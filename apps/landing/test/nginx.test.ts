import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "vitest";

const NGINX = path.resolve(import.meta.dirname, "../nginx");

const conf = () => readFile(path.join(NGINX, "default.conf"), "utf8");
const snippet = () => readFile(path.join(NGINX, "snippets/security-headers.conf"), "utf8");

/**
 * The whole point of this suite. nginx's add_header does NOT inherit into a
 * location block that declares any add_header of its own, so the block that
 * sets immutable caching on hashed assets would silently serve them with no
 * security headers at all. The site would look fine and be unprotected.
 */
test("every location block includes the security headers", async () => {
  const text = await conf();
  const blocks = text.split(/\blocation\b/).slice(1);

  expect(blocks.length, "no location blocks found — is default.conf right?").toBeGreaterThan(0);

  for (const block of blocks) {
    const body = block.slice(0, block.indexOf("}"));

    expect(body, `a location block does not include security-headers.conf:\n${body}`).toContain(
      "security-headers.conf",
    );
  }
});

test("the CSP allows nothing inline and nothing third-party", async () => {
  const text = await snippet();

  expect(text).toContain("default-src 'none'");
  expect(text).not.toContain("unsafe-inline");
  expect(text).not.toContain("unsafe-eval");
  expect(text).toMatch(/script-src 'self'/);
  expect(text).toMatch(/style-src 'self'/);
});

test("HSTS is set without preload", async () => {
  const text = await snippet();

  expect(text).toContain("Strict-Transport-Security");
  // Deliberate: preload submission is effectively irreversible.
  expect(text).not.toContain("preload");
});

test("the expected headers are all present", async () => {
  const text = await snippet();

  for (const header of [
    "X-Content-Type-Options",
    "Referrer-Policy",
    "X-Frame-Options",
    "Permissions-Policy",
    "Cross-Origin-Opener-Policy",
    "Cross-Origin-Resource-Policy",
  ]) {
    expect(text, `missing ${header}`).toContain(header);
  }
});

test("the server listens unprivileged and hides its version", async () => {
  const text = await conf();

  expect(text).toContain("listen 8080");
  expect(text).toContain("server_tokens off");
});
