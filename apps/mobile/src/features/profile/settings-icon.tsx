import { Image } from "@expo/ui/swift-ui";
import { background, frame, shapes } from "@expo/ui/swift-ui/modifiers";
import { PlatformColor } from "react-native";
import type { SFSymbol } from "sf-symbols-typescript";

/** iOS system colours, so each tile follows the system's light and dark
 * variants the way Settings' tiles do. */
export type TileColor =
  | "systemOrange"
  | "systemBlue"
  | "systemGreen"
  | "systemIndigo"
  | "systemGray"
  | "systemRed"
  | "systemBrown"
  | "systemYellow";

const TILE = 28;

/**
 * A Settings-style icon: a white symbol on a rounded, coloured tile.
 * Decorative: the row's own label names the action.
 */
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
