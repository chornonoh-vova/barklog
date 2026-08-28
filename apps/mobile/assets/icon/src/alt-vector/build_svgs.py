#!/usr/bin/env python3
"""Generates the Barklog dog icon SVGs: flat preview + Icon Composer layers."""
import pathlib

OUT = pathlib.Path(__file__).resolve().parent

NAVY  = "#0B1A3C"   # background and facial marks
CREAM = "#FBF3E7"   # IP color 1 - head, chest
SHADE = "#E9DCC6"   # tonal sibling of CREAM, separates the ears
CORAL = "#FF7F6E"   # IP color 2 - collar, tongue

# Ears hang from behind the head so only the outer lobes read.
EARS = f'''  <g fill="{SHADE}">
    <ellipse cx="272" cy="498" rx="104" ry="202" transform="rotate(-17 272 498)"/>
    <ellipse cx="752" cy="498" rx="104" ry="202" transform="rotate(17 752 498)"/>
  </g>'''

CHEST = f'''  <path fill="{CREAM}" d="M258 1024 C258 764 322 596 512 596 C702 596 766 764 766 1024 Z"/>'''

COLLAR = f'''  <rect x="302" y="662" width="420" height="78" rx="39" fill="{CORAL}"/>'''

HEAD = f'''  <path fill="{CREAM}" d="M512 150
    C676 150 808 264 808 406
    C808 556 704 660 512 660
    C320 660 216 556 216 406
    C216 264 348 150 512 150 Z"/>'''

FACE = f'''  <g fill="{NAVY}">
    <ellipse cx="402" cy="390" rx="48" ry="56"/>
    <ellipse cx="622" cy="390" rx="48" ry="56"/>
    <path d="M454 490 C454 468 570 468 570 490 C570 522 544 548 512 548 C480 548 454 522 454 490 Z"/>
    <path d="M450 566 C450 556 574 556 574 566 C574 598 546 620 512 620 C478 620 450 598 450 566 Z"/>
  </g>
  <clipPath id="mouthclip">
    <path d="M450 566 C450 556 574 556 574 566 C574 598 546 620 512 620 C478 620 450 598 450 566 Z"/>
  </clipPath>
  <path clip-path="url(#mouthclip)" fill="{CORAL}"
        d="M474 594 C474 578 550 578 550 594 C550 616 533 630 512 630 C491 630 474 616 474 594 Z"/>'''

BODY_LAYER = "\n".join([EARS, CHEST, COLLAR, HEAD])


# Scales the character up about a point below centre so it fills the icon grid
# without pushing the top of the head into the mask.
FIT = 'transform="translate(512 600) scale(1.06) translate(-512 -600)"'


def svg(body, background=None):
    bg = f'  <rect width="1024" height="1024" fill="{background}"/>\n' if background else ""
    inner = f'  <g {FIT}>\n{body}\n  </g>' if body.strip() else ""
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" '
            'viewBox="0 0 1024 1024">\n' + bg + inner + "\n</svg>\n")


files = {
    "barklog-icon.svg":       svg(BODY_LAYER + "\n" + FACE, NAVY),
    "layer-1-body.svg":       svg(BODY_LAYER),
    "layer-2-face.svg":       svg(FACE),
    "layer-0-background.svg": svg("", NAVY),
}
for name, markup in files.items():
    (OUT / name).write_text(markup)
