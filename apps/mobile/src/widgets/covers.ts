import { Asset } from "expo-asset";
import { Directory, File } from "expo-file-system";
import { widgetsDirectory } from "expo-widgets";

import { coverUrl } from "@/igdb-image";

import { staleCoverFiles } from "./cover-files";

// The widget cannot load urls or see the app sandbox, only the app group.
const coversDirectory = widgetsDirectory ? new Directory(widgetsDirectory, "covers") : null;

/** Downloads missing covers and returns `imageId → uri` for those on disk; a
 * failed download is left out and drawn as a placeholder. */
export async function syncCovers(imageIds: string[]): Promise<Record<string, string>> {
  if (coversDirectory === null) return {};

  coversDirectory.create({ intermediates: true, idempotent: true });

  const paths: Record<string, string> = {};
  await Promise.all(
    imageIds.map(async (id) => {
      const file = new File(coversDirectory, `${id}.jpg`);
      try {
        if (!file.exists) await File.downloadFileAsync(coverUrl(id, "big")!, file);
        paths[id] = file.uri;
      } catch {
        // Left out: drawn as a placeholder.
      }
    }),
  );

  return paths;
}

/** Only after the new snapshot is pushed: the one on screen may still use them. */
export function pruneCovers(keepIds: string[]): void {
  if (!coversDirectory?.exists) return;

  const names = coversDirectory.list().map((entry) => entry.name);
  for (const name of staleCoverFiles(names, keepIds)) new File(coversDirectory, name).delete();
}

export function clearCovers(): void {
  if (coversDirectory?.exists) coversDirectory.delete();
}

let mascot: Promise<string> | null = null;

/** Copies the bundled mascot into the app group once; `""` if it can't. */
export function ensureMascot(): Promise<string> {
  mascot ??= copyMascot();

  return mascot;
}

async function copyMascot(): Promise<string> {
  if (!widgetsDirectory) return "";

  const target = new File(widgetsDirectory, "mascot.png");
  try {
    if (!target.exists) {
      const asset = await Asset.fromModule(
        require("../../assets/widget/mascot.png"),
      ).downloadAsync();
      new File(asset.localUri ?? asset.uri).copy(target);
    }

    return target.uri;
  } catch {
    return "";
  }
}
