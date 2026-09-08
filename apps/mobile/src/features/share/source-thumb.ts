import type { ShareProviderName } from "@repo/contracts";

/**
 * Display sizes, deliberately not the dimensions oEmbed reports: YouTube's
 * `hqdefault.jpg` is 480x360, 4:3 with letterbox bars baked in, so a 16:9 box
 * with `contentFit="cover"` crops off exactly the bars. TikTok's cover is
 * already portrait. Equal heights keep the row independent of the source.
 */
const SOURCE_THUMB_SIZE: Record<ShareProviderName, { width: number; height: number }> = {
  youtube: { width: 100, height: 56 },
  tiktok: { width: 32, height: 56 },
};

// Stopgap ahead of Task 10, which replaces this with aspect-ratio sizing:
// `provider` is now any wire string, so a host outside the old two-provider
// map falls back to YouTube's box rather than indexing undefined.
export function sourceThumbSize(provider: string): { width: number; height: number } {
  return SOURCE_THUMB_SIZE[provider as ShareProviderName] ?? SOURCE_THUMB_SIZE.youtube;
}
