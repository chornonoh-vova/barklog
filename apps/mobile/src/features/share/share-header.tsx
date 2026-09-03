import type { ShareSourceWire } from "@repo/contracts";
import { Image } from "expo-image";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
import { PlatformColor, StyleSheet, Text, View } from "react-native";

import { TITLE_MATCH_NOTICE } from "@/features/share/empty-states";
import { sourceThumbSize } from "@/features/share/source-thumb";
import { Type } from "@/theme";

/**
 * The share screen's whole `ListHeaderComponent`, and the owner of its
 * padding, so the list stays responsible only for the list.
 */
export function ShareHeader({
  source,
  identified,
}: {
  source: ShareSourceWire;
  identified: boolean;
}) {
  return (
    <View style={styles.header}>
      <Text style={styles.question}>Which game is this?</Text>

      <View style={styles.source}>
        <SourceCover source={source} />

        <View style={styles.sourceText}>
          <Text style={styles.sourceTitle} numberOfLines={2}>
            {source.title}
          </Text>
          {source.author === null ? null : (
            <Text style={styles.sourceAuthor} numberOfLines={1}>
              {source.author}
            </Text>
          )}
        </View>
      </View>

      {identified ? null : <FallbackNotice />}
    </View>
  );
}

/**
 * The cover, with the placeholder covering two cases rather than one: a
 * provider that gave no thumbnail, and a url that has since expired. TikTok's
 * is a signed CDN url with a lifetime shorter than `OEMBED_TTL_SECONDS`, so
 * `onError` is an ordinary outcome here, not an exceptional one.
 *
 * Both branches render at the same dimensions, so the row never shifts.
 */
function SourceCover({ source }: { source: ShareSourceWire }) {
  const [failed, setFailed] = useState(false);
  const size = sourceThumbSize(source.provider);

  // The title beside it says everything the cover says, so VoiceOver skips it.
  if (source.thumbnailUrl === null || failed) {
    return (
      <View style={[styles.cover, styles.coverPlaceholder, size]} accessibilityElementsHidden>
        <SymbolView
          name="play.rectangle.fill"
          size={Math.min(size.width, size.height) * 0.5}
          tintColor={PlatformColor("secondaryLabel")}
        />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: source.thumbnailUrl }}
      style={[styles.cover, size]}
      contentFit="cover"
      transition={150}
      cachePolicy="disk"
      onError={() => setFailed(true)}
      accessibilityElementsHidden
    />
  );
}

/**
 * `opacity` sits on a child rather than the container because React Native
 * will not apply alpha to a `PlatformColor`, and `theme.ts` keeps
 * `Brand.tint` as the app's only hex literal. Border, glyph and fill are then
 * all the same dynamic colour, so all three track light and dark for free.
 */
function FallbackNotice() {
  return (
    <View style={styles.notice}>
      <View style={styles.noticeFill} />
      {/* Wrapped in a `View` because `SymbolViewProps` is a plain object type
          with no accessibility props of its own — putting
          `accessibilityElementsHidden` on the `SymbolView` fails
          `check-types`. The glyph restates the copy, so VoiceOver reads the
          copy only: the same call `components/empty-state.tsx` makes for its
          symbol. */}
      <View accessibilityElementsHidden>
        <SymbolView
          name="exclamationmark.triangle.fill"
          size={14}
          tintColor={PlatformColor("systemOrange")}
        />
      </View>
      <Text style={styles.noticeText}>{TITLE_MATCH_NOTICE}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  question: { ...Type.headline, color: PlatformColor("label"), paddingBottom: 10 },

  source: { flexDirection: "row", alignItems: "center", gap: 12 },
  cover: {
    borderRadius: 8,
    backgroundColor: PlatformColor("secondarySystemGroupedBackground"),
  },
  coverPlaceholder: { alignItems: "center", justifyContent: "center" },
  sourceText: { flex: 1, gap: 2 },
  sourceTitle: { ...Type.subheadline, color: PlatformColor("label") },
  sourceAuthor: { ...Type.footnote, color: PlatformColor("secondaryLabel") },

  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: PlatformColor("systemOrange"),
    overflow: "hidden",
  },
  noticeFill: {
    ...StyleSheet.absoluteFill,
    backgroundColor: PlatformColor("systemOrange"),
    opacity: 0.12,
  },
  noticeText: { ...Type.footnote, color: PlatformColor("label"), flex: 1 },
});
