#!/usr/bin/env python3
"""Create a DMG background image with an arrow pointing from app to Applications folder"""

from PIL import Image, ImageDraw, ImageFont

# DMG window size
WIDTH = 660
HEIGHT = 400

# Create image with light gray background
img = Image.new('RGB', (WIDTH, HEIGHT), color=(240, 240, 245))
draw = ImageDraw.Draw(img)

# App icon position (center of icon at 180, 170)
app_x, app_y = 180, 170

# Applications folder position (center at 480, 170)
apps_x, apps_y = 480, 170

# Draw arrow from app to Applications
# Arrow body (horizontal line)
# CALCULATED VALUES from debug script:
# Porua label ends at x=197, Applications starts at x=445
# Gap is 248px, arrow should span from 212 to 430
arrow_y = 190  # Below the icon labels (calculated)
arrow_start_x = 250  # Right after "Porua" label
arrow_end_x = 400    # Right before "Applications" label
arrow_width = 2

# Draw the horizontal line
draw.line([(arrow_start_x, arrow_y), (arrow_end_x, arrow_y)],
          fill=(150, 150, 160), width=arrow_width)

# Draw arrowhead (triangle pointing right)
arrow_head_size = 20
arrow_head = [
    (arrow_end_x + 2, arrow_y),  # Point
    (arrow_end_x - arrow_head_size, arrow_y - arrow_head_size//2),  # Top
    (arrow_end_x - arrow_head_size, arrow_y + arrow_head_size//2),  # Bottom
]
draw.polygon(arrow_head, fill=(150, 150, 160))

# Add text below arrow
try:
    # Try to use a system font
    font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 14)
except:
    # Fallback to default font
    font = ImageFont.load_default()

text = "Drag to install"
# Get text bounding box for centering
bbox = draw.textbbox((0, 0), text, font=font)
text_width = bbox[2] - bbox[0]
text_x = (arrow_start_x + arrow_end_x) // 2 - text_width // 2
text_y = arrow_y + 12

draw.text((text_x, text_y), text, fill=(100, 100, 110), font=font)

# Save the image
output_path = 'dmg-background.png'
img.save(output_path)
print(f"DMG background created: {output_path}")

# Also create @2x version for retina displays
img_2x = Image.new('RGB', (WIDTH * 2, HEIGHT * 2), color=(240, 240, 245))
draw_2x = ImageDraw.Draw(img_2x)

# Scale everything by 2
app_x_2x, app_y_2x = app_x * 2, app_y * 2
apps_x_2x, apps_y_2x = apps_x * 2, apps_y * 2
arrow_y_2x = 190 * 2
arrow_start_x_2x = 250 * 2
arrow_end_x_2x = 400 * 2
arrow_width_2x = 2 * 2

# Draw arrow
draw_2x.line([(arrow_start_x_2x, arrow_y_2x), (arrow_end_x_2x, arrow_y_2x)],
            fill=(150, 150, 160), width=arrow_width_2x)

# Arrowhead
arrow_head_2x = [
    (arrow_end_x_2x + 4, arrow_y_2x),
    (arrow_end_x_2x - arrow_head_size * 2, arrow_y_2x - arrow_head_size),
    (arrow_end_x_2x - arrow_head_size * 2, arrow_y_2x + arrow_head_size),
]
draw_2x.polygon(arrow_head_2x, fill=(150, 150, 160))

# Text
try:
    font_2x = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 28)
except:
    font_2x = ImageFont.load_default()

bbox_2x = draw_2x.textbbox((0, 0), text, font=font_2x)
text_width_2x = bbox_2x[2] - bbox_2x[0]
text_x_2x = (arrow_start_x_2x + arrow_end_x_2x) // 2 - text_width_2x // 2
text_y_2x = arrow_y_2x + 24

draw_2x.text((text_x_2x, text_y_2x), text, fill=(100, 100, 110), font=font_2x)

output_path_2x = 'dmg-background@2x.png'
img_2x.save(output_path_2x)
print(f"DMG background @2x created: {output_path_2x}")
