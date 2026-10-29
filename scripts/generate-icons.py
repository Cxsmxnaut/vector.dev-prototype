"""Regenerate the macOS vector.dev icon using Pillow and Apple's iconutil."""
from pathlib import Path
import subprocess
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
destination = root / 'assets' / 'Vector.iconset'
destination.mkdir(parents=True, exist_ok=True)
for size in [16, 32, 128, 256, 512]:
    for scale in [1, 2]:
        pixels = size * scale
        side = pixels * 4
        image = Image.new('RGBA', (side, side))
        draw = ImageDraw.Draw(image)
        draw.rounded_rectangle((side*.06, side*.06, side*.94, side*.94), radius=side*.2, fill='#203019')
        points = [(side*.23,side*.29),(side*.43,side*.76),(side*.77,side*.24)]
        width = max(1, round(side*.072))
        draw.line(points, fill='#d7e4c7', width=width, joint='curve')
        draw.line([(side*.55,side*.24),(side*.77,side*.24),(side*.77,side*.46)], fill='#d7e4c7', width=width, joint='curve')
        image = image.resize((pixels,pixels), Image.Resampling.LANCZOS)
        suffix = '@2x' if scale == 2 else ''
        image.save(destination / f'icon_{size}x{size}{suffix}.png')
subprocess.run(['iconutil','-c','icns',str(destination),'-o',str(root/'assets'/'Vector.icns')],check=True)
