#!/usr/bin/env python3
"""
Builds public/eink/fonts.json, the font data the dashboard's live preview draws with.
It reads the SAME fonts.h the calendar firmware uses, so the preview always matches the device.

    python tools/make_fonts_json.py  path/to/sketch/fonts.h  path/to/Adafruit_GFX_Library/Fonts  > public/eink/fonts.json

(The second path is only needed for the built-in FreeSans headers fonts.h includes. In
the Arduino IDE it is  Documents/Arduino/libraries/Adafruit_GFX_Library/Fonts .)
Re-run it whenever you add a font family to fonts.h.
"""
import re, sys, json, base64, os

fonts_h = open(sys.argv[1]).read()
fonts_dir = sys.argv[2] if len(sys.argv) > 2 else None

def load(text):
    out = {}
    for m in re.finditer(r'const\s+uint8_t\s+(\w+)Bitmaps\[\]\s*PROGMEM\s*=\s*\{(.*?)\};', text, re.S):
        out.setdefault(m.group(1), {})['bitmap'] = bytes(int(x, 16) for x in re.findall(r'0x([0-9A-Fa-f]{2})', m.group(2)))
    for m in re.finditer(r'const\s+GFXglyph\s+(\w+)Glyphs\[\]\s*PROGMEM\s*=\s*\{(.*?)\};', text, re.S):
        body = re.sub(r'//[^\n]*|/\*.*?\*/', '', m.group(2), flags=re.S)
        nums = [int(x) for x in re.findall(r'-?\d+', body)]
        out.setdefault(m.group(1), {})['glyphs'] = nums
    for m in re.finditer(r'const\s+GFXfont\s+(\w+)\s+PROGMEM\s*=\s*\{[^,]*,[^,]*,\s*(0x[0-9A-Fa-f]+|\d+)\s*,\s*(0x[0-9A-Fa-f]+|\d+)\s*,\s*(\d+)\s*\}', text):
        out.setdefault(m.group(1), {}).update(first=int(m.group(2), 0), last=int(m.group(3), 0), yadv=int(m.group(4)))
    return out

fonts = load(fonts_h)
for inc in re.findall(r'#include\s*<Fonts/(\w+)\.h>', fonts_h):
    if fonts_dir:
        fonts.update(load(open(os.path.join(fonts_dir, inc + '.h')).read()))

# FONT_TABLE rows: "// <n> <name>" comment followed by 8 entries
table = re.search(r'FONT_TABLE\[[^\]]*\]\s*=\s*\{(.*?)\n\};', fonts_h, re.S).group(1)
names, rows = [], []
for m in re.finditer(r'//\s*\d+\s+(\w+)\s*\n\s*([^\n]+)', table):
    names.append(m.group(1))
    rows.append([x.strip() for x in m.group(2).rstrip(',').split(',')])
result = {'families': names, 'fonts': {}}
for fi, row in enumerate(rows):
    for role, ent in enumerate(row):
        if ent in ('nullptr', ''): continue
        key = ent.lstrip('&')
        f = fonts[key]
        # glyph table: 6 numbers each (offset, w, h, xAdvance, xOffset, yOffset)
        result['fonts'][str(fi * 8 + role)] = {
            'f': f['first'], 'l': f['last'], 'y': f['yadv'], 'g': f['glyphs'],
            'b': base64.b64encode(f['bitmap']).decode()}
json.dump(result, sys.stdout, separators=(',', ':'))
