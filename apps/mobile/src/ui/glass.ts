/** `buttonStyle('glass')` is iOS 26+ only; on iOS 18 it renders with no style
 * at all rather than degrading. */
export type ButtonStyleName = "glass" | "glassProminent" | "bordered" | "borderedProminent";

export function glassButtonStyle(iosMajorVersion: number, prominent: boolean): ButtonStyleName {
  if (iosMajorVersion >= 26) return prominent ? "glassProminent" : "glass";

  return prominent ? "borderedProminent" : "bordered";
}
