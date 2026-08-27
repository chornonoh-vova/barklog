import { Stack } from "expo-router";

import { ProfileToolbar } from "@/components/profile-toolbar";

export default function SearchScreen() {
  return (
    <>
      <Stack.Title large>Search</Stack.Title>
      <ProfileToolbar />
      <Stack.SearchBar placement="automatic" placeholder="Search games" />
    </>
  );
}
