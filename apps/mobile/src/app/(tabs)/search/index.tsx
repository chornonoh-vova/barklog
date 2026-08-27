import { Stack } from "expo-router";
import { useState } from "react";

import { ProfileToolbar } from "@/components/profile-toolbar";
import { SearchScreen } from "@/features/search/search-screen";

export default function SearchRoute() {
  const [query, setQuery] = useState("");

  return (
    <>
      <Stack.Title>Search</Stack.Title>
      <ProfileToolbar />
      <Stack.SearchBar
        placement="automatic"
        placeholder="Search games"
        // The native search bar hands over an event, not a string.
        onChangeText={(event) => setQuery(event.nativeEvent.text)}
      />
      <SearchScreen query={query} />
    </>
  );
}
