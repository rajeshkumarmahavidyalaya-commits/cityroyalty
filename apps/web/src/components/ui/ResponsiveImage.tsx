'use client';
import { useState } from 'react';
import type { ImageDTO } from '@cityroyalty/shared';

interface Props {
  image: ImageDTO;
  sizes: string;
  className?: string;
  imgClassName?: string;
  priority?: boolean;
  /** CSS aspect-ratio; defaults to the image's own */
  ratio?: string;
  fit?: 'cover' | 'contain';
  alt?: string;
}

const srcset = (xs: { w: number; url: string }[]) => xs.map((s) => `${s.url} ${s.w}w`).join(', ');

/** AVIF → WebP responsive picture with blur-up and a fade-in. Dimensions are reserved so there is no layout shift. */
export function ResponsiveImage({ image, sizes, className = '', imgClassName = '', priority, ratio, fit = 'cover', alt }: Props) {
  const [loaded, setLoaded] = useState(false);
  const aspect = ratio ?? (image.width && image.height ? `${image.width} / ${image.height}` : '4 / 5');
  return (
    <span
      className={`relative block overflow-hidden bg-line ${className}`}
      style={{ aspectRatio: aspect, backgroundImage: image.blur ? `url(${image.blur})` : undefined, backgroundSize: 'cover' }}
    >
      <picture>
        {image.avif.length > 0 && <source type="image/avif" srcSet={srcset(image.avif)} sizes={sizes} />}
        <source type="image/webp" srcSet={srcset(image.webp)} sizes={sizes} />
        <img
          src={image.src}
          alt={alt ?? image.alt}
          width={image.width || undefined}
          height={image.height || undefined}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : undefined}
          ref={(el) => {
            if (el?.complete && el.naturalWidth) setLoaded(true);
          }}
          onLoad={() => setLoaded(true)}
          className={`absolute inset-0 h-full w-full transition-opacity duration-500 ease-[var(--ease-lux)] ${fit === 'cover' ? 'object-cover' : 'object-contain'} ${loaded ? 'opacity-100' : 'opacity-0'} ${imgClassName}`}
        />
      </picture>
    </span>
  );
}
