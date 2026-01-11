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
  actions
}) => {
  const location = useLocation();
  const hasRight = Boolean(right);
  const storageKey = useMemo(
    () => `workspace-right-open:${location.pathname}`,
    [location.pathname]
  );

  const [rightOpen, setRightOpen] = useState(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored === null) return defaultRightOpen;
    return stored === 'true';
  });

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored === null) {
      setRightOpen(defaultRightOpen);
    } else {
      setRightOpen(stored === 'true');
    }
  }, [storageKey, defaultRightOpen]);

  const toggleRight = () => {
    setRightOpen(prev => {
      const next = !prev;
      localStorage.setItem(storageKey, String(next));
      if (onToggleRight) onToggleRight(next);
      return next;
    });
  };

  return (
    <div className={`workspace-shell ${rightOpen ? '' : 'workspace-shell--right-collapsed'}`}>
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
                {rightOpen ? 'Hide panel' : 'Show panel'}
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
          className={`workspace-panel workspace-panel-right ${rightOpen ? '' : 'is-collapsed'}`}
          aria-hidden={!rightOpen}
        >
          {rightOpen && (
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
