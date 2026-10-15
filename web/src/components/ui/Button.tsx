import type { LucideIcon } from 'lucide-react';
import { LoaderCircle } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { cn } from './cn.js';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type Size = 'sm' | 'md';

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-navy text-white hover:bg-navy-deep dark:bg-primary dark:text-navy-deep dark:hover:bg-primary-strong',
  secondary: 'bg-surface text-ink border border-line hover:bg-surface-2',
  ghost: 'text-ink hover:bg-surface-2',
  danger: 'bg-danger text-white hover:opacity-90 dark:text-navy-deep',
  subtle: 'bg-primary-soft text-primary-strong hover:brightness-95',
};
const SIZE: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
};

export function buttonClass(
  variant: ButtonVariant = 'secondary',
  size: Size = 'md',
  extra?: string,
): string {
  return cn(
    'inline-flex shrink-0 items-center justify-center rounded-lg font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50',
    VARIANT[variant],
    SIZE[size],
    extra,
  );
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: Size;
  icon?: LucideIcon;
  loading?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  loading = false,
  className,
  children,
  type = 'button',
  disabled,
  ...rest
}: Props): React.JSX.Element {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
      ) : (
        Icon !== undefined && <Icon className="size-4" aria-hidden />
      )}
      {children}
    </button>
  );
}

interface LinkButtonProps extends LinkProps {
  variant?: ButtonVariant;
  size?: Size;
  icon?: LucideIcon;
}

export function LinkButton({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  className,
  children,
  ...rest
}: LinkButtonProps): React.JSX.Element {
  return (
    <Link
      className={buttonClass(variant, size, typeof className === 'string' ? className : undefined)}
      {...rest}
    >
      {Icon !== undefined && <Icon className="size-4" aria-hidden />}
      {children}
    </Link>
  );
}

export function IconButton({
  label,
  icon: Icon,
  className,
  ...rest
}: {
  label: string;
  icon: LucideIcon;
} & ButtonHTMLAttributes<HTMLButtonElement>): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'text-muted hover:text-ink hover:bg-surface-2 inline-flex size-9 items-center justify-center rounded-lg disabled:opacity-40',
        className,
      )}
      {...rest}
    >
      <Icon className="size-[18px]" aria-hidden />
    </button>
  );
}
