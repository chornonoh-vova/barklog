import { NativeTabs } from "expo-router/native-tabs";
import { useTranslation } from "react-i18next";

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

      {/* No automatic activation: it morphs the tab bar into a search field,
          but the bar is `stacked` in the header with toolbar integration off,
          so on iPhone that field could appear without a search bar behind it
          — glass that takes no taps. On the layout trigger so it covers the
          first selection too. */}
      <Trigger name="search" role="search" disableAutomaticSearchActivation>
        <Label>{t("tabs.search")}</Label>
        <Icon sf="magnifyingglass" md="search" />
      </Trigger>
    </NativeTabs>
  );
}
