export default function Loading() {
  return (
    <div className="container-x py-24" aria-busy="true" aria-live="polite">
      <div className="skeleton h-10 w-64" />
      <div className="mt-10 grid grid-cols-2 gap-6 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (<div key={i} className="skeleton aspect-[4/5]" />))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
