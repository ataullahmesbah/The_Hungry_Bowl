import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Section({
  children,
  className,
  tone = 'default',
}: {
  children: React.ReactNode;
  className?: string;
  tone?: 'default' | 'muted' | 'dark';
}) {
  const tones = {
    default: '',
    muted: 'bg-cream-100',
    dark: 'bg-espresso-900 text-cream-100',
  } as const;

  return (
    <section className={cn('py-14 sm:py-20', tones[tone], className)}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">{children}</div>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  linkHref,
  linkLabel,
  align = 'left',
  invert = false,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  linkHref?: string;
  linkLabel?: string;
  align?: 'left' | 'center';
  invert?: boolean;
}) {
  return (
    <div
      className={cn(
        'mb-8 flex flex-col gap-3 sm:mb-10 sm:flex-row sm:items-end sm:justify-between',
        align === 'center' && 'sm:flex-col sm:items-center sm:text-center',
      )}
    >
      <div className={cn(align === 'center' && 'max-w-2xl')}>
        {eyebrow ? (
          <p className={cn('text-xs font-semibold uppercase tracking-[0.14em]', invert ? 'text-saffron-400' : 'text-saffron-700')}>
            {eyebrow}
          </p>
        ) : null}
        <h2
          className={cn(
            'mt-1.5 font-[family-name:--font-display] text-2xl font-semibold tracking-tight sm:text-3xl',
            invert ? 'text-cream-50' : 'text-espresso-900',
          )}
        >
          {title}
        </h2>
        {description ? (
          <p className={cn('mt-2 max-w-2xl text-sm sm:text-base', invert ? 'text-cream-300' : 'text-espresso-400')}>
            {description}
          </p>
        ) : null}
      </div>

      {linkHref && linkLabel ? (
        <Link
          href={linkHref}
          className={cn(
            'group inline-flex shrink-0 items-center gap-1.5 text-sm font-medium',
            invert ? 'text-saffron-300 hover:text-saffron-200' : 'text-saffron-700 hover:text-saffron-800',
          )}
        >
          {linkLabel}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      ) : null}
    </div>
  );
}
