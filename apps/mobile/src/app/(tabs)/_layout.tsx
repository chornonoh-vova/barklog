<<<<<<< HEAD
import { NativeTabs } from "expo-router/native-tabs";
=======
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useTranslation } from "react-i18next";
>>>>>>> origin/main

const { Trigger } = NativeTabs;
const { Icon, Label } = Trigger;

export default function TabsLayout() {
  const { t } = useTranslation();

  return (
    <NativeTabs minimizeBehavior="onScrollDown" sidebarAdaptable>
      <Trigger name="(home)">
        <Label>{t("tabs.home")}</Label>
        <Icon sf={{ default: "house", selected: "house.fill" }} md="home" />
      </Trigger>

      <Trigger name="explore">
        <Label>{t("tabs.explore")}</Label>
        <Icon sf={{ default: "safari", selected: "safari.fill" }} md="explore" />
      </Trigger>

      <Trigger name="search" role="search">
<<<<<<< HEAD
        <Label>Search</Label>
=======
        <Label>{t("tabs.search")}</Label>
        <Icon sf="magnifyingglass" md="search" />
>>>>>>> origin/main
      </Trigger>
    </NativeTabs>
  );
}
