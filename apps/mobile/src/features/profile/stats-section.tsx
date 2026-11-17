import { Button, HStack, Section, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import { accessibilityElement, accessibilityLabel, font } from "@expo/ui/swift-ui/modifiers";
import type { BacklogStatus } from "@repo/contracts";
import { useTranslation } from "react-i18next";

import {
  averageRatingRow,
  backlogStats,
  statsTitle,
  statusRows,
} from "@/features/profile/backlog-stats";
import { PRIMARY, ROW, ROW_SHAPE, SECONDARY } from "@/features/profile/row-styles";
import { Chevron, NavigationRow } from "@/features/profile/rows";
import { SettingsIcon } from "@/features/profile/settings-icon";
import { useBacklog } from "@/lib/api/hooks";

/**
 * Backlog stats, derived from the one backlog query (ADR-0003). Absent until
 * the backlog has loaded once: before that it cannot say the backlog is empty.
 */
export function StatsSection({
  onOpenStatus,
  onFindGames,
}: {
  onOpenStatus: (status: BacklogStatus) => void;
  onFindGames: () => void;
}) {
  const { data } = useBacklog();
  const { t } = useTranslation();

  if (data === undefined) return null;

  if (data.items.length === 0) {
    return (
      <Section
        title={t("profile.stats.title")}
        footer={<Text>{t("profile.stats.emptyFooter")}</Text>}
      >
        <NavigationRow
          title={t("profile.stats.findGames")}
          onPress={onFindGames}
          icon={<SettingsIcon systemName="gamecontroller.fill" color="systemBlue" />}
        />
      </Section>
    );
  }

  const stats = backlogStats(data.items);
  const average = averageRatingRow(stats);

  // The average is one summary number, not a list to open, so it gets a group
  // of its own instead of reading as a fifth status.
  return (
    <>
      <Section title={statsTitle(stats.total)}>
        {statusRows(stats).map((row) => (
          <Button
            key={row.status}
            onPress={() => onOpenStatus(row.status)}
            modifiers={[...ROW, accessibilityLabel(row.accessibilityLabel)]}
          >
            <HStack spacing={12} modifiers={[ROW_SHAPE]}>
              <SettingsIcon systemName={row.icon} color={row.color} />
              <Text modifiers={[PRIMARY]}>{row.title}</Text>
              <Spacer />
              <Text modifiers={[SECONDARY]}>{row.value}</Text>
              <Chevron />
            </HStack>
          </Button>
        ))}
      </Section>
      {average === null ? null : (
        <Section>
          <HStack
            spacing={12}
            modifiers={[
              ROW_SHAPE,
              accessibilityElement("ignore"),
              accessibilityLabel(average.accessibilityLabel),
            ]}
          >
            <SettingsIcon systemName="star.fill" color="systemYellow" />
            <VStack alignment="leading" spacing={2}>
              <Text modifiers={[PRIMARY]}>{average.title}</Text>
              <Text modifiers={[font({ textStyle: "subheadline" }), SECONDARY]}>
                {average.subtitle}
              </Text>
            </VStack>
            <Spacer />
            <Text modifiers={[SECONDARY]}>{average.value}</Text>
          </HStack>
        </Section>
      )}
    </>
  );
}
