import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="container-x grid min-h-[60vh] place-items-center py-24 text-center">
      <div>
        <p className="eyebrow text-tan">404</p>
        <h1 className="mt-3 text-5xl md:text-7xl">This page has left the building</h1>
        <p className="mx-auto mt-4 max-w-md text-muted">The page you’re looking for may have moved. Let’s get you back to the collection.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/collections/all" className="btn btn-primary">Shop the collection</Link>
          <Link href="/" className="btn btn-ghost">Home</Link>
        </div>
      </div>
    </div>
  );
}
