import Link from 'next/link';
import { Flame, Leaf } from 'lucide-react';
import type { PublicMenuItem } from '@/lib/public/queries';
import { publicPriceLabel } from '@/lib/public/menu';
import type { CurrencyConfig } from '@/lib/format';
import { CldImage } from './cld-image';
import { cn } from '@/lib/utils';

export function MenuCard({
  item,
  currency,
  priority = false,
}: {
  item: PublicMenuItem;
  currency: CurrencyConfig;
  priority?: boolean;
}) {
  const price = publicPriceLabel(item, item.variants, currency);
  const image = item.media[0]?.media;

  return (
    <article
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-[--radius-card] border border-espresso-100 bg-white transition-shadow hover:shadow-lg',
        !item.isAvailable && 'opacity-75',
      )}
    >
      <Link href={`/menu/${item.slug}`} className="relative block">
        <CldImage
          src={image?.secureUrl}
          alt={image?.altText || item.name}
          aspect="1 / 1"
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
          rounded={false}
          priority={priority}
          className="transition-transform duration-300 group-hover:scale-[1.03]"
        />

        <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
          {item.isTodaysSpecial ? (
            <span className="rounded-full bg-saffron-500 px-2.5 py-1 text-[11px] font-semibold text-espresso-950">
              Today’s special
            </span>
          ) : null}
          {item.isNew ? (
            <span className="rounded-full bg-basil-500 px-2.5 py-1 text-[11px] font-semibold text-white">New</span>
          ) : null}
        </div>

        {!item.isAvailable ? (
          <div className="absolute inset-0 flex items-center justify-center bg-espresso-950/55">
            <span className="rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-espresso-900">
              Unavailable today
            </span>
          </div>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-medium leading-snug text-espresso-900">
            <Link href={`/menu/${item.slug}`} className="hover:text-saffron-700">
              {item.name}
            </Link>
          </h3>
          <div className="flex shrink-0 items-center gap-1 pt-0.5">
            {item.isVegetarian ? <Leaf className="h-3.5 w-3.5 text-basil-500" aria-label="Vegetarian" /> : null}
            {item.spiceLevel >= 2 ? (
              <span className="flex" aria-label={`Spice level ${item.spiceLevel} of 4`}>
                {Array.from({ length: Math.min(item.spiceLevel, 3) }).map((_, i) => (
                  <Flame key={i} className="h-3.5 w-3.5 text-chilli-500" />
                ))}
              </span>
            ) : null}
          </div>
        </div>

        {item.shortDescription ? (
          <p className="mt-1.5 line-clamp-2 text-sm text-espresso-400">{item.shortDescription}</p>
        ) : null}

        <div className="mt-auto flex items-end justify-between gap-3 pt-3">
          {/* PRD §5: an item with no price must show nothing here, never "0". */}
          {price ? (
            <p className="font-semibold tabular-nums text-espresso-900">{price}</p>
          ) : (
            <p className="text-sm italic text-espresso-400">Ask our staff</p>
          )}
          {item.variants.length > 1 ? (
            <p className="text-xs text-espresso-400">{item.variants.length} sizes</p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
