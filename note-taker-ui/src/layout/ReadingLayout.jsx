import React, { useState } from 'react';

const RIGHT_PANEL_COLLAPSED_KEY = 'ui.rightPanelCollapsed';

const getStoredCollapsed = () => {
  if (typeof window === 'undefined') return false;
  const stored = window.localStorage.getItem(RIGHT_PANEL_COLLAPSED_KEY);
  if (stored === null) return false;
  return stored === 'true';
};

const ReadingLayout = ({
  children,
  rightPanel,
  rightTitle = 'Context',
  rightPanelToggleLabel = 'Context',
  className = ''
}) => {
  const hasRightPanel = Boolean(rightPanel);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(getStoredCollapsed);

  const isCollapsed = !hasRightPanel || rightPanelCollapsed;

  const togglePanel = () => {
    const nextCollapsed = !rightPanelCollapsed;
    setRightPanelCollapsed(nextCollapsed);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(RIGHT_PANEL_COLLAPSED_KEY, String(nextCollapsed));
    }
  };

  return (
    <div
      className={`reading-layout ${isCollapsed ? 'is-collapsed' : ''} ${className}`.trim()}
      data-testid="reading-layout"
    >
      <section className="reading-layout__main-region">
        {hasRightPanel && (
          <div className="reading-layout__toolbar">
            <button
              type="button"
              className="topbar__button"
              onClick={togglePanel}
              aria-expanded={!isCollapsed}
              aria-controls="reading-layout-context-panel"
              data-testid="reading-layout-toggle"
            >
              {isCollapsed ? `Show ${rightPanelToggleLabel}` : `Hide ${rightPanelToggleLabel}`}
            </button>
          </div>
        )}
        <div className="reading-layout__main-content" data-testid="reading-main-region">
          {children}
        </div>
      </section>

      {hasRightPanel && (
        <aside
          id="reading-layout-context-panel"
          className={`reading-layout__context-region ${isCollapsed ? 'is-collapsed' : ''}`}
          aria-hidden={isCollapsed}
          data-testid="reading-context-region"
        >
          {!isCollapsed && (
            <>
              <div className="reading-layout__context-header">
                <span>{rightTitle}</span>
                <button type="button" className="topbar__button" onClick={togglePanel}>
                  Collapse
                </button>
              </div>
              <div className="reading-layout__context-content">
                {rightPanel}
              </div>
            </>
          )}
        </aside>
      )}
    </div>
  );
};

export default ReadingLayout;
