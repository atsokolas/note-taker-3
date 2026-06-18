import React from 'react';

export const EditorialSideRail = ({ className = '', children }) => (
  <div className={`editorial-side-rail ${className}`.trim()}>
    {children}
  </div>
);

export const EditorialSideRailCollapsible = ({
  title,
  subtitle = '',
  children,
  className = '',
  defaultOpen = false,
  testId
}) => (
  <details
    className={`editorial-side-rail__collapsible editorial-side-rail__section ${className}`.trim()}
    open={defaultOpen || undefined}
    data-testid={testId}
  >
    <summary>
      <span>{title}</span>
      {subtitle ? <small>{subtitle}</small> : null}
    </summary>
    {children}
  </details>
);

export default EditorialSideRail;
