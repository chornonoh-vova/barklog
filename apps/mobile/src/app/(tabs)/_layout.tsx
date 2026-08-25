import { NativeTabs } from "expo-router/unstable-native-tabs";

const { Trigger } = NativeTabs;
const { Icon, Label } = Trigger;

/**
 * iOS native tab bar (UITabBarController). Home, Explore and Profile sit
 * together in the main group; Search uses the `search` role so iOS 26 renders
 * it apart from the group and morphs it into the native search field.
 */
export default function TabsLayout() {
  return (
    <NativeTabs minimizeBehavior="onScrollDown">
      <Trigger name="index">
        <Label>Home</Label>
        <Icon sf={{ default: "house", selected: "house.fill" }} md="home" />
      </Trigger>

      <Trigger name="explore">
        <Label>Explore</Label>
        <Icon sf={{ default: "safari", selected: "safari.fill" }} md="explore" />
      </Trigger>

      <Trigger name="profile">
        <Label>Profile</Label>
        <Icon sf={{ default: "person", selected: "person.fill" }} md="person" />
      </Trigger>

      <Trigger name="search" role="search">
        <Label>Search</Label>
      </Trigger>
    </NativeTabs>
  );
}
