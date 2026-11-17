import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";

import { AboutScreen } from "@/features/profile/about-screen";

export default function AboutRoute() {
  const { t } = useTranslation();

  return (
    <>
      <Stack.Title>{t("profile.about")}</Stack.Title>
      <AboutScreen />
    </>
  );
}
