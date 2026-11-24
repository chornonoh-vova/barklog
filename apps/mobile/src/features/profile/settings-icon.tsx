import { Image } from "@expo/ui/swift-ui";
import { background, frame, shapes } from "@expo/ui/swift-ui/modifiers";
import { PlatformColor } from "react-native";
import type { SFSymbol } from "sf-symbols-typescript";

/** System colours, so tiles follow light and dark like Settings'. */
export type TileColor =
  | "systemOrange"
  | "systemBlue"
  | "systemGreen"
  | "systemIndigo"
  | "systemGray"
  | "systemRed"
  | "systemBrown"
  | "systemYellow";

export const TILE = 28;

/** Decorative: the row's own label names the action. */
export function SettingsIcon({ systemName, color }: { systemName: SFSymbol; color: TileColor }) {
  return (
    <Image
      systemName={systemName}
      size={16}
      color="white"
      modifiers={[
        frame({ width: TILE, height: TILE }),
        background(PlatformColor(color), shapes.roundedRectangle({ cornerRadius: 7 })),
      ]}
    />
  );
}
