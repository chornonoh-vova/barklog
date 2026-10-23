/**
 * Queries for what RNTL's role and text queries cannot reach: native views
 * that render as opaque hosts, layout read off host props, and the native
 * navigation bar, whose items are props rather than elements.
 */
import { fireEvent, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

export type Host = ReturnType<typeof screen.getByText>;

/** Every rendered host of a native view type, e.g. `"ViewManagerAdapter_ExpoImage"`. */
export function nativeViews(type: string): Host[] {
  return screen.container.queryAll((node) => node.type === type);
}

/** The first rendered host of a native view type; throws if there is none. */
export function nativeView(type: string): Host {
  const [view] = nativeViews(type);
  if (view === undefined) throw new Error(`no ${type} rendered`);
  return view;
}

/** The element itself or its nearest ancestor that passes `test`; throws if none does. */
export function ancestor(element: Host, test: (node: Host) => boolean): Host {
  let node: Host | null = element;
  while (node !== null && !test(node)) node = node.parent;
  if (node === null) throw new Error("no ancestor passes the test");
  return node;
}

/** The nearest scroll view around an element: `horizontal` for a shelf. */
export function scrollViewAround(element: Host, { horizontal }: { horizontal: boolean }): Host {
  return ancestor(
    element,
    (node) => node.type === "RCTScrollView" && !!node.props.horizontal === horizontal,
  );
}

type Sides = { left: unknown; right: unknown };

function sides(style: unknown): Sides {
  const flat = StyleSheet.flatten(style as never) ?? {};
  return { left: flat.paddingLeft, right: flat.paddingRight };
}

/** The side padding of a scroll view's own frame and of its content. */
export function sidePadding(scrollView: Host): { frame: Sides; content: Sides } {
  return {
    frame: sides(scrollView.props.style),
    content: sides(scrollView.props.contentContainerStyle),
  };
}

/**
 * How a shelf is inset, read from one of its items and its title: the list's
 * own frame, its content, and the title. A full-bleed shelf has no frame
 * padding, so its items can scroll under a side safe area.
 */
export function shelfInsets(
  item: Host,
  title: string,
): { frame: Sides; content: Sides; title: Sides } {
  return {
    ...sidePadding(scrollViewAround(item, { horizontal: true })),
    title: sides(screen.getByText(title).props.style),
  };
}

export type BarItem = {
  accessibilityLabel?: string;
  buttonId?: string;
  sfSymbolName?: string;
  type?: "button" | "menu";
  disabled?: boolean;
  onPress?: () => void;
  menu?: { items: { title: string; destructive?: boolean; onPress: () => void }[] };
};

type NavigationBar = { config: Host; title: string; items: BarItem[] };

/**
 * Each native navigation bar on screen, outermost first. `Stack.Title` and
 * `Stack.Toolbar` become props on the header config, not elements, so a role
 * query cannot reach them.
 */
export function navigationBars(): NavigationBar[] {
  return nativeViews("RNSScreenStackHeaderConfig").map((config) => ({
    config,
    title: config.props.title as string,
    items: [
      ...((config.props.headerLeftBarButtonItems as BarItem[] | undefined) ?? []),
      ...((config.props.headerRightBarButtonItems as BarItem[] | undefined) ?? []),
    ],
  }));
}

/** The first navigation bar on screen; throws if there is none. */
export function navigationBar(): NavigationBar {
  const [bar] = navigationBars();
  if (bar === undefined) throw new Error("no navigation bar");
  return bar;
}

/** A bar item by its accessibility label, from any bar on screen. */
export function navigationBarItem(label: string): BarItem | undefined {
  for (const { items } of navigationBars()) {
    const item = items.find((candidate) => candidate.accessibilityLabel === label);
    if (item !== undefined) return item;
  }
  return undefined;
}

/** Presses a bar button the way UIKit reports a tap: by the item's `buttonId`. */
export function pressHeaderButton(label: string) {
  for (const { config, items } of navigationBars()) {
    const item = items.find((candidate) => candidate.accessibilityLabel === label);
    if (item !== undefined) {
      return fireEvent(config, "pressHeaderBarButtonItem", {
        nativeEvent: { buttonId: item.buttonId },
      });
    }
  }
  throw new Error(`No header bar button labelled "${label}"`);
}
