import { expect } from "vitest";

/**
 * Drizzle hangs the real Postgres error off `cause`, so asserting on `.message`
 * alone would pass for any failure at all. This flattens the whole chain.
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
