import React from 'react';

const Skeleton = ({ className = '', style }) => (
  <div className={`skeleton ${className}`.trim()} style={style} />
);

export const SkeletonText = ({ width = '100%' }) => (
  <Skeleton className="skeleton-text" style={{ width }} />
);

export const SkeletonCard = () => (
  <div className="skeleton-card">
    <Skeleton className="skeleton-title" />
    <SkeletonText width="80%" />
    <SkeletonText width="65%" />
    <div className="skeleton-chip-row">
      <Skeleton className="skeleton-chip" />
      <Skeleton className="skeleton-chip" />
      <Skeleton className="skeleton-chip" />
    </div>
  </div>
);

export default Skeleton;
