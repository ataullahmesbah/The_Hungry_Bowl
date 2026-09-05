import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getSettings } from '@/lib/settings';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Staff Sign In',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getSession();
  const params = await searchParams;

  if (session) redirect(params.next && params.next.startsWith('/') ? params.next : '/dashboard');

  const settings = await getSettings().catch(() => null);

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 inline-flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-espresso-900 text-sm font-bold text-saffron-400">
              HB
            </span>
            <span className="font-[family-name:--font-display] text-lg font-semibold text-espresso-900">
              {settings?.name ?? 'The Hungry Bowl'}
            </span>
          </Link>

          <h1 className="text-2xl font-semibold tracking-tight text-espresso-900">Staff sign in</h1>
          <p className="mt-1.5 text-sm text-espresso-400">
            This area is for restaurant staff. Customers can browse the{' '}
            <Link href="/menu" className="text-saffron-700 underline">
              menu
            </Link>{' '}
            or{' '}
            <Link href="/reservation" className="text-saffron-700 underline">
              reserve a table
            </Link>
            .
          </p>

          <div className="mt-8">
            <LoginForm redirectTo={params.next} />
          </div>

          <p className="mt-8 text-xs text-espresso-400">
            Forgot your password? Ask a manager or the system administrator to reset it for you.
          </p>
        </div>
      </div>

      <div className="relative hidden overflow-hidden bg-espresso-900 lg:block">
        <div
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, #f9860a 0, transparent 45%), radial-gradient(circle at 80% 70%, #b74806 0, transparent 40%)',
          }}
        />
        <div className="relative flex h-full flex-col justify-end p-12 text-cream-100">
          <blockquote className="max-w-md">
            <p className="font-[family-name:--font-display] text-2xl leading-relaxed">
              One kitchen, one source of truth — menu, tables, orders, stock and money, all in the same place.
            </p>
            <footer className="mt-4 text-sm text-cream-300">
              {settings?.name ?? 'The Hungry Bowl'} · Operations Platform
            </footer>
          </blockquote>
        </div>
      </div>
    </main>
  );
}
