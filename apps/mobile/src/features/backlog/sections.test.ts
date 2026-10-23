import { BACKLOG_STATUSES, type BacklogListItemWire, type BacklogStatus } from "@repo/contracts";

import { STATUS_ORDER, toRowSections, toSections } from "@/features/backlog/sections";

let nextId = 1;

const entry = (status: BacklogStatus, name = `Game ${nextId}`): BacklogListItemWire => {
  const id = nextId++;

  return {
    gameId: id,
    status,
    rating: null,
    addedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    game: {
      id,
      name,
      slug: `game-${id}`,
      coverImageId: null,
      firstReleaseDate: null,
      totalRating: null,
      totalRatingCount: 0,
    },
  };
};

describe("STATUS_ORDER", () => {
  it("is Playing, Waiting, Completed, Abandoned", () => {
    expect(STATUS_ORDER).toEqual(["playing", "waiting", "completed", "abandoned"]);
  });

  it("covers every status in the enum, so none can go unrendered", () => {
    expect([...STATUS_ORDER].sort()).toEqual([...BACKLOG_STATUSES].sort());
  });
});

describe("toSections — unfiltered", () => {
  it("orders sections Playing, Waiting, Completed, Abandoned regardless of input order", () => {
    const sections = toSections(
      [entry("abandoned"), entry("completed"), entry("waiting"), entry("playing")],
      undefined,
    );

    expect(sections.map((s) => s.status)).toEqual(["playing", "waiting", "completed", "abandoned"]);
  });

  it("titles each section", () => {
    expect(toSections([entry("playing")], undefined)[0]?.title).toBe("Playing");
  });

  it("omits statuses with no entries", () => {
    const sections = toSections([entry("playing"), entry("completed")], undefined);

    expect(sections.map((s) => s.status)).toEqual(["playing", "completed"]);
  });

  it("counts the entries in each section", () => {
    const sections = toSections([entry("playing"), entry("playing"), entry("waiting")], undefined);

    expect(sections.map((s) => s.count)).toEqual([2, 1]);
  });

  it("preserves the order the API returned within a section", () => {
    const first = entry("playing", "First");
    const second = entry("playing", "Second");
    const sections = toSections([first, second], undefined);

    expect(sections[0]?.data.map((i) => i.game.name)).toEqual(["First", "Second"]);
  });

  it("returns no sections for an empty backlog", () => {
    expect(toSections([], undefined)).toEqual([]);
  });
});

describe("toSections — filtered", () => {
  it("returns one headerless section so SectionList stays the single code path", () => {
    const sections = toSections([entry("completed"), entry("completed")], "completed");

    expect(sections).toHaveLength(1);
    expect(sections[0]?.title).toBeNull();
    expect(sections[0]?.count).toBe(2);
  });

  it("returns no sections when the filter matches nothing", () => {
    expect(toSections([], "abandoned")).toEqual([]);
  });

  it("keeps only entries of the filtered status, in API order", () => {
    const sections = toSections(
      [entry("playing", "A"), entry("waiting"), entry("playing", "B")],
      "playing",
    );

    expect(sections).toHaveLength(1);
    expect(sections[0]?.title).toBeNull();
    expect(sections[0]?.count).toBe(2);
    expect(sections[0]?.data.map((i) => i.game.name)).toEqual(["A", "B"]);
  });

  it("returns no sections when no entry has the filtered status", () => {
    expect(toSections([entry("waiting")], "abandoned")).toEqual([]);
  });
});

describe("toRowSections", () => {
  it("chunks each section's items into rows of the column count", () => {
    const sections = toSections(
      [entry("playing"), entry("playing"), entry("playing"), entry("waiting")],
      undefined,
    );

    const rows = toRowSections(sections, 2);

    expect(rows.map((s) => s.data.map((row) => row.length))).toEqual([[2, 1], [1]]);
  });

  it("keeps the section's item count, not its row count", () => {
    const rows = toRowSections(toSections([entry("playing"), entry("playing")], undefined), 2);

    expect(rows[0]?.count).toBe(2);
    expect(rows[0]?.data).toHaveLength(1);
  });

  it("keeps status and title", () => {
    const rows = toRowSections(toSections([entry("completed")], undefined), 3);

    expect(rows[0]?.status).toBe("completed");
    expect(rows[0]?.title).toBe("Completed");
  });

  it("gives one item per row for one column, so the phone layout is unchanged", () => {
    const first = entry("playing", "First");
    const second = entry("playing", "Second");
    const rows = toRowSections(toSections([first, second], undefined), 1);

    expect(rows[0]?.data.map((row) => row.map((i) => i.game.name))).toEqual([
      ["First"],
      ["Second"],
    ]);
  });

  it("returns no sections for no sections", () => {
    expect(toRowSections([], 3)).toEqual([]);
  });
});
