import React from 'react';
import { LucideIcon } from 'lucide-react';

type StatCardColor = 'blue' | 'red' | 'green' | 'amber';

const colorClasses: Record<StatCardColor, { icon: string; value: string }> = {
  blue:  { icon: 'bg-[#EFF6FF] text-primary',       value: 'text-text-base' },
  red:   { icon: 'bg-[#FEF2F2] text-accent-red',    value: 'text-accent-red' },
  green: { icon: 'bg-[#F0FDF4] text-accent-green',  value: 'text-accent-green' },
  amber: { icon: 'bg-[#FFFBEB] text-accent-amber',  value: 'text-accent-amber' },
};

interface StatCardProps {
  icon: LucideIcon;
  value: string | number;
  label: string;
  color?: StatCardColor;
}

const StatCard: React.FC<StatCardProps> = ({ icon: Icon, value, label, color = 'blue' }) => {
  const colors = colorClasses[color];
  return (
    <div className="bg-surface border border-border rounded-card shadow-card p-4 flex items-center gap-3.5">
      <div className={`w-10 h-10 rounded-card flex items-center justify-center flex-shrink-0 ${colors.icon}`}>
        <Icon className="w-5 h-5" aria-hidden="true" />
      </div>
      <div>
        <p className={`font-heading font-bold text-[26px] leading-none ${colors.value}`}>{value}</p>
        <p className="text-[12px] text-text-muted mt-0.5">{label}</p>
      </div>
    </div>
  );
};

export default StatCard;
