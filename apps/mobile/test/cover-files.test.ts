import { describe, expect, it } from "vitest";

import { staleCoverFiles } from "@/widgets/cover-files";

describe("staleCoverFiles", () => {
  it("lists the cover files no kept game uses", () => {
    expect(staleCoverFiles(["a.jpg", "b.jpg", "c.jpg"], ["a", "c"])).toEqual(["b.jpg"]);
  });

  it("leaves files that are not covers alone", () => {
    expect(staleCoverFiles(["a.jpg", ".DS_Store", "b.tmp"], [])).toEqual(["a.jpg"]);
  });
});
