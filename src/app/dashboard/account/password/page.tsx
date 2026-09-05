import { requirePageSession } from '@/lib/auth/guard';
import { PageHeader, Alert } from '@/components/ui/primitives';
import { ChangePasswordForm } from './change-password-form';

export const metadata = { title: 'Change password' };
export const dynamic = 'force-dynamic';

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ first?: string }>;
}) {
  await requirePageSession('/dashboard/account/password');
  const params = await searchParams;

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader
        title="Change password"
        description="Choose a password you do not use anywhere else."
      />
      {params.first ? (
        <div className="mb-4">
          <Alert tone="warning" title="Set your own password">
            You are signed in with a password that was created for you. Please change it before you continue.
          </Alert>
        </div>
      ) : null}
      <ChangePasswordForm />
    </div>
  );
}
