import { Host, Picker, Text } from "@expo/ui/swift-ui";
import { pickerStyle, tag } from "@expo/ui/swift-ui/modifiers";
import type { BacklogStatus } from "@repo/contracts";
import { StyleSheet } from "react-native";

import { STATUS_ORDER } from "@/features/backlog/sections";
import { statusLabel } from "@/features/game/format";
import { Brand } from "@/theme";

const ALL = "all";

/**
 * A real UISegmentedControl via SwiftUI, per the composition rule: lists are
 * React Native, controls are `@expo/ui`.
 *
 * Options follow `STATUS_ORDER`, so the segments read in the same order the
 * sections below them do.
 */
export function StatusFilter({
  value,
  onChange,
}: {
  value: BacklogStatus | undefined;
  onChange: (status: BacklogStatus | undefined) => void;
}) {
  return (
    <Host style={styles.host} matchContents={{ vertical: true }} seedColor={Brand.tint}>
      <Picker
        selection={value ?? ALL}
        onSelectionChange={(selection) =>
          onChange(selection === ALL ? undefined : (selection as BacklogStatus))
        }
        modifiers={[pickerStyle("segmented")]}
      >
        <Text modifiers={[tag(ALL)]}>All</Text>
        {STATUS_ORDER.map((status) => (
          <Text key={status} modifiers={[tag(status)]}>
            {statusLabel(status)}
          </Text>
        ))}
      </Picker>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: { marginHorizontal: 16, marginBottom: 8 },
});
