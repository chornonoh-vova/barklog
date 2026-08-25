import { ContentUnavailableView, Host } from "@expo/ui/swift-ui";
import type { ComponentProps } from "react";
import { StyleSheet } from "react-native";

import { Brand } from "@/theme";

type PlaceholderScreenProps = {
  title: string;
  systemImage: NonNullable<ComponentProps<typeof ContentUnavailableView>["systemImage"]>;
  description: string;
};

/** Native empty state for a screen whose real content isn't built yet. */
export function PlaceholderScreen({ title, systemImage, description }: PlaceholderScreenProps) {
  return (
    <Host style={styles.host} seedColor={Brand.tint} useViewportSizeMeasurement>
      <ContentUnavailableView title={title} systemImage={systemImage} description={description} />
    </Host>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
  },
});
