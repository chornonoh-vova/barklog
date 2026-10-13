import { describe, expect, it } from "vitest";

import { removeConfirmCopy } from "@/features/game/remove-confirm";

describe("removeConfirmCopy", () => {
  it("names the game in the title", () => {
    expect(removeConfirmCopy("Hades II").title).toBe("Remove “Hades II”?");
  });

  it("says what is lost", () => {
    expect(removeConfirmCopy("Hades II").message).toBe("Its status and rating will be lost.");
  });

  it("labels a destructive confirm and a cancel", () => {
    const copy = removeConfirmCopy("Hades II");
    expect(copy.confirm).toBe("Remove");
    expect(copy.cancel).toBe("Cancel");
  });
});
