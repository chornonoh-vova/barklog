import type { screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

type Host = ReturnType<typeof screen.getByText>;

/** The nearest scroll view around an element: `horizontal` for a shelf. */
export function scrollViewAround(element: Host, { horizontal }: { horizontal: boolean }): Host {
  let node: Host | null = element;
  while (
    node !== null &&
    !(node.type === "RCTScrollView" && !!node.props.horizontal === horizontal)
  ) {
    node = node.parent;
  }
  if (node === null) throw new Error("no scroll view of that direction around the element");
  return node;
}

/** The side padding of a scroll view's own frame and of its content. */
export function sidePadding(scrollView: Host) {
  const pick = (style: unknown) => {
    const flat = StyleSheet.flatten(style as never) ?? {};
    return { left: flat.paddingLeft, right: flat.paddingRight };
  };
  return {
    frame: pick(scrollView.props.style),
    content: pick(scrollView.props.contentContainerStyle),
  };
}
