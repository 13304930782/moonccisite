import { forwardRef, type ComponentProps } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { Button } from '../ui/button';

export type AdminButtonProps = Omit<ComponentProps<typeof Button>, 'variant'> & {
  variant?: 'solid' | 'soft' | 'ghost';
};

export const AdminButton = forwardRef<HTMLButtonElement, AdminButtonProps>(function AdminButton({ variant = 'solid', size, asChild = false, children, className = '', ...props }, ref) {
  const Content = asChild ? Slot : 'button';
  // The generated Button has no forwardRef, so attach the ref to its slotted DOM child.
  return <Button asChild variant="ghost" size={size} className={`admin-button admin-button--${variant}${size === 'icon' ? ' admin-icon-button' : ''} ${className}`}><Content {...props} ref={ref}>{children}</Content></Button>;
});
