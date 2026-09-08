import { Platform } from "../types/comment";
import { SocialPlatformAdapter } from "./SocialPlatformAdapter";
import { YouTubeAdapter } from "./YouTubeAdapter";
import { LinkedInAdapter } from "./LinkedInAdapter";

/**
 * Single place that maps a Platform enum value to its adapter instance.
 * Adding a new platform = write the adapter class + add one line here.
 * Adapters are stateless, so we can safely reuse singleton instances.
 */
const registry: Partial<Record<Platform, SocialPlatformAdapter>> = {
  YOUTUBE: new YouTubeAdapter(),
  LINKEDIN: new LinkedInAdapter(),
};

export function getAdapter(platform: Platform): SocialPlatformAdapter {
  const adapter = registry[platform];
  if (!adapter) {
    throw new Error(`No adapter registered for platform: ${platform}`);
  }
  return adapter;
}
