import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { Language } from "@repo/i18n";

import { homePath } from "../../src/i18n";

export const DIST = path.resolve(import.meta.dirname, "../../dist");

const pages = new Map<Language, Promise<string>>();

/** The built home page for a language, read once per test file. */
export function homeHtml(lang: Language): Promise<string> {
  let page = pages.get(lang);
  if (page === undefined) {
    page = readFile(path.join(DIST, homePath(lang), "index.html"), "utf8");
    pages.set(lang, page);
  }
  return page;
}

/** Every stylesheet the build emitted, concatenated. */
export async function builtCss(): Promise<string> {
  const dir = path.join(DIST, "_astro");
  const sheets = (await readdir(dir)).filter((name) => name.endsWith(".css"));

  return (await Promise.all(sheets.map((name) => readFile(path.join(dir, name), "utf8")))).join(
    "\n",
  );
}

/** Whether a root-relative href resolves to a file the build emitted. */
export async function resolves(href: string): Promise<boolean> {
  const clean = href.split(/[?#]/)[0]!.slice(1);
  const candidates =
    clean === "" || clean.endsWith("/")
      ? [path.join(clean, "index.html")]
      : [clean, path.join(clean, "index.html"), `${clean}.html`];

  for (const candidate of candidates) {
    try {
      await access(path.join(DIST, candidate));
      return true;
    } catch {
      // try the next shape
    }
  }

  return false;
}

/** The few entities Astro writes into text and attributes, turned back into characters. */
export const decode = (html: string) =>
  html
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
