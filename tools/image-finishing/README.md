# Image finishing for the concept pack

`enhance.py` turns the supplied concept images (City_Royalty_Master_Asset_Library) into web-ready editorial images:
trim crop slivers, upscale low-resolution views ×4 with Real-ESRGAN (blended with a plain resample so texture stays
natural), then a photographic finish — film tone curve, slightly reduced over-saturation, fine luminance grain, soft
vignette — and, where a concept's leather drifts from the real product, a hue/saturation nudge toward it
(`hue`/`sat` in `jobs.json`). Model shots use `"anchor": "top"` so 4:5 crops keep heads in frame.

```bash
python3 -m venv .venv && .venv/bin/pip install --index-url https://download.pytorch.org/whl/cpu torch && .venv/bin/pip install numpy pillow
curl -LO https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth
.venv/bin/python enhance.py RealESRGAN_x4plus.pth jobs.json <asset-library-dir> <out-dir>
```

Upload the results in Admin → Media (or `POST /api/v1/admin/uploads`); they are editorial images and must not be
attached to a product's gallery. See `docs/product-accuracy.md`.
