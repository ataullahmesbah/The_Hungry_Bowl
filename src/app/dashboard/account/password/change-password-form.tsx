'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Alert, Card, CardBody, Spinner } from '@/components/ui/primitives';
import { ApiError, api } from '@/lib/client/api-client';

const RULES = [
  'At least 10 characters',
  'One uppercase and one lowercase letter',
  'At least one number',
  'Different from your current password',
];

export function ChangePasswordForm() {
  const router = useRouter();
  const [values, setValues] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  function set(key: keyof typeof values) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setValues((prev) => ({ ...prev, [key]: e.target.value }));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    setErrors({});
    try {
      await api.post('/api/auth/change-password', values);
      setDone(true);
      setValues({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => router.push('/dashboard'), 1200);
    } catch (err) {
      if (err instanceof ApiError) {
        setMessage(err.message);
        setErrors(err.details ?? {});
      } else {
        setMessage('Could not reach the server. Try again.');
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardBody>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {done ? <Alert tone="success">Password updated. Other devices have been signed out.</Alert> : null}
          {message ? <Alert tone="danger">{message}</Alert> : null}

          <Field label="Current password" htmlFor="currentPassword" required error={errors.currentPassword}>
            <Input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              value={values.currentPassword}
              onChange={set('currentPassword')}
            />
          </Field>

          <Field
            label="New password"
            htmlFor="newPassword"
            required
            error={errors.newPassword}
            hint={RULES.join(' · ')}
          >
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              required
              value={values.newPassword}
              onChange={set('newPassword')}
            />
          </Field>

          <Field label="Confirm new password" htmlFor="confirmPassword" required error={errors.confirmPassword}>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              value={values.confirmPassword}
              onChange={set('confirmPassword')}
            />
          </Field>

          <Button type="submit" disabled={pending}>
            {pending ? <Spinner /> : <KeyRound className="h-4 w-4" />}
            {pending ? 'Saving…' : 'Update password'}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
