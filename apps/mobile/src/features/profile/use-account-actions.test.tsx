import { act, renderHook } from "@testing-library/react-native";
import { Alert } from "react-native";

import { confirmDeleteAccount, confirmSignOut } from "@/features/profile/confirm-account-actions";
import { useAccountActions } from "@/features/profile/use-account-actions";
import { playDecisionHaptic } from "@/lib/haptics/play";
import { clerk } from "@test/mocks/native";

jest.mock("@/features/profile/confirm-account-actions");
jest.mock("@/lib/haptics/play");

const onReverificationRequired = jest.fn();

async function setup() {
  return await renderHook(() => useAccountActions({ onReverificationRequired }));
}

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  jest.mocked(confirmSignOut).mockImplementation((onConfirm) => onConfirm());
  jest.mocked(confirmDeleteAccount).mockImplementation((onConfirm) => onConfirm());
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

describe("signOut", () => {
  it("signs out once confirmed", async () => {
    const { result } = await setup();
    await act(async () => result.current.signOut());
    expect(clerk.signOut).toHaveBeenCalledTimes(1);
  });

  it("does nothing when cancelled", async () => {
    jest.mocked(confirmSignOut).mockImplementation(() => {});
    const { result } = await setup();
    await act(async () => result.current.signOut());
    expect(clerk.signOut).not.toHaveBeenCalled();
  });
});

describe("deleteAccount", () => {
  it("deletes and reports isDeleting until it settles", async () => {
    const d = deferred();
    clerk.user!.delete.mockReturnValueOnce(d.promise);
    const { result } = await setup();
    await act(async () => result.current.deleteAccount());
    expect(clerk.user!.delete).toHaveBeenCalledTimes(1);
    expect(result.current.isDeleting).toBe(true);
    await act(async () => d.resolve());
    expect(result.current.isDeleting).toBe(false);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(playDecisionHaptic).not.toHaveBeenCalled();
  });

  it("ignores a second call while one is pending", async () => {
    const d = deferred();
    clerk.user!.delete.mockReturnValueOnce(d.promise);
    const { result } = await setup();
    await act(async () => {
      result.current.deleteAccount();
      result.current.deleteAccount();
    });
    expect(clerk.user!.delete).toHaveBeenCalledTimes(1);
    await act(async () => d.resolve());
  });

  it("does nothing when cancelled", async () => {
    jest.mocked(confirmDeleteAccount).mockImplementation(() => {});
    const { result } = await setup();
    await act(async () => result.current.deleteAccount());
    expect(clerk.user!.delete).not.toHaveBeenCalled();
    expect(clerk.signOut).not.toHaveBeenCalled();
  });

  it("alerts and plays the failure haptic when delete fails", async () => {
    clerk.user!.delete.mockRejectedValueOnce(new Error("boom"));
    const { result } = await setup();
    await act(async () => result.current.deleteAccount());
    expect(Alert.alert).toHaveBeenCalledWith("Couldn't delete your account", expect.any(String));
    expect(playDecisionHaptic).toHaveBeenCalledWith({ kind: "writeFailed" });
    expect(result.current.isDeleting).toBe(false);
    expect(clerk.signOut).not.toHaveBeenCalled();
  });

  it("offers to continue when Clerk requires reverification", async () => {
    clerk.user!.delete.mockRejectedValueOnce({
      errors: [{ code: "session_reverification_required" }],
    });
    const { result } = await setup();
    await act(async () => result.current.deleteAccount());
    expect(playDecisionHaptic).not.toHaveBeenCalled();
    expect(result.current.isDeleting).toBe(false);
    const [title, , buttons] = jest.mocked(Alert.alert).mock.calls[0]!;
    expect(title).toBe("Confirm it's you");
    const proceed = buttons!.find((b) => b.text === "Continue")!;
    expect(onReverificationRequired).not.toHaveBeenCalled();
    proceed.onPress!();
    expect(onReverificationRequired).toHaveBeenCalledTimes(1);
  });
});
