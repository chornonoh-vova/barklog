import { access, readFile } from "node:fs/promises";
import path from "node:path";

import type { Language } from "@repo/i18n";

export const DIST = path.resolve(import.meta.dirname, "../../dist");

/** The built home page for a language: `/` for English, `/<lang>/` for the rest. */
export const homeHtml = (lang: Language) =>
  readFile(path.join(DIST, lang === "en" ? "" : lang, "index.html"), "utf8");

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
