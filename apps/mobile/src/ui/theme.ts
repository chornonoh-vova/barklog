import { PlatformColor } from "react-native";

/** The brand tint, and the only hex literal in the app: every other colour comes
 * from `PlatformColor` so both halves resolve the same iOS dynamic colours. */
export const Brand = {
  tint: "#208AEF",
} as const;

export const Type = {
  title2: { fontSize: 22, fontWeight: "700" },
  headline: { fontSize: 17, fontWeight: "600" },
  body: { fontSize: 17, fontWeight: "400" },
  subheadline: { fontSize: 15, fontWeight: "400" },
  footnote: { fontSize: 13, fontWeight: "400" },
} as const;

/** IGDB covers are 3:4 portrait, never square. */
export const COVER_ASPECT = 3 / 4;

/** IGDB screenshots are 16:9. Width over height, like `COVER_ASPECT`. */
export const SHOT_ASPECT = 16 / 9;

/** The heading above a horizontal shelf: Similar Games, Explore's rows, and
 * the screenshot strip. */
export const ShelfTitle = {
  ...Type.headline,
  color: PlatformColor("label"),
  paddingHorizontal: 16,
} as const;

/** `listContent` must grow, or a `ListEmptyComponent` — cloned straight into
 * the content container — has no height and gets clipped. `groupedFill` is the
 * background a grid of cards sits on. */
export const Screen = {
  fill: { flex: 1, backgroundColor: PlatformColor("systemBackground") },
  groupedFill: { flex: 1, backgroundColor: PlatformColor("systemGroupedBackground") },
  listContent: { flexGrow: 1 },
} as const;

const SECTION_HEADER_INSETS = { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6 } as const;

/** Shared by the two `SectionList` screens. Opaque, or sticky headers show the
 * rows sliding under them — so the grouped variant has to match the grouped
 * list behind it, or it shows as a white band over a grey grid. */
export const SectionHeader = {
  container: { ...SECTION_HEADER_INSETS, backgroundColor: PlatformColor("systemBackground") },
  groupedContainer: {
    ...SECTION_HEADER_INSETS,
    backgroundColor: PlatformColor("systemGroupedBackground"),
  },
  /** iOS 26 plain-list headers are title case in headline weight, not the
   * old small caps. */
  title: { ...Type.headline, color: PlatformColor("label") },
} as const;
