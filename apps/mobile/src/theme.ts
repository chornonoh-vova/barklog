import { PlatformColor } from "react-native";

/**
 * Barklog's brand tint. Passed to `<Host seedColor>` so it propagates through
 * the SwiftUI environment and themes every native control underneath.
 *
 * This is the only hex literal in the app. Every React Native colour comes from
 * `PlatformColor`, so the RN half resolves the same iOS dynamic system colours
 * the SwiftUI half is already using, in both appearances, with no
 * `useColorScheme` branch to keep in step.
 */
export const Brand = {
  tint: "#208AEF",
} as const;

/** Matches the iOS text styles the SwiftUI controls beside these use. */
export const Type = {
  title2: { fontSize: 22, fontWeight: "700" },
  headline: { fontSize: 17, fontWeight: "600" },
  body: { fontSize: 17, fontWeight: "400" },
  subheadline: { fontSize: 15, fontWeight: "400" },
  footnote: { fontSize: 13, fontWeight: "400" },
} as const;

/** Cover aspect ratio. IGDB covers are 3:4 portrait, never square. */
export const COVER_ASPECT = 3 / 4;

/**
 * The frame every list screen shares. `listContent` is what lets a list's
 * `ListEmptyComponent` fill the screen: it is cloned straight into the content
 * container with no wrapper of its own, so without a growing container it has
 * no height and its SwiftUI content gets clipped.
 */
export const Screen = {
  fill: { flex: 1, backgroundColor: PlatformColor("systemBackground") },
  listContent: { flexGrow: 1 },
} as const;
