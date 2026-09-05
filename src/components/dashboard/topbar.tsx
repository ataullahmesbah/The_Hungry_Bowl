'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ChevronDown, ExternalLink, KeyRound, LogOut, Monitor } from 'lucide-react';
import { api } from '@/lib/client/api-client';
import { NotificationBell } from './notification-bell';

export function Topbar({
  userName,
  userEmail,
  roleNames,
  canSeeKds,
}: {
  userName: string;
  userEmail: string;
  roleNames: string[];
  canSeeKds: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await api.post('/api/auth/logout');
    } finally {
      router.push('/login');
      router.refresh();
    }
  }

  const initials = userName
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-espresso-100 bg-white/90 px-4 backdrop-blur sm:px-6">
      <div className="flex items-center gap-2">
        <Link
          href="/"
          target="_blank"
          rel="noreferrer"
          className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-espresso-600 hover:bg-cream-200 sm:inline-flex"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          View website
        </Link>
        {canSeeKds ? (
          <Link
            href="/kds"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-espresso-600 hover:bg-cream-200"
          >
            <Monitor className="h-3.5 w-3.5" />
            Kitchen screen
          </Link>
        ) : null}
      </div>

      <div className="flex items-center gap-1.5">
        <NotificationBell />

        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-cream-200"
            aria-haspopup="menu"
            aria-expanded={open}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-espresso-900 text-xs font-semibold text-saffron-400">
              {initials || 'U'}
            </span>
            <span className="hidden text-left sm:block">
              <span className="block text-xs font-medium leading-tight text-espresso-900">{userName}</span>
              <span className="block text-[11px] leading-tight text-espresso-400">
                {roleNames[0] ?? 'Staff'}
              </span>
            </span>
            <ChevronDown className="h-4 w-4 text-espresso-400" />
          </button>

          {open ? (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
              <div
                role="menu"
                className="absolute right-0 z-20 mt-2 w-60 overflow-hidden rounded-xl border border-espresso-100 bg-white shadow-lg"
              >
                <div className="border-b border-espresso-100 px-4 py-3">
                  <p className="truncate text-sm font-medium text-espresso-900">{userName}</p>
                  <p className="truncate text-xs text-espresso-400">{userEmail}</p>
                  <p className="mt-1.5 text-[11px] text-espresso-400">{roleNames.join(', ')}</p>
                </div>
                <Link
                  href="/dashboard/account/password"
                  className="flex items-center gap-2 px-4 py-2.5 text-sm text-espresso-700 hover:bg-cream-100"
                >
                  <KeyRound className="h-4 w-4" />
                  Change password
                </Link>
                <button
                  type="button"
                  onClick={signOut}
                  disabled={signingOut}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-chilli-600 hover:bg-red-50 disabled:opacity-50"
                >
                  <LogOut className="h-4 w-4" />
                  {signingOut ? 'Signing out…' : 'Sign out'}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
