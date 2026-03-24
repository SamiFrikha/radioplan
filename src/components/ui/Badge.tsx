import React from 'react';

type BadgeVariant = 'green' | 'red' | 'amber' | 'blue' | 'violet' | 'gray';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}

const variants: Record<BadgeVariant, string> = {
  green:  'bg-success/10 text-emerald-700 ring-1 ring-success/20',
  red:    'bg-danger/10  text-red-700     ring-1 ring-danger/20',
  amber:  'bg-warning/10 text-amber-700   ring-1 ring-warning/20',
  blue:   'bg-primary/10 text-indigo-700  ring-1 ring-primary/20',
  violet: 'bg-secondary/10 text-violet-700 ring-1 ring-secondary/20',
  gray:   'bg-border     text-text-muted  ring-1 ring-border',
};

const dots: Record<BadgeVariant, string> = {
  green: 'bg-success', red: 'bg-danger', amber: 'bg-warning',
  blue: 'bg-primary', violet: 'bg-secondary', gray: 'bg-text-muted',
};

export function Badge({ variant = 'gray', children, dot = false, className = '' }: BadgeProps) {
  return (
    <span className={[
      'inline-flex items-center gap-1.5 px-2.5 py-0.5',
      'text-xs font-semibold rounded-badge',
      variants[variant],
      className,
    ].join(' ')}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dots[variant]}`} aria-hidden="true" />}
      {children}
    </span>
  );
}
