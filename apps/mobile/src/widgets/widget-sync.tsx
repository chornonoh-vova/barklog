import { useEffect } from "react";

import { useBacklog } from "@/api/hooks";

import { pushBacklog } from "./sync";

/** Observes Home's unfiltered list for the widget, so it stays fresh — and
 * refetches on invalidation — even while Home shows a filter. */
export function WidgetSync() {
  const { data } = useBacklog(undefined);

  useEffect(() => {
    if (data !== undefined) pushBacklog(data);
  }, [data]);

  return null;
}
