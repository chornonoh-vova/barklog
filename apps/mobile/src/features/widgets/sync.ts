import type { BacklogListResponse } from "@repo/contracts";

import BacklogWidget from "./backlog-widget";
import { clearCovers, ensureMascot, pruneCovers, syncCovers } from "./covers";
import { deriveSnapshot, shelfCoverIds, signedOutSnapshot, type WidgetSnapshot } from "./snapshot";

let lastPushed: string | null = null;
// Latest wins, one at a time: a push started on older data must not land after
// one on newer data.
let pending: (() => Promise<void>) | null = null;
let running = false;

async function drain(): Promise<void> {
  if (running) return;

  running = true;
  while (pending !== null) {
    const next = pending;
    pending = null;
    try {
      await next();
    } catch {
      // Best-effort: the widget keeps its last snapshot.
    }
  }
  running = false;
}

function schedule(job: () => Promise<void>): void {
  pending = job;
  void drain();
}

function push(snapshot: WidgetSnapshot): void {
  const serialized = JSON.stringify(snapshot);
  if (serialized === lastPushed) return;

  BacklogWidget.updateSnapshot(snapshot);
  lastPushed = serialized;
}

export function pushBacklog(data: BacklogListResponse): void {
  schedule(async () => {
    const ids = shelfCoverIds(data.items);
    const [covers, mascot] = await Promise.all([syncCovers(ids), ensureMascot()]);
    push(deriveSnapshot(data.items, covers, mascot));
    pruneCovers(ids);
  });
}

/** Sign-out or account switch: forget the last user's games entirely. */
export function clearWidget(): void {
  schedule(async () => {
    clearCovers();
    push(signedOutSnapshot(await ensureMascot()));
  });
}
