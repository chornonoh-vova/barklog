import { Parser } from "htmlparser2";

import { httpsUrlOrNull, toPositiveInt } from "./coerce.js";
import type { LookupFn } from "./safe-fetch.js";
import { safeFetch } from "./safe-fetch.js";

export const HTML_MAX_BYTES = 524_288;

export interface PageMeta {
  title: string;
  siteName: string | null;
  imageUrl: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
}

export function parseOpenGraph(html: string): PageMeta | null {
  const tags = new Map<string, string>();
  let documentTitle = "";
  let inTitle = false;

  const parser = new Parser({
    onopentag(name, attributes) {
      if (name === "title") {
        inTitle = true;
        return;
      }

      if (name !== "meta") return;

      const key = (attributes["property"] ?? attributes["name"] ?? "").toLowerCase();
      const content = attributes["content"];
      if (key.startsWith("og:") && content !== undefined && !tags.has(key)) tags.set(key, content);
    },
    ontext(text) {
      if (inTitle) documentTitle += text;
    },
    onclosetag(name) {
      if (name === "title") inTitle = false;
      // Verified against htmlparser2's own source: reset() clears the
      // tokenizer's buffers without throwing, and nothing after </head> (a
      // <body><title>) reaches the callbacks above. Bounds the work to the
      // head, where everything worth reading lives.
      if (name === "head") parser.reset();
    },
  });

  parser.write(html);
  parser.end();

  // `??` alone only falls back on nullish, so a page emitting an empty or
  // whitespace-only `og:title` would never reach `documentTitle` below.
  const ogTitle = tags.get("og:title")?.trim() ?? "";
  const title = ogTitle !== "" ? ogTitle : documentTitle.trim();
  if (title === "") return null;

  const imageUrl = httpsUrlOrNull(tags.get("og:image"));

  return {
    title,
    siteName: tags.get("og:site_name")?.trim() || null,
    imageUrl,
    imageWidth: imageUrl === null ? null : toPositiveInt(tags.get("og:image:width")),
    imageHeight: imageUrl === null ? null : toPositiveInt(tags.get("og:image:height")),
  };
}

export async function fetchPage(
  url: string,
  deadline: number,
  fetchImpl?: typeof fetch,
  lookup?: LookupFn,
): Promise<{ html: string; finalUrl: string }> {
  const response = await safeFetch(url, {
    allow: ["text/html", "application/xhtml+xml"],
    maxBytes: HTML_MAX_BYTES,
    deadline,
    fetchImpl,
    lookup,
  });

  return { html: response.body, finalUrl: response.finalUrl };
}
