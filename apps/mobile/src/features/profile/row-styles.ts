import { buttonStyle, contentShape, foregroundStyle, shapes } from "@expo/ui/swift-ui/modifiers";
import { PlatformColor } from "react-native";

/** Rows are `plain` buttons, as in Expo UI's Settings recipe: the default
 * style tints everything blue. Text then takes hierarchical styles, which
 * follow light and dark mode; only Delete Account is red. */
export const PRIMARY = foregroundStyle({ type: "hierarchical", style: "primary" });
export const SECONDARY = foregroundStyle({ type: "hierarchical", style: "secondary" });
export const TERTIARY = foregroundStyle({ type: "hierarchical", style: "tertiary" });
export const DESTRUCTIVE = foregroundStyle(PlatformColor("systemRed"));

/** Every row names itself, so VoiceOver never reads a tile's symbol name.
 * A plain button only hit-tests its drawn content; the row's shape makes the
 * empty space beside a `Spacer` tappable too. */
export const ROW = [buttonStyle("plain")];
export const ROW_SHAPE = contentShape(shapes.rectangle());
