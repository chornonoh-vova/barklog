import { Host, ProgressView } from "@expo/ui/swift-ui";
import { useTranslation } from "react-i18next";
import { PlatformColor, StyleSheet, Text, View } from "react-native";

import { Mascot } from "@/components/mascot";
import { Type } from "@/ui/theme";

export function SearchingState() {
  const { t } = useTranslation();

  return (
    <View style={styles.root}>
      <Mascot illustration="share" />
      <Text style={styles.label}>{t("share.searching")}</Text>
      <Host style={styles.spinner} alignment="center">
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
