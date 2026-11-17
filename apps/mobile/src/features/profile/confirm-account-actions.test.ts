import { ActionSheetIOS, Alert } from "react-native";

import { confirmDeleteAccount, confirmSignOut } from "@/features/profile/confirm-account-actions";

afterEach(() => jest.restoreAllMocks());

describe("confirmSignOut", () => {
  function run(anchor: number | null) {
    const sheet = jest
      .spyOn(ActionSheetIOS, "showActionSheetWithOptions")
      .mockImplementation(() => {});
    const onConfirm = jest.fn();
    confirmSignOut(anchor, onConfirm);
    const [options, callback] = sheet.mock.calls[0]!;
    return { options, callback, onConfirm };
  }

  it("shows a destructive sign out sheet", () => {
    const { options, onConfirm } = run(7);
    expect(options).toEqual({
      title: "Sign out of Barklog?",
      options: ["Sign Out", "Cancel"],
      destructiveButtonIndex: 0,
      cancelButtonIndex: 1,
      anchor: 7,
    });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("omits the anchor when there is none", () => {
    expect(run(null).options.anchor).toBeUndefined();
  });

  it("confirms only on the sign out button", () => {
    const { callback, onConfirm } = run(null);
    callback(1);
    expect(onConfirm).not.toHaveBeenCalled();
    callback(0);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe("confirmDeleteAccount", () => {
  it("warns about deletion and subscriptions, and confirms only on Delete", () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const onConfirm = jest.fn();

    confirmDeleteAccount(onConfirm);

    const [title, message, buttons] = alert.mock.calls[0]!;
    expect(title).toBe("Delete your account?");
    expect(message).toContain("permanently deleted");
    expect(message).toContain("doesn't cancel");
    expect(buttons).toEqual([
      { text: "Cancel", style: "cancel" },
      { text: "Delete Account", style: "destructive", onPress: onConfirm },
    ]);
    expect(buttons![0]!.onPress).toBeUndefined();
    buttons![1]!.onPress!();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
