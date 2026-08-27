import type { GameDetailResponse } from "@repo/contracts";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { PlatformColor, StyleSheet, Text, useColorScheme, View } from "react-native";

import { Cover } from "@/components/cover";
import { coverUrl } from "@/igdb-image";
import { metaLine, ratingLine } from "@/features/game/format";
import { Type } from "@/theme";

const COVER_WIDTH = 132;

/**
 * Cover left, information right — chosen over Apple Music's centred arrangement
 * because game covers are 3:4 portrait rather than square, so side-by-side
 * wastes no vertical space.
 *
 * The backdrop is the same cover blurred and scaled to fill, faded into the
 * system background. Deriving it from the artwork is what makes every game
 * screen look different. A pale cover would wash out the title, so the gradient
 * is a two-stop scrim rather than a single fade — and a game with no cover gets
 * no blur layer at all rather than a grey smear.
 */
export function Hero({ game }: { game: GameDetailResponse }) {
  /**
   * The one place in the app that cannot use `PlatformColor`.
   * `PlatformColor("systemBackground")` returns an opaque `{semantic: [...]}`
   * descriptor that the native layer resolves at render time;
   * `expo-linear-gradient` needs actual colour *strings*, and stringifying the
   * descriptor yields "[object Object]". So the page colour is resolved here
   * from the colour scheme, matching what `systemBackground` resolves to on
   * iOS: white in light, black in dark.
   */
  const scheme = useColorScheme();
  const pageColor = scheme === "dark" ? "#000000" : "#FFFFFF";

  const backdrop = coverUrl(game.coverImageId, "big");
  const meta = metaLine({ firstReleaseDate: game.firstReleaseDate, genres: game.genres });
  const rating = ratingLine(game);
  const developer = game.developers[0]?.name ?? null;

  return (
    <View style={styles.container}>
      {backdrop === null ? null : (
        <View style={styles.backdrop} pointerEvents="none">
          <Image
            source={{ uri: backdrop }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            blurRadius={40}
            cachePolicy="disk"
          />
          <LinearGradient
            // Two stops: a scrim over the whole blur so text is legible on a
            // pale cover, then the fade into the page.
            colors={["rgba(0,0,0,0.35)", "rgba(0,0,0,0.15)", "transparent"]}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={["transparent", pageColor]}
            locations={[0.55, 1]}
            style={StyleSheet.absoluteFill}
          />
        </View>
      )}

      <View style={styles.row}>
        <Cover imageId={game.coverImageId} size="big" width={COVER_WIDTH} />

        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={3}>
            {game.name}
          </Text>
          {developer === null ? null : <Text style={styles.developer}>{developer}</Text>}
          {meta === null ? null : <Text style={styles.meta}>{meta}</Text>}
          {rating === null ? null : <Text style={styles.meta}>{rating}</Text>}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 8 },
  // RN 0.86 types `absoluteFill` as the plain object
  // {position:'absolute', left:0, right:0, top:0, bottom:0}, so spreading it is
  // correct. There is no `absoluteFillObject` in these typings.
  backdrop: { ...StyleSheet.absoluteFill },
  row: { flexDirection: "row", gap: 16, paddingHorizontal: 16, paddingBottom: 16 },
  info: { flex: 1, gap: 4, justifyContent: "flex-end", paddingBottom: 4 },
  name: { ...Type.title2, color: PlatformColor("label") },
  developer: { ...Type.headline, color: PlatformColor("label") },
  meta: { ...Type.subheadline, color: PlatformColor("secondaryLabel") },
});
