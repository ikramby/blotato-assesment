import { prisma } from "../db/client";
import { getAdapter } from "../adapters/AdapterFactory";
import { PlatformCredentials } from "../types/comment";

/**
 * Design decision: comments are cached in our own DB rather than always proxying
 * live to the platform API, because:
 *   1. Read traffic (viewing comments) is much higher than write traffic (replying),
 *      and platform APIs are rate-limited — we don't want a busy Blotato dashboard
 *      to burn a customer's YouTube quota on every page refresh.
 *   2. It lets us serve comments even if a platform's API is temporarily down.
 *   3. It gives us a normalized, queryable store (e.g. "show me all comments
 *      across every platform for this account") which the platforms don't offer.
 *
 * Trade-off: comments can be briefly stale. We mitigate this with a short TTL-based
 * refetch (see `MAX_CACHE_AGE_MS`) rather than a background sync job, to keep the
 * take-home scope reasonable — a production system would likely use webhooks
 * where the platform supports them, falling back to polling where it doesn't.
 */
const MAX_CACHE_AGE_MS = 5 * 60 * 1000; // 5 minutes

export class CommentService {
  async getComments(platformPostId: string, cursor?: string, limit = 20) {
    const platformPost = await prisma.platformPost.findUniqueOrThrow({
      where: { id: platformPostId },
      include: { connection: true },
    });

    const newestCached = await prisma.comment.findFirst({
      where: { platformPostId },
      orderBy: { syncedAt: "desc" },
    });

    const cacheIsFresh = newestCached && Date.now() - newestCached.syncedAt.getTime() < MAX_CACHE_AGE_MS;

    // On a cache miss (or no cursor = first page requested while stale), pull from
    // the platform and upsert. Subsequent pages within a fresh cache window are
    // served straight from the DB to avoid redundant API calls.
    if (!cacheIsFresh && !cursor) {
      await this.syncFromPlatform(platformPost.id, platformPost.platform, platformPost.externalPostId, {
        accessToken: platformPost.connection.accessToken,
        refreshToken: platformPost.connection.refreshToken,
      });
    }

    const comments = await prisma.comment.findMany({
      where: { platformPostId, parentId: cursor ? undefined : null }, // top-level first; see docs/API_DESIGN.md
      orderBy: { createdAtPlatform: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { replies: { orderBy: { createdAtPlatform: "asc" } } },
    });

    const hasMore = comments.length > limit;
    const page = comments.slice(0, limit);

    return {
      comments: page,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async replyToComment(commentId: string, content: string) {
    const parent = await prisma.comment.findUniqueOrThrow({
      where: { id: commentId },
      include: { platformPost: { include: { connection: true } } },
    });

    const adapter = getAdapter(parent.platformPost.platform);
    const credentials: PlatformCredentials = {
      accessToken: parent.platformPost.connection.accessToken,
      refreshToken: parent.platformPost.connection.refreshToken,
    };

    // Write-through: post to the platform first (source of truth), then persist
    // locally. If the platform call fails, we intentionally do NOT write a local
    // row — a comment that "exists" in Blotato but not on the actual platform
    // would be worse than a failed request the user can retry.
    const normalizedReply = await adapter.replyToComment(
      parent.platformPost.externalPostId,
      parent.externalCommentId,
      content,
      credentials
    );

    return prisma.comment.create({
      data: {
        platformPostId: parent.platformPostId,
        externalCommentId: normalizedReply.externalId,
        parentId: parent.id,
        externalParentId: parent.externalCommentId,
        authorName: normalizedReply.authorName,
        authorExternalId: normalizedReply.authorExternalId,
        content: normalizedReply.content,
        createdAtPlatform: normalizedReply.createdAtPlatform,
        isOwnReply: true,
      },
    });
  }

  private async syncFromPlatform(
    platformPostId: string,
    platform: any,
    externalPostId: string,
    credentials: PlatformCredentials
  ) {
    const adapter = getAdapter(platform);
    const { comments } = await adapter.getComments(externalPostId, credentials);

    // Upsert rather than insert: re-syncing must not create duplicates, and an
    // externally-edited comment should have its content refreshed.
    await Promise.all(
      comments.map((c) =>
        prisma.comment.upsert({
          where: { platformPostId_externalCommentId: { platformPostId, externalCommentId: c.externalId } },
          create: {
            platformPostId,
            externalCommentId: c.externalId,
            externalParentId: c.externalParentId,
            authorName: c.authorName,
            authorExternalId: c.authorExternalId,
            content: c.content,
            createdAtPlatform: c.createdAtPlatform,
          },
          update: {
            content: c.content,
            syncedAt: new Date(),
          },
        })
      )
    );
  }
}

export const commentService = new CommentService();
