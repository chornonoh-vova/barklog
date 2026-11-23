import { Button, HStack, Image, Spacer, Text } from "@expo/ui/swift-ui";
import { accessibilityLabel, imageScale, type ModifierConfig } from "@expo/ui/swift-ui/modifiers";
import { openURL } from "expo-linking";
import type { ReactNode } from "react";

import {
  DESTRUCTIVE,
  PRIMARY,
  ROW,
  ROW_SPACING,
  TERTIARY,
  useRowShape,
} from "@/features/profile/row-styles";

export function Chevron() {
  return <Image systemName="chevron.right" modifiers={[imageScale("small"), TERTIARY]} />;
}

function ExternalMark() {
  return <Image systemName="arrow.up.forward" modifiers={[imageScale("small"), TERTIARY]} />;
}

type RowProps = { title: string; icon?: ReactNode; onPress: () => void };

/** The Settings-style row the others build on. */
export function ActionRow({
  title,
  icon,
  onPress,
  trailing,
  label = title,
  destructive = false,
  modifiers = [],
}: RowProps & {
  trailing?: ReactNode;
  /** VoiceOver label, when the title alone does not say enough. */
  label?: string;
  destructive?: boolean;
  modifiers?: ModifierConfig[];
}) {
  const rowShape = useRowShape();

  return (
    <Button
      role={destructive ? "destructive" : undefined}
      onPress={onPress}
      modifiers={[...ROW, ...modifiers, accessibilityLabel(label)]}
    >
      <HStack spacing={ROW_SPACING} modifiers={rowShape}>
        {icon}
        <Text modifiers={[destructive ? DESTRUCTIVE : PRIMARY]}>{title}</Text>
        <Spacer />
        {trailing}
      </HStack>
    </Button>
  );
}

export function NavigationRow(props: RowProps) {
  return <ActionRow {...props} trailing={<Chevron />} />;
}

export function ExternalLinkRow({ url, ...props }: Omit<RowProps, "onPress"> & { url: string }) {
  return <ActionRow {...props} onPress={() => void openURL(url)} trailing={<ExternalMark />} />;
}
