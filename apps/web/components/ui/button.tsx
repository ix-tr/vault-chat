import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ComponentProps } from 'react';
const variants = cva('button', { variants: { variant: { primary: 'primary', secondary: 'secondary' } }, defaultVariants: { variant: 'secondary' } });
export function Button({ asChild = false, variant, className, ...props }: ComponentProps<'button'> & VariantProps<typeof variants> & { asChild?: boolean }) {
 const Component = asChild ? Slot : 'button';
 return <Component className={twMerge(clsx(variants({ variant }), className))} {...props} />;
}
