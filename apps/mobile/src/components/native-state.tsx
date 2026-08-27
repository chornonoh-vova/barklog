import { Button, ContentUnavailableView, Host, VStack } from "@expo/ui/swift-ui";
import { buttonStyle, controlSize } from "@expo/ui/swift-ui/modifiers";
import type { SFSymbol } from "sf-symbols-typescript";
import { StyleSheet } from "react-native";

import { GLASS_PROMINENT_STYLE } from "@/ui/platform-glass";
import { Brand } from "@/theme";

/**
 * `ContentUnavailableView` takes only title, systemImage and description — it
 * has no children and no action slot — so a call to action has to be a sibling
 * in the `VStack` rather than a child of it.
 */
export function NativeState({
  title,
  systemImage,
  description,
  action,
}: {
  title: string;
  systemImage: SFSymbol;
  description: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <Host style={styles.host} seedColor={Brand.tint} useViewportSizeMeasurement>
      <VStack spacing={16}>
        <ContentUnavailableView title={title} systemImage={systemImage} description={description} />
        {action ? (
          <Button
            label={action.label}
            onPress={action.onPress}
            modifiers={[buttonStyle(GLASS_PROMINENT_STYLE), controlSize("large")]}
          />
        ) : null}
      </VStack>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
});
