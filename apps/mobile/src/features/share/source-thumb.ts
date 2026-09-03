import type { ShareProviderName } from "@repo/contracts";

/**
 * Pure, and with no react-native in its module graph, so it tests in plain
 * Node — the same reason `features/share/extract-url.ts` is structured this
 * way. The `@repo/contracts` import is type-only and erases.
 */

/** Equal across providers, so the row's height never depends on the source. */
const SOURCE_THUMB_HEIGHT = 56;

/**
 * The aspect we render at, which is deliberately not the aspect oEmbed
 * reports. YouTube's thumbnail is `hqdefault.jpg` at 480x360 — 4:3, with
 * letterbox bars baked in — so a 16:9 box with `contentFit="cover"` crops off
 * exactly the bars. TikTok's cover is already portrait, so 9:16 crops
 * nothing. A rare landscape TikTok is centre-cropped, which is the accepted
 * cost of not plumbing the reported dimensions.
 */
const ASPECT: Record<ShareProviderName, number> = {
  youtube: 16 / 9,
  tiktok: 9 / 16,
};

export function sourceThumbSize(provider: ShareProviderName): {
  width: number;
  height: number;
} {
  return {
    width: Math.round(SOURCE_THUMB_HEIGHT * ASPECT[provider]),
    height: SOURCE_THUMB_HEIGHT,
  };
}
