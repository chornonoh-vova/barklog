/**
 * `redirectSystemPath` returns a path to navigate to — there is no return
 * value meaning "stay where you are". So a share has to land on a route, which
 * is why `/shared` exists and why the root layout is a Stack (see
 * `_layout.tsx`).
 *
 * `hostname` on a `barklog://` url needs the spec-compliant `URL` that Expo's
 * winter runtime installs — React Native's own polyfill matches `^https?://`
 * only and would answer `""` for every share, silently.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    return new URL(path).hostname === "expo-sharing" ? "/shared" : path;
  } catch {
    // Not a URL at all: hand expo-router the path untouched rather than
    // swallowing a deep link this function does not own.
    return path;
  }
}
