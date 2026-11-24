export interface OnboardingCover {
  name: string;
  coverImageId: string;
}

/** Hand-picked: onboarding runs before sign-in, so it cannot ask the API.
 * Ids checked against the IGDB API on 2026-11-24. */
export const ONBOARDING_COVERS = [
  { name: "Grand Theft Auto VI", coverImageId: "cocv1v" },
  { name: "Elden Ring", coverImageId: "co4jni" },
  { name: "Clair Obscur: Expedition 33", coverImageId: "co9gam" },
  { name: "Baldur's Gate III", coverImageId: "co670h" },
  // The 2018 game (IGDB slug `god-of-war--1`), not Ragnarök.
  { name: "God of War", coverImageId: "cobkt6" },
  { name: "Astro Bot", coverImageId: "coba3k" },
] as const satisfies readonly OnboardingCover[];
