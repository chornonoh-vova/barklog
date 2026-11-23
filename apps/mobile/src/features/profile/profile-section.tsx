import { Divider, Section, Text, VStack } from "@expo/ui/swift-ui";
import {
  background,
  font,
  frame,
  padding,
  shapes,
  type ModifierConfig,
} from "@expo/ui/swift-ui/modifiers";
import { Children, createContext, useContext, type ReactNode } from "react";
import { PlatformColor } from "react-native";

import { ROW_SHAPE, SECONDARY } from "@/features/profile/row-styles";

/**
 * Whether Profile's sections render as hand-built grouped cards instead of
 * native `Form` sections. Wide windows need cards: two columns of `Form`s
 * would be two scroll views, so each side would scroll on its own.
 */
const CardsContext = createContext(false);

export const ProfileCards = CardsContext.Provider;

/** Insets matching an inset-grouped list's rows and section text. */
const ROW_INSET = 16;
const TEXT_INSET = 20;
/** iOS 26's inset-grouped corner radius. */
const CARD_RADIUS = 26;
/** Where a row's title starts: the inset plus a 28pt icon tile and its 12pt gap,
 * so separators start under the title, as in Settings. */
const SEPARATOR_INSET = ROW_INSET + 28 + 12;

/**
 * Modifiers for a row's content. In a card, the padding goes inside the row
 * and before its content shape, so the whole padded row stays tappable.
 */
export function rowShape(cards: boolean): ModifierConfig[] {
  if (!cards) return [ROW_SHAPE];

  return [
    padding({ horizontal: ROW_INSET, vertical: 8 }),
    frame({ maxWidth: Infinity, minHeight: 44, alignment: "leading" }),
    ROW_SHAPE,
  ];
}

/** `rowShape` for a row inside `ProfileCards`. */
export function useRowShape(): ModifierConfig[] {
  return rowShape(useContext(CardsContext));
}

/**
 * One group of Profile rows: a native `Section` inside a `Form`, or a grouped
 * card in the wide layout. Null children (a row with nothing to show) are
 * skipped, so they never leave a stray separator.
 */
export function ProfileSection({
  title,
  footer,
  children,
}: {
  title?: string;
  footer?: string;
  children: ReactNode;
}) {
  const cards = useContext(CardsContext);

  if (!cards) {
    return (
      <Section title={title} footer={footer === undefined ? undefined : <Text>{footer}</Text>}>
        {children}
      </Section>
    );
  }

  const rows = Children.toArray(children);

  return (
    <VStack alignment="leading" spacing={8}>
      {title === undefined ? null : (
        <Text
          modifiers={[
            font({ textStyle: "subheadline", weight: "semibold" }),
            SECONDARY,
            padding({ horizontal: TEXT_INSET }),
          ]}
        >
          {title}
        </Text>
      )}
      <VStack
        alignment="leading"
        spacing={0}
        modifiers={[
          background(
            PlatformColor("secondarySystemGroupedBackground"),
            shapes.roundedRectangle({ cornerRadius: CARD_RADIUS }),
          ),
        ]}
      >
        {rows.flatMap((row, index) =>
          index === 0
            ? [row]
            : [
                <Divider
                  key={`divider-${index}`}
                  modifiers={[padding({ leading: SEPARATOR_INSET })]}
                />,
                row,
              ],
        )}
      </VStack>
      {footer === undefined ? null : (
        <Text
          modifiers={[
            font({ textStyle: "footnote" }),
            SECONDARY,
            padding({ horizontal: TEXT_INSET }),
          ]}
        >
          {footer}
        </Text>
      )}
    </VStack>
  );
}
