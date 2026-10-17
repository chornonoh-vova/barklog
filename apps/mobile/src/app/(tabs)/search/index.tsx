import { useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SearchBarCommands } from "react-native-screens";

import { ProfileToolbar } from "@/components/profile-toolbar";
import { clearRecents, recordRecent, useRecents } from "@/features/search/recents-storage";
import { SearchScreen } from "@/features/search/search-screen";

export default function SearchRoute() {
  const [query, setQuery] = useState("");
  const queryClient = useQueryClient();
  const recents = useRecents();
  const searchBar = useRef<SearchBarCommands>(null);
  const { t } = useTranslation();

  const record = useCallback(
    (searched: string) => recordRecent(queryClient, searched),
    [queryClient],
  );
  const clear = useCallback(() => clearRecents(queryClient), [queryClient]);

  // Through the bar's own command, so the field shows the query too — setting
  // state alone would search for text the field does not show.
  const pickRecent = useCallback((recent: string) => {
    searchBar.current?.setText(recent);
    setQuery(recent);
  }, []);

  return (
    <>
      <Stack.Title large>{t("tabs.search")}</Stack.Title>
      <ProfileToolbar />
      <Stack.SearchBar
        ref={searchBar}
        placement="stacked"
        placeholder={t("search.placeholder")}
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
