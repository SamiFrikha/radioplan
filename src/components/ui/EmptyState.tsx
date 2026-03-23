import React from 'react';
import { LucideIcon } from 'lucide-react';
import { Button } from './Button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon: Icon, title, description, actionLabel, onAction }) => (
  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
    <Icon className="w-12 h-12 text-text-muted mb-3" aria-hidden="true" />
    <h3 className="font-heading font-semibold text-base text-text-base mb-1">{title}</h3>
    {description && <p className="text-sm text-text-muted mb-4 max-w-xs">{description}</p>}
    {actionLabel && onAction && (
      <Button variant="primary" onClick={onAction}>{actionLabel}</Button>
    )}
  </div>
);
