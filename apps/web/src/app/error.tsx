'use client';
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="container-x grid min-h-[50vh] place-items-center py-24 text-center" role="alert">
      <div>
        <h1 className="text-4xl">Something went wrong</h1>
        <p className="mt-3 text-muted">Please try again. If it keeps happening, contact us.</p>
        <button type="button" className="btn btn-primary mt-6" onClick={reset}>Try again</button>
      </div>
    </div>
  );
}
