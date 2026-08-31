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

/** `listContent` must grow, or a `ListEmptyComponent` — cloned straight into
 * the content container — has no height and gets clipped. */
export const Screen = {
  fill: { flex: 1, backgroundColor: PlatformColor("systemBackground") },
  listContent: { flexGrow: 1 },
} as const;
