import { Alert } from "react-native";

import { confirmDeleteAccount, confirmSignOut } from "@/features/profile/confirm-account-actions";

afterEach(() => jest.restoreAllMocks());

describe("confirmSignOut", () => {
  it("asks in a centred alert, like Delete Account, and confirms only on Sign Out", () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const onConfirm = jest.fn();

    confirmSignOut(onConfirm);

    const [title, message, buttons] = alert.mock.calls[0]!;
    expect(title).toBe("Sign out of Barklog?");
    expect(message).toContain("stays saved");
    expect(buttons).toEqual([
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: onConfirm },
    ]);
    expect(onConfirm).not.toHaveBeenCalled();
    buttons![1]!.onPress!();
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
