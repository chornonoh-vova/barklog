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

/** `plain` buttons: the default style tints everything blue. */
export const PRIMARY = foregroundStyle({ type: "hierarchical", style: "primary" });
export const SECONDARY = foregroundStyle({ type: "hierarchical", style: "secondary" });
export const TERTIARY = foregroundStyle({ type: "hierarchical", style: "tertiary" });
export const DESTRUCTIVE = foregroundStyle(PlatformColor("systemRed"));

export const ROW = [buttonStyle("plain")];

export const ROW_SPACING = 12;
export const ROW_INSET = 16;

/** A plain button only hit-tests drawn content; the shape makes `Spacer` space tappable. */
const ROW_SHAPE = contentShape(shapes.rectangle());
const LIST_ROW = [ROW_SHAPE];
/** Padding before the shape, so the padded row stays tappable. */
const CARD_ROW = [
  padding({ horizontal: ROW_INSET, vertical: 8 }),
  frame({ maxWidth: Infinity, minHeight: 44, alignment: "leading" }),
  ROW_SHAPE,
];

const CardsContext = createContext(false);

export const GroupedCards = CardsContext.Provider;

export const useCards = () => useContext(CardsContext);

export function useRowShape(): ModifierConfig[] {
  return useCards() ? CARD_ROW : LIST_ROW;
}
