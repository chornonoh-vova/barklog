import { Button, Divider, Host, Menu, Picker, Text } from "@expo/ui/swift-ui";
import {
  accessibilityLabel,
  buttonStyle,
  foregroundStyle,
  labelStyle,
  pickerStyle,
  tag,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import type { BacklogStatus } from "@repo/contracts";
import { PlatformColor, StyleSheet } from "react-native";

import { STATUS_ORDER } from "@/features/backlog/sections";
import { statusLabel, statusSymbol } from "@/features/game/format";
import { i18n } from "@/lib/i18n/instance";

/**
 * The `…` on a Home row. A visible button rather than a long-press menu: it is
 * found without guessing, and touch, VoiceOver and pointer all reach it the same
 * way (spec §3.4). SwiftUI's own `Menu`, so the pointer effect comes free.
 */
export function BacklogRowMenu({
  name,
  status,
  onStatus,
  onShare,
  onRemove,
}: {
  name: string;
  status: BacklogStatus;
  onStatus: (next: BacklogStatus) => void;
  onShare: () => void;
  onRemove: () => void;
}) {
  // `i18n.t`, not `useTranslation`: that would subscribe every row to a
  // language change, and iOS relaunches the app on one anyway.
  return (
    // Label-coloured, not the brand tint: menu icons follow the host's tint,
    // and a menu of brand-coloured icons reads as a row of links.
    <Host style={styles.host} seedColor={PlatformColor("label")}>
      <Menu
        label={i18n.t("backlog.more")}
        systemImage="ellipsis.circle"
        modifiers={[
          labelStyle("iconOnly"),
          buttonStyle("borderless"),
          foregroundStyle(PlatformColor("secondaryLabel")),
          accessibilityLabel(i18n.t("backlog.moreFor", { name })),
        ]}
      >
        <Menu label={i18n.t("backlog.statusMenu")} systemImage={statusSymbol(status)}>
          <Picker
            selection={status}
            onSelectionChange={(selection) => onStatus(selection as BacklogStatus)}
            modifiers={[pickerStyle("inline")]}
          >
            {STATUS_ORDER.map((value) => (
              <Text key={value} modifiers={[tag(value)]}>
                {statusLabel(value)}
              </Text>
            ))}
          </Picker>
        </Menu>
        <Button
          label={i18n.t("common.share")}
          systemImage="square.and.arrow.up"
          onPress={onShare}
        />
        <Divider />
        <Button
          label={i18n.t("backlog.removeFromBacklog")}
          systemImage="trash"
          role="destructive"
          onPress={onRemove}
          // The role reddens the title only; the icon follows the tint.
          modifiers={[tint(PlatformColor("systemRed"))]}
        />
      </Menu>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: { width: 44, height: 44 },
});
