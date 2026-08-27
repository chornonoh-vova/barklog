import { Stack } from "expo-router";

import { ProfileToolbar } from "@/components/profile-toolbar";
import { ExploreScreen } from "@/features/explore/explore-screen";

export default function ExploreRoute() {
  return (
    <>
      <Stack.Title>Explore</Stack.Title>
      <ProfileToolbar />
      <ExploreScreen />
    </>
  );
}
