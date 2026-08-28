#!/usr/bin/env python3
"""Rasterises the SVG sources into every asset the Expo app needs.

Outputs (relative to assets/icon/):
  Barklog.icon/            Icon Composer bundle - iOS 26 liquid glass
  icon.png                 1024 flat, opaque navy - universal fallback
  ios-light.png            1024 flat, opaque navy
  ios-dark.png             1024, transparent background
  ios-tinted.png           1024, greyscale on transparent
"""
import json, pathlib, shutil, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
BUNDLE = ROOT / "Barklog.icon"
NAVY = (0x0B, 0x1A, 0x3C)


def render(svg: pathlib.Path, png: pathlib.Path, size: int = 1024) -> None:
    png.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["sips", "-s", "format", "png", "--resampleHeightWidth", str(size), str(size),
         str(svg), "--out", str(png)],
        check=True, capture_output=True,
    )


def grey(hex_colour: str) -> str:
    r, g, b = (int(hex_colour[i:i + 2], 16) for i in (1, 3, 5))
    y = round(0.2126 * r + 0.7152 * g + 0.0722 * b)
    return f"#{y:02x}{y:02x}{y:02x}"


def main() -> None:
    if not shutil.which("sips"):
        sys.exit("sips not found; this script requires macOS.")

    build = SRC / "_build"
    build.mkdir(exist_ok=True)

    # Greyscale sources for the tinted appearance.
    import build_svgs as bs
    tinted_body = bs.BODY_LAYER
    tinted_face = bs.FACE
    for colour in (bs.CREAM, bs.SHADE, bs.CORAL, bs.NAVY):
        tinted_body = tinted_body.replace(colour, grey(colour))
        tinted_face = tinted_face.replace(colour, grey(colour))
    (build / "tinted.svg").write_text(bs.svg(tinted_body + "\n" + tinted_face))

    render(SRC / "barklog-icon.svg", ROOT / "icon.png")
    render(SRC / "barklog-icon.svg", ROOT / "ios-light.png")
    render(build / "tinted.svg", ROOT / "ios-tinted.png")

    # Dark appearance: same artwork, transparent background.
    (build / "dark.svg").write_text(bs.svg(bs.BODY_LAYER + "\n" + bs.FACE))
    render(build / "dark.svg", ROOT / "ios-dark.png")

    # --- Icon Composer bundle ------------------------------------------------
    assets = BUNDLE / "Assets"
    assets.mkdir(parents=True, exist_ok=True)
    render(SRC / "layer-1-body.svg", assets / "body.png")
    render(SRC / "layer-2-face.svg", assets / "face.png")

    r, g, b = (c / 255 for c in NAVY)
    manifest = {
        "fill": {"solid": f"extended-srgb:{r:.5f},{g:.5f},{b:.5f},1.00000"},
        "groups": [
            {
                "layers": [
                    {"image-name": "face.png", "name": "Face"},
                    {"image-name": "body.png", "name": "Body"},
                ],
                "shadow": {"kind": "neutral", "opacity": 0.5},
                "translucency": {"enabled": False, "value": 0.5},
            }
        ],
        "supported-platforms": {"circles": ["watchOS"], "squares": "shared"},
    }
    (BUNDLE / "icon.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"wrote {BUNDLE.relative_to(ROOT.parent.parent)} and 4 PNGs")


if __name__ == "__main__":
    main()
