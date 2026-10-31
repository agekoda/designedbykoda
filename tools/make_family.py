#!/usr/bin/env python3
"""
Make all 5 sizes of a new font family in one go, ready to paste into fonts.h.

    python make_family.py myfont Regular.ttf Bold.ttf  [--hint auto|mono|light]  > myfont_block.h

Needs:  pip install freetype-py fonttools brotli
Works with .ttf, .otf, .woff, .woff2. Then in fonts.h:
  1. paste the output above the  #define FONT_FAMILIES  line
  2. add a row to FONT_TABLE (the script prints it to stderr) and bump FONT_FAMILIES
  3. add the name to FAMILIES in src/lib/eink/fonts.ts (same order!)
  4. in src/lib/eink/layouts/index.ts set  font: 'myfont'  on the layout that should use it.
"""
import sys, argparse, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gfxfont import convert

ap = argparse.ArgumentParser()
ap.add_argument('name'); ap.add_argument('regular'); ap.add_argument('bold')
ap.add_argument('--hint', default='auto')
a = ap.parse_args()
roles = [('9', 9, 0), ('9b', 9, 1), ('12', 12, 0), ('12b', 12, 1), ('24b', 24, 1)]
total = 0
print(f'\n// ===== {a.name} =====\n')
for tag, pt, bold in roles:
    text, size = convert(a.bold if bold else a.regular, pt, f'{a.name}_{tag}', a.hint)
    print(text); total += size
print('FONT_TABLE row:\n  ' + ', '.join(f'&{a.name}_{t}' for t, _, _ in roles) + ', nullptr, nullptr, nullptr,', file=sys.stderr)
print(f'flash cost: about {total/1024:.1f} KB', file=sys.stderr)
