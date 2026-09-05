'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Underline,
  Undo2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A small formatting editor for CMS content.
 *
 * It writes plain HTML that the server sanitises on save, and deliberately
 * offers only the handful of formats a restaurant page needs — an owner
 * writing an About page should never be looking at markup or at a toolbar with
 * forty buttons they will never press.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeight = 260,
  id,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  id?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);

  // Only push external value in when the editor is not being typed into, so
  // the caret never jumps mid-sentence.
  useEffect(() => {
    if (ref.current && !focused && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value;
    }
  }, [value, focused]);

  const exec = useCallback(
    (command: string, argument?: string) => {
      ref.current?.focus();
      document.execCommand(command, false, argument);
      onChange(ref.current?.innerHTML ?? '');
    },
    [onChange],
  );

  const buttons = [
    { icon: Bold, label: 'Bold', action: () => exec('bold') },
    { icon: Italic, label: 'Italic', action: () => exec('italic') },
    { icon: Underline, label: 'Underline', action: () => exec('underline') },
    { icon: Heading2, label: 'Heading', action: () => exec('formatBlock', '<h2>') },
    { icon: Heading3, label: 'Sub-heading', action: () => exec('formatBlock', '<h3>') },
    { icon: List, label: 'Bullet list', action: () => exec('insertUnorderedList') },
    { icon: ListOrdered, label: 'Numbered list', action: () => exec('insertOrderedList') },
    { icon: Quote, label: 'Quote', action: () => exec('formatBlock', '<blockquote>') },
    {
      icon: Link2,
      label: 'Add link',
      action: () => {
        const url = window.prompt('Link address (https://…)');
        if (!url) return;
        if (!/^https?:\/\//i.test(url) && !url.startsWith('/')) {
          window.alert('Links must start with https:// or /');
          return;
        }
        exec('createLink', url);
      },
    },
    { icon: Undo2, label: 'Undo', action: () => exec('undo') },
    { icon: Redo2, label: 'Redo', action: () => exec('redo') },
  ];

  const isEmpty = !value || value === '<br>' || value === '<p></p>';

  return (
    <div className="overflow-hidden rounded-lg border border-espresso-200 bg-white focus-within:border-saffron-400 focus-within:ring-2 focus-within:ring-saffron-200">
      <div className="flex flex-wrap gap-0.5 border-b border-espresso-100 bg-cream-50 px-2 py-1.5">
        {buttons.map(({ icon: Icon, label, action }) => (
          <button
            key={label}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={action}
            title={label}
            aria-label={label}
            className="rounded p-1.5 text-espresso-500 transition-colors hover:bg-espresso-100 hover:text-espresso-900"
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>

      <div className="relative">
        {isEmpty && !focused && placeholder ? (
          <p className="pointer-events-none absolute left-4 top-3 text-sm text-espresso-300">{placeholder}</p>
        ) : null}
        <div
          id={id}
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="Page content"
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            onChange(ref.current?.innerHTML ?? '');
          }}
          onInput={() => onChange(ref.current?.innerHTML ?? '')}
          onPaste={(event) => {
            // Paste as plain text so a copy from Word does not drag in a wall
            // of inline styles and font tags.
            event.preventDefault();
            const text = event.clipboardData.getData('text/plain');
            document.execCommand('insertText', false, text);
          }}
          className={cn('prose-hb px-4 py-3 text-sm text-espresso-800 outline-none')}
          style={{ minHeight }}
        />
      </div>
    </div>
  );
}
