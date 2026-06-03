import React, { useEffect, useMemo, useState } from 'react';

const TRACE_MEMORY_KEY = 'noeis.agentTraceMemory.v1';
const TRACE_MEMORY_LIMIT = 8;

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

const getTraceStorage = () => {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage || null;
  } catch {
    return null;
  }
};

const readTraceMemory = () => {
  const storage = getTraceStorage();
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(TRACE_MEMORY_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed
          .map(entry => ({
            line: String(entry?.line || '').trim(),
            surface: String(entry?.surface || '').trim(),
            label: String(entry?.label || '').trim(),
            state: String(entry?.state || '').trim(),
            createdAt: Number(entry?.createdAt) || 0
          }))
          .filter(entry => entry.line)
      : [];
  } catch {
    return [];
  }
};

const writeTraceMemory = (entries) => {
  const storage = getTraceStorage();
  if (!storage) return;
  try {
    storage.setItem(TRACE_MEMORY_KEY, JSON.stringify(entries.slice(-TRACE_MEMORY_LIMIT)));
  } catch {
    // Session storage can be unavailable in hardened browser contexts; local ticker behavior still works.
  }
};

const AgentTicker = ({
  label = 'System trace',
  lines = [],
  state = 'idle',
  className = '',
  characterDelayMs = 22,
  sharedMemory = false,
  surface = ''
}) => {
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [typedLength, setTypedLength] = useState(0);
  const [traceMemory, setTraceMemory] = useState(() => (sharedMemory ? readTraceMemory() : []));
  const normalizedLines = useMemo(() => normalizeLines(lines), [lines]);
  const currentLine = normalizedLines[normalizedLines.length - 1] || '';
  const recentSharedLines = useMemo(() => {
    if (!sharedMemory || !currentLine) return [];
    const seen = new Set([currentLine]);
    return traceMemory
      .slice()
      .reverse()
      .filter(entry => {
        const key = `${entry.surface || entry.label}:${entry.line}`;
        if (seen.has(entry.line) || seen.has(key)) return false;
        seen.add(entry.line);
        seen.add(key);
        return true;
      })
      .slice(0, 2)
      .reverse()
      .map(entry => `${entry.surface || entry.label || 'Earlier'}: ${entry.line}`);
  }, [currentLine, sharedMemory, traceMemory]);
  const visibleLines = normalizedLines.length > 0
    ? [...recentSharedLines, ...normalizedLines].slice(-3)
    : recentSharedLines.length > 0
      ? [...recentSharedLines, 'idle'].slice(-3)
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

  useEffect(() => {
    if (!sharedMemory) return undefined;
    const refresh = () => setTraceMemory(readTraceMemory());
    refresh();
    if (typeof window === 'undefined') return undefined;
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, [sharedMemory]);

  useEffect(() => {
    if (!sharedMemory || !currentLine || currentLine === 'idle') return;
    const source = String(surface || label || 'Workspace').trim();
    const nextEntry = {
      line: currentLine,
      surface: source,
      label,
      state,
      createdAt: Date.now()
    };
    const existing = readTraceMemory();
    const deduped = existing.filter(entry => !(entry.line === nextEntry.line && entry.surface === nextEntry.surface));
    const next = [...deduped, nextEntry].slice(-TRACE_MEMORY_LIMIT);
    writeTraceMemory(next);
    setTraceMemory(next);
  }, [currentLine, label, sharedMemory, state, surface]);

  return (
    <div
      className={`agent-ticker agent-ticker--${state} ${historyExpanded ? 'is-history-expanded' : ''} ${className}`.trim()}
      aria-label={label}
      data-state={state}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      data-history-count={historyCount}
      data-shared-history-count={recentSharedLines.length}
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
