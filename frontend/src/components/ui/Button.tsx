/**
 * Button — Apple-style button with variants, sizes, and press animation.
 * Follows HIG: primary uses accent fill, secondary is subtle, ghost is minimal.
 * Uses CSS active:scale instead of framer-motion to avoid onDrag type conflicts.
 */
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
}

const variantStyles: Record<Variant, string> = {
  primary:
    'bg-accent text-white hover:bg-accent-hover active:bg-accent-dark shadow-card',
  secondary:
    'bg-surface border border-border text-txt-primary hover:bg-surface-secondary active:bg-surface-tertiary',
  ghost:
    'bg-transparent text-txt-secondary hover:bg-surface-secondary active:bg-surface-tertiary',
  danger:
    'bg-severity-major/10 text-severity-major border border-severity-major-border hover:bg-severity-major/20',
};

const sizeStyles: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-body-sm rounded-lg gap-1.5',
  md: 'px-4 py-2 text-body-sm rounded-xl gap-2',
  lg: 'px-6 py-2.5 text-body rounded-xl gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, icon, children, className, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={clsx(
          'inline-flex items-center justify-center font-medium transition-all duration-150 select-none',
          'active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none',
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {loading ? (
          <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
        ) : icon ? (
          <span className="flex-shrink-0">{icon}</span>
        ) : null}
        {children && <span>{children}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';
