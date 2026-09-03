import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * The CSP guarantees this suite asserts are properties of the built output,
 * not of the source, so the suite builds for real rather than mocking one.
 */
export async function setup(): Promise<void> {
  await run("pnpm", ["exec", "astro", "build"], { cwd: process.cwd() });
}
