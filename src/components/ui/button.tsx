import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-saffron-500',
  {
    variants: {
      variant: {
        primary: 'bg-espresso-900 text-cream-50 hover:bg-espresso-800',
        accent: 'bg-saffron-500 text-espresso-950 hover:bg-saffron-400',
        outline: 'border border-espresso-200 bg-white text-espresso-800 hover:bg-cream-100',
        ghost: 'text-espresso-700 hover:bg-cream-200',
        danger: 'bg-chilli-500 text-white hover:bg-chilli-600',
        success: 'bg-basil-500 text-white hover:bg-basil-600',
        subtle: 'bg-cream-200 text-espresso-800 hover:bg-cream-300',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = 'Button';

export { buttonVariants };
