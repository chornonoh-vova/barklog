import { Host, Image, Menu, Picker, Text, VStack } from "@expo/ui/swift-ui";
import {
  accessibilityLabel,
  buttonStyle,
  clipShape,
  pickerStyle,
  tag,
} from "@expo/ui/swift-ui/modifiers";
import type { BacklogStatus } from "@repo/contracts";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native";
import type { SFSymbol } from "sf-symbols-typescript";

import { STATUS_ORDER } from "@/features/backlog/sections";
import { statusLabel, statusSymbol } from "@/features/game/format";
import { Brand } from "@/ui/theme";
import { GLASS_PROMINENT_STYLE } from "@/ui/platform-glass";
import { useIsAccessibilitySize } from "@/ui/use-accessibility-size";

const ALL = "all";
const ALL_SYMBOL: SFSymbol = "tray.full";

type Selection = BacklogStatus | typeof ALL;

const OPTIONS: Selection[] = [ALL, ...STATUS_ORDER];

export function StatusFilter({
  value,
  onChange,
}: {
  value: BacklogStatus | undefined;
  onChange: (status: BacklogStatus | undefined) => void;
}) {
  const ax = useIsAccessibilitySize();
  const { t } = useTranslation();
  const selected: Selection = value ?? ALL;
  const label = (option: Selection) =>
    option === ALL ? t("backlog.filterAll") : statusLabel(option);
  const select = (selection: Selection) => onChange(selection === ALL ? undefined : selection);

  // Five segments of text truncate at accessibility sizes, so those keep the menu.
  if (ax) {
    return (
      <Host
        style={styles.host}
        alignment="center"
        matchContents={{ vertical: true }}
        seedColor={Brand.tint}
      >
        <VStack alignment="leading">
          <Text>{t("backlog.filterShow")}</Text>
          <Menu
            label={label(selected)}
            systemImage="line.3.horizontal.decrease"
            modifiers={[buttonStyle(GLASS_PROMINENT_STYLE), clipShape("capsule")]}
          >
            <Picker
              selection={selected}
              onSelectionChange={select}
              modifiers={[pickerStyle("inline")]}
            >
              {OPTIONS.map((option) => (
                <Text key={option} modifiers={[tag(option)]}>
                  {label(option)}
                </Text>
              ))}
            </Picker>
          </Menu>
        </VStack>
      </Host>
    );
  }

  // Like Mail's category switcher: the selected segment names itself, the rest
  // are icons that VoiceOver still reads by name.
  return (
    <Host
      style={styles.host}
      alignment="center"
      matchContents={{ vertical: true }}
      seedColor={Brand.tint}
    >
      <Picker
        selection={selected}
        onSelectionChange={select}
        modifiers={[pickerStyle("segmented")]}
      >
        {OPTIONS.map((option) =>
          option === selected ? (
            <Text key={option} modifiers={[tag(option)]}>
              {label(option)}
            </Text>
          ) : (
            <Image
              key={option}
              systemName={option === ALL ? ALL_SYMBOL : statusSymbol(option)}
              modifiers={[tag(option), accessibilityLabel(label(option))]}
            />
          ),
        )}
      </Picker>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: { marginHorizontal: 16 },
});
