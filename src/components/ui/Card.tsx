import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}
interface CardHeaderProps { children: React.ReactNode; className?: string; }
interface CardTitleProps  { children: React.ReactNode; as?: 'h2' | 'h3' | 'h4'; className?: string; }
interface CardBodyProps   { children: React.ReactNode; className?: string; }

export function Card({ children, className = '', hover = false, onClick }: CardProps) {
  const interactive = hover || !!onClick;
  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.(); } : undefined}
      className={[
        'bg-surface rounded-card shadow-card border border-border/40',
        interactive ? 'cursor-pointer hover:shadow-card-hover press-scale transition-shadow' : '',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }: CardHeaderProps) {
  return (
    <div className={`px-5 pt-5 pb-0 flex items-center justify-between ${className}`}>
      {children}
    </div>
  );
}

export function CardTitle({ children, as: Tag = 'h3', className = '' }: CardTitleProps) {
  return (
    <Tag className={`text-sm font-bold text-text-base tracking-tight ${className}`}>
      {children}
    </Tag>
  );
}

export function CardBody({ children, className = '' }: CardBodyProps) {
  return <div className={`px-5 py-4 ${className}`}>{children}</div>;
}
