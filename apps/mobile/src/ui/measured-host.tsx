import { Host } from "@expo/ui/swift-ui";
import { useCallback, useState, type ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";

import { Brand } from "@/theme";

/**
 * SwiftUI dedupes the measured size it pushes into Fabric state, so reopening a
 * screen — fresh shadow node at `auto`, state still holding the old value —
 * cancels the commit and collapses the host to zero. `onLayoutContent` fires on
 * every mount regardless, so mirroring it into `minHeight` keeps a floor under
 * it. A component, not a hook, because all four props have to agree.
 */
export function MeasuredHost({
  style,
  children,
}: {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const [minHeight, setMinHeight] = useState<number>();

  const onLayoutContent = useCallback((event: { nativeEvent: { height: number } }) => {
    setMinHeight(event.nativeEvent.height);
  }, []);

  return (
    <Host
      style={[style, { minHeight }]}
      matchContents={{ vertical: true }}
      seedColor={Brand.tint}
      onLayoutContent={onLayoutContent}
    >
      {children}
    </Host>
  );
}
