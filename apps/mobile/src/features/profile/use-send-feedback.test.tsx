import { act, waitFor } from "@testing-library/react-native";
import { openURL } from "expo-linking";
import * as MailComposer from "expo-mail-composer";
import { Alert } from "react-native";

import { useSendFeedback } from "@/features/profile/use-send-feedback";
import { usePremium } from "@/lib/api/hooks";
import { me } from "@test/fixtures";
import { fakeEndpoints, renderHookWithProviders } from "@test/render";

jest.mock("expo-mail-composer", () => ({
  isAvailableAsync: jest.fn(async () => true),
  composeAsync: jest.fn(async () => ({ status: "sent" })),
}));
jest.mock("expo-linking", () => ({
  ...jest.requireActual<object>("expo-linking"),
  openURL: jest.fn(async () => true),
}));
jest.mock("expo-application", () => ({
  nativeApplicationVersion: "1.4.0",
  nativeBuildVersion: "123",
}));

async function send({ premium }: { premium?: boolean } = {}) {
  const getMe = premium === undefined ? undefined : async () => me({ premium });
  // Rendered next to `usePremium`, so the press waits for the entitlement the
  // row would see rather than racing its query.
  const { result } = await renderHookWithProviders(
    () => ({ sendFeedback: useSendFeedback(), premium: usePremium() }),
    { api: fakeEndpoints(getMe ? { getMe } : {}) },
  );
  if (premium !== undefined) await waitFor(() => expect(result.current.premium).toBe(premium));
  await act(async () => result.current.sendFeedback());
}

describe("useSendFeedback", () => {
  it("opens the compose sheet addressed to the feedback inbox with the details", async () => {
    await send();

    const [options] = jest.mocked(MailComposer.composeAsync).mock.calls[0]!;
    expect(options.recipients).toEqual(["chernonog.vova+barklog@gmail.com"]);
    expect(options.subject).toBe("Feedback About Barklog");
    expect(options.body).toMatch(/^\n\n\n—\n/);
    expect(options.body).toContain("App: Barklog 1.4.0 (123)");
    expect(options.body).toContain("Account: user_1");
    expect(openURL).not.toHaveBeenCalled();
  });

  it("falls back to a mailto link without Mail set up", async () => {
    jest.mocked(MailComposer.isAvailableAsync).mockResolvedValueOnce(false);

    await send();

    expect(MailComposer.composeAsync).not.toHaveBeenCalled();
    expect(jest.mocked(openURL).mock.calls[0]![0]).toMatch(
      /^mailto:chernonog\.vova%2Bbarklog@gmail\.com\?subject=Feedback%20About%20Barklog&body=/,
    );
  });

  it("hands the draft to the default mail app when the sheet fails", async () => {
    jest.mocked(MailComposer.composeAsync).mockRejectedValueOnce(new Error("SendingFailed"));

    await send();

    expect(jest.mocked(openURL).mock.calls[0]![0]).toMatch(/^mailto:/);
  });

  it("opens one sheet at a time", async () => {
    let close!: () => void;
    jest
      .mocked(MailComposer.composeAsync)
      .mockImplementationOnce(
        () => new Promise((resolve) => (close = () => resolve({ status: "cancelled" } as never))),
      );
    const { result } = await renderHookWithProviders(() => useSendFeedback());

    await act(async () => result.current());
    await act(async () => result.current());
    expect(MailComposer.composeAsync).toHaveBeenCalledTimes(1);

    await act(async () => close());
    await act(async () => result.current());
    expect(MailComposer.composeAsync).toHaveBeenCalledTimes(2);
  });

  it("reports the entitlement the app knows", async () => {
    await send({ premium: true });

    expect(jest.mocked(MailComposer.composeAsync).mock.calls[0]![0].body).toContain("Premium: yes");
  });

  it("gives the address when no mail app can open", async () => {
    jest.mocked(MailComposer.isAvailableAsync).mockResolvedValueOnce(false);
    jest.mocked(openURL).mockRejectedValueOnce(new Error("no handler"));
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});

    await send();

    expect(alert).toHaveBeenCalledWith(
      "Couldn't open Mail",
      "Write to chernonog.vova+barklog@gmail.com from any mail app.",
    );
  });
});
