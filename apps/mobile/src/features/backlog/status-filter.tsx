import { HStack, Menu, Picker, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import { buttonStyle, clipShape, pickerStyle, tag } from "@expo/ui/swift-ui/modifiers";
import type { BacklogStatus } from "@repo/contracts";
import { StyleSheet, useWindowDimensions } from "react-native";

import { STATUS_ORDER } from "@/features/backlog/sections";
import { statusLabel } from "@/features/game/format";
import { MeasuredHost } from "@/ui/measured-host";
import { GLASS_PROMINENT_STYLE } from "@/ui/platform-glass";
import { isAccessibilitySize } from "@/ui/text-size";

const ALL = "all";

export function StatusFilter({
  value,
  onChange,
}: {
  value: BacklogStatus | undefined;
  onChange: (status: BacklogStatus | undefined) => void;
}) {
  const { fontScale } = useWindowDimensions();
  const menu = (
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
  );

  return (
    <MeasuredHost style={styles.host}>
      {isAccessibilitySize(fontScale) ? (
        <VStack alignment="leading">
          <Text>Show</Text>
          {menu}
        </VStack>
      ) : (
        <HStack>
          <Text>Show</Text>
          <Spacer />
          {menu}
        </HStack>
      )}
    </MeasuredHost>
  );
}

const styles = StyleSheet.create({
  host: { marginHorizontal: 16 },
});
