import type { CSSProperties } from 'react';

type SkeletonVariant = 'block' | 'line';

export interface SkeletonProps {
  variant?: SkeletonVariant;
  width?: string | number;
  height?: string | number;
  radius?: string | number;
  className?: string;
  style?: CSSProperties;
}

export function Skeleton({ variant = 'line', width, height, radius, className, style }: SkeletonProps) {
  const base = variant === 'block' ? 'skeleton skeleton-block' : 'skeleton skeleton-line';
  return (
    <span
      aria-hidden="true"
      className={className ? `${base} ${className}` : base}
      style={{
        width,
        height: height ?? (variant === 'line' ? '0.85em' : undefined),
        borderRadius: radius,
        ...style,
      }}
    />
  );
}
