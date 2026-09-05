import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { serialize } from '@/lib/db';
import { getSettings, toPublicSettings } from '@/lib/settings';
import { PageHeader } from '@/components/ui/primitives';
import { AddOnGroupsManager } from './addons-manager';

export const metadata = { title: 'Add-on groups' };
export const dynamic = 'force-dynamic';

export default async function AddOnsPage() {
  await requirePagePermission(PERMISSIONS.MENU_MANAGE, '/dashboard/menu/addons');
  const settings = await getSettings();

  const groups = await prisma.addOnGroup.findMany({
    where: { deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      addOns: { orderBy: { sortOrder: 'asc' } },
      _count: { select: { menuItems: true } },
    },
  });

  return (
    <div>
      <PageHeader
        title="Add-on groups"
        description="Reusable extras such as “Choose Salad” or “Extras”. Build a group once, then attach it to as many dishes as you like."
      />
      <AddOnGroupsManager groups={serialize(groups)} currency={toPublicSettings(settings)} />
    </div>
  );
}
