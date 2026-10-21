#!/usr/bin/env python3
"""Self-host the site's fonts: download Google's latin woff2 files once, subset them, narrow the weight axis to the
weights the CSS actually uses (400-800) and write them to assets/fonts. Needs network + `pip install fonttools brotli`.

    python3 tools/subset_fonts.py

Also produces a tiny rupee-sign face (U+20B9, only in Google's latin-ext files) so prices render in the brand fonts."""
import os, re, subprocess, sys, tempfile, urllib.request

OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'fonts')
CSS = ('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900'
       '&family=Manrope:wght@300..800&display=swap')
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
LATIN = 'U+0020-007E,U+00A0-00FF,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+2022,U+2026,U+00B7,U+2192'
FEATURES = 'kern,liga,calt,ccmp,locl,mark,mkmk,onum,lnum,tnum,case'

def get(url, binary=False):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    data = urllib.request.urlopen(req, timeout=60).read()
    return data if binary else data.decode()

def run(*args):
    subprocess.run([sys.executable, '-I', '-m', *args], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def main():
    css = get(CSS)
    faces = re.findall(r'/\* (\S+) \*/\s*@font-face \{(.*?)\}', css, re.S)
    os.makedirs(OUT, exist_ok=True)
    tmp = tempfile.mkdtemp()
    for subset, body in faces:
        if subset not in ('latin', 'latin-ext'):
            continue
        fam = re.search(r"font-family: '([^']+)'", body).group(1)
        style = re.search(r'font-style: (\w+)', body).group(1)
        url = re.search(r'url\((https://[^)]+)\)', body).group(1)
        src = os.path.join(tmp, f'{fam}-{style}-{subset}.woff2')
        open(src, 'wb').write(get(url, True))
        if subset == 'latin':
            name, unicodes = f'{fam}-{style}', LATIN
        elif style == 'normal':          # rupee sign only, from latin-ext
            name, unicodes = f'{fam}-rupee', 'U+20B9'
        else:
            continue
        sub = os.path.join(tmp, name + '.sub.woff2')
        run('fontTools.subset', src, f'--unicodes={unicodes}', f'--layout-features={FEATURES}', '--flavor=woff2', f'--output-file={sub}')
        dst = os.path.join(OUT, name + '.woff2')
        run('fontTools.varLib.instancer', sub, 'wght=400:800', f'--output={dst}')
        print(f'{name}.woff2  {os.path.getsize(dst)//1024} KB')

if __name__ == '__main__':
    main()
