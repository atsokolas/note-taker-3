import React from 'react';

const SkeletonBlock = ({ width = '100%', height = 12, className = '' }) => (
  <div className={`skeleton skeleton-block ${className}`.trim()} style={{ width, height }} aria-hidden="true" />
);

export default SkeletonBlock;
