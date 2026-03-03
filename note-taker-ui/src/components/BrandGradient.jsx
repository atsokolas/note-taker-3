import React from 'react';

const BrandGradient = ({ variant = 'header', enabled = true, className = '' }) => {
  if (!enabled) return null;
  return (
    <div
      aria-hidden="true"
      className={`brand-gradient brand-gradient--${variant} ${className}`.trim()}
    />
  );
};

export default React.memo(BrandGradient);
