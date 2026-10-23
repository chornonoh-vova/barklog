import { useEffect } from "react";

import { useBacklog } from "@/lib/api/hooks";

import { pushBacklog } from "./sync";

/** Observes the backlog for the widget, so it stays fresh — and refetches on
 * invalidation — whether or not Home is mounted. */
export function WidgetSync() {
  const { data } = useBacklog();

  useEffect(() => {
    if (data !== undefined) pushBacklog(data);
  }, [data]);

  return null;
}
