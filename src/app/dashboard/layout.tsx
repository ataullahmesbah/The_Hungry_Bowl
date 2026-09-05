import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { getSettings } from '@/lib/settings';
import { NAV_GROUPS, filterNav } from '@/lib/dashboard/nav';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { Sidebar, type NavBadges } from '@/components/dashboard/sidebar';
import { Topbar } from '@/components/dashboard/topbar';
import { ToastProvider } from '@/components/ui/toast';

export const dynamic = 'force-dynamic';

/**
 * The authoritative auth gate. Edge middleware only checks that a cookie
 * exists; this layout resolves the real session against the database, so a
 * forged or revoked cookie gets nothing.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login?next=/dashboard');

  const { permissions } = session.user;
  const groups = filterNav(NAV_GROUPS, permissions);
  const settings = await getSettings();

  const badges: NavBadges = {};

  if (permissions.has(PERMISSIONS.ORDER_VIEW)) {
    badges.newOrders = await prisma.order.count({
      where: { status: { in: ['PLACED', 'ACCEPTED', 'PREPARING', 'READY'] } },
    });
  }
  if (permissions.has(PERMISSIONS.RESERVATION_VIEW)) {
    badges.pendingReservations = await prisma.reservation.count({ where: { status: 'PENDING' } });
  }
  if (permissions.has(PERMISSIONS.WEBSITE_VIEW)) {
    badges.pendingReviews = await prisma.review.count({ where: { status: 'PENDING', deletedAt: null } });
  }

  return (
    <ToastProvider>
    <div className="flex min-h-screen bg-cream-50">
      <Sidebar groups={groups} badges={badges} restaurantName={settings.name} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          userName={session.user.name}
          userEmail={session.user.email}
          roleNames={session.user.roleNames}
          canSeeKds={permissions.has(PERMISSIONS.KITCHEN_VIEW)}
        />
        <main className="flex-1 px-4 py-6 pb-24 sm:px-6 lg:pb-6">{children}</main>
      </div>
    </div>
    </ToastProvider>
  );
}
