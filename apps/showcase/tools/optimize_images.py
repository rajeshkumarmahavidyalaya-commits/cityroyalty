#!/usr/bin/env python3
"""Convert product photos / logo in assets/img to WebP (max 1024px on the long edge).
Idempotent: only touches .jpg/.jpeg/.png files, and removes each source after converting.
Run:  python3 tools/optimize_images.py"""
import os, sys
from PIL import Image

DIR = os.path.join(os.path.dirname(__file__), '..', 'assets', 'img')
MAX = 1024
for name in sorted(os.listdir(DIR)):
    base, ext = os.path.splitext(name)
    if ext.lower() not in ('.jpg', '.jpeg', '.png'):
        continue
    src = os.path.join(DIR, name)
    im = Image.open(src)
    has_alpha = im.mode in ('RGBA', 'LA', 'P') and ('transparency' in im.info or im.mode in ('RGBA', 'LA'))
    im = im.convert('RGBA' if has_alpha else 'RGB')
    if max(im.size) > MAX:
        k = MAX / max(im.size)
        im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    out = os.path.join(DIR, base + '.webp')
    # photos: q80 is visually lossless at these sizes; logo/alpha art: higher quality
    im.save(out, 'WEBP', quality=90 if has_alpha else 80, method=6)
    print(f'{name:70s} {os.path.getsize(src)//1024:5d} KB -> {os.path.getsize(out)//1024:4d} KB')
    os.remove(src)
