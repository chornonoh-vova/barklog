/** The row's tiles and the viewer's pages must announce a shot the same way. */
export function screenshotLabel(index: number, total: number): string {
  return `Screenshot ${index + 1} of ${total}`;
}
