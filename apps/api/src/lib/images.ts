import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { Storage } from './storage';

/** Responsive ladder. Never upscales: widths above the source are dropped. */
export const WIDTHS = [320, 640, 960, 1280, 1920];

export interface ProcessedImage {
  key: string;
  width: number;
  height: number;
  bytes: number;
  src: string;
  avif: { w: number; url: string }[];
  webp: { w: number; url: string }[];
  blur: string;
}

/** An image already processed and uploaded elsewhere (see scripts/export-media-manifest.ts). */
export interface MediaManifestEntry {
  key: string;
  width: number;
  height: number;
  bytes: number;
  widths: number[];
  blur: string;
}

/** Rebuild the image record for an already-uploaded ladder; URLs come from this environment's storage. */
export function fromManifest(e: MediaManifestEntry, storage: Storage): ProcessedImage {
  const avif = e.widths.map((w) => ({ w, url: storage.url(`images/${e.key}/${w}.avif`) }));
  const webp = e.widths.map((w) => ({ w, url: storage.url(`images/${e.key}/${w}.webp`) }));
  return { key: e.key, width: e.width, height: e.height, bytes: e.bytes, src: webp[webp.length - 1]!.url, avif, webp, blur: e.blur };
}

export async function processImage(input: Buffer, storage: Storage): Promise<ProcessedImage> {
  const hash = createHash('sha256').update(input).digest('hex').slice(0, 16);
  const base = sharp(input, { failOn: 'error' }).rotate(); // honour EXIF orientation
  const meta = await base.metadata();
  if (!meta.width || !meta.height) throw new Error('Unreadable image');
  if (meta.width < 200 || meta.height < 200) throw new Error('Image is too small (min 200px)');
  const w0 = meta.width;
  const widths = [...new Set([...WIDTHS.filter((w) => w < w0), Math.min(w0, WIDTHS[WIDTHS.length - 1]!)])].sort((a, b) => a - b);

  // encode the whole ladder in parallel (sharp runs on the libuv pool)
  const encoded = await Promise.all(
    widths.map(async (w) => {
      const resized = () => base.clone().resize({ width: w, withoutEnlargement: true });
      const [a, p] = await Promise.all([resized().avif({ quality: 56, effort: 3 }).toBuffer(), resized().webp({ quality: 80 }).toBuffer()]);
      const ak = `images/${hash}/${w}.avif`;
      const pk = `images/${hash}/${w}.webp`;
      await Promise.all([storage.put(ak, a, 'image/avif'), storage.put(pk, p, 'image/webp')]);
      return { w, avif: { w, url: storage.url(ak) }, webp: { w, url: storage.url(pk) } };
    }),
  );
  const avif: ProcessedImage['avif'] = encoded.map((e) => e.avif);
  const webp: ProcessedImage['webp'] = encoded.map((e) => e.webp);
  const blurBuf = await base.clone().resize({ width: 16 }).webp({ quality: 40 }).toBuffer();
  const largest = widths[widths.length - 1]!;
  const height = Math.round((meta.height * largest) / w0);
  return {
    key: hash,
    width: largest,
    height,
    bytes: input.length,
    src: webp[webp.length - 1]!.url,
    avif,
    webp,
    blur: `data:image/webp;base64,${blurBuf.toString('base64')}`,
  };
}
