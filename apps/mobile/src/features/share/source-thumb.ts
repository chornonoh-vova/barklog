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

export function sourceThumbSize(provider: ShareProviderName): { width: number; height: number } {
  return SOURCE_THUMB_SIZE[provider];
}
