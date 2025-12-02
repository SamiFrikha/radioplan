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
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-start space-x-4">
      <div className={`p-3 rounded-lg ${color} bg-opacity-10`}>
        <Icon className={`w-6 h-6 ${color.replace('bg-', 'text-')}`} />
      </div>
      <div>
        <h3 className="text-slate-500 text-sm font-medium uppercase tracking-wide">{title}</h3>
        <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
        {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
      </div>
    </div>
  );
};

export default StatCard;
