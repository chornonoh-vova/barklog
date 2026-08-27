import { PlaceholderScreen } from "@/components/placeholder-screen";
import { Stack } from "expo-router";

export default function SearchIndex() {
  return (
    <>
      <Stack.Title>Search</Stack.Title>
      <Stack.SearchBar placement="automatic" placeholder="Search" onChangeText={() => {}} />
      <PlaceholderScreen
        title="Fetch a game"
        systemImage="magnifyingglass"
        description="Search your backlog and the whole game catalogue by title, platform, or genre."
      />
    </>
  );
}
