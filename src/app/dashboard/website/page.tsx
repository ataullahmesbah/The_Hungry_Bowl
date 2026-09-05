import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { PageHeader, Alert } from '@/components/ui/primitives';
import { BlocksEditor } from './blocks-editor';

export const metadata = { title: 'Home sections' };
export const dynamic = 'force-dynamic';

export default async function WebsiteDashboard() {
  await requirePagePermission(PERMISSIONS.WEBSITE_MANAGE, '/dashboard/website');

  const blocks = await prisma.contentBlock.findMany({
    where: { section: 'home' },
    orderBy: { sortOrder: 'asc' },
  });

  return (
    <div>
      <PageHeader
        title="Home page sections"
        description="Edit the text and pictures on the home page. Changes appear on the website within a minute."
      />
      {blocks.length === 0 ? (
        <Alert tone="warning" title="No sections found">
          Run the seed command (<code className="font-mono text-xs">npm run db:seed</code>) to create the default home
          page sections.
        </Alert>
      ) : (
        <BlocksEditor
          blocks={blocks.map((block) => ({
            key: block.key,
            label: block.label,
            isEnabled: block.isEnabled,
            // Prisma types Json as a union that includes null and scalars; the
            // renderer only ever deals with object payloads.
            data: (block.data ?? {}) as Record<string, unknown>,
          }))}
        />
      )}
    </div>
  );
}
