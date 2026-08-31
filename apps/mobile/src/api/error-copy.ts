import { isApiError } from "./errors";

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
