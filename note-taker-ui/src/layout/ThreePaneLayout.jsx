import React, { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import LeftRail from './LeftRail';
import MainSurface from './MainSurface';
import RightContextPanel from './RightContextPanel';

const ThreePaneLayout = ({
  left,
  main,
  right,
  rightTitle = 'Context',
  leftOpen,
  rightOpen,
  defaultLeftOpen = false,
  defaultRightOpen = false,
  onToggleLeft,
  onToggleRight,
  mainHeader,
  mainActions,
  rightToggleLabel = 'Context'
}) => {
  const location = useLocation();
  const hasLeft = Boolean(left);
  const hasRight = Boolean(right);
  const leftControlled = typeof leftOpen === 'boolean';
  const rightControlled = typeof rightOpen === 'boolean';

  const leftStorageKey = useMemo(
    () => `three-pane-left-open:${location.pathname}`,
    [location.pathname]
  );
  const rightStorageKey = useMemo(
    () => `three-pane-right-open:${location.pathname}`,
    [location.pathname]
  );

  const [internalLeftOpen, setInternalLeftOpen] = useState(() => {
    const stored = localStorage.getItem(leftStorageKey);
    if (stored === null) return defaultLeftOpen;
    return stored === 'true';
  });
  const [internalRightOpen, setInternalRightOpen] = useState(() => {
    const stored = localStorage.getItem(rightStorageKey);
    if (stored === null) return defaultRightOpen;
    return stored === 'true';
  });

  const effectiveLeftOpen = leftControlled ? leftOpen : internalLeftOpen;
  const effectiveRightOpen = rightControlled ? rightOpen : internalRightOpen;

  const handleToggleLeft = (next) => {
    if (!leftControlled) setInternalLeftOpen(next);
    localStorage.setItem(leftStorageKey, String(next));
    onToggleLeft?.(next);
  };

  const handleToggleRight = (next) => {
    if (!rightControlled) setInternalRightOpen(next);
    localStorage.setItem(rightStorageKey, String(next));
    onToggleRight?.(next);
  };

  return (
    <div
      className={`three-pane ${(!hasLeft || !effectiveLeftOpen) ? 'three-pane--left-collapsed' : ''} ${(!hasRight || !effectiveRightOpen) ? 'three-pane--right-collapsed' : ''}`}
    >
      <LeftRail collapsed={!hasLeft || !effectiveLeftOpen}>
        {left}
      </LeftRail>
      <MainSurface
        header={mainHeader}
        actions={mainActions || (hasRight ? (
          <button
            type="button"
            className="topbar__button"
            onClick={() => handleToggleRight(!effectiveRightOpen)}
          >
            {rightToggleLabel}
          </button>
        ) : null)}
      >
        {main}
      </MainSurface>
      <RightContextPanel
        title={rightTitle}
        open={hasRight && effectiveRightOpen}
        onToggle={() => handleToggleRight(false)}
      >
        {right}
      </RightContextPanel>
    </div>
  );
};

export default ThreePaneLayout;
