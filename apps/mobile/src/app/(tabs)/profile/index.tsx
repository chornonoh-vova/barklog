import { Stack, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { useOpenStatus } from "@/features/profile/open-status";
import { ProfileScreen } from "@/features/profile/profile-screen";

export default function ProfileRoute() {
  const router = useRouter();
  const { t } = useTranslation();
  const openStatus = useOpenStatus();

  return (
    <>
      <Stack.Title large>{t("tabs.profile")}</Stack.Title>
      <ProfileScreen
        onOpenAccount={() => router.push("/profile/account")}
        onOpenAbout={() => router.push("/profile/about")}
        onOpenStatus={openStatus}
        onFindGames={() => router.navigate("/(tabs)/explore")}
      />
    </>
  );
}
