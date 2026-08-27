import { Stack } from "expo-router";

import { ProfileToolbar } from "@/components/profile-toolbar";

export default function ExploreScreen() {
  return (
    <>
      <Stack.Title large>Explore</Stack.Title>
      <ProfileToolbar />
    </>
  );
}
