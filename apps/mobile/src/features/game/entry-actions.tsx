import { HStack, Menu, Picker, Text, VStack } from "@expo/ui/swift-ui";
import {
  accessibilityLabel,
  buttonStyle,
  clipShape,
  controlSize,
  foregroundStyle,
  pickerStyle,
  tag,
} from "@expo/ui/swift-ui/modifiers";
import { RATING_MAX, RATING_MIN, type BacklogEntryWire, type BacklogStatus } from "@repo/contracts";
import { useTranslation } from "react-i18next";
import { PlatformColor, StyleSheet } from "react-native";

import { STATUS_ORDER } from "@/features/backlog/sections";
import {
  ratingButtonLabel,
  ratingButtonSymbol,
  ratingSpoken,
  statusButtonLabel,
  statusButtonSymbol,
  statusLabel,
} from "@/features/game/format";
import { wouldExceedSlots } from "@/features/paywall/should-offer-paywall";
import { Brand } from "@/theme";
import { MeasuredHost } from "@/ui/measured-host";
import { GLASS_PROMINENT_STYLE } from "@/ui/platform-glass";
import { useIsAccessibilitySize } from "@/ui/use-accessibility-size";

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
  premium: boolean | undefined;
  activeCount: number | undefined;
  onBlocked: () => void;
  onUpsert: (input: { status: BacklogStatus; rating: number | null }) => void;
}) {
  const status = entry?.status ?? null;
  const rating = entry?.rating ?? null;
  // Two large capsules side by side truncate at accessibility sizes.
  const Container = useIsAccessibilitySize() ? VStack : HStack;
  const { t } = useTranslation();
  return (
    <MeasuredHost style={styles.host}>
      <Container>
        {status === null ? null : (
          <Menu
            label={ratingButtonLabel(rating)}
            systemImage={ratingButtonSymbol(rating)}
            modifiers={[
              buttonStyle("bordered"),
              controlSize("large"),
              clipShape("capsule"),
              foregroundStyle(rating === null ? PlatformColor("label") : Brand.tint),
              accessibilityLabel(ratingSpoken(rating)),
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
              <Text modifiers={[tag(NO_RATING)]}>{t("game.noRating")}</Text>
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
      </Container>
    </MeasuredHost>
  );
}

const styles = StyleSheet.create({
  host: { margin: 8 },
});
