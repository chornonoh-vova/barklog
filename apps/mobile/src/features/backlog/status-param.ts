import { BACKLOG_STATUSES, type BacklogStatus } from "@repo/contracts";

/** Home's `?status=` param, set by a widget tap on a section. Anything that is
 * not a status is ignored rather than trusted. */
export function parseStatusParam(value: string | string[] | undefined): BacklogStatus | undefined {
  const first = Array.isArray(value) ? value[0] : value;

  return BACKLOG_STATUSES.find((status) => status === first);
}
