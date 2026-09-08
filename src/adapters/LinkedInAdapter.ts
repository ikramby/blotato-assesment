import { SocialPlatformAdapter } from "./SocialPlatformAdapter";
import { CommentPage, NormalizedComment, PlatformCredentials, PlatformApiError } from "../types/comment";

/**
 * Mock adapter simulating LinkedIn's Social Actions / Comments API.
 * Real LinkedIn quirks this models:
 *  - Offset-based pagination (start/count) rather than tokens.
 *  - Nested replies ARE returned inline in the same payload (unlike YouTube),
 *    so this adapter demonstrates flattening a nested response into our flat
 *    NormalizedComment[] + externalParentId shape.
 *  - Much stricter content moderation on replies (LinkedIn rejects certain
 *    content client-side before it even hits their API in some SDKs) —
 *    modeled as a non-retryable validation error.
 */
export class LinkedInAdapter implements SocialPlatformAdapter {
  readonly platform = "LINKEDIN" as const;

  async getComments(externalPostId: string, credentials: PlatformCredentials, cursor?: string): Promise<CommentPage> {
    if (!credentials.accessToken) {
      throw new PlatformApiError(this.platform, "missing access token", false);
    }

    const offset = cursor ? parseInt(cursor, 10) : 0;
    const pageSize = 15;
    const totalMockComments = 28;

    // Simulate a nested payload: every 5th comment is a reply to the previous one.
    const comments: NormalizedComment[] = Array.from(
      { length: Math.min(pageSize, Math.max(0, totalMockComments - offset)) },
      (_, i) => {
        const idx = offset + i;
        const isReply = idx % 5 === 4;
        return {
          externalId: `li_comment_${externalPostId}_${idx}`,
          externalParentId: isReply ? `li_comment_${externalPostId}_${idx - 1}` : null,
          authorName: `LinkedIn Professional ${idx}`,
          authorExternalId: `li_user_${idx}`,
          content: isReply ? `Totally agree with the above (mock #${idx})` : `Insightful post (mock #${idx})`,
          createdAtPlatform: new Date(Date.now() - idx * 90_000),
        };
      }
    );

    const nextCursor = offset + pageSize < totalMockComments ? String(offset + pageSize) : null;

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
    if (content.trim().length === 0) {
      throw new PlatformApiError(this.platform, "empty reply rejected by LinkedIn client-side validation", false);
    }

    return {
      externalId: `li_reply_${Date.now()}`,
      externalParentId: externalCommentId,
      authorName: "Blotato Account",
      authorExternalId: "li_me",
      content,
      createdAtPlatform: new Date(),
    };
  }
}
