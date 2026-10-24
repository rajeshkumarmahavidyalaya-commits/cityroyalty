"""Photographic finishing for the concept pack: trim, Real-ESRGAN upscale, film-like grade, grain, vignette."""
import sys, json
import numpy as np, torch, torch.nn as nn, torch.nn.functional as F
from PIL import Image, ImageFilter

# ---- Real-ESRGAN RRDBNet (x4plus) ----
class RDB(nn.Module):
    def __init__(s, f=64, g=32):
        super().__init__()
        s.conv1 = nn.Conv2d(f, g, 3, 1, 1); s.conv2 = nn.Conv2d(f + g, g, 3, 1, 1); s.conv3 = nn.Conv2d(f + 2 * g, g, 3, 1, 1)
        s.conv4 = nn.Conv2d(f + 3 * g, g, 3, 1, 1); s.conv5 = nn.Conv2d(f + 4 * g, f, 3, 1, 1); s.l = nn.LeakyReLU(0.2, True)
    def forward(s, x):
        x1 = s.l(s.conv1(x)); x2 = s.l(s.conv2(torch.cat((x, x1), 1))); x3 = s.l(s.conv3(torch.cat((x, x1, x2), 1)))
        x4 = s.l(s.conv4(torch.cat((x, x1, x2, x3), 1))); x5 = s.conv5(torch.cat((x, x1, x2, x3, x4), 1)); return x5 * 0.2 + x
class RRDB(nn.Module):
    def __init__(s, f=64, g=32):
        super().__init__(); s.rdb1 = RDB(f, g); s.rdb2 = RDB(f, g); s.rdb3 = RDB(f, g)
    def forward(s, x): return s.rdb3(s.rdb2(s.rdb1(x))) * 0.2 + x
class RRDBNet(nn.Module):
    def __init__(s, f=64, nb=23, g=32):
        super().__init__()
        s.conv_first = nn.Conv2d(3, f, 3, 1, 1); s.body = nn.Sequential(*[RRDB(f, g) for _ in range(nb)]); s.conv_body = nn.Conv2d(f, f, 3, 1, 1)
        s.conv_up1 = nn.Conv2d(f, f, 3, 1, 1); s.conv_up2 = nn.Conv2d(f, f, 3, 1, 1); s.conv_hr = nn.Conv2d(f, f, 3, 1, 1); s.conv_last = nn.Conv2d(f, 3, 3, 1, 1)
        s.l = nn.LeakyReLU(0.2, True)
    def forward(s, x):
        fe = s.conv_first(x); fe = fe + s.conv_body(s.body(fe))
        fe = s.l(s.conv_up1(F.interpolate(fe, scale_factor=2, mode='nearest'))); fe = s.l(s.conv_up2(F.interpolate(fe, scale_factor=2, mode='nearest')))
        return s.conv_last(s.l(s.conv_hr(fe)))

_net = None
def sr4(img: Image.Image) -> Image.Image:
    global _net
    if _net is None:
        _net = RRDBNet(); sd = torch.load(sys.argv[1], map_location='cpu'); _net.load_state_dict(sd.get('params_ema', sd.get('params', sd)), strict=True); _net.eval()
        torch.set_num_threads(4)
    x = torch.from_numpy(np.asarray(img, dtype=np.float32) / 255.0).permute(2, 0, 1)[None]
    with torch.no_grad(): y = _net(x).clamp(0, 1)
    return Image.fromarray((y[0].permute(1, 2, 0).numpy() * 255).round().astype(np.uint8))

def trim(img, thr=232):
    a = np.asarray(img.convert('L'), dtype=np.float32)
    def edge(lines):  # count leading near-white / near-flat lines
        n = 0
        for ln in lines:
            if ln.mean() > thr and ln.std() < 12: n += 1
            else: break
        return n
    t, b = edge(a), edge(a[::-1]); l, r = edge(a.T), edge(a.T[::-1])
    pad = 2  # also shave the anti-aliased seam next to a white bar
    box = (l + (pad if l else 0), t + (pad if t else 0), img.width - r - (pad if r else 0), img.height - b - (pad if b else 0))
    return img.crop(box), box

def rgb2hsv(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]; mx = a.max(-1); mn = a.min(-1); d = mx - mn + 1e-6
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) / 6.0
    s = np.where(mx > 0, d / (mx + 1e-6), 0); return np.stack([h, s, mx], -1)
def hsv2rgb(h):
    H, S, V = h[..., 0] * 6, h[..., 1], h[..., 2]; i = np.floor(H).astype(int) % 6; f = H - np.floor(H)
    p, q, t = V * (1 - S), V * (1 - S * f), V * (1 - S * (1 - f))
    out = np.zeros(h.shape)
    for k, (R, G, B) in enumerate([(V, t, p), (q, V, p), (p, V, t), (p, q, V), (t, p, V), (V, p, q)]):
        m = i == k; out[..., 0][m] = R[m]; out[..., 1][m] = G[m]; out[..., 2][m] = B[m]
    return out

def finish(img, leather_hue_shift=0.0, leather_sat=1.0, seed=7):
    a = np.asarray(img, dtype=np.float64) / 255.0
    hsv = rgb2hsv(a)
    # leather (orange-brown band): nudge hue/saturation toward the real products
    if leather_hue_shift or leather_sat != 1.0:
        band = np.clip(1 - np.abs(hsv[..., 0] - 0.07) / 0.06, 0, 1) * np.clip((hsv[..., 1] - 0.25) / 0.2, 0, 1)
        hsv[..., 0] = (hsv[..., 0] + leather_hue_shift * band) % 1.0
        hsv[..., 1] = np.clip(hsv[..., 1] * (1 + (leather_sat - 1) * band), 0, 1)
    # tame the generator's over-saturation a little (strongest on already saturated pixels)
    hsv[..., 1] = hsv[..., 1] * (1 - 0.10 * hsv[..., 1])
    a = hsv2rgb(hsv)
    # film-style tone curve: slightly lifted blacks, soft shoulder on highlights
    a = 0.025 + 0.95 * a
    a = np.where(a > 0.82, 0.82 + (a - 0.82) * 0.8, a)
    # gentle warm/cool split: warm highlights, neutral-cool shadows
    lum = a.mean(-1, keepdims=True)
    a = a + (lum - 0.5) * np.array([0.012, 0.004, -0.012])
    # lens vignette
    h, w = a.shape[:2]; yy, xx = np.mgrid[0:h, 0:w]; r = np.sqrt(((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2)
    a = a * (1 - 0.09 * np.clip(r - 0.35, 0, None) ** 1.6)[..., None]
    # fine luminance grain, a touch stronger in the midtones, slightly clumped like film
    rng = np.random.default_rng(seed)
    g = rng.normal(0, 1, (h, w)); g = np.asarray(Image.fromarray(((g * 40) + 128).clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6)), dtype=np.float64)
    g = (g - 128) / 40 * 0.027 * (0.6 + 0.8 * (1 - np.abs(lum[..., 0] - 0.5) * 2))
    a = a + g[..., None]
    return Image.fromarray((a.clip(0, 1) * 255).round().astype(np.uint8))

def run(src, dst, target_w, ratio=None, hue=0.0, sat=1.0, crop=None, anchor='center'):
    img = Image.open(src).convert('RGB')
    img, box = trim(img)
    if crop: img = img.crop(crop)
    if ratio:  # centre-crop to aspect (w/h)
        w, h = img.size
        if w / h > ratio: nw = round(h * ratio); img = img.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
        else:
            nh = round(w / ratio); top = round((h - nh) * 0.08) if anchor == 'top' else (h - nh) // 2  # top: keep heads in frame
            img = img.crop((0, top, w, top + nh))
    if img.width < target_w:
        up = sr4(img)
        plain = img.resize(up.size, Image.LANCZOS)
        img = Image.blend(up, plain, 0.45)  # keep natural texture; pure SR reads as painted
    tw = min(target_w, img.width); th = round(img.height * tw / img.width)
    img = img.resize((tw, th), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=1.0, percent=35, threshold=2))
    out = finish(img, hue, sat)
    out.save(dst, quality=92, subsampling=0)
    return out.size, box

if __name__ == '__main__':
    jobs = json.load(open(sys.argv[2])); root = sys.argv[3]; outdir = sys.argv[4]
    for j in jobs:
        size, box = run(f"{root}/{j['src']}", f"{outdir}/{j['out']}", j['w'], j.get('ratio'), j.get('hue', 0.0), j.get('sat', 1.0), j.get('crop'), j.get('anchor', 'center'))
        print(j['out'], size, 'trim', box, flush=True)
