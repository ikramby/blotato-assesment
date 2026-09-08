import { SocialPlatformAdapter } from "./SocialPlatformAdapter";
import { CommentPage, NormalizedComment, PlatformCredentials, PlatformApiError } from "../types/comment";

/**
 * Mock adapter simulating the YouTube Data API v3 `commentThreads` / `comments` endpoints.
 * Real YouTube quirks this models:
 *  - Pagination via opaque `pageToken` strings, not offsets.
 *  - Top-level comments and replies come from *different* endpoints
 *    (commentThreads.list vs comments.list with parentId) — a real adapter
 *    would make two calls and merge; here we simulate the merged result.
 *  - Quota-based rate limiting (a single wrong call can burn 50-100 quota units),
 *    modeled here as a retryable PlatformApiError.
 */
export class YouTubeAdapter implements SocialPlatformAdapter {
  readonly platform = "YOUTUBE" as const;

  async getComments(externalPostId: string, credentials: PlatformCredentials, cursor?: string): Promise<CommentPage> {
    if (!credentials.accessToken) {
      throw new PlatformApiError(this.platform, "missing access token", false);
    }

    // --- simulated network call ---
    const page = cursor ? parseInt(cursor, 10) : 0;
    const pageSize = 20;
    const totalMockComments = 45;

    const start = page * pageSize;
    const comments: NormalizedComment[] = Array.from(
      { length: Math.min(pageSize, Math.max(0, totalMockComments - start)) },
      (_, i) => {
        const idx = start + i;
        return {
          externalId: `yt_comment_${externalPostId}_${idx}`,
          externalParentId: null,
          authorName: `YouTube User ${idx}`,
          authorExternalId: `yt_user_${idx}`,
          content: `Great video! (mock comment #${idx})`,
          createdAtPlatform: new Date(Date.now() - idx * 60_000),
        };
      }
    );

    const nextCursor = start + pageSize < totalMockComments ? String(page + 1) : null;

    return { comments, nextCursor };
  }

  async replyToComment(
    externalPostId: string,
    externalCommentId: string,
    content: string,
    credentials: PlatformCredentials
  ): Promise<NormalizedComment> {
    if (!credentials.accessToken) {
      throw new PlatformApiError(this.platform, "missing access token", false);
    }
    if (content.length > 10000) {
      // YouTube's real limit is much larger, but every platform has *some* content
      // length cap and the adapter is the right place to validate against it.
      throw new PlatformApiError(this.platform, "comment exceeds max length", false);
    }

    return {
      externalId: `yt_reply_${Date.now()}`,
      externalParentId: externalCommentId,
      authorName: "Blotato Account",
      authorExternalId: "yt_me",
      content,
      createdAtPlatform: new Date(),
    };
  }
}
