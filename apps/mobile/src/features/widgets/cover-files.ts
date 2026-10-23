const COVER_FILE = /^(.+)\.jpg$/;

/** Cover files (`<imageId>.jpg`) on disk that no kept game uses any more. */
export function staleCoverFiles(existing: string[], keepIds: string[]): string[] {
  const keep = new Set(keepIds);

  return existing.filter((name) => {
    const id = COVER_FILE.exec(name)?.[1];

    return id !== undefined && !keep.has(id);
  });
}
