/**
 * `covers.ts` reads `widgetsDirectory` once, at import, so each test loads a
 * fresh copy with the App Group it wants. The file system is an in-memory set
 * of paths behind `expo-file-system`'s `File` and `Directory`.
 */
import type * as CoversModule from "@/features/widgets/covers";

type Covers = typeof CoversModule;

const mockFs = {
  paths: new Set<string>(),
  download: jest.fn(async (_url: string, file: { uri: string }) => {
    mockFs.paths.add(file.uri);
  }),
  bundledMascot: jest.fn(async () => ({ localUri: "file:///bundle/mascot.png", uri: "asset" })),
};

let mockWidgetsDirectory: string | null = null;

jest.mock("expo-widgets", () => ({
  __esModule: true,
  get widgetsDirectory() {
    return mockWidgetsDirectory;
  },
}));

jest.mock("expo-asset", () => ({
  Asset: { fromModule: () => ({ downloadAsync: () => mockFs.bundledMascot() }) },
}));

jest.mock("expo-file-system", () => {
  const join = (parent: string | { uri: string }, name?: string) => {
    const base = typeof parent === "string" ? parent : parent.uri;
    return name === undefined ? base : `${base.replace(/\/$/, "")}/${name}`;
  };

  class File {
    uri: string;
    constructor(parent: string | { uri: string }, name?: string) {
      this.uri = join(parent, name);
    }
    get name() {
      return this.uri.split("/").pop()!;
    }
    get exists() {
      return mockFs.paths.has(this.uri);
    }
    delete() {
      mockFs.paths.delete(this.uri);
    }
    copy(target: File) {
      if (!this.exists) throw new Error(`no such file: ${this.uri}`);
      mockFs.paths.add(target.uri);
    }
    static downloadFileAsync(url: string, file: File) {
      return mockFs.download(url, file);
    }
  }

  class Directory {
    uri: string;
    constructor(parent: string | { uri: string }, name?: string) {
      this.uri = join(parent, name);
    }
    get exists() {
      return mockFs.paths.has(this.uri);
    }
    create() {
      mockFs.paths.add(this.uri);
    }
    list() {
      return [...mockFs.paths]
        .filter((path) => path.startsWith(`${this.uri}/`))
        .map((path) => new File(path));
    }
    delete() {
      for (const path of [...mockFs.paths]) {
        if (path === this.uri || path.startsWith(`${this.uri}/`)) mockFs.paths.delete(path);
      }
    }
  }

  return { File, Directory };
});

const GROUP = "file:///group";
const COVERS = `${GROUP}/covers`;

function loadCovers(widgetsDirectory: string | null = GROUP): Covers {
  mockWidgetsDirectory = widgetsDirectory;
  let covers!: Covers;
  jest.isolateModules(() => {
    covers = jest.requireActual<Covers>("@/features/widgets/covers");
  });
  return covers;
}

beforeEach(() => {
  mockFs.paths.clear();
  mockFs.paths.add("file:///bundle/mascot.png");
  mockFs.download.mockImplementation(async (_url, file) => {
    mockFs.paths.add(file.uri);
  });
});

describe("syncCovers", () => {
  it("downloads missing covers into the App Group and maps each id to its file", async () => {
    const { syncCovers } = loadCovers();

    await expect(syncCovers(["a", "b"])).resolves.toEqual({
      a: `${COVERS}/a.jpg`,
      b: `${COVERS}/b.jpg`,
    });
    expect(mockFs.download).toHaveBeenCalledWith(
      expect.stringMatching(/\/a\.jpg$/),
      expect.objectContaining({ uri: `${COVERS}/a.jpg` }),
    );
  });

  it("reuses a cover already on disk", async () => {
    const { syncCovers } = loadCovers();
    mockFs.paths.add(`${COVERS}/a.jpg`);

    await expect(syncCovers(["a"])).resolves.toEqual({ a: `${COVERS}/a.jpg` });
    expect(mockFs.download).not.toHaveBeenCalled();
  });

  it("leaves out a cover that failed to download, so it is drawn as a placeholder", async () => {
    const { syncCovers } = loadCovers();
    mockFs.download.mockImplementation(async (url, file) => {
      if (url.endsWith("/bad.jpg")) throw new Error("offline");
      mockFs.paths.add(file.uri);
    });

    await expect(syncCovers(["good", "bad"])).resolves.toEqual({ good: `${COVERS}/good.jpg` });
  });

  it("has nothing to write without an App Group", async () => {
    const { syncCovers } = loadCovers(null);

    await expect(syncCovers(["a"])).resolves.toEqual({});
    expect(mockFs.download).not.toHaveBeenCalled();
  });
});

describe("pruneCovers", () => {
  it("deletes covers no kept game uses", () => {
    const { pruneCovers } = loadCovers();
    mockFs.paths.add(COVERS);
    mockFs.paths.add(`${COVERS}/keep.jpg`);
    mockFs.paths.add(`${COVERS}/old.jpg`);

    pruneCovers(["keep"]);

    expect(mockFs.paths.has(`${COVERS}/keep.jpg`)).toBe(true);
    expect(mockFs.paths.has(`${COVERS}/old.jpg`)).toBe(false);
  });

  it("does nothing before any cover was written", () => {
    expect(() => loadCovers().pruneCovers([])).not.toThrow();
    expect(() => loadCovers(null).pruneCovers([])).not.toThrow();
  });
});

describe("clearCovers", () => {
  it("removes every cover", () => {
    const { clearCovers } = loadCovers();
    mockFs.paths.add(COVERS);
    mockFs.paths.add(`${COVERS}/a.jpg`);

    clearCovers();

    expect(mockFs.paths.has(COVERS)).toBe(false);
    expect(mockFs.paths.has(`${COVERS}/a.jpg`)).toBe(false);
  });

  it("does nothing when there are none", () => {
    expect(() => loadCovers().clearCovers()).not.toThrow();
  });
});

describe("ensureMascot", () => {
  it("copies the bundled mascot into the App Group once", async () => {
    const { ensureMascot } = loadCovers();

    await expect(ensureMascot()).resolves.toBe(`${GROUP}/mascot.png`);
    await expect(ensureMascot()).resolves.toBe(`${GROUP}/mascot.png`);
    expect(mockFs.bundledMascot).toHaveBeenCalledTimes(1);
    expect(mockFs.paths.has(`${GROUP}/mascot.png`)).toBe(true);
  });

  it("reuses a mascot copied on an earlier launch", async () => {
    mockFs.paths.add(`${GROUP}/mascot.png`);

    await expect(loadCovers().ensureMascot()).resolves.toBe(`${GROUP}/mascot.png`);
    expect(mockFs.bundledMascot).not.toHaveBeenCalled();
  });

  it("falls back to the asset's uri when it has no local copy", async () => {
    mockFs.bundledMascot.mockResolvedValueOnce({
      localUri: null as unknown as string,
      uri: "file:///remote/mascot.png",
    });
    mockFs.paths.add("file:///remote/mascot.png");

    await expect(loadCovers().ensureMascot()).resolves.toBe(`${GROUP}/mascot.png`);
  });

  it("is empty when the copy fails", async () => {
    mockFs.paths.delete("file:///bundle/mascot.png");

    await expect(loadCovers().ensureMascot()).resolves.toBe("");
  });

  it("is empty without an App Group", async () => {
    await expect(loadCovers(null).ensureMascot()).resolves.toBe("");
  });
});
