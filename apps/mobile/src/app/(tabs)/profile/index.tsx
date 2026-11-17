import { Stack, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { ProfileScreen } from "@/features/profile/profile-screen";

export default function ProfileRoute() {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <>
      <Stack.Title large>{t("tabs.profile")}</Stack.Title>
      <ProfileScreen onOpenAccount={() => router.push("/profile/account")} />
    </>
  );
}
