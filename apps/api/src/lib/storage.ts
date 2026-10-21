import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Config } from '../config';

export interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  url(key: string): string;
}

export function createStorage(config: Config): Storage {
  const base = config.PUBLIC_MEDIA_URL.replace(/\/$/, '');
  if (config.STORAGE_DRIVER === 's3') {
    if (!config.S3_BUCKET || !config.S3_ACCESS_KEY_ID || !config.S3_SECRET_ACCESS_KEY) throw new Error('S3_* env vars are required for STORAGE_DRIVER=s3');
    let client: import('@aws-sdk/client-s3').S3Client | undefined;
    return {
      async put(key, body, contentType) {
        const s3 = await import('@aws-sdk/client-s3');
        client ??= new s3.S3Client({
          region: config.S3_REGION,
          endpoint: config.S3_ENDPOINT,
          forcePathStyle: Boolean(config.S3_ENDPOINT),
          credentials: { accessKeyId: config.S3_ACCESS_KEY_ID!, secretAccessKey: config.S3_SECRET_ACCESS_KEY! },
        });
        await client.send(
          new s3.PutObjectCommand({ Bucket: config.S3_BUCKET, Key: key, Body: body, ContentType: contentType, CacheControl: 'public, max-age=31536000, immutable' }),
        );
      },
      url: (key) => `${base}/${key}`,
    };
  }
  const root = path.resolve(config.STORAGE_LOCAL_DIR);
  return {
    async put(key, body) {
      const file = path.join(root, key);
      if (!file.startsWith(root + path.sep)) throw new Error('Invalid storage key');
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, body);
    },
    url: (key) => `${base}/${key}`,
  };
}
