'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Icon } from './icon';
import type { NavGroup } from '@/lib/dashboard/nav';

export interface NavBadges {
  newOrders?: number;
  pendingReservations?: number;
  lowStock?: number;
  pendingReviews?: number;
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  // A nested route like /dashboard/menu/categories must not also light up
  // /dashboard/menu, so an exact-or-child check is done against the longest
  // matching sibling by the caller ordering; here we only match self/children.
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({
  groups,
  badges,
  restaurantName,
}: {
  groups: NavGroup[];
  badges: NavBadges;
  restaurantName: string;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Only the deepest matching link should look active.
  const allHrefs = groups.flatMap((g) => g.items.map((i) => i.href));
  const bestMatch = allHrefs
    .filter((href) => isActive(pathname, href))
    .sort((a, b) => b.length - a.length)[0];

  const nav = (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4 scroll-slim">
      {groups.map((group) => (
        <div key={group.title}>
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-espresso-400">
            {group.title}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = bestMatch === item.href;
              const badge = item.badgeKey ? badges[item.badgeKey] : undefined;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                      active
                        ? 'bg-saffron-500 font-medium text-espresso-950'
                        : 'text-cream-200 hover:bg-espresso-800 hover:text-cream-50',
                    )}
                  >
                    <Icon name={item.icon} className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="flex-1 truncate">{item.label}</span>
                    {badge && badge > 0 ? (
                      <span
                        className={cn(
                          'rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                          active ? 'bg-espresso-900 text-saffron-300' : 'bg-chilli-500 text-white',
                        )}
                      >
                        {badge > 99 ? '99+' : badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const brand = (
    <div className="flex items-center gap-2.5 border-b border-espresso-800 px-5 py-4">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-saffron-500 text-xs font-bold text-espresso-950">
        HB
      </span>
      <span className="truncate font-[family-name:--font-display] text-sm font-semibold text-cream-50">
        {restaurantName}
      </span>
    </div>
  );

  return (
    <>
      {/* Mobile trigger — floor staff work on phones and tablets. */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed bottom-4 left-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-espresso-900 text-cream-50 shadow-lg lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-espresso-950/60"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-espresso-900">
            <div className="flex items-center justify-between border-b border-espresso-800 pr-3">
              <div className="flex-1">{brand}</div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded p-2 text-cream-200"
                aria-label="Close navigation"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {nav}
          </div>
        </div>
      ) : null}

      <aside className="hidden w-64 shrink-0 flex-col border-r border-espresso-800 bg-espresso-900 lg:flex">
        {brand}
        {nav}
      </aside>
    </>
  );
}
