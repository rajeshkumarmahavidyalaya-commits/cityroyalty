'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ImageDTO } from '@cityroyalty/shared';
import { Drawer } from '../ui/Drawer';
import { ChevronIcon, ZoomIcon } from '../ui/Icons';
import { ResponsiveImage } from '../ui/ResponsiveImage';

const STYLING_LABEL = 'Styling image · similar look';
const NONE: ImageDTO[] = [];
/** Tag shown on styling (concept) images so they are never mistaken for photographs of this exact piece. */
function StylingTag({ small }: { small?: boolean }) {
  return (
    <span className={`pointer-events-none absolute left-2 top-2 z-10 bg-ivory/90 text-royal ${small ? 'px-1 py-0.5 text-[0.55rem] tracking-wide' : 'eyebrow px-2.5 py-1.5 !text-[0.65rem]'}`}>
      {small ? 'Styling' : STYLING_LABEL}
    </span>
  );
}

/**
 * Desktop: thumbnails + large image with click-to-zoom. Mobile: swipeable snap carousel with dots.
 * Styling images (a similar look, not this exact piece) lead, each tagged; the product photographs follow.
 */
export function Gallery({ images: photos, styling = NONE, title, activeColour }: { images: ImageDTO[]; styling?: ImageDTO[]; title: string; activeColour?: string }) {
  // styling only ever accompanies real photographs; a product without photos shows the placeholder instead
  const images = useMemo(() => (photos.length ? [...styling, ...photos] : photos), [photos, styling]);
  const stylingIds = useMemo(() => new Set(styling.map((s) => s.id)), [styling]);
  const isStyling = (n: number) => stylingIds.has(images[n]?.id ?? '');
  const [i, setI] = useState(0);
  const [zoom, setZoom] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const go = useCallback((n: number) => {
    setI(n);
    const el = scroller.current;
    if (el) el.scrollTo({ left: n * el.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, []);

  // jump to the first image tagged with the selected colour
  useEffect(() => {
    if (!activeColour) return;
    const idx = images.findIndex((im) => im.colour?.toLowerCase() === activeColour.toLowerCase());
    if (idx >= 0) go(idx);
  }, [activeColour, images, go]);

  if (!images.length) {
    return <div className="grid aspect-[4/5] place-items-center bg-line text-sm text-muted">Product photography is being prepared.</div>;
  }
  return (
    <div className="lg:grid lg:grid-cols-[5.5rem_1fr] lg:gap-4">
      {images.length > 1 && (
        <ul className="no-scrollbar hidden max-h-[44rem] flex-col gap-3 overflow-y-auto lg:flex" aria-label="Product images">
          {images.map((im, n) => (
            <li key={im.id}>
              <button type="button" onClick={() => go(n)} aria-label={`Show image ${n + 1} of ${images.length}`} aria-current={i === n} className={`block w-full border transition-opacity ${i === n ? 'border-royal' : 'border-transparent opacity-60 hover:opacity-100'}`}>
                <span className="relative block">
                  <ResponsiveImage image={im} sizes="88px" ratio="4 / 5" alt="" />
                  {isStyling(n) && <StylingTag small />}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <div
          ref={scroller}
          className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto lg:overflow-hidden"
          onScroll={(e) => {
            const el = e.currentTarget;
            const n = Math.round(el.scrollLeft / el.clientWidth);
            if (n !== i && matchMedia('(max-width:1023px)').matches) setI(n);
          }}
          role="group"
          aria-roledescription="carousel"
          aria-label={`${title} images`}
        >
          {images.map((im, n) => (
            <div key={im.id} className="w-full shrink-0 snap-center" role="group" aria-roledescription="slide" aria-label={`${n + 1} of ${images.length}${isStyling(n) ? `, ${STYLING_LABEL}` : ''}`} hidden={false}>
              <button type="button" onClick={() => { setI(n); setZoom(true); }} className="relative block w-full cursor-zoom-in" aria-label="Zoom image">
                <ResponsiveImage image={im} sizes="(min-width:1024px) 46vw, 100vw" ratio="4 / 5" priority={n === 0} />
                {isStyling(n) && <StylingTag />}
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setZoom(true)} className="absolute bottom-3 right-3 hidden h-10 w-10 place-items-center rounded-full bg-ivory/90 lg:grid" aria-label="Open image zoom">
          <ZoomIcon width={20} height={20} />
        </button>
        {images.length > 1 && (
          <>
            <ul className="mt-3 flex justify-center gap-2 lg:hidden" aria-hidden>
              {images.map((im, n) => (<li key={im.id} className={`h-1.5 rounded-full transition-all ${i === n ? 'w-6 bg-royal' : 'w-1.5 bg-stone'}`} />))}
            </ul>
            <div className="pointer-events-none absolute inset-y-0 left-0 right-0 hidden items-center justify-between px-3 lg:flex">
              <button type="button" className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full bg-ivory/90 disabled:opacity-0" disabled={i === 0} onClick={() => go(i - 1)} aria-label="Previous image"><ChevronIcon dir="left" /></button>
              <button type="button" className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full bg-ivory/90 disabled:opacity-0" disabled={i === images.length - 1} onClick={() => go(i + 1)} aria-label="Next image"><ChevronIcon dir="right" /></button>
            </div>
          </>
        )}
      </div>
      <Zoom images={images} stylingIds={stylingIds} start={i} open={zoom} onClose={() => setZoom(false)} title={title} />
    </div>
  );
}

function Zoom({ images, stylingIds, start, open, onClose, title }: { images: ImageDTO[]; stylingIds: Set<string>; start: number; open: boolean; onClose: () => void; title: string }) {
  const [n, setN] = useState(start);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => { if (open) setN(start); }, [open, start]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setN((x) => Math.min(images.length - 1, x + 1));
      if (e.key === 'ArrowLeft') setN((x) => Math.max(0, x - 1));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, images.length]);
  const im = images[n];
  return (
    <Drawer open={open} onClose={onClose} title={`${title} — image ${n + 1} of ${images.length}`} side="center" hideTitle className="!h-[96dvh] !max-h-[96dvh] !w-[min(96vw,64rem)] !bg-royal">
      {im && (
        <div className="relative grid h-full min-h-0 flex-1 place-items-center overflow-hidden">
          <div
            className="relative h-full w-full cursor-zoom-in"
            onMouseMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setPos({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
            }}
            onMouseLeave={() => setPos(null)}
          >
            {/* largest rendition, magnified toward the cursor on hover */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={im.src}
              alt={im.alt}
              className="h-full w-full object-contain transition-transform duration-200 ease-out"
              style={pos ? { transform: 'scale(2)', transformOrigin: `${pos.x}% ${pos.y}%` } : undefined}
              draggable={false}
            />
            {stylingIds.has(im.id) && <StylingTag />}
          </div>
          {images.length > 1 && (
            <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-4 text-ivory">
              <button type="button" className="rounded-full bg-royal/70 p-2 disabled:opacity-30" disabled={n === 0} onClick={() => setN(n - 1)} aria-label="Previous image"><ChevronIcon dir="left" /></button>
              <span className="text-xs tabular-nums">{n + 1} / {images.length}</span>
              <button type="button" className="rounded-full bg-royal/70 p-2 disabled:opacity-30" disabled={n === images.length - 1} onClick={() => setN(n + 1)} aria-label="Next image"><ChevronIcon dir="right" /></button>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
