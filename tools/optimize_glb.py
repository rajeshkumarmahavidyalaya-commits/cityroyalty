#!/usr/bin/env python3
"""Re-encode a GLB's textures as WebP (smaller download, same pixels to the eye).

    python3 tools/optimize_glb.py in.glb out.glb

The texture role decides the quality: normal maps are the most sensitive to compression artefacts, so they get
the highest. The images are stored with mimeType image/webp; three's GLTFLoader decodes them by content, so no
glTF extension is needed for this site (the files are only consumed by GLTFLoader in the browser)."""
import struct, json, io, sys
from PIL import Image

QUALITY = {'baseColor': 86, 'normal': 93, 'orm': 86}

def main(src, dst):
    b = open(src, 'rb').read()
    _, _, length = struct.unpack('<4sII', b[:12])
    off, chunks = 12, []
    while off < length:
        cl, ct = struct.unpack('<I4s', b[off:off + 8]); chunks.append([ct, b[off + 8:off + 8 + cl]]); off += 8 + cl
    j = json.loads(chunks[0][1]); binb = chunks[1][1]

    # which image plays which role
    role = {}
    tex_src = lambda t: j['textures'][t].get('source')
    for m in j.get('materials', []):
        pbr = m.get('pbrMetallicRoughness', {})
        for key, r in (('baseColorTexture', 'baseColor'), ('metallicRoughnessTexture', 'orm')):
            if key in pbr: role[tex_src(pbr[key]['index'])] = r
        if 'normalTexture' in m: role[tex_src(m['normalTexture']['index'])] = 'normal'
        if 'occlusionTexture' in m: role.setdefault(tex_src(m['occlusionTexture']['index']), 'orm')

    img_views = {i['bufferView']: n for n, i in enumerate(j['images'])}
    new_bin, new_views = bytearray(), []
    for vi, v in enumerate(j['bufferViews']):
        data = binb[v.get('byteOffset', 0): v.get('byteOffset', 0) + v['byteLength']]
        if vi in img_views:
            q = QUALITY[role.get(img_views[vi], 'baseColor')]
            out = io.BytesIO(); Image.open(io.BytesIO(data)).convert('RGB').save(out, 'WEBP', quality=q, method=6)
            data = out.getvalue()
        while len(new_bin) % 4: new_bin.append(0)
        nv = dict(v); nv['byteOffset'] = len(new_bin); nv['byteLength'] = len(data); new_views.append(nv)
        new_bin += data
    while len(new_bin) % 4: new_bin.append(0)
    j['bufferViews'] = new_views
    j['buffers'] = [{'byteLength': len(new_bin)}]
    for i in j['images']: i['mimeType'] = 'image/webp'
    js = json.dumps(j, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    out = (struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(new_bin)) + struct.pack('<I4s', len(js), b'JSON') + js
           + struct.pack('<I4s', len(new_bin), b'BIN\x00') + bytes(new_bin))
    open(dst, 'wb').write(out)
    print(f'{dst}: {len(b)//1024} KB -> {len(out)//1024} KB')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
