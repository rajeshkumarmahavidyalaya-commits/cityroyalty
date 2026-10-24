import Link from 'next/link';
import type { CampaignDTO, ImageDTO } from '@cityroyalty/shared';
import { ArrowIcon } from '../ui/Icons';
import { ResponsiveImage } from '../ui/ResponsiveImage';

/**
 * Full-height dark hero (brand board: "Wear a higher standard"). Image from the `home-hero` campaign; until one is set,
 * a homepage product photo stands in. Copy defaults are City Royalty's own lines.
 */
export function Hero({ campaign, fallback }: { campaign?: CampaignDTO; fallback: ImageDTO | null }) {
  const headline = campaign?.headline || 'Wear a higher standard.';
  const sub = campaign?.subline || 'Timeless leather. Modern expression.';
  return (
    <section className="on-dark relative -mt-16 overflow-hidden bg-royal text-ivory md:-mt-20" aria-label="City Royalty">
      <div className="relative flex min-h-[100svh] items-end md:min-h-[min(94svh,880px)] md:items-center">
        <div className="absolute inset-0 md:left-auto md:w-[62%]">
          {campaign?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={campaign.image} alt={campaign.imageAlt} className="h-full w-full object-cover object-[50%_18%]" fetchPriority="high" />
          ) : fallback ? (
            <ResponsiveImage image={fallback} sizes="(min-width:768px) 62vw, 100vw" ratio="auto" priority className="!absolute inset-0 h-full w-full" />
          ) : null}
        </div>
        {/* mobile: fade up from the copy; desktop: fade the photo into the black copy column */}
        <div className="absolute inset-0 bg-gradient-to-t from-royal via-royal/55 to-royal/0 md:hidden" aria-hidden />
        <div className="absolute inset-0 hidden md:block" style={{ background: 'linear-gradient(90deg,#080808 0%,#080808 38%,rgba(8,8,8,.6) 52%,rgba(8,8,8,0) 70%)' }} aria-hidden />
        <div className="container-x relative w-full pb-16 pt-40 md:py-32">
          <p className="eyebrow text-stone">Leather lives longer</p>
          <h1 className="display-caps mt-5 max-w-[11ch] text-[2.9rem] md:text-[5.4rem]">{headline}</h1>
          <p className="mt-6 max-w-sm text-ivory/80 md:text-lg">{sub}</p>
          <Link href={campaign?.ctaHref || '/collections/all'} className="btn btn-light mt-9">
            {campaign?.ctaLabel || 'Explore collection'}
            <ArrowIcon width={18} height={18} />
          </Link>
        </div>
        <p className="eyebrow pointer-events-none absolute bottom-8 right-[max(1.5rem,5vw)] hidden text-right leading-loose text-stone/90 lg:block" aria-hidden>
          People<br />Places<br />Pieces<br /><span className="text-ivory">A higher standard</span>
        </p>
      </div>
    </section>
  );
}
