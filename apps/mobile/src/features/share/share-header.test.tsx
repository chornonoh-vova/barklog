import type { ShareSourceWire } from "@repo/contracts";
import { fireEvent, render, screen, userEvent } from "@testing-library/react-native";
import { openURL } from "expo-linking";
import type * as ReactNative from "react-native";

import { ShareHeader } from "@/features/share/share-header";
import { identifyResponse } from "@test/fixtures";

jest.mock("expo-linking", () => ({ openURL: jest.fn(async () => true) }));

// expo-image as a plain view a test can find, and fail, by its testID. The
// cover is hidden from VoiceOver (the title beside it says the same), so the
// queries for it include hidden elements.
jest.mock("expo-image", () => {
  const { View } = jest.requireActual<typeof ReactNative>("react-native");
  return { Image: (props: object) => <View testID="thumbnail" {...props} /> };
});

const HIDDEN = { includeHiddenElements: true };

const source = (overrides: Partial<ShareSourceWire> = {}): ShareSourceWire => ({
  ...identifyResponse().source,
  ...overrides,
});

describe("ShareHeader", () => {
  it("asks which game it is and names the shared video", async () => {
    await render(<ShareHeader source={source()} basis="title" />);

    expect(screen.getByText("Which game is this?")).toBeOnTheScreen();
    expect(screen.getByText("Hollow Knight Silksong review")).toBeOnTheScreen();
    expect(screen.getByText("Reviewer")).toBeOnTheScreen();
    expect(screen.queryByText(/so these are matches for the title instead/)).not.toBeOnTheScreen();
  });

  it("leaves the author out when the source has none", async () => {
    await render(<ShareHeader source={source({ author: null })} basis="title" />);

    expect(screen.queryByText("Reviewer")).not.toBeOnTheScreen();
  });

  it("opens the original page from its host link", async () => {
    await render(<ShareHeader source={source()} basis="title" />);

    await userEvent.setup().press(screen.getByRole("link", { name: "youtube.com" }));

    expect(openURL).toHaveBeenCalledWith("https://www.youtube.com/watch?v=abc");
  });

  it("warns that the matches are only for the title when identification was unavailable", async () => {
    await render(<ShareHeader source={source()} basis="unavailable" />);

    expect(
      screen.getByText(
        "We couldn't tell which game this is, so these are matches for the title instead.",
      ),
    ).toBeOnTheScreen();
  });

  it("shows the thumbnail, and a placeholder once it fails to load", async () => {
    await render(
      <ShareHeader
        source={source({
          thumbnailUrl: "https://i.ytimg.com/abc.jpg",
          thumbnailWidth: 480,
          thumbnailHeight: 360,
        })}
        basis="title"
      />,
    );

    const thumbnail = screen.getByTestId("thumbnail", HIDDEN);
    expect(thumbnail.props.source).toEqual({ uri: "https://i.ytimg.com/abc.jpg" });

    await fireEvent(thumbnail, "error");

    expect(screen.queryByTestId("thumbnail", HIDDEN)).not.toBeOnTheScreen();
  });

  it("shows a placeholder when the source has no thumbnail", async () => {
    await render(<ShareHeader source={source({ thumbnailUrl: null })} basis="title" />);

    expect(screen.queryByTestId("thumbnail", HIDDEN)).not.toBeOnTheScreen();
  });
});
