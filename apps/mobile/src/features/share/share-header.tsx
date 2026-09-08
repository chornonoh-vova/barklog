import type { ShareBasis, ShareSourceWire } from "@repo/contracts";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
import { PlatformColor, StyleSheet, Text, View } from "react-native";

import { UNAVAILABLE_NOTICE } from "@/features/share/empty-states";
import { RemoteImage } from "@/components/remote-image";
import { sourceThumbSize } from "@/features/share/source-thumb";
import { Type } from "@/theme";

export function ShareHeader({ source, basis }: { source: ShareSourceWire; basis: ShareBasis }) {
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

      {basis === "unavailable" ? <FallbackNotice /> : null}
    </View>
  );
}

/**
 * A signed CDN thumbnail url can expire inside its cache TTL, so `onError`
 * is an ordinary outcome here, not an exceptional one.
 */
function SourceCover({ source }: { source: ShareSourceWire }) {
  const [failed, setFailed] = useState(false);
  const size = sourceThumbSize(source.provider);

  // `== null`, not `===`: responses are cast, not validated, so a field absent
  // from an older API build arrives as `undefined`.
  if (source.thumbnailUrl == null || failed) {
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
    <RemoteImage
      source={{ uri: source.thumbnailUrl }}
      style={[styles.cover, size]}
      onError={() => setFailed(true)}
      accessibilityElementsHidden
    />
  );
}

/**
 * The tint is a child view because React Native will not apply alpha to a
 * `PlatformColor`, and `theme.ts` keeps hex literals out of the app.
 */
function FallbackNotice() {
  return (
    <View style={styles.notice}>
      <View style={styles.noticeFill} />
      {/* Wrapped: the prop hides the elements *contained within* a view. */}
      <View accessibilityElementsHidden>
        <SymbolView
          name="exclamationmark.triangle.fill"
          size={14}
          tintColor={PlatformColor("systemOrange")}
        />
      </View>
      <Text style={styles.noticeText}>{UNAVAILABLE_NOTICE}</Text>
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
