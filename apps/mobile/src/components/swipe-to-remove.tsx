import { useRef, type ReactNode } from "react";
import { PlatformColor, Pressable, StyleSheet, Text } from "react-native";
import Swipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";

import { Type } from "@/theme";

/**
 * A trailing "Remove" that asks first (`onRemove` goes through
 * `confirmRemove`). No full-swipe delete: a confirmation after a full swipe
 * feels broken. The row closes before the alert so a cancel leaves it tidy.
 */
export function SwipeToRemove({
  onRemove,
  children,
}: {
  onRemove: () => void;
  children: ReactNode;
}) {
  const swipeable = useRef<SwipeableMethods>(null);

  return (
    <Swipeable
      ref={swipeable}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={() => (
        <Pressable
          style={styles.action}
          accessibilityRole="button"
          accessibilityLabel="Remove from Backlog"
          onPress={() => {
            swipeable.current?.close();
            onRemove();
          }}
        >
          <Text style={styles.label}>Remove</Text>
        </Pressable>
      )}
    >
      {children}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  action: {
    width: 96,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PlatformColor("systemRed"),
  },
  label: { ...Type.headline, color: PlatformColor("white") },
});
