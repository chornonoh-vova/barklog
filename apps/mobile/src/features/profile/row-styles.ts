import {
  buttonStyle,
  contentShape,
  foregroundStyle,
  frame,
  padding,
  shapes,
  type ModifierConfig,
} from "@expo/ui/swift-ui/modifiers";
import { createContext, useContext } from "react";
import { PlatformColor } from "react-native";

/** Rows are `plain` buttons, as in Expo UI's Settings recipe: the default
 * style tints everything blue. Only Delete Account is red. */
export const PRIMARY = foregroundStyle({ type: "hierarchical", style: "primary" });
export const SECONDARY = foregroundStyle({ type: "hierarchical", style: "secondary" });
export const TERTIARY = foregroundStyle({ type: "hierarchical", style: "tertiary" });
export const DESTRUCTIVE = foregroundStyle(PlatformColor("systemRed"));

export const ROW = [buttonStyle("plain")];

/** Between a row's icon, title and trailing content. */
export const ROW_SPACING = 12;
/** A card row's side inset, as in an inset-grouped list. */
export const ROW_INSET = 16;

/** A plain button only hit-tests its drawn content; the shape makes the space
 * beside a `Spacer` tappable too. */
const ROW_SHAPE = contentShape(shapes.rectangle());
const LIST_ROW = [ROW_SHAPE];
/** Padding before the shape, so the whole padded card row stays tappable. */
const CARD_ROW = [
  padding({ horizontal: ROW_INSET, vertical: 8 }),
  frame({ maxWidth: Infinity, minHeight: 44, alignment: "leading" }),
  ROW_SHAPE,
];

/** Whether rows sit in hand-built cards (wide Profile) rather than a `Form`. */
const CardsContext = createContext(false);

export const GroupedCards = CardsContext.Provider;

export const useCards = () => useContext(CardsContext);

export function useRowShape(): ModifierConfig[] {
  return useCards() ? CARD_ROW : LIST_ROW;
}
