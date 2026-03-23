import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({ children, className = '', hover = false, onClick }) => (
  <div
    className={`bg-surface border border-border rounded-card shadow-card ${hover ? 'transition-shadow duration-150 hover:shadow-card-hover cursor-pointer' : ''} ${className}`}
    role={hover ? 'button' : undefined}
    tabIndex={hover ? 0 : undefined}
    onClick={onClick}
    onKeyDown={hover && onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
  >
    {children}
  </div>
);

interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export const CardHeader: React.FC<CardHeaderProps> = ({ children, className = '' }) => (
  <div className={`px-4 py-3 border-b border-border flex items-center justify-between ${className}`}>
    {children}
  </div>
);

export const CardTitle: React.FC<{ children: React.ReactNode; level?: 'h2' | 'h3' | 'h4' }> = ({ children, level = 'h3' }) => {
  const Tag = level;
  return <Tag className="font-heading font-semibold text-sm text-text-base">{children}</Tag>;
};

export const CardBody: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={className}>{children}</div>
);
