import React, { useEffect, useMemo, useState } from 'react';

const normalizeLines = (lines) => (
  Array.isArray(lines)
    ? lines.map(line => String(line || '').trim()).filter(Boolean)
    : []
);

const prefersReducedMotion = () => (
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

const AgentTicker = ({
  label = 'System trace',
  lines = [],
  state = 'idle',
  className = '',
  characterDelayMs = 22
}) => {
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [typedLength, setTypedLength] = useState(0);
  const normalizedLines = useMemo(() => normalizeLines(lines), [lines]);
  const visibleLines = normalizedLines.length > 0
    ? normalizedLines.slice(0, 3)
    : ['idle'];
  const historyLines = visibleLines.slice(0, -1);
  const historyCount = historyLines.length;
  const activeLine = visibleLines[visibleLines.length - 1] || '';
  const reducedMotion = prefersReducedMotion();
  const renderedActiveLine = reducedMotion
    ? activeLine
    : activeLine.slice(0, Math.min(typedLength, activeLine.length));

  useEffect(() => {
    setTypedLength(reducedMotion ? activeLine.length : 0);
    if (reducedMotion || !activeLine) return undefined;
    const delay = Number(characterDelayMs);
    const intervalMs = Number.isFinite(delay) && delay > 0 ? delay : 22;
    const intervalId = window.setInterval(() => {
      setTypedLength(current => {
        if (current >= activeLine.length) {
          window.clearInterval(intervalId);
          return current;
        }
        return current + 1;
      });
    }, intervalMs);
    return () => window.clearInterval(intervalId);
  }, [activeLine, characterDelayMs, reducedMotion]);

  return (
    <div
      className={`agent-ticker agent-ticker--${state} ${historyExpanded ? 'is-history-expanded' : ''} ${className}`.trim()}
      aria-label={label}
      data-state={state}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      data-history-count={historyCount}
    >
      <button
        type="button"
        className="agent-ticker__history"
        aria-label={historyExpanded ? 'Collapse trace history' : `Expand ${historyCount} trace history ${historyCount === 1 ? 'line' : 'lines'}`}
        aria-expanded={historyExpanded}
        disabled={historyCount === 0}
        onClick={() => setHistoryExpanded(current => !current)}
      />
      {historyExpanded && historyLines.length > 0 ? (
        <ol className="agent-ticker__lines agent-ticker__lines--history" aria-label="Trace history">
          {historyLines.map((line, index) => (
            <li key={`${line}-${index}`} className="agent-ticker__line">
              <span className="agent-ticker__prompt" aria-hidden="true">&gt;</span>
              <span>{line}</span>
            </li>
          ))}
        </ol>
      ) : null}
      <ol className="agent-ticker__lines">
        <li className="agent-ticker__line agent-ticker__line--active">
          <span className="agent-ticker__prompt" aria-hidden="true">&gt;</span>
          <span>{renderedActiveLine || (activeLine ? '' : 'idle')}</span>
          {!reducedMotion && typedLength < activeLine.length ? (
            <span className="agent-ticker__cursor" data-testid="agent-ticker-cursor" aria-hidden="true" />
          ) : null}
        </li>
      </ol>
    </div>
  );
};

export default React.memo(AgentTicker);
