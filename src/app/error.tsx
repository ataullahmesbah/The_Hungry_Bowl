'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[app] unhandled error', error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-20">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-espresso-900">Something went wrong</h1>
        <p className="mt-3 text-espresso-400">
          The page could not be loaded. Please try again — if it keeps happening, let the team know.
        </p>
        {error.digest ? (
          <p className="mt-2 font-mono text-xs text-espresso-300">Reference: {error.digest}</p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          className="mt-8 rounded-lg bg-espresso-900 px-5 py-2.5 text-sm font-medium text-cream-50 hover:bg-espresso-800"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
