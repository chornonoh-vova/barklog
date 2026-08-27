import { isApiError } from "./errors";

/**
 * Error copy is keyed off status rather than shown verbatim, because a 5xx
 * problem document carries no `detail` by design — the API strips exception
 * messages so they cannot leak schema names and file paths.
 *
 * Pure and framework-free on purpose — importing only from `./errors` (no
 * `react-native`, no `@expo/ui`) is what lets Vitest reach it directly rather
 * than through a `.tsx` that pulls in native modules.
 */
export function errorCopy(error: unknown): { title: string; description: string } {
  if (!isApiError(error)) {
    return { title: "Something went wrong", description: "Please try again." };
  }

  if (error.status === 0) {
    return { title: "You're offline", description: error.detail ?? "Check your connection." };
  }

  if (error.status === 429) {
    return {
      title: "Slow down a moment",
      description: "You've made a lot of requests. Try again shortly.",
    };
  }

  if (error.status >= 500) {
    return {
      title: "Barklog is having trouble",
      description: "The server couldn't answer. Try again in a moment.",
    };
  }

  return { title: error.title, description: error.detail ?? "Please try again." };
}
