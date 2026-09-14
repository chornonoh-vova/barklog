import { Host, ProgressView } from "@expo/ui/swift-ui";
import { PlatformColor, StyleSheet, Text, View } from "react-native";

import { Mascot } from "@/components/mascot";
import { Type } from "@/theme";

export function SearchingState() {
  return (
    <View style={styles.root}>
      <Mascot illustration="share" />
      <Text style={styles.label}>Working out which game this is</Text>
      <Host style={styles.spinner}>
        <ProgressView />
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  label: { ...Type.body, color: PlatformColor("secondaryLabel"), textAlign: "center" },
  /** `Host` has no intrinsic size; without one the spinner collapses. */
  spinner: { width: 32, height: 32 },
});
