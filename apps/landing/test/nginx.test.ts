import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "vitest";

const NGINX = path.resolve(import.meta.dirname, "../nginx");

const conf = () => readFile(path.join(NGINX, "default.conf"), "utf8");
const snippet = () => readFile(path.join(NGINX, "snippets/security-headers.conf"), "utf8");

/** Strips `#`-comment lines so value assertions can't be satisfied by prose. */
const stripComments = (text: string) => text.replace(/^\s*#.*$/gm, "");

/**
 * Extracts each top-level `location ... { ... }` block from an nginx server
 * block by counting braces, so a block's extent is its real extent — not
 * "up to the next `}` anywhere in the file", which a nested block or a
 * missing brace would get wrong.
 */
function locationBlocks(text: string): string[] {
  const blocks: string[] = [];
  const re = /\blocation\b[^{]*\{/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text))) {
    let depth = 1;
    let i = match.index + match[0].length;

    while (depth > 0 && i < text.length) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") depth--;
      i++;
    }

    expect(depth, `location block starting at offset ${match.index} never closes`).toBe(0);
    blocks.push(text.slice(match.index, i));
  }

  return blocks;
}

/** Pulls the quoted value out of `add_header <Name> "<value>" always;`. */
function headerValue(text: string, name: string): string {
  const re = new RegExp(`add_header\\s+${name}\\s+"([^"]*)"`);
  const match = stripComments(text).match(re);

  expect(match, `no add_header for ${name}`).not.toBeNull();
  return match![1];
}

/**
 * The whole point of this suite. nginx's add_header does NOT inherit into a
 * location block that declares any add_header of its own, so the block that
 * sets immutable caching on hashed assets would silently serve them with no
 * security headers at all. The site would look fine and be unprotected.
 */
test("every location block includes the security headers", async () => {
  const text = await conf();
  const blocks = locationBlocks(text);

  // healthz, /_astro/, /, and the internal 404 page. A silently-dropped
  // block should fail this rather than just shrinking the loop below.
  expect(blocks.length).toBe(4);

  for (const block of blocks) {
    // Anchored so a commented-out `# include ...security-headers.conf;`
    // cannot satisfy it.
    expect(
      block,
      `a location block does not include security-headers.conf:\n${block}`,
    ).toMatch(/^\s*include\s+\S*security-headers\.conf;/m);
  }
});

test("the CSP allows nothing inline and nothing third-party", async () => {
  const csp = headerValue(await snippet(), "Content-Security-Policy");

  expect(csp).toContain("default-src 'none'");
  expect(csp).toMatch(/script-src 'self'/);
  expect(csp).toMatch(/style-src 'self'/);
  // Catches 'unsafe-inline', 'unsafe-eval', 'unsafe-hashes', a nonce, and
  // 'strict-dynamic' — any of which would loosen the policy back open.
  expect(csp).not.toMatch(/'unsafe-|'nonce-|'strict-dynamic'/);
});

test("HSTS is set without preload", async () => {
  const hsts = headerValue(await snippet(), "Strict-Transport-Security");

  // Exact match: catches a dropped includeSubDomains or a wrong max-age,
  // not just the presence of the word "preload".
  expect(hsts).toBe("max-age=31536000; includeSubDomains");
});

test("the expected headers are all present", async () => {
  const text = stripComments(await snippet());

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
