import { HStack, Menu, Picker, Text } from "@expo/ui/swift-ui";
import {
  buttonStyle,
  clipShape,
  controlSize,
  foregroundStyle,
  pickerStyle,
  tag,
} from "@expo/ui/swift-ui/modifiers";
import { RATING_MAX, RATING_MIN, type BacklogEntryWire, type BacklogStatus } from "@repo/contracts";
import { PlatformColor, StyleSheet } from "react-native";

import { STATUS_ORDER } from "@/features/backlog/sections";
import {
  ratingButtonLabel,
  statusButtonLabel,
  statusButtonSymbol,
  statusLabel,
} from "@/features/game/format";
import { wouldExceedSlots } from "@/features/paywall/should-offer-paywall";
import { Brand } from "@/theme";
import { MeasuredHost } from "@/ui/measured-host";
import { GLASS_PROMINENT_STYLE } from "@/ui/platform-glass";

const NO_RATING = 0;
const RATINGS = Array.from({ length: RATING_MAX - RATING_MIN + 1 }, (_, i) => RATING_MIN + i);

export function EntryActions({
  entry,
  premium,
  activeCount,
  onBlocked,
  onUpsert,
}: {
  entry: BacklogEntryWire | null;
  premium: boolean;
  activeCount: number | undefined;
  onBlocked: () => void;
  onUpsert: (input: { status: BacklogStatus; rating: number | null }) => void;
}) {
  const status = entry?.status ?? null;
  const rating = entry?.rating ?? null;
  return (
    <MeasuredHost style={styles.host}>
      <HStack>
        {status === null ? null : (
          <Menu
            label={`★ ${ratingButtonLabel(rating)}`.trim()}
            modifiers={[
              buttonStyle("bordered"),
              controlSize("large"),
              clipShape("capsule"),
              foregroundStyle(rating === null ? PlatformColor("label") : Brand.tint),
            ]}
          >
            <Picker
              selection={rating ?? NO_RATING}
              onSelectionChange={(selection) =>
                onUpsert({
                  status,
                  rating: selection === NO_RATING ? null : Number(selection),
                })
              }
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
        )}

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
            onSelectionChange={(selection) => {
              const next = selection as BacklogStatus;

              if (wouldExceedSlots({ premium, activeCount, from: status, to: next })) {
                onBlocked();
                return;
              }

              onUpsert({ status: next, rating });
            }}
            modifiers={[pickerStyle("inline")]}
          >
            {STATUS_ORDER.map((value) => (
              <Text key={value} modifiers={[tag(value)]}>
                {statusLabel(value)}
              </Text>
            ))}
          </Picker>
        </Menu>
      </HStack>
    </MeasuredHost>
  );
}

const styles = StyleSheet.create({
  host: { margin: 8 },
});
