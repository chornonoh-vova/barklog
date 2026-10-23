import { render, screen } from "@testing-library/react-native";

import { Cover } from "@/components/cover";

/** expo-image and expo-symbols render opaque native views: read the props they were given. */
const nativeViews = (type: string) => screen.container.queryAll((node) => node.type === type);

function nativeView(type: string) {
  const [view] = nativeViews(type);
  if (view === undefined) throw new Error(`no ${type} rendered`);
  return view;
}

describe("Cover", () => {
  it("loads the IGDB cover at the requested size", async () => {
    await render(<Cover imageId="co1abc" size="big" width={100} />);

    const image = nativeView("ViewManagerAdapter_ExpoImage");
    expect(image.props.source).toEqual([
      expect.objectContaining({
        uri: "https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co1abc.jpg",
      }),
    ]);
  });

  it("keeps the 3:4 cover shape at any width", async () => {
    await render(<Cover imageId="co1abc" size="small" width={60} />);

    const image = nativeView("ViewManagerAdapter_ExpoImage");
    expect(image).toHaveStyle({ width: 60, height: 80 });
  });

  it("shows a controller in a cover-shaped placeholder when the game has no cover", async () => {
    await render(<Cover imageId={null} size="small" width={60} />);

    expect(nativeViews("ViewManagerAdapter_ExpoImage")).toHaveLength(0);
    expect(screen.root).toHaveStyle({ width: 60, height: 80 });

    const symbol = nativeView("ViewManagerAdapter_SymbolModule");
    expect(symbol.props).toEqual(expect.objectContaining({ name: "gamecontroller", size: 27 }));
  });
});
