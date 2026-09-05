import { apiSuccess, route } from '@/lib/api';

export const GET = route({}, async ({ session }) =>
  apiSuccess({
    id: session!.user.id,
    name: session!.user.name,
    email: session!.user.email,
    avatarUrl: session!.user.avatarUrl,
    roles: session!.user.roleNames,
    permissions: [...session!.user.permissions],
    mustChangePassword: session!.user.mustChangePassword,
  }),
);
