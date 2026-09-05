import Link from 'next/link';

export const metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-20">
      <div className="max-w-md text-center">
        <p className="font-[family-name:--font-display] text-6xl font-semibold text-espresso-200">404</p>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-espresso-900">
          We could not find that page
        </h1>
        <p className="mt-3 text-espresso-400">
          The link may be out of date, or the dish may have come off the menu.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="rounded-lg bg-espresso-900 px-5 py-2.5 text-sm font-medium text-cream-50 hover:bg-espresso-800"
          >
            Back to home
          </Link>
          <Link
            href="/menu"
            className="rounded-lg border border-espresso-200 bg-white px-5 py-2.5 text-sm font-medium text-espresso-800 hover:bg-cream-100"
          >
            Browse the menu
          </Link>
        </div>
      </div>
    </main>
  );
}
