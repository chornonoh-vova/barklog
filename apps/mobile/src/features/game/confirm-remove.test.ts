import { Alert } from "react-native";

import { confirmRemove, removeConfirmCopy } from "@/features/game/confirm-remove";

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

describe("confirmRemove", () => {
  it("asks before removing, and removes only on the destructive button", () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const onConfirm = jest.fn();

    confirmRemove("Hades II", onConfirm);

    expect(alert).toHaveBeenCalledWith(
      "Remove “Hades II”?",
      "Its status and rating will be lost.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: onConfirm },
      ],
    );
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
