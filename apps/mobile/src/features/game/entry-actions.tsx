import { Button, HStack, Menu, Picker, Text } from "@expo/ui/swift-ui";
import {
  buttonStyle,
  clipShape,
  controlSize,
  disabled,
  pickerStyle,
  tag,
} from "@expo/ui/swift-ui/modifiers";
import { RATING_MAX, RATING_MIN, type BacklogEntryWire, type BacklogStatus } from "@repo/contracts";
import { StyleSheet } from "react-native";

import { STATUS_ORDER } from "@/features/backlog/sections";
import {
  ratingButtonLabel,
  statusButtonLabel,
  statusButtonSymbol,
  statusLabel,
} from "@/features/game/format";
import { MeasuredHost } from "@/ui/measured-host";
import { GLASS_PROMINENT_STYLE, GLASS_STYLE } from "@/ui/platform-glass";

const NO_RATING = 0;
const RATINGS = Array.from({ length: RATING_MAX - RATING_MIN + 1 }, (_, i) => RATING_MIN + i);

/**
 * Every change writes immediately. `PUT` is a full replace of a two-field
 * resource and the client holds both fields, so a Save button would add a
 * dirty-state concept for nothing.
 */
export function EntryActions({
  entry,
  onUpsert,
  onRemove,
}: {
  entry: BacklogEntryWire | null;
  onUpsert: (input: { status: BacklogStatus; rating: number | null }) => void;
  onRemove: () => void;
}) {
  const status = entry?.status ?? null;
  const rating = entry?.rating ?? null;
  return (
    <MeasuredHost style={styles.host}>
      <HStack>
        <Menu
          label={`★ ${ratingButtonLabel(rating)}`.trim()}
          modifiers={[
            buttonStyle(GLASS_STYLE),
            controlSize("large"),
            clipShape("capsule"),
            // A rating cannot exist without a status: PUT requires one.
            disabled(status === null),
          ]}
        >
          <Picker
            selection={rating ?? NO_RATING}
            onSelectionChange={(selection) => {
              if (status === null) return;
              onUpsert({
                status,
                rating: selection === NO_RATING ? null : Number(selection),
              });
            }}
            modifiers={[pickerStyle("inline")]}
          >
            <Text modifiers={[tag(NO_RATING)]}>No rating</Text>
            {RATINGS.map((value) => (
              <Text key={value} modifiers={[tag(value)]}>
                {String(value)}
              </Text>
            ))}
          </Picker>
        </Menu>

        <Menu
          label={statusButtonLabel(status)}
          systemImage={statusButtonSymbol(status)}
          modifiers={[
            buttonStyle(GLASS_PROMINENT_STYLE),
            controlSize("large"),
            clipShape("capsule"),
          ]}
        >
          <Picker
            selection={status ?? ""}
            onSelectionChange={(selection) =>
              onUpsert({ status: selection as BacklogStatus, rating })
            }
            modifiers={[pickerStyle("inline")]}
          >
            {STATUS_ORDER.map((value) => (
              <Text key={value} modifiers={[tag(value)]}>
                {statusLabel(value)}
              </Text>
            ))}
          </Picker>
        </Menu>

        {status === null ? null : (
          <Menu
            label="More"
            systemImage="ellipsis"
            modifiers={[buttonStyle(GLASS_STYLE), controlSize("large"), clipShape("capsule")]}
          >
            <Button role="destructive" label="Remove from Backlog" onPress={onRemove} />
          </Menu>
        )}
      </HStack>
    </MeasuredHost>
  );
}

const styles = StyleSheet.create({
  host: { margin: 8 },
});
