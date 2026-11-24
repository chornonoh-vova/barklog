import { Divider, Section, Text, VStack } from "@expo/ui/swift-ui";
import {
  background,
  font,
  padding,
  shapes,
  type ModifierConfig,
} from "@expo/ui/swift-ui/modifiers";
import { Children, type ReactNode } from "react";
import { PlatformColor } from "react-native";

import { ROW_INSET, ROW_SPACING, SECONDARY, useCards } from "@/features/profile/row-styles";
import { TILE } from "@/features/profile/settings-icon";

/** iOS 26's inset-grouped corner radius. */
const CARD_RADIUS = 26;
const CARD = [
  background(
    PlatformColor("secondarySystemGroupedBackground"),
    shapes.roundedRectangle({ cornerRadius: CARD_RADIUS }),
  ),
];
/** Separators start under the title, past the icon tile, as in Settings. */
const SEPARATOR = [padding({ leading: ROW_INSET + TILE + ROW_SPACING })];
const CAPTION_INSET = padding({ horizontal: 20 });
const TITLE = [font({ textStyle: "subheadline", weight: "semibold" }), SECONDARY, CAPTION_INSET];
const FOOTER = [font({ textStyle: "footnote" }), SECONDARY, CAPTION_INSET];

function Caption({ modifiers, text }: { modifiers: ModifierConfig[]; text?: string }) {
  return text === undefined ? null : <Text modifiers={modifiers}>{text}</Text>;
}

/** A native `Section` in a `Form`, or a grouped card when `GroupedCards` is on. */
export function ProfileSection({
  title,
  footer,
  children,
}: {
  title?: string;
  footer?: string;
  children: ReactNode;
}) {
  if (!useCards()) {
    return (
      <Section title={title} footer={footer === undefined ? undefined : <Text>{footer}</Text>}>
        {children}
      </Section>
    );
  }

  // `toArray` drops null rows, so they never leave a stray separator.
  const rows = Children.toArray(children);

  return (
    <VStack alignment="leading" spacing={8}>
      <Caption modifiers={TITLE} text={title} />
      <VStack alignment="leading" spacing={0} modifiers={CARD}>
        {rows.flatMap((row, index) =>
          index === 0 ? [row] : [<Divider key={`divider-${index}`} modifiers={SEPARATOR} />, row],
        )}
      </VStack>
      <Caption modifiers={FOOTER} text={footer} />
    </VStack>
  );
}
