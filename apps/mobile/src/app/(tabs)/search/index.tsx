import { Stack } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SearchBarCommands } from "react-native-screens";

import { ProfileToolbar } from "@/components/profile-toolbar";
import { pushRecent } from "@/features/search/recents";
import { clearRecents, readRecents, writeRecents } from "@/features/search/recents-storage";
import { SearchScreen } from "@/features/search/search-screen";

export default function SearchRoute() {
  const [query, setQuery] = useState("");
  const [recents, setRecents] = useState<string[]>([]);
  const searchBar = useRef<SearchBarCommands>(null);

  useEffect(() => {
    void readRecents().then(setRecents);
  }, []);

  // A functional update, so `record` stays stable and the result rows that
  // hold it do not re-render each time a search is remembered.
  const record = useCallback((searched: string) => {
    setRecents((current) => {
      const next = pushRecent(current, searched);
      void writeRecents(next);
      return next;
    });
  }, []);

  // Through the bar's own command, so the field shows the query too — setting
  // state alone would search for text the field does not show.
  const pickRecent = useCallback((recent: string) => {
    searchBar.current?.setText(recent);
    setQuery(recent);
  }, []);

  const clear = useCallback(() => {
    setRecents([]);
    void clearRecents();
  }, []);

  return (
    <>
      <Stack.Title large>Search</Stack.Title>
      <ProfileToolbar />
      <Stack.SearchBar
        ref={searchBar}
        placement="stacked"
        placeholder="Search games"
        onChangeText={(event) => setQuery(event.nativeEvent.text)}
      />
      <SearchScreen
        query={query}
        recents={recents}
        onPickRecent={pickRecent}
        onClearRecents={clear}
        onOpenResult={record}
      />
    </>
  );
}
