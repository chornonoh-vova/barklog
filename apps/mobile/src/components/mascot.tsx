import { Image } from "expo-image";
import { StyleSheet } from "react-native";

import { ILLUSTRATIONS, type IllustrationName } from "@/components/illustrations";

const MASCOT_SIZE = 200;

/**
 * The art on its own, so it can be shared across the two view trees that show
 * it: the empty state renders it inline, and onboarding hands it to
 * `RNHostView` as the single child SwiftUI measures.
 *
 * `pointerEvents="none"` keeps the hosted copy from swallowing the onboarding
 * pager's swipe. `enforceEarlyResizing` decodes at the view's size instead of
 * the source's 1024 square — `allowDownscaling`, on by default, only resizes
 * after the full decode. expo-image leaves `accessible` false, and the mascot
 * only restates the title, so VoiceOver reads the copy alone.
 */
export function Mascot({ illustration }: { illustration: IllustrationName }) {
  return (
    <Image
      source={ILLUSTRATIONS[illustration]}
      style={styles.image}
      contentFit="contain"
      enforceEarlyResizing
      pointerEvents="none"
    />
  );
}

const styles = StyleSheet.create({
  image: { width: MASCOT_SIZE, height: MASCOT_SIZE },
});
