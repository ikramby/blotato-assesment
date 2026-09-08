import { CommentPage, NormalizedComment, Platform, PlatformCredentials } from "../types/comment";

/**
 * Every social platform implements this contract. Adding platform #7 means writing
 * one new class that implements this interface — nothing in routes/, services/, or
 * the DB layer needs to change. This is the single most important design decision
 * in the system: it isolates platform-specific quirks (auth schemes, pagination
 * styles, rate limits, payload shapes) behind one boundary.
 */
export interface SocialPlatformAdapter {
  readonly platform: Platform;

  /**
   * Fetch a page of comments for a given external post ID.
   * `cursor` is an opaque string — each adapter defines its own cursor format
   * internally (e.g. YouTube's pageToken vs LinkedIn's offset-based cursor)
   * and the caller never needs to know the difference.
   */
  getComments(externalPostId: string, credentials: PlatformCredentials, cursor?: string): Promise<CommentPage>;

  /**
   * Post a reply to a comment on the platform. Returns the normalized comment
   * that was created (some platforms return the full object, others just an ID —
   * adapters that only get an ID back should synthesize the rest client-side).
   */
  replyToComment(
    externalPostId: string,
    externalCommentId: string,
    content: string,
    credentials: PlatformCredentials
  ): Promise<NormalizedComment>;
}
