import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
// shadcn/ui Button pattern (MIT), adapted for KSF variants.
import { cn } from '../../lib/utils';
const variants = cva('button inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-2 disabled:pointer-events-none disabled:opacity-50', {
  variants: { variant: { default: 'button-default', ghost: 'button-ghost', outline: 'button-outline' }, size: { default: 'button-normal', icon: 'button-icon', sm: 'button-small' } }, defaultVariants: { variant: 'ghost', size: 'default' },
});
export function Button({ className, variant, size, asChild = false, ...props }: React.ComponentProps<'button'> & VariantProps<typeof variants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button';
  return <Comp data-slot="button" className={cn(variants({ variant, size, className }))} {...props} />;
}
