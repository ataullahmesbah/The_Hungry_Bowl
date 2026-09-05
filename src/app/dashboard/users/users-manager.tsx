'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Pencil, Plus, Shield, ShieldCheck, Trash2, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select } from '@/components/ui/field';
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle, Spinner } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { DataTable, type Column } from '@/components/dashboard/data-table';
import { ApiError, api } from '@/lib/client/api-client';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

interface Role {
  id: string;
  key: string;
  name: string;
  description: string | null;
  rank: number;
  isSystem: boolean;
  userCount: number;
  permissionKeys: string[];
}

interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  lastLoginAt: string | null;
  mustChangePassword: boolean;
  lockedUntil: string | null;
  roles: { id: string; key: string; name: string; rank: number }[];
}

interface PermissionMeta {
  key: string;
  module: string;
  description: string;
}

export function UsersManager({
  users,
  roles,
  permissions,
  actorRank,
  actorId,
  timezone,
  locale,
  can,
}: {
  users: User[];
  roles: Role[];
  permissions: PermissionMeta[];
  actorRank: number;
  actorId: string;
  timezone: string;
  locale: string;
  can: { manageUsers: boolean; manageRoles: boolean };
}) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<'users' | 'roles'>('users');
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const [resetFor, setResetFor] = useState<User | null>(null);
  const [toDelete, setToDelete] = useState<User | null>(null);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [pending, setPending] = useState(false);

  function rankOf(user: User) {
    return Math.min(999, ...user.roles.map((r) => r.rank));
  }

  async function remove() {
    if (!toDelete) return;
    setPending(true);
    try {
      await api.del(`/api/users/${toDelete.id}`);
      toast.success('User removed');
      setToDelete(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not remove the user');
    } finally {
      setPending(false);
    }
  }

  async function setStatus(user: User, status: string) {
    try {
      await api.patch(`/api/users/${user.id}`, { status });
      toast.success(
        status === 'ACTIVE' ? `${user.name} can sign in again` : `${user.name} has been signed out and suspended`,
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update the account');
    }
  }

  const columns: Column<User>[] = [
    {
      key: 'name',
      header: 'Person',
      render: (user) => (
        <div>
          <p className="flex items-center gap-2 font-medium text-espresso-900">
            {user.name}
            {user.id === actorId ? <Badge tone="info">you</Badge> : null}
            {user.lockedUntil && new Date(user.lockedUntil) > new Date() ? <Badge tone="danger">locked</Badge> : null}
          </p>
          <p className="text-xs text-espresso-400">{user.email}</p>
        </div>
      ),
    },
    {
      key: 'roles',
      header: 'Roles',
      render: (user) => (
        <div className="flex flex-wrap gap-1">
          {user.roles.map((role) => (
            <Badge key={role.id} tone={role.rank === 0 ? 'accent' : 'neutral'}>
              {role.name}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (user) => (
        <Badge tone={user.status === 'ACTIVE' ? 'success' : user.status === 'SUSPENDED' ? 'warning' : 'neutral'}>
          {user.status.toLowerCase()}
        </Badge>
      ),
    },
    {
      key: 'last',
      header: 'Last signed in',
      align: 'right',
      render: (user) => (
        <span className="text-xs text-espresso-400">
          {user.lastLoginAt ? formatDateTime(user.lastLoginAt, timezone, locale) : 'never'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (user) => {
        // A user senior to you cannot be managed by you, but you can always
        // manage yourself.
        const locked = rankOf(user) < actorRank && user.id !== actorId;
        if (!can.manageUsers || locked) return null;
        return (
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" title="Edit" onClick={() => setEditing(user)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" title="Reset password" onClick={() => setResetFor(user)}>
              <KeyRound className="h-3.5 w-3.5" />
            </Button>
            {user.status === 'ACTIVE' ? (
              <Button size="sm" variant="ghost" title="Suspend" onClick={() => void setStatus(user, 'SUSPENDED')}>
                Suspend
              </Button>
            ) : (
              <Button size="sm" variant="ghost" title="Reactivate" onClick={() => void setStatus(user, 'ACTIVE')}>
                Reactivate
              </Button>
            )}
            {user.id !== actorId ? (
              <button
                type="button"
                onClick={() => setToDelete(user)}
                className="rounded p-2 text-espresso-400 hover:bg-red-50 hover:text-chilli-600"
                aria-label={`Remove ${user.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex gap-1 rounded-lg border border-espresso-200 bg-white p-1">
        {(['users', 'roles'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setTab(option)}
            className={cn(
              'flex-1 rounded px-3 py-2 text-sm font-medium capitalize transition-colors',
              tab === option ? 'bg-espresso-900 text-cream-50' : 'text-espresso-600 hover:bg-cream-100',
            )}
          >
            {option}
            <span className="ml-1.5 text-xs opacity-70">{option === 'users' ? users.length : roles.length}</span>
          </button>
        ))}
      </div>

      {tab === 'users' ? (
        <>
          {can.manageUsers && !editing ? (
            <Button onClick={() => setEditing('new')}>
              <UserPlus className="h-4 w-4" />
              Add a staff account
            </Button>
          ) : null}

          {editing ? (
            <UserForm
              user={editing === 'new' ? null : editing}
              roles={roles.filter((r) => r.rank >= actorRank)}
              onClose={() => setEditing(null)}
              onDone={() => {
                setEditing(null);
                toast.success('Account saved');
                router.refresh();
              }}
            />
          ) : null}

          <Card>
            <DataTable columns={columns} rows={users} emptyMessage="No staff accounts yet." />
          </Card>
        </>
      ) : (
        <div className="space-y-4">
          <Alert tone="info" title="What a role can do">
            Ticking a permission grants it to everyone holding that role, immediately. Built-in roles can have their
            permissions adjusted, except Super Admin, which always holds everything so the system stays administrable.
          </Alert>

          <div className="grid gap-4 lg:grid-cols-2">
            {roles.map((role) => (
              <Card key={role.id}>
                <CardHeader>
                  <div className="min-w-0">
                    <CardTitle className="flex items-center gap-2">
                      {role.rank === 0 ? (
                        <ShieldCheck className="h-4 w-4 text-saffron-600" />
                      ) : (
                        <Shield className="h-4 w-4 text-espresso-400" />
                      )}
                      {role.name}
                    </CardTitle>
                    <p className="mt-0.5 text-xs text-espresso-400">{role.description}</p>
                  </div>
                  {can.manageRoles && role.rank >= actorRank && role.key !== 'SUPER_ADMIN' ? (
                    <Button size="sm" variant="ghost" onClick={() => setEditingRole(role)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </CardHeader>
                <CardBody>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge tone="neutral">{role.userCount} user(s)</Badge>
                    <Badge tone={role.key === 'SUPER_ADMIN' ? 'accent' : 'info'}>
                      {role.key === 'SUPER_ADMIN' ? 'every permission' : `${role.permissionKeys.length} permissions`}
                    </Badge>
                    {role.isSystem ? <Badge tone="neutral">built-in</Badge> : null}
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      )}

      {editingRole ? (
        <RoleForm
          role={editingRole}
          permissions={permissions}
          onClose={() => setEditingRole(null)}
          onDone={() => {
            setEditingRole(null);
            toast.success('Role updated');
            router.refresh();
          }}
        />
      ) : null}

      {resetFor ? (
        <ResetPasswordDialog
          user={resetFor}
          onClose={() => setResetFor(null)}
          onDone={() => {
            setResetFor(null);
            toast.success('Password reset', 'Every session for that account has been signed out.');
            router.refresh();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(toDelete)}
        title={`Remove ${toDelete?.name}?`}
        confirmLabel="Remove"
        confirmWord={toDelete?.email}
        pending={pending}
        description="The account is disabled and signed out everywhere. Their past orders and audit entries are kept."
        onCancel={() => setToDelete(null)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}

function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-espresso-950/50" onClick={onClose} aria-hidden />
      <Card className={cn('relative max-h-[88vh] w-full overflow-y-auto scroll-slim', wide ? 'max-w-2xl' : 'max-w-lg')}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <button type="button" onClick={onClose} className="rounded p-1 text-espresso-400 hover:bg-cream-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </CardHeader>
        <CardBody>{children}</CardBody>
      </Card>
    </div>
  );
}

function UserForm({
  user,
  roles,
  onClose,
  onDone,
}: {
  user: User | null;
  roles: Role[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [values, setValues] = useState({
    name: user?.name ?? '',
    email: user?.email ?? '',
    phone: user?.phone ?? '',
    password: '',
    roleIds: user?.roles.map((r) => r.id) ?? (roles[0] ? [roles[0].id] : []),
    mustChangePassword: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    setErrors({});
    try {
      if (user) {
        await api.patch(`/api/users/${user.id}`, {
          name: values.name.trim(),
          phone: values.phone.trim() || null,
          roleIds: values.roleIds,
        });
      } else {
        await api.post('/api/users', {
          name: values.name.trim(),
          email: values.email.trim().toLowerCase(),
          phone: values.phone.trim() || null,
          password: values.password,
          roleIds: values.roleIds,
          mustChangePassword: values.mustChangePassword,
        });
      }
      onDone();
    } catch (err) {
      if (err instanceof ApiError) {
        setMessage(err.message);
        setErrors(err.details ?? {});
      } else setMessage('Could not save the account.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal title={user ? `Edit ${user.name}` : 'Add a staff account'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {message ? <Alert tone="danger">{message}</Alert> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required error={errors.name}>
            <Input value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} required />
          </Field>
          <Field label="Email" required error={errors.email} hint={user ? 'The email cannot be changed.' : 'They sign in with this.'}>
            <Input
              type="email"
              value={values.email}
              onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
              required
              disabled={Boolean(user)}
            />
          </Field>
        </div>

        <Field label="Phone" error={errors.phone}>
          <Input value={values.phone} onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))} />
        </Field>

        {!user ? (
          <>
            <Field
              label="First password"
              required
              error={errors.password}
              hint="At least 10 characters with upper case, lower case and a number."
            >
              <Input
                type="text"
                value={values.password}
                onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))}
                required
                autoComplete="new-password"
              />
            </Field>
            <label className="flex items-start gap-2.5 text-sm text-espresso-700">
              <Checkbox
                className="mt-0.5"
                checked={values.mustChangePassword}
                onChange={(e) => setValues((v) => ({ ...v, mustChangePassword: e.target.checked }))}
              />
              <span>
                <span className="block font-medium">Make them set their own password on first sign-in</span>
                <span className="block text-xs text-espresso-400">
                  Recommended — it means you never end up knowing a password that still works.
                </span>
              </span>
            </label>
          </>
        ) : null}

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-espresso-800">Roles</legend>
          <div className="space-y-1.5">
            {roles.map((role) => {
              const checked = values.roleIds.includes(role.id);
              return (
                <label
                  key={role.id}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-lg border p-3',
                    checked ? 'border-saffron-400 bg-saffron-50' : 'border-espresso-100 hover:bg-cream-50',
                  )}
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={checked}
                    onChange={() =>
                      setValues((v) => ({
                        ...v,
                        roleIds: checked ? v.roleIds.filter((id) => id !== role.id) : [...v.roleIds, role.id],
                      }))
                    }
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-espresso-900">{role.name}</span>
                    <span className="block text-xs text-espresso-400">{role.description}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {errors.roleIds ? <p className="mt-1 text-xs text-chilli-600">{errors.roleIds}</p> : null}
        </fieldset>

        <div className="flex gap-2">
          <Button type="submit" disabled={pending || values.roleIds.length === 0}>
            {pending ? <Spinner /> : <Plus className="h-4 w-4" />}
            {user ? 'Save changes' : 'Create account'}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordDialog({ user, onClose, onDone }: { user: User; onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [mustChange, setMustChange] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    setErrors({});
    try {
      await api.post(`/api/users/${user.id}/password`, { password, mustChangePassword: mustChange });
      onDone();
    } catch (err) {
      if (err instanceof ApiError) {
        setMessage(err.message);
        setErrors(err.details ?? {});
      } else setMessage('Could not reset the password.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal title={`Reset the password for ${user.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {message ? <Alert tone="danger">{message}</Alert> : null}
        <Alert tone="warning">
          Every device signed in as {user.email} will be signed out immediately.
        </Alert>

        <Field
          label="New password"
          required
          error={errors.password}
          hint="At least 10 characters with upper case, lower case and a number."
        >
          <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
        </Field>

        <label className="flex items-center gap-2 text-sm text-espresso-700">
          <Checkbox checked={mustChange} onChange={(e) => setMustChange(e.target.checked)} />
          Make them choose their own on next sign-in
        </label>

        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? <Spinner /> : <KeyRound className="h-4 w-4" />}
            Reset password
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function RoleForm({
  role,
  permissions,
  onClose,
  onDone,
}: {
  role: Role;
  permissions: PermissionMeta[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(role.permissionKeys);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const byModule = useMemo(() => {
    const map = new Map<string, PermissionMeta[]>();
    for (const permission of permissions) {
      if (!map.has(permission.module)) map.set(permission.module, []);
      map.get(permission.module)!.push(permission);
    }
    return [...map.entries()];
  }, [permissions]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      await api.patch(`/api/roles/${role.id}`, { permissionKeys: selected });
      onDone();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Could not update the role.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal title={`What ${role.name} can do`} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        {message ? <Alert tone="danger">{message}</Alert> : null}
        <p className="text-sm text-espresso-500">
          {role.userCount} user(s) hold this role. Changes take effect the moment you save.
        </p>

        <div className="space-y-4">
          {byModule.map(([module, list]) => {
            const allOn = list.every((p) => selected.includes(p.key));
            return (
              <fieldset key={module} className="rounded-lg border border-espresso-100 p-3">
                <legend className="flex items-center gap-2 px-1">
                  <span className="text-sm font-medium capitalize text-espresso-800">{module}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setSelected((prev) =>
                        allOn
                          ? prev.filter((key) => !list.some((p) => p.key === key))
                          : [...new Set([...prev, ...list.map((p) => p.key)])],
                      )
                    }
                    className="text-xs text-saffron-700 hover:underline"
                  >
                    {allOn ? 'clear all' : 'select all'}
                  </button>
                </legend>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {list.map((permission) => (
                    <label key={permission.key} className="flex items-start gap-2 text-sm text-espresso-700">
                      <Checkbox
                        className="mt-0.5"
                        checked={selected.includes(permission.key)}
                        onChange={() =>
                          setSelected((prev) =>
                            prev.includes(permission.key)
                              ? prev.filter((k) => k !== permission.key)
                              : [...prev, permission.key],
                          )
                        }
                      />
                      <span className="text-xs">{permission.description}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          })}
        </div>

        <div className="sticky bottom-0 flex gap-2 border-t border-espresso-100 bg-white pt-3">
          <Button type="submit" disabled={pending}>
            {pending ? <Spinner /> : null}
            Save permissions ({selected.length})
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
