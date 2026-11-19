from PIL import Image, ImageDraw
import math
import os

size = 256
img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# Background circle with dark blue
bg_margin = 16
draw.ellipse([bg_margin, bg_margin, size - bg_margin, size - bg_margin], fill=(11, 16, 27, 255), outline=(0, 242, 254, 200), width=4)

# Outer HUD rings
center = size / 2
radius_outer = 95
for angle in range(0, 360, 20):
    rad = math.radians(angle)
    x1 = center + (radius_outer - 6) * math.cos(rad)
    y1 = center + (radius_outer - 6) * math.sin(rad)
    x2 = center + (radius_outer + 6) * math.cos(rad)
    y2 = center + (radius_outer + 6) * math.sin(rad)
    draw.line([(x1, y1), (x2, y2)], fill=(0, 242, 254, 180), width=2)

# Middle glowing ring
draw.ellipse([center - 65, center - 65, center + 65, center + 65], outline=(79, 172, 254, 255), width=6)

# Arc segments
draw.arc([center - 75, center - 75, center + 75, center + 75], start=45, end=135, fill=(56, 239, 125, 255), width=5)
draw.arc([center - 75, center - 75, center + 75, center + 75], start=225, end=315, fill=(0, 242, 254, 255), width=5)

# Center core
draw.ellipse([center - 32, center - 32, center + 32, center + 32], fill=(0, 242, 254, 255), outline=(255, 255, 255, 255), width=4)
draw.ellipse([center - 16, center - 16, center + 16, center + 16], fill=(255, 255, 255, 255))

# Save ICO with multiple sizes
out_path = os.path.join(os.path.dirname(__file__), "..", "public", "jarvis.ico")
img.save(out_path, format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print(f"Generated JARVIS ICO successfully at: {out_path}")
