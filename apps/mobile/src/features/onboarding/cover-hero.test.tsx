import { render, screen } from "@testing-library/react-native";
import { PlatformColor, StyleSheet } from "react-native";

import { CoverHero } from "@/features/onboarding/cover-hero";
import { ONBOARDING_COVERS } from "@/features/onboarding/covers";
import { coverUrl } from "@/lib/igdb/image";
import { ancestor, nativeViews } from "@test/queries";

/** The cover images only: the mascot is an expo-image too. */
function coverImages() {
  return nativeViews("ViewManagerAdapter_ExpoImage").filter((image) =>
    String(image.props.source?.[0]?.uri).includes("images.igdb.com"),
  );
}

describe("CoverHero", () => {
  it("floats the first four covers around the mascot", async () => {
    await render(<CoverHero covers={ONBOARDING_COVERS} />);

    expect(coverImages().map((image) => image.props.source[0].uri)).toEqual(
      ONBOARDING_COVERS.slice(0, 4).map((cover) => coverUrl(cover.coverImageId, "big")),
    );
  });

  it("gives every tile the same size, so a cover that never loads leaves a same-shaped placeholder", async () => {
    await render(
      <CoverHero
        covers={[
          { name: "Loaded", coverImageId: "co4jni" },
          { name: "Missing", coverImageId: "missing" },
          { name: "Loaded too", coverImageId: "co9gam" },
          { name: "Loaded three", coverImageId: "coba3k" },
        ]}
      />,
    );

    const sizes = coverImages().map((image) => {
      const { width, height } = StyleSheet.flatten(image.props.style);
      return { width, height };
    });
    expect(sizes).toHaveLength(4);
    for (const size of sizes) expect(size).toEqual(sizes[0]);
  });

  it("is decoration only, hidden from VoiceOver", async () => {
    await render(<CoverHero covers={ONBOARDING_COVERS} />);

    expect(screen.root).toHaveProp("accessibilityElementsHidden", true);
    expect(screen.root).toHaveProp("importantForAccessibility", "no-hide-descendants");
  });

  it("backs every tile with an opaque system colour: a visible placeholder in light mode, and a solid shape iOS can shadow cheaply", async () => {
    await render(<CoverHero covers={ONBOARDING_COVERS} />);

    for (const image of coverImages()) {
      const tile = ancestor(
        image,
        (node) => StyleSheet.flatten(node.props.style)?.position === "absolute",
      );
      expect(StyleSheet.flatten(tile.props.style).backgroundColor).toEqual(
        PlatformColor("secondarySystemBackground"),
      );
    }
  });
});
