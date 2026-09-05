import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'No access' };

export default function NoAccessPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center py-20 text-center">
      <ShieldAlert className="h-12 w-12 text-espresso-200" />
      <h1 className="mt-4 text-xl font-semibold text-espresso-900">You do not have access to this page</h1>
      <p className="mt-2 text-sm text-espresso-400">
        Your role does not include permission for this module. If you believe this is a mistake, ask an
        administrator to review your role.
      </p>
      <Link href="/dashboard" className="mt-6">
        <Button variant="outline">Back to dashboard</Button>
      </Link>
    </div>
  );
}
