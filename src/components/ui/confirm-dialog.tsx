'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './button';
import { Input } from './field';

/**
 * Confirmation for destructive actions, PRD §17.
 *
 * `confirmWord` forces the operator to type the record's name before a
 * genuinely irreversible action goes through — an accidental double-click on
 * "Delete" cannot get past it.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  confirmWord,
  pending = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'warning' | 'primary';
  confirmWord?: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState('');
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      setTyped('');
      cancelRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const canConfirm = !confirmWord || typed.trim().toLowerCase() === confirmWord.trim().toLowerCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-espresso-950/50" onClick={onCancel} aria-hidden />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
      >
        <div className="flex gap-3">
          <span
            className={
              tone === 'danger'
                ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600'
                : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-saffron-100 text-saffron-700'
            }
          >
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="confirm-title" className="text-base font-semibold text-espresso-900">
              {title}
            </h2>
            {description ? <div className="mt-1.5 text-sm text-espresso-500">{description}</div> : null}
          </div>
        </div>

        {confirmWord ? (
          <div className="mt-4">
            <label htmlFor="confirm-word" className="mb-1.5 block text-sm text-espresso-600">
              Type <strong className="font-semibold text-espresso-900">{confirmWord}</strong> to confirm
            </label>
            <Input
              id="confirm-word"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
            />
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <Button ref={cancelRef} type="button" variant="outline" onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={!canConfirm || pending}
          >
            {pending ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
