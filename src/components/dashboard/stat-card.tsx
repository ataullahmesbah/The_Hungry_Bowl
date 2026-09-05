import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Icon } from './icon';

export function StatCard({
  label,
  value,
  sublabel,
  icon,
  href,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  sublabel?: string;
  icon?: string;
  href?: string;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
}) {
  const tones = {
    neutral: 'bg-espresso-100 text-espresso-600',
    accent: 'bg-saffron-100 text-saffron-700',
    success: 'bg-green-100 text-green-700',
    warning: 'bg-amber-100 text-amber-700',
    danger: 'bg-red-100 text-red-700',
  } as const;

  const inner = (
    <div className="flex items-start justify-between gap-3 rounded-[--radius-card] border border-espresso-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-espresso-400">{label}</p>
        <p className="mt-1.5 text-2xl font-semibold tabular-nums text-espresso-900">{value}</p>
        {sublabel ? <p className="mt-0.5 truncate text-xs text-espresso-400">{sublabel}</p> : null}
      </div>
      {icon ? (
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', tones[tone])}>
          <Icon name={icon} className="h-4.5 w-4.5" aria-hidden />
        </span>
      ) : null}
    </div>
  );

  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}
