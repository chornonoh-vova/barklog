import type { BacklogListResponse } from "@repo/contracts";

import type * as CoversModule from "@/features/widgets/covers";
import type * as I18n from "@/lib/i18n/instance";
import type * as SyncModule from "@/features/widgets/sync";
import { deriveSnapshot, signedOutSnapshot } from "@/features/widgets/snapshot";
import { backlogItem, backlogList } from "@test/fixtures";

/** Module state (last push, queue) lives for the process, so each test loads fresh. */
type Sync = typeof SyncModule;
type Covers = jest.Mocked<typeof CoversModule>;
type Widget = { updateSnapshot: jest.Mock };

jest.mock("@/features/widgets/covers", () => ({
  syncCovers: jest.fn(async (ids: string[]) =>
    Object.fromEntries(ids.map((id) => [id, `file:///covers/${id}.jpg`])),
  ),
  ensureMascot: jest.fn(async () => "file:///mascot.png"),
  pruneCovers: jest.fn(),
  clearCovers: jest.fn(),
}));

function load() {
  let loaded!: { sync: Sync; covers: Covers; widget: Widget };
  jest.isolateModules(() => {
    // A fresh registry has its own i18n instance, not yet set up.
    jest.requireActual<typeof I18n>("@/lib/i18n/instance").initI18n("en");
    loaded = {
      sync: jest.requireActual<Sync>("@/features/widgets/sync"),
      covers: jest.requireMock<Covers>("@/features/widgets/covers"),
      widget: jest.requireActual<{ default: Widget }>("@/features/widgets/backlog-widget").default,
    };
  });
  return loaded;
}

/** Lets the queue run every job it has. */
const drained = () => new Promise((resolve) => setTimeout(resolve, 0));

const backlog = (...ids: number[]): BacklogListResponse =>
  backlogList(...ids.map((id) => backlogItem(id, "playing")));

const covers = (ids: number[]) =>
  Object.fromEntries(ids.map((id) => [`cover${id}`, `file:///covers/cover${id}.jpg`]));

describe("pushBacklog", () => {
  it("pushes the backlog with its covers and mascot, then prunes old covers", async () => {
    const { sync, covers: files, widget } = load();

    sync.pushBacklog(backlog(1, 2));
    await drained();

    expect(files.syncCovers).toHaveBeenCalledWith(["cover1", "cover2"]);
    expect(widget.updateSnapshot).toHaveBeenCalledWith(
      deriveSnapshot(backlog(1, 2).items, covers([1, 2]), "file:///mascot.png"),
    );
    expect(files.pruneCovers).toHaveBeenCalledWith(["cover1", "cover2"]);
    // Pruned only after the new snapshot no longer needs the old files.
    expect(widget.updateSnapshot.mock.invocationCallOrder[0]).toBeLessThan(
      files.pruneCovers.mock.invocationCallOrder[0]!,
    );
  });

  it("skips a push identical to the last one", async () => {
    const { sync, widget } = load();

    sync.pushBacklog(backlog(1));
    await drained();
    sync.pushBacklog(backlog(1));
    await drained();

    expect(widget.updateSnapshot).toHaveBeenCalledTimes(1);
  });

  it("runs one push at a time and keeps only the latest waiting one", async () => {
    const { sync, covers: files, widget } = load();
    let finishFirst!: () => void;
    files.syncCovers.mockImplementationOnce(
      (ids) =>
        new Promise((resolve) => {
          finishFirst = () => resolve(Object.fromEntries(ids.map((id) => [id, ""])));
        }),
    );

    sync.pushBacklog(backlog(1));
    sync.pushBacklog(backlog(2));
    sync.pushBacklog(backlog(3));
    await drained();
    expect(widget.updateSnapshot).not.toHaveBeenCalled();

    finishFirst();
    await drained();

    const pushed = widget.updateSnapshot.mock.calls.map(
      ([snapshot]) => snapshot.sections.playing.games[0].id,
    );
    expect(pushed).toEqual([1, 3]);
    expect(files.syncCovers).toHaveBeenCalledTimes(2);
  });

  it("keeps the widget's last snapshot when a push fails, and recovers on the next", async () => {
    const { sync, covers: files, widget } = load();
    files.syncCovers.mockRejectedValueOnce(new Error("disk full"));

    sync.pushBacklog(backlog(1));
    await drained();
    expect(widget.updateSnapshot).not.toHaveBeenCalled();

    sync.pushBacklog(backlog(1));
    await drained();
    expect(widget.updateSnapshot).toHaveBeenCalledTimes(1);
  });
});

describe("clearWidget", () => {
  it("forgets the last user's games and covers", async () => {
    const { sync, covers: files, widget } = load();
    sync.pushBacklog(backlog(1));
    await drained();

    sync.clearWidget();
    await drained();

    expect(files.clearCovers).toHaveBeenCalledTimes(1);
    expect(widget.updateSnapshot).toHaveBeenLastCalledWith(signedOutSnapshot("file:///mascot.png"));
  });

  it("lets the same backlog push again after a sign-out", async () => {
    const { sync, widget } = load();

    sync.pushBacklog(backlog(1));
    await drained();
    sync.clearWidget();
    await drained();
    sync.pushBacklog(backlog(1));
    await drained();

    expect(widget.updateSnapshot).toHaveBeenCalledTimes(3);
  });
});
