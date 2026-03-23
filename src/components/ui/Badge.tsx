import React from 'react';

type BadgeVariant = 'green' | 'red' | 'amber' | 'blue' | 'gray';

const variantClasses: Record<BadgeVariant, string> = {
  green: 'bg-[#F0FDF4] text-accent-green',
  red: 'bg-[#FEF2F2] text-accent-red',
  amber: 'bg-[#FFFBEB] text-accent-amber',
  blue: 'bg-[#EFF6FF] text-primary',
  gray: 'bg-[#F1F5F9] text-[#475569]',
};

interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ variant, children, className = '' }) => (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-badge text-[11px] font-medium font-body ${variantClasses[variant]} ${className}`}>
    <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />
    {children}
  </span>
);
