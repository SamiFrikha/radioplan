import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Button } from './Button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 rounded-card bg-primary/10 flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-primary" aria-hidden="true" />
      </div>
      <p className="text-base font-bold text-text-base mb-1">{title}</p>
      {description && (
        <p className="text-sm text-text-muted max-w-xs mb-5 leading-relaxed">{description}</p>
      )}
      {action && (
        <Button size="sm" onClick={action.onClick}>{action.label}</Button>
      )}
    </div>
  );
}
