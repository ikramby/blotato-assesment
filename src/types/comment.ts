export type Platform = "YOUTUBE" | "LINKEDIN" | "TWITTER" | "FACEBOOK" | "INSTAGRAM" | "TIKTOK";

/**
 * Platform-agnostic comment shape. Every adapter must translate its platform's
 * native payload into this shape before it touches the rest of the system —
 * this is the seam that keeps platform quirks out of the service/route layer.
 */
export interface NormalizedComment {
  externalId: string;
  externalParentId: string | null;
  authorName: string;
  authorExternalId: string | null;
  content: string;
  createdAtPlatform: Date;
}

export interface CommentPage {
  comments: NormalizedComment[];
  nextCursor: string | null;
}

export interface PlatformCredentials {
  accessToken: string;
  refreshToken?: string | null;
}

export class PlatformApiError extends Error {
  constructor(
    public readonly platform: Platform,
    public readonly cause: string,
    public readonly retryable: boolean = false
  ) {
    super(`[${platform}] ${cause}`);
    this.name = "PlatformApiError";
  }
}
