import { useBacklogStats, usePremium } from "@/api/hooks";
import { activeSlotsUsed } from "@/features/backlog/slots";

/** What `wouldExceedSlots` needs; `undefined` while either is still loading. */
export function useSlotState(): { premium: boolean | undefined; activeCount: number | undefined } {
  const premium = usePremium();
  const stats = useBacklogStats();

  return {
    premium,
    activeCount: stats.data === undefined ? undefined : activeSlotsUsed(stats.data),
  };
}
