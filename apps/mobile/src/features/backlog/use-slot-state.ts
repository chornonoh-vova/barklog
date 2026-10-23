import { useBacklog, usePremium } from "@/api/hooks";
import { activeSlotsUsed } from "@/features/backlog/slots";

/** What `wouldExceedSlots` needs; `undefined` while either is still loading. */
export function useSlotState(): { premium: boolean | undefined; activeCount: number | undefined } {
  const premium = usePremium();
  const backlog = useBacklog();

  return {
    premium,
    activeCount: backlog.data === undefined ? undefined : activeSlotsUsed(backlog.data.items),
  };
}
