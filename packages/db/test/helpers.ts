import { expect } from "vitest";

/**
 * Drizzle wraps driver errors as `Failed query: ...` and hangs the real
 * Postgres error off `cause`, so asserting on `.message` alone would pass for
 * any failure at all. This flattens the whole chain and matches against that.
 *
 * Lives here rather than in `src/testing.ts` because it imports vitest, which
 * must not become a runtime dependency of the package.
 */
export async function expectRejectedBy(
  operation: Promise<unknown>,
  pattern: RegExp,
): Promise<void> {
  try {
    await operation;
  } catch (error) {
    const messages: string[] = [];
    let current: unknown = error;
    while (current instanceof Error) {
      messages.push(current.message);
      current = current.cause;
    }
    expect(messages.join(" | ")).toMatch(pattern);
    return;
  }

  throw new Error(`Expected the query to be rejected by ${pattern}, but it succeeded`);
}
