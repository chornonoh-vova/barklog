import { Button, Host, Image, Text, VStack } from "@expo/ui/swift-ui";
import {
  accessibilityHidden,
  buttonStyle,
  controlSize,
  fixedSize,
  font,
  foregroundStyle,
  frame,
  multilineTextAlignment,
  padding,
} from "@expo/ui/swift-ui/modifiers";
import type { SFSymbol } from "sf-symbols-typescript";
import { StyleSheet } from "react-native";

import { GLASS_PROMINENT_STYLE } from "@/ui/platform-glass";
import { Brand } from "@/theme";

/** Named so the copy modules can be typed by it and spread at a call site. */
export interface EmptyStateContent {
  title: string;
  systemImage: SFSymbol;
  description: string;
}

export function EmptyState({
  title,
  systemImage,
  description,
  action,
}: EmptyStateContent & { action?: { label: string; onPress: () => void } }) {
  return (
    <Host style={styles.host} seedColor={Brand.tint}>
      <VStack spacing={8} modifiers={[padding({ horizontal: 32 })]}>
        <Image
          systemName={systemImage}
          size={52}
          modifiers={[
            foregroundStyle({ type: "hierarchical", style: "secondary" }),
            padding({ bottom: 4 }),
            // The symbol restates the title; VoiceOver reads the copy only.
            accessibilityHidden(true),
          ]}
        />
        <Text modifiers={[font({ textStyle: "title2", weight: "bold" })]}>{title}</Text>
        <Text
          modifiers={[
            font({ textStyle: "body" }),
            foregroundStyle({ type: "hierarchical", style: "secondary" }),
            multilineTextAlignment("center"),
            frame({ maxWidth: 320 }),
            // Wrap rather than truncate when the host is shorter than ideal.
            fixedSize({ vertical: true }),
          ]}
        >
          {description}
        </Text>
        {action ? (
          <Button
            label={action.label}
            onPress={action.onPress}
            modifiers={[
              buttonStyle(GLASS_PROMINENT_STYLE),
              controlSize("large"),
              padding({ top: 12 }),
            ]}
          />
        ) : null}
      </VStack>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
});
