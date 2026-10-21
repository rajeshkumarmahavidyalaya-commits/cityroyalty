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

export async function processImage(input: Buffer, storage: Storage): Promise<ProcessedImage> {
  const hash = createHash('sha256').update(input).digest('hex').slice(0, 16);
  const base = sharp(input, { failOn: 'error' }).rotate(); // honour EXIF orientation
  const meta = await base.metadata();
  if (!meta.width || !meta.height) throw new Error('Unreadable image');
  if (meta.width < 200 || meta.height < 200) throw new Error('Image is too small (min 200px)');
  const w0 = meta.width;
  const widths = [...new Set([...WIDTHS.filter((w) => w < w0), Math.min(w0, WIDTHS[WIDTHS.length - 1]!)])].sort((a, b) => a - b);

  const avif: ProcessedImage['avif'] = [];
  const webp: ProcessedImage['webp'] = [];
  for (const w of widths) {
    const resized = () => base.clone().resize({ width: w, withoutEnlargement: true });
    const [a, p] = await Promise.all([resized().avif({ quality: 56, effort: 4 }).toBuffer(), resized().webp({ quality: 80 }).toBuffer()]);
    const ak = `images/${hash}/${w}.avif`;
    const pk = `images/${hash}/${w}.webp`;
    await Promise.all([storage.put(ak, a, 'image/avif'), storage.put(pk, p, 'image/webp')]);
    avif.push({ w, url: storage.url(ak) });
    webp.push({ w, url: storage.url(pk) });
  }
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
