import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { PageTitle, QuietButton, PanelHeader, SubtleDivider } from '../components/ui';

const WorkspaceShell = ({
  left,
  main,
  right,
  rightTitle = 'Details',
  defaultRightOpen = true,
  onToggleRight,
  title,
  subtitle,
  eyebrow,
  actions,
  rightOpen,
  className
}) => {
  const location = useLocation();
  const hasRight = Boolean(right);
  const isControlled = typeof rightOpen === 'boolean';
  const storageKey = useMemo(
    () => `workspace-right-open:${location.pathname}`,
    [location.pathname]
  );

  const [internalRightOpen, setInternalRightOpen] = useState(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored === null) return defaultRightOpen;
    return stored === 'true';
  });

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored === null) {
      setInternalRightOpen(defaultRightOpen);
    } else {
      setInternalRightOpen(stored === 'true');
    }
  }, [storageKey, defaultRightOpen]);

  useEffect(() => {
    if (!isControlled) return;
    localStorage.setItem(storageKey, String(rightOpen));
  }, [isControlled, rightOpen, storageKey]);

  const effectiveRightOpen = isControlled ? rightOpen : internalRightOpen;

  const toggleRight = () => {
    const next = !effectiveRightOpen;
    localStorage.setItem(storageKey, String(next));
    if (onToggleRight) onToggleRight(next);
    if (!isControlled) {
      setInternalRightOpen(next);
    }
  };

  return (
    <div className={`workspace-shell ${effectiveRightOpen ? '' : 'workspace-shell--right-collapsed'} ${className || ''}`}>
      <aside className="workspace-panel workspace-panel-left">
        {left}
      </aside>
      <section className="workspace-main">
        <div className="workspace-main-header">
          <PageTitle eyebrow={eyebrow} title={title} subtitle={subtitle} />
          <div className="workspace-main-actions">
            {actions}
            {hasRight && (
              <QuietButton onClick={toggleRight}>
                {effectiveRightOpen ? 'Hide panel' : 'Show panel'}
              </QuietButton>
            )}
          </div>
        </div>
        <SubtleDivider />
        <div className="workspace-main-body">
          {main}
        </div>
      </section>
      {hasRight && (
        <aside
          className={`workspace-panel workspace-panel-right ${effectiveRightOpen ? '' : 'is-collapsed'}`}
          aria-hidden={!effectiveRightOpen}
        >
          {effectiveRightOpen && (
            <>
              <PanelHeader
                title={rightTitle}
                action={<QuietButton onClick={toggleRight}>Collapse</QuietButton>}
              />
              <div className="workspace-panel-body">
                {right}
              </div>
            </>
          )}
        </aside>
      )}
    </div>
  );
};

export default WorkspaceShell;
