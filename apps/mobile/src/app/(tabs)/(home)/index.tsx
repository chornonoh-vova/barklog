import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";

import { ProfileToolbar } from "@/components/profile-toolbar";
import { BacklogScreen } from "@/features/backlog/backlog-screen";

export default function HomeRoute() {
  const { t } = useTranslation();

  return (
    <>
      <Stack.Title large>{t("tabs.home")}</Stack.Title>
      <ProfileToolbar />
      <BacklogScreen />
    </>
  );
}
