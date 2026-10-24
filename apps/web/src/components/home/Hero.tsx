import Link from 'next/link';
import type { ImageDTO } from '@cityroyalty/shared';
import { ResponsiveImage } from '../ui/ResponsiveImage';

/** Homepage hero: brand line and a real product photo. Copy is from cityroyalty.in (no invented claims). */
export function Hero({ poster }: { poster: ImageDTO | null }) {
  return (
    <section className="on-dark relative -mt-16 overflow-hidden bg-royal text-ivory md:-mt-20" aria-label="City Royalty">
      <div className="container-x grid min-h-svh items-center gap-10 pb-16 pt-32 md:grid-cols-2">
        <div>
          <p className="eyebrow text-stone">City Royalty</p>
          <h1 className="mt-3 text-[2.8rem] leading-[1.02] md:text-[5.2rem]">Wear a higher standard.</h1>
          <p className="mt-4 max-w-md text-ivory/80 md:text-lg">Timeless leather. Modern expression.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/collections/all" className="btn btn-light">Explore collection</Link>
          </div>
        </div>
        {poster && <ResponsiveImage image={poster} sizes="(min-width:768px) 45vw, 100vw" ratio="4 / 5" priority className="w-full md:ml-auto md:max-w-md" />}
      </div>
    </section>
  );
}
