import React from 'react';

const ProtocolWorkbenchCanvas = ({
  hero = null,
  main = null,
  aside = null,
  timeline = null,
  className = ''
}) => {
  const hasAside = Boolean(aside);

  return (
    <div className={`section-stack think-protocol-canvas ${hasAside ? 'has-aside' : 'has-no-aside'} ${className}`.trim()}>
      {hero}
      <div className="think-protocol-canvas__body">
        <div className="think-protocol-canvas__main">
          {main}
        </div>
        {hasAside && (
          <div className="think-protocol-canvas__aside">
            {aside}
          </div>
        )}
      </div>
      {timeline}
    </div>
  );
};

export default ProtocolWorkbenchCanvas;
