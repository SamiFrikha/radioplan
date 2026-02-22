import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  color: string;
  description?: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon: Icon, color, description }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 md:p-6 flex items-start space-x-3 md:space-x-4">
      <div className={`p-2 md:p-3 rounded-lg ${color} bg-opacity-10`}>
        <Icon className={`w-4 h-4 md:w-6 md:h-6 ${color.replace('bg-', 'text-')}`} />
      </div>
      <div className="min-w-0">
        <h3 className="text-slate-500 text-[10px] md:text-sm font-medium uppercase tracking-wide truncate">{title}</h3>
        <div className="mt-0.5 md:mt-1 text-lg md:text-2xl font-bold text-slate-900">{value}</div>
        {description && <p className="mt-0.5 md:mt-1 text-[10px] md:text-sm text-slate-400 hidden sm:block">{description}</p>}
      </div>
    </div>
  );
};

export default StatCard;
