import { NativeTabs } from "expo-router/unstable-native-tabs";

const { Trigger } = NativeTabs;
const { Icon, Label } = Trigger;

/**
 * `(home)` is a route group, not a directory named `index`: a group adds no path
 * segment, so `(tabs)/(home)/index.tsx` still resolves to `/` while carrying its
 * own Stack for the title and the profile avatar.
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

      <Trigger name="search" role="search">
        <Label>Search</Label>
        <Icon sf="magnifyingglass" />
      </Trigger>
    </NativeTabs>
  );
}
