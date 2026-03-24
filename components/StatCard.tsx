import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  icon: LucideIcon;
  value: string | number;
  label: string;
  color?: 'blue' | 'violet' | 'green' | 'amber' | 'red';
  trend?: { value: number; label: string };
}

const colorMap = {
  blue:   { bg: 'bg-primary/10',   ring: 'ring-1 ring-primary/25',   icon: 'text-primary',   shadow: 'shadow-card' },
  violet: { bg: 'bg-secondary/10', ring: 'ring-1 ring-secondary/25', icon: 'text-secondary',  shadow: 'shadow-card' },
  green:  { bg: 'bg-success/10',   ring: 'ring-1 ring-success/25',   icon: 'text-success',    shadow: 'shadow-card' },
  amber:  { bg: 'bg-warning/10',   ring: 'ring-1 ring-warning/25',   icon: 'text-warning',    shadow: 'shadow-card' },
  red:    { bg: 'bg-danger/10',    ring: 'ring-1 ring-danger/25',    icon: 'text-danger',     shadow: 'shadow-card' },
} as const;

export default function StatCard({ icon: Icon, value, label, color = 'blue', trend }: StatCardProps) {
  const c = colorMap[color];
  return (
    <article
      className={`bg-surface rounded-card ${c.shadow} border border-border/40 p-5 flex items-start gap-4 press-scale`}
      aria-label={`${label}: ${value}`}
    >
      <div className={`w-11 h-11 rounded-card flex-shrink-0 flex items-center justify-center ${c.bg} ${c.ring}`}>
        <Icon className={`w-5 h-5 ${c.icon}`} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[28px] font-extrabold text-text-base leading-tight tracking-tight tabular-nums">
          {value}
        </p>
        <p className="text-xs font-medium text-text-muted mt-0.5 leading-snug">{label}</p>
        {trend && (
          <p className={`text-xs font-semibold mt-1.5 ${trend.value >= 0 ? 'text-success' : 'text-danger'}`}>
            {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
          </p>
        )}
      </div>
    </article>
  );
}
