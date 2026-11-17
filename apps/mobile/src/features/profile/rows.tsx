import { Button, HStack, Image, Spacer, Text } from "@expo/ui/swift-ui";
import { accessibilityLabel, imageScale } from "@expo/ui/swift-ui/modifiers";
import { openURL } from "expo-linking";
import type { ReactNode } from "react";

import { PRIMARY, ROW, ROW_SHAPE, TERTIARY } from "@/features/profile/row-styles";

/** Settings' disclosure indicator: small and in the tertiary style. */
export function Chevron() {
  return <Image systemName="chevron.right" modifiers={[imageScale("small"), TERTIARY]} />;
}

/** The trailing mark of a row that leaves the app. */
function ExternalMark() {
  return <Image systemName="arrow.up.forward" modifiers={[imageScale("small"), TERTIARY]} />;
}

type RowProps = { title: string; icon?: ReactNode };

/** A row that pushes a screen inside the app. */
export function NavigationRow({ title, icon, onPress }: RowProps & { onPress: () => void }) {
  return (
    <Button onPress={onPress} modifiers={[...ROW, accessibilityLabel(title)]}>
      <HStack spacing={12} modifiers={[ROW_SHAPE]}>
        {icon}
        <Text modifiers={[PRIMARY]}>{title}</Text>
        <Spacer />
        <Chevron />
      </HStack>
    </Button>
  );
}

/** A row that does something in place, such as opening a system sheet. */
export function ActionRow({ title, icon, onPress }: RowProps & { onPress: () => void }) {
  return (
    <Button onPress={onPress} modifiers={[...ROW, accessibilityLabel(title)]}>
      <HStack spacing={12} modifiers={[ROW_SHAPE]}>
        {icon}
        <Text modifiers={[PRIMARY]}>{title}</Text>
        <Spacer />
      </HStack>
    </Button>
  );
}

/** A row that opens a web page or the App Store, outside the app. */
export function ExternalLinkRow({ title, icon, url }: RowProps & { url: string }) {
  return (
    <Button onPress={() => void openURL(url)} modifiers={[...ROW, accessibilityLabel(title)]}>
      <HStack spacing={12} modifiers={[ROW_SHAPE]}>
        {icon}
        <Text modifiers={[PRIMARY]}>{title}</Text>
        <Spacer />
        <ExternalMark />
      </HStack>
    </Button>
  );
}
