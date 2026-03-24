import React from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: React.ReactNode;
}

const variants: Record<string, string> = {
  primary:   'bg-gradient-primary text-white shadow-card hover:shadow-card-hover',
  secondary: 'bg-surface text-primary border border-primary/30 hover:bg-primary/5',
  ghost:     'bg-transparent text-text-muted hover:bg-muted hover:text-text-base',
  danger:    'bg-danger text-white hover:bg-red-700',
};

const sizes: Record<string, string> = {
  sm: 'h-8  px-4  text-xs  font-semibold rounded-btn-sm',
  md: 'h-11 px-6  text-sm  font-semibold rounded-btn',
  lg: 'h-14 px-8  text-base font-semibold rounded-btn',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className = '',
  children,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <button
      {...props}
      disabled={isDisabled}
      aria-busy={loading}
      className={[
        'inline-flex items-center justify-center gap-2 cursor-pointer',
        'transition-all duration-150 press-scale',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
        variants[variant],
        sizes[size],
        className,
      ].join(' ')}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
