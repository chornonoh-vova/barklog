import { Stack } from "expo-router";

import { ProfileToolbar } from "@/components/profile-toolbar";
import { BacklogScreen } from "@/features/backlog/backlog-screen";

export default function HomeRoute() {
  return (
    <>
      <Stack.Title large>Home</Stack.Title>
      <ProfileToolbar />
      <BacklogScreen />
    </>
  );
}
