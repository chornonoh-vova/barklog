import { Host } from "@expo/ui/swift-ui";
import { useCallback, useState, type ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";

import { Brand } from "@/theme";

/**
 * A `Host` with `matchContents` takes its height from SwiftUI pushing the
 * measured size into Fabric state, and that push is deduped against the value
 * already there (`dispatchSizePatch` returns `nullptr` to cancel the commit).
 * Reopening a screen builds a fresh shadow node back at `auto` while the state
 * still holds the first measurement, so the commit is cancelled, the host
 * collapses to zero and its content draws over its neighbours. `onLayoutContent`
 * fires on every mount regardless, so mirroring it into `minHeight` keeps a
 * floor under the host; a taller measurement still wins.
 *
 * A component rather than a hook because the four props have to agree — keeping
 * the state but forgetting `matchContents` brings the collapse back.
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
