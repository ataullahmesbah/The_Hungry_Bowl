'use client';

import { useState } from 'react';
import { Send, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Alert, Spinner } from '@/components/ui/primitives';
import { ApiError, api } from '@/lib/client/api-client';
import { cn } from '@/lib/utils';

export function ReviewForm() {
  const [values, setValues] = useState({ authorName: '', authorEmail: '', title: '', body: '' });
  const [rating, setRating] = useState(5);
  const [hover, setHover] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  function set(key: keyof typeof values) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValues((prev) => ({ ...prev, [key]: e.target.value }));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    setErrors({});
    try {
      const result = await api.post<{ pending: boolean }>('/api/public/reviews', { ...values, rating });
      setDone(true);
      setMessage(
        result.pending
          ? 'Thank you. Your review has been sent to our team and will appear once it is approved.'
          : 'Thank you. Your review is now live.',
      );
      setValues({ authorName: '', authorEmail: '', title: '', body: '' });
      setRating(5);
    } catch (err) {
      if (err instanceof ApiError) {
        setMessage(err.message);
        setErrors(err.details ?? {});
      } else {
        setMessage('Could not send your review. Please try again.');
      }
    } finally {
      setPending(false);
    }
  }

  if (done) return <Alert tone="success">{message}</Alert>;

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {message ? <Alert tone="danger">{message}</Alert> : null}

      <fieldset>
        <legend className="mb-1.5 block text-sm font-medium text-espresso-800">
          Your rating <span className="text-chilli-500">*</span>
        </legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setRating(value)}
              onMouseEnter={() => setHover(value)}
              onMouseLeave={() => setHover(0)}
              aria-label={`${value} star${value === 1 ? '' : 's'}`}
              aria-pressed={rating === value}
              className="rounded p-0.5"
            >
              <Star
                className={cn(
                  'h-7 w-7 transition-colors',
                  value <= (hover || rating) ? 'fill-saffron-400 text-saffron-400' : 'text-espresso-200',
                )}
              />
            </button>
          ))}
        </div>
      </fieldset>

      <Field label="Your name" htmlFor="authorName" required error={errors.authorName}>
        <Input id="authorName" required maxLength={80} value={values.authorName} onChange={set('authorName')} />
      </Field>

      <Field
        label="Email"
        htmlFor="authorEmail"
        error={errors.authorEmail}
        hint="Only used if we need to follow up. Never published."
      >
        <Input id="authorEmail" type="email" maxLength={200} value={values.authorEmail} onChange={set('authorEmail')} />
      </Field>

      <Field label="Headline" htmlFor="title" error={errors.title}>
        <Input id="title" maxLength={120} value={values.title} onChange={set('title')} placeholder="Best kacchi in town" />
      </Field>

      <Field label="Your review" htmlFor="body" required error={errors.body}>
        <Textarea
          id="body"
          required
          minLength={10}
          maxLength={2000}
          rows={5}
          value={values.body}
          onChange={set('body')}
          placeholder="Tell us what you ate and how the visit went."
        />
      </Field>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Spinner /> : <Send className="h-4 w-4" />}
        {pending ? 'Sending…' : 'Submit review'}
      </Button>
    </form>
  );
}
