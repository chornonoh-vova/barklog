import { act } from "@testing-library/react-native";
import { openURL } from "expo-linking";
import * as MailComposer from "expo-mail-composer";
import { Alert } from "react-native";

import { useSendFeedback } from "@/features/profile/use-send-feedback";
import { renderHookWithProviders } from "@test/render";

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

async function send() {
  const { result } = await renderHookWithProviders(() => useSendFeedback());
  await act(async () => result.current());
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
      /^mailto:chernonog\.vova\+barklog@gmail\.com\?subject=Feedback%20About%20Barklog&body=/,
    );
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
