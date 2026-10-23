import { MODAL_ORIENTATIONS } from "@/ui/modal-orientations";

describe("MODAL_ORIENTATIONS", () => {
  it("lets a modal turn with the window, rather than only portrait", () => {
    expect(MODAL_ORIENTATIONS).toEqual(
      expect.arrayContaining([
        "portrait",
        "portrait-upside-down",
        "landscape-left",
        "landscape-right",
      ]),
    );
  });
});
