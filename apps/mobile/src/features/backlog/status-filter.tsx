import { HStack, Menu, Picker, Spacer, Text } from "@expo/ui/swift-ui";
import { buttonStyle, clipShape, pickerStyle, tag } from "@expo/ui/swift-ui/modifiers";
import type { BacklogStatus } from "@repo/contracts";
import { StyleSheet } from "react-native";

import { STATUS_ORDER } from "@/features/backlog/sections";
import { statusLabel } from "@/features/game/format";
import { MeasuredHost } from "@/ui/measured-host";
import { GLASS_PROMINENT_STYLE } from "@/ui/platform-glass";

const ALL = "all";

export function StatusFilter({
  value,
  onChange,
}: {
  value: BacklogStatus | undefined;
  onChange: (status: BacklogStatus | undefined) => void;
}) {
  return (
    <MeasuredHost style={styles.host}>
      <HStack>
        <Text>Show</Text>
        <Spacer />
        <Menu
          label={value ? statusLabel(value) : "All"}
          systemImage="line.3.horizontal.decrease"
          modifiers={[buttonStyle(GLASS_PROMINENT_STYLE), clipShape("capsule")]}
        >
          <Picker
            selection={value ?? ALL}
            onSelectionChange={(selection) =>
              onChange(selection === ALL ? undefined : (selection as BacklogStatus))
            }
            modifiers={[pickerStyle("inline")]}
          >
            <Text modifiers={[tag(ALL)]}>All</Text>
            {STATUS_ORDER.map((status) => (
              <Text key={status} modifiers={[tag(status)]}>
                {statusLabel(status)}
              </Text>
            ))}
          </Picker>
        </Menu>
      </HStack>
    </MeasuredHost>
  );
}

const styles = StyleSheet.create({
  host: { marginHorizontal: 16 },
});
