import { Stack } from "expo-router";

import { ProfileToolbar } from "@/components/profile-toolbar";

export default function HomeScreen() {
  return (
    <>
      <Stack.Title large>Home</Stack.Title>
      <ProfileToolbar />
    </>
  );
}
