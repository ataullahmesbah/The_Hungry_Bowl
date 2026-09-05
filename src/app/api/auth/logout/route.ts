import { apiSuccess, route } from '@/lib/api';
import { destroySession } from '@/lib/auth/session';
import { audit } from '@/lib/audit';

export const POST = route({}, async ({ session }) => {
  await audit({ session, action: 'auth.logout', entity: 'User', entityId: session?.user.id ?? null });
  await destroySession();
  return apiSuccess({ signedOut: true });
});
