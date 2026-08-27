import { NativeTabs } from "expo-router/unstable-native-tabs";

const { Trigger } = NativeTabs;
const { Icon, Label } = Trigger;

/**
 * iOS native tab bar (UITabBarController). Home and Explore sit in the main
 * group; Search uses the `search` role so iOS 26 renders it apart from the
 * group and morphs it into the native search field.
 *
 * `(home)` is a route group, not a directory named `index`: a group adds no
 * path segment, so `(tabs)/(home)/index.tsx` still resolves to `/` while being
 * able to carry its own Stack for the title and the profile avatar.
 */
export default function TabsLayout() {
  return (
    <NativeTabs minimizeBehavior="onScrollDown">
      <Trigger name="(home)">
        <Label>Home</Label>
        <Icon sf={{ default: "house", selected: "house.fill" }} md="home" />
      </Trigger>

      <Trigger name="explore">
        <Label>Explore</Label>
        <Icon sf={{ default: "safari", selected: "safari.fill" }} md="explore" />
      </Trigger>

      <Trigger name="search">
        <Label>Search</Label>
        <Icon sf="magnifyingglass" />
      </Trigger>
    </NativeTabs>
  );
}
