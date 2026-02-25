#!/usr/bin/env python3
"""
Génère les icônes PWA pour Lexora.
Usage : python generate_icons.py
Installe Pillow si besoin : pip install Pillow
"""
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("Installe Pillow : pip install Pillow")
    exit(1)

Path("icons").mkdir(exist_ok=True)

def make_icon(size: int, path: str):
    img = Image.new("RGBA", (size, size), (9, 9, 15, 255))   # --bg
    draw = ImageDraw.Draw(img)

    # Cercle de fond violet
    margin = size // 8
    draw.ellipse(
        [margin, margin, size - margin, size - margin],
        fill=(124, 106, 247, 255)   # --accent
    )

    # Lettre "L"
    font_size = size // 2
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
    except:
        font = ImageFont.load_default()

    text = "L"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (size - tw) // 2 - bbox[0]
    y = (size - th) // 2 - bbox[1]
    draw.text((x, y), text, fill=(255, 255, 255, 255), font=font)

    img.save(path, "PNG")
    print(f"✅ {path} ({size}x{size})")

make_icon(192, "icons/icon-192.png")
make_icon(512, "icons/icon-512.png")
print("\nIcones générées dans le dossier icons/")
print("Place ce dossier à la racine de ton repo GitHub.")
