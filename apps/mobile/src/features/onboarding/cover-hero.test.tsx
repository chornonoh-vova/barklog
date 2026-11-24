import { render, screen } from "@testing-library/react-native";
import { PlatformColor, StyleSheet } from "react-native";

import { CoverHero } from "@/features/onboarding/cover-hero";
import { ONBOARDING_COVERS } from "@/features/onboarding/covers";
import { coverUrl } from "@/lib/igdb/image";
import { ancestor, nativeViews } from "@test/queries";

/** By parsed host, not substring: `https://example.com/?images.igdb.com` contains it too. */
function isIgdbImage(uri: unknown): boolean {
  if (typeof uri !== "string") return false;

  try {
    return new URL(uri).hostname === "images.igdb.com";
  } catch {
    return false;
  }
}

/** The mascot is an expo-image too. */
function coverImages() {
  return nativeViews("ViewManagerAdapter_ExpoImage").filter((image) =>
    isIgdbImage(image.props.source?.[0]?.uri),
  );
}

describe("CoverHero", () => {
  it("floats all six covers around the mascot", async () => {
    await render(<CoverHero covers={ONBOARDING_COVERS} />);

    expect(coverImages().map((image) => image.props.source[0].uri)).toEqual(
      ONBOARDING_COVERS.map((cover) => coverUrl(cover.coverImageId, "big")),
    );
  });

  it("shows the mascot on its own, with no tile behind it", async () => {
    await render(<CoverHero covers={ONBOARDING_COVERS} />);

    const mascot = nativeViews("ViewManagerAdapter_ExpoImage").find(
      (image) => !isIgdbImage(image.props.source?.[0]?.uri),
    );
    expect(mascot).toBeDefined();
    const holder = ancestor(
      mascot!,
      (node) => StyleSheet.flatten(node.props.style)?.position === "absolute",
    );
    expect(StyleSheet.flatten(holder.props.style).backgroundColor).toBeUndefined();
  });

  it("floats a gamepad below the mascot", async () => {
    await render(<CoverHero covers={ONBOARDING_COVERS} />);

    const top = (node: Parameters<typeof ancestor>[0]) =>
      StyleSheet.flatten(
        ancestor(node, (n) => StyleSheet.flatten(n.props.style)?.position === "absolute").props
          .style,
      ).top as number;
    const gamepad = nativeViews("ViewManagerAdapter_SymbolModule").find(
      (view) => view.props.name === "gamecontroller.fill",
    );
    const mascot = nativeViews("ViewManagerAdapter_ExpoImage").find(
      (image) => !isIgdbImage(image.props.source?.[0]?.uri),
    );
    expect(gamepad).toBeDefined();
    expect(top(gamepad!)).toBeGreaterThan(top(mascot!));
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
