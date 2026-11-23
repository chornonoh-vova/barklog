import { Stack, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { AboutScreen } from "@/features/profile/about-screen";

/** A modal from `_layout.tsx`: full screen on a narrow window, a page sheet on a wide one. */
export default function AboutRoute() {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <>
      <Stack.Title>{t("profile.about")}</Stack.Title>

      {/* The root of a modal has nothing to pop back to; a full-screen modal
          cannot be swiped down, so this is the only way out. */}
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="xmark"
          accessibilityLabel={t("common.close")}
          onPress={() => router.back()}
        />
      </Stack.Toolbar>

      <AboutScreen />
    </>
  );
}
