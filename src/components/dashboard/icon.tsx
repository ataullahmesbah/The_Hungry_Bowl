'use client';

import * as Icons from 'lucide-react';
import type { LucideProps } from 'lucide-react';

/**
 * Nav config stores icon names as strings so it can stay a plain server-safe
 * module. This resolves the name to a component at render time.
 */
export function Icon({ name, ...props }: { name: string } & LucideProps) {
  const Resolved = (Icons as unknown as Record<string, React.ComponentType<LucideProps>>)[name];
  const Fallback = Icons.Circle;
  const Component = Resolved ?? Fallback;
  return <Component {...props} />;
}
