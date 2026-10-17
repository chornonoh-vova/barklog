import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";

import { ProfileToolbar } from "@/components/profile-toolbar";
import { ExploreScreen } from "@/features/explore/explore-screen";

export default function ExploreRoute() {
  const { t } = useTranslation();

  return (
    <>
      <Stack.Title large>{t("tabs.explore")}</Stack.Title>
      <ProfileToolbar />
      <ExploreScreen />
    </>
  );
}
