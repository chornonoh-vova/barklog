import { describe, expect, it } from "vitest";

import { keys } from "@/api/keys";

describe("query keys", () => {
  it("namespaces games and backlog separately", () => {
    expect(keys.games.all).toEqual(["games"]);
    expect(keys.backlog.all).toEqual(["backlog"]);
  });

  it("keys a search by its full argument set", () => {
    expect(keys.games.search("zelda", 20, 0)).toEqual(["games", "search", "zelda", 20, 0]);
  });

  it("distinguishes searches that differ only by page", () => {
    expect(keys.games.search("zelda", 20, 0)).not.toEqual(keys.games.search("zelda", 20, 20));
  });

  it("keys a game detail by id", () => {
    expect(keys.games.detail(1942)).toEqual(["games", "detail", 1942]);
  });

  it("keys the backlog list by its filter, so All and a status differ", () => {
    expect(keys.backlog.list(undefined, "updated_at")).toEqual([
      "backlog",
      "list",
      "all",
      "updated_at",
    ]);
    expect(keys.backlog.list("playing", "updated_at")).toEqual([
      "backlog",
      "list",
      "playing",
      "updated_at",
    ]);
  });

  it("keys stats under the backlog namespace so one invalidation covers both", () => {
    expect(keys.backlog.stats()).toEqual(["backlog", "stats"]);
    expect(keys.backlog.stats()[0]).toBe(keys.backlog.all[0]);
  });

  it("is stable across calls", () => {
    expect(keys.games.detail(1)).toEqual(keys.games.detail(1));
  });
});
