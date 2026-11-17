/**
 * `@expo/ui/swift-ui` for Jest. The real components render SwiftUI views,
 * which jest-expo leaves as opaque `ViewManagerAdapter_ExpoUI` hosts: no text a
 * query can find, nothing a press can reach. These stand-ins render the same
 * props as React Native elements, so a test reads labels and presses buttons
 * the way a VoiceOver user would.
 *
 * Modifiers stay real: they are plain `{ $type, ...params }` objects, and the
 * few that change what a user perceives (`accessibilityLabel`, `hidden`,
 * `accessibilityHidden`, `tag`) are read from them here.
 *
 * Only the components the app imports are replaced; `test/setup.ts` spreads
 * these over the real module, so the rest pass through.
 * An `@expo/ui` upgrade that changes a prop's name changes it here too.
 */
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { Pressable, Text as RNText, View } from "react-native";

type Modifier = { $type: string; [param: string]: unknown };

type Base = { modifiers?: Modifier[]; children?: ReactNode; testID?: string };

function modifier(modifiers: Modifier[] | undefined, type: string): Modifier | undefined {
  return modifiers?.find((m) => m.$type === type);
}

const labelOf = (modifiers?: Modifier[]) =>
  modifier(modifiers, "accessibilityLabel")?.label as string | undefined;

const isHidden = (modifiers?: Modifier[]) =>
  modifier(modifiers, "hidden")?.hidden === true ||
  modifier(modifiers, "accessibilityHidden")?.hidden === true;

/** The `tag(...)` a Picker or TabView option carries. */
const tagOf = (modifiers?: Modifier[]) =>
  modifier(modifiers, "tag")?.tag as string | number | undefined;

function container(name: string) {
  function Container({ modifiers, children, testID }: Base) {
    if (isHidden(modifiers)) return null;

    return (
      <View testID={testID ?? `swiftui-${name}`} accessibilityLabel={labelOf(modifiers)}>
        {children}
      </View>
    );
  }
  Container.displayName = `SwiftUI.${name}`;
  return Container;
}

function Text({ modifiers, children }: Base) {
  if (isHidden(modifiers)) return null;

  return <RNText accessibilityLabel={labelOf(modifiers)}>{children}</RNText>;
}

/** `children` is the custom title view and wins over `title`, as natively. */
function Label({
  title,
  systemImage,
  modifiers,
  children,
}: Base & { title?: string; systemImage?: string }) {
  if (isHidden(modifiers)) return null;

  return (
    <>
      {systemImage === undefined ? null : <View testID={`symbol-${systemImage}`} />}
      {children ?? <RNText accessibilityLabel={labelOf(modifiers)}>{title}</RNText>}
    </>
  );
}

function Image({
  systemName,
  modifiers,
}: Base & { systemName?: string; uiImage?: unknown; size?: number }) {
  if (isHidden(modifiers)) return null;

  return <View testID={systemName ? `symbol-${systemName}` : "swiftui-image"} />;
}

/**
 * The role reads as the hint, and the symbol renders as `symbol-<name>` inside
 * the button, so a test reads both the way it reads an `Image`. Disabled comes
 * from the `disabled` modifier, the only way the real `Button` takes it.
 */
function Button({
  label,
  systemImage,
  onPress,
  disabled: disabledProp,
  role,
  modifiers,
  children,
}: Base & {
  label?: string;
  systemImage?: string;
  onPress?: () => void;
  disabled?: boolean;
  role?: string;
}) {
  if (isHidden(modifiers)) return null;

  const disabled = disabledProp === true || modifier(modifiers, "disabled")?.disabled === true;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={labelOf(modifiers) ?? label}
      accessibilityState={{ disabled }}
      accessibilityHint={role === "destructive" ? "destructive" : undefined}
      disabled={disabled}
      onPress={onPress}
    >
      {systemImage === undefined ? null : <View testID={`symbol-${systemImage}`} />}
      {label === undefined ? children : <RNText>{label}</RNText>}
    </Pressable>
  );
}

/** A grouped list's section: its header, its rows, then its footer. */
function Section({
  title,
  header,
  footer,
  modifiers,
  children,
}: Base & { title?: string; header?: ReactNode; footer?: ReactNode }) {
  if (isHidden(modifiers)) return null;

  return (
    <View testID="swiftui-section">
      {title === undefined ? null : <RNText accessibilityRole="header">{title}</RNText>}
      {header}
      {children}
      {typeof footer === "string" ? <RNText>{footer}</RNText> : footer}
    </View>
  );
}

function Link({ destination, modifiers, children }: Base & { destination: string }) {
  if (isHidden(modifiers)) return null;

  return (
    <View
      accessible
      accessibilityRole="link"
      accessibilityLabel={labelOf(modifiers)}
      accessibilityHint={destination}
    >
      {children}
    </View>
  );
}

/** A menu shows its items inline: a test presses the item, not the disclosure. */
function Menu({ label, modifiers, children }: Base & { label?: string; systemImage?: string }) {
  if (isHidden(modifiers)) return null;

  return (
    <View accessible accessibilityRole="menu" accessibilityLabel={labelOf(modifiers) ?? label}>
      {label === undefined ? null : <RNText>{label}</RNText>}
      {children}
    </View>
  );
}

function optionLabel(option: ReactElement<Base & { title?: string }>): string | undefined {
  const { modifiers, children, title } = option.props;
  return labelOf(modifiers) ?? title ?? (typeof children === "string" ? children : undefined);
}

/** Each tagged child becomes a radio a test can press to pick that value. */
function Picker({
  selection,
  onSelectionChange,
  modifiers,
  children,
}: Base & {
  selection?: string | number;
  onSelectionChange?: (selection: string | number) => void;
  label?: string;
}) {
  if (isHidden(modifiers)) return null;

  return (
    <View accessible accessibilityRole="radiogroup" accessibilityLabel={labelOf(modifiers)}>
      {Children.toArray(children).map((child) => {
        if (!isValidElement<Base>(child)) return child;

        const value = tagOf(child.props.modifiers);

        return (
          <Pressable
            key={String(value)}
            accessibilityRole="radio"
            accessibilityLabel={optionLabel(child)}
            accessibilityState={{ selected: value === selection }}
            onPress={() => value !== undefined && onSelectionChange?.(value)}
          >
            {child}
          </Pressable>
        );
      })}
    </View>
  );
}

function ProgressView() {
  return <View accessible accessibilityRole="progressbar" />;
}

function Divider() {
  return <View testID="swiftui-divider" />;
}

/** Every page renders, so a test can read each one without swiping. */
function TabView({ children, modifiers }: Base & Record<string, unknown>) {
  if (isHidden(modifiers)) return null;

  return <View testID="swiftui-tabview">{children}</View>;
}
TabView.Tab = function Tab({ value, children }: { value: string | number; children?: ReactNode }) {
  return <View testID={`swiftui-tab-${value}`}>{children}</View>;
};

const Toolbar = Object.assign(container("Toolbar"), { Content: container("ToolbarContent") });

export const Host = container("Host");
export const NavigationStack = container("NavigationStack");
export const VStack = container("VStack");
export const HStack = container("HStack");
export const ZStack = container("ZStack");
export const Spacer = container("Spacer");
export const RoundedRectangle = container("RoundedRectangle");
export const RNHostView = container("RNHostView");
export const Form = container("Form");
export {
  Button,
  Divider,
  Image,
  Label,
  Link,
  Menu,
  Picker,
  ProgressView,
  Section,
  TabView,
  Text,
  Toolbar,
};
