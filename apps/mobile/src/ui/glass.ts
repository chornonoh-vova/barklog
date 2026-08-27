/**
 * `buttonStyle('glass')` and `'glassProminent'` are iOS 26+ only, and on iOS 18
 * they render with no style at all rather than degrading. The version is a
 * parameter so this module stays importable by Vitest.
 */
export type ButtonStyleName = "glass" | "glassProminent" | "bordered" | "borderedProminent";

export function glassButtonStyle(iosMajorVersion: number, prominent: boolean): ButtonStyleName {
  if (iosMajorVersion >= 26) return prominent ? "glassProminent" : "glass";

  return prominent ? "borderedProminent" : "bordered";
}
