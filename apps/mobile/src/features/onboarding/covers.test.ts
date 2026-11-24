import { ONBOARDING_COVERS } from "@/features/onboarding/covers";

describe("ONBOARDING_COVERS", () => {
  it("is the six hand-picked games, in the agreed order", () => {
    expect(ONBOARDING_COVERS.map((cover) => cover.name)).toEqual([
      "Grand Theft Auto VI",
      "Elden Ring",
      "Clair Obscur: Expedition 33",
      "Baldur's Gate III",
      "God of War",
      "Astro Bot",
    ]);
  });

  it("gives every game a distinct IGDB image id", () => {
    const ids = ONBOARDING_COVERS.map((cover) => cover.coverImageId);

    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+$/);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
