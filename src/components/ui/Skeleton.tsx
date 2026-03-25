import React from 'react';

interface SkeletonProps {
  className?: string;
  rounded?: boolean;
}

export function Skeleton({ className = '', rounded = false }: SkeletonProps) {
  return (
    <div
      className={['skeleton', rounded ? 'rounded-full' : 'rounded-btn-sm', className].join(' ')}
      aria-hidden="true"
    />
  );
}
