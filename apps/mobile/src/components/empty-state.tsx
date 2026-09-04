import { Button, VStack } from "@expo/ui/swift-ui";
import { buttonStyle, controlSize } from "@expo/ui/swift-ui/modifiers";
import { SymbolView } from "expo-symbols";
import { PlatformColor, StyleSheet, Text, View } from "react-native";
import type { SFSymbol } from "sf-symbols-typescript";

import { SYMBOL_SIZE, type IllustrationName } from "@/components/illustrations";
import { Mascot } from "@/components/mascot";
import { Type } from "@/theme";
import { MeasuredHost } from "@/ui/measured-host";
import { GLASS_PROMINENT_STYLE } from "@/ui/platform-glass";

export interface EmptyStateContent {
  title: string;
  /** Kept required alongside `illustration` rather than replaced by it: a state
   * with no mascot of its own — a request that failed — falls back to this. */
  systemImage: SFSymbol;
  illustration?: IllustrationName;
  description: string;
}

export interface EmptyStateAction {
  label: string;
  onPress: () => void;
}

/**
 * Plain react-native, with SwiftUI kept to the buttons: the mascot is a Metro
 * asset, and @expo/ui's `Image` takes only an SF Symbol, an asset-catalog
 * symbol set, or a `file://` URI — never a bundled webp.
 */
export function EmptyState({
  title,
  systemImage,
  illustration,
  description,
  action,
  secondaryAction,
  fullscreen = false,
}: EmptyStateContent & {
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  /** Fills the screen and centres in it. Off inside a list, whose
   * `ListEmptyComponent` has nothing to flex against. */
  fullscreen?: boolean;
}) {
  return (
    <View style={[styles.root, fullscreen && styles.fullscreen]}>
      {illustration ? (
        <Mascot illustration={illustration} />
      ) : (
        // The symbol restates the title, so VoiceOver reads the copy only.
        <SymbolView
          name={systemImage}
          type="hierarchical"
          size={SYMBOL_SIZE}
          tintColor={PlatformColor("secondaryLabel")}
          accessibilityElementsHidden
        />
      )}

      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>

      {action || secondaryAction ? (
        <MeasuredHost style={styles.actions}>
          <VStack spacing={8}>
            {action ? (
              <Button
                label={action.label}
                onPress={action.onPress}
                modifiers={[buttonStyle(GLASS_PROMINENT_STYLE), controlSize("large")]}
              />
            ) : null}
            {secondaryAction ? (
              <Button
                label={secondaryAction.label}
                onPress={secondaryAction.onPress}
                modifiers={[controlSize("large")]}
              />
            ) : null}
          </VStack>
        </MeasuredHost>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 64,
    gap: 8,
  },
  fullscreen: { flex: 1 },
  title: { ...Type.title2, color: PlatformColor("label"), textAlign: "center" },
  description: {
    ...Type.body,
    color: PlatformColor("secondaryLabel"),
    textAlign: "center",
    maxWidth: 320,
  },
  /** `stretch`, or the host has no width to lay the buttons out in; the SwiftUI
   * `VStack` centres them inside it. The 4 on top of the root's 8 is the 12 the
   * primary button used to carry. */
  actions: { marginTop: 4, alignSelf: "stretch" },
});
