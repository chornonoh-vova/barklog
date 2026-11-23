import { Button, HStack, Image, Spacer, Text } from "@expo/ui/swift-ui";
import { accessibilityLabel, imageScale } from "@expo/ui/swift-ui/modifiers";
import { openURL } from "expo-linking";
import type { ReactNode } from "react";

import { useRowShape } from "@/features/profile/profile-section";
import { PRIMARY, ROW, TERTIARY } from "@/features/profile/row-styles";

/** Settings' disclosure indicator: small and in the tertiary style. */
export function Chevron() {
  return <Image systemName="chevron.right" modifiers={[imageScale("small"), TERTIARY]} />;
}

/** The trailing mark of a row that leaves the app. */
function ExternalMark() {
  return <Image systemName="arrow.up.forward" modifiers={[imageScale("small"), TERTIARY]} />;
}

type RowProps = { title: string; icon?: ReactNode; onPress: () => void };

/**
 * The one Settings-style row the others build on; only the trailing mark
 * differs. A row that opens a sheet in place, like the mail composer, has none.
 */
export function ActionRow({ title, icon, onPress, trailing }: RowProps & { trailing?: ReactNode }) {
  const rowShape = useRowShape();

  return (
    <Button onPress={onPress} modifiers={[...ROW, accessibilityLabel(title)]}>
      <HStack spacing={12} modifiers={rowShape}>
        {icon}
        <Text modifiers={[PRIMARY]}>{title}</Text>
        <Spacer />
        {trailing}
      </HStack>
    </Button>
  );
}

/** A row that pushes a screen inside the app. */
export function NavigationRow(props: RowProps) {
  return <ActionRow {...props} trailing={<Chevron />} />;
}

/** A row that opens a web page or the App Store, outside the app. */
export function ExternalLinkRow({ url, ...props }: Omit<RowProps, "onPress"> & { url: string }) {
  return <ActionRow {...props} onPress={() => void openURL(url)} trailing={<ExternalMark />} />;
}
