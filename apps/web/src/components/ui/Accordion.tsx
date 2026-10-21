import type { ReactNode } from 'react';
import { ChevronIcon } from './Icons';

export function Accordion({ items }: { items: { title: string; content: ReactNode; open?: boolean }[] }) {
  return (
    <div className="divide-y divide-line border-y border-line">
      {items.map((it) => (
        <details key={it.title} className="group py-1" open={it.open}>
          <summary className="flex cursor-pointer list-none items-center justify-between py-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
            {it.title}
            <span className="transition-transform duration-300 group-open:rotate-180"><ChevronIcon width={18} height={18} /></span>
          </summary>
          <div className="pb-5 text-sm leading-relaxed text-royal/85">{it.content}</div>
        </details>
      ))}
    </div>
  );
}
