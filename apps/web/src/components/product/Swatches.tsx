import { swatchColour } from '@/lib/format';

export function Swatches({ colours, max = 5 }: { colours: string[]; max?: number }) {
  const shown = colours.slice(0, max);
  if (!colours.length) return null;
  return (
    <ul className="flex items-center gap-1.5" aria-label={`Available colours: ${colours.join(', ')}`}>
      {shown.map((c) => {
        const bg = swatchColour(c);
        return bg ? <li key={c} title={c} className="h-3 w-3 rounded-full ring-1 ring-royal/25" style={{ background: bg }} /> : null;
      })}
      {colours.length > max && <li className="text-[0.7rem] text-muted">+{colours.length - max}</li>}
    </ul>
  );
}
