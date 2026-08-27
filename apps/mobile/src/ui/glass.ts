/**
 * `buttonStyle('glass')` and `'glassProminent'` are iOS 26+ only. Passing them
 * on iOS 18 does not degrade gracefully — the button renders with no style at
 * all — so every call site resolves through here.
 *
 * The version is a parameter rather than read from `Platform.Version` inside
 * this function, so the module stays importable by Vitest (see the Global
 * Constraints: no react-native imports in tested modules).
 */
export type ButtonStyleName = "glass" | "glassProminent" | "bordered" | "borderedProminent";

export function glassButtonStyle(iosMajorVersion: number, prominent: boolean): ButtonStyleName {
  if (iosMajorVersion >= 26) return prominent ? "glassProminent" : "glass";

  return prominent ? "borderedProminent" : "bordered";
}
