#!/usr/bin/env python3
"""Builds the Barklog app icon from src/artwork.png.

Outputs (relative to assets/icon/):
  Barklog.icon/   Icon Composer bundle - iOS 26 liquid glass (ios.icon)
  icon.png        1024 flat, opaque navy - root `icon` fallback
  splash.png      1024 transparent - the `expo-splash-screen` image

Re-run after replacing src/artwork.png:  python3 src/build_icon.py
"""
import json, pathlib
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src" / "artwork.png"
BUNDLE = ROOT / "Barklog.icon"

CANVAS = 1024
NAVY = (0x0B, 0x1A, 0x3C)
FILL = 0.92           # fraction of the canvas the artwork spans
Y_BIAS = 0.015        # nudge down; the dog's head carries the visual weight
HALO = 10             # px of soft edge kept around the opaque bounds
ALPHA_FLOOR = 24      # alpha below this is glow, not content


def trimmed_artwork() -> Image.Image:
    """Artwork cropped to its real bounds, keeping a halo of soft edge."""
    art = Image.open(SRC).convert("RGBA")
    solid = art.getchannel("A").point(lambda v: 255 if v > ALPHA_FLOOR else 0).getbbox()
    x0, y0, x1, y1 = solid
    box = (max(0, x0 - HALO), max(0, y0 - HALO),
           min(art.width, x1 + HALO), min(art.height, y1 + HALO))
    return art.crop(box)


def placed(art: Image.Image, fill: float, y_bias: float) -> Image.Image:
    """`art` scaled to span `fill` of a transparent 1024 canvas, nudged down by `y_bias`."""
    scale = (CANVAS * fill) / max(art.size)
    art = art.resize((round(art.width * scale), round(art.height * scale)), Image.LANCZOS)

    layer = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    layer.paste(art, ((CANVAS - art.width) // 2,
                      (CANVAS - art.height) // 2 + round(CANVAS * y_bias)))
    return layer


def main() -> None:
    art = trimmed_artwork()
    layer = placed(art, FILL, Y_BIAS)

    assets = BUNDLE / "Assets"
    assets.mkdir(parents=True, exist_ok=True)
    layer.save(assets / "dog.png")

    flat = Image.new("RGBA", (CANVAS, CANVAS), NAVY + (255,))
    flat.alpha_composite(layer)
    flat.convert("RGB").save(ROOT / "icon.png")

    # The splash sits free on the navy, with no icon mask to inset for and no
    # head-weight bias to correct: `imageWidth` in app.json does the framing.
    placed(art, 1.0, 0.0).save(ROOT / "splash.png")

    r, g, b = (c / 255 for c in NAVY)
    manifest = {
        "fill": {"solid": f"extended-srgb:{r:.5f},{g:.5f},{b:.5f},1.00000"},
        "groups": [
            {
                "layers": [{"image-name": "dog.png", "name": "Dog"}],
                "shadow": {"kind": "neutral", "opacity": 0.5},
                "translucency": {"enabled": False, "value": 0.5},
            }
        ],
        "supported-platforms": {"circles": ["watchOS"], "squares": "shared"},
    }
    (BUNDLE / "icon.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print("wrote Barklog.icon/, icon.png and splash.png")


if __name__ == "__main__":
    main()
