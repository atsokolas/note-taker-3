import React, { useEffect, useRef, useState } from 'react';
import {
  addPoint, dropBranch, hasChildren, moveBranch, removePoint, shiftBranch, toggleFold, visiblePoints, writeOut, writtenHtml
} from './outline';

export const OUTLINE_DRAG = 'application/x-noeis-outline-point';

/* A long point wraps onto a second line instead of hiding its end. */
const fit = (field) => {
  field.style.height = 'auto';
  field.style.height = `${field.scrollHeight}px`;
};
/* ↑ and ↓ leave a point only from its first or last line. */
const atEdge = (field, step) => {
  const line = parseFloat(window.getComputedStyle(field).lineHeight) || 20;
  if (field.scrollHeight < line * 1.5) return true;
  return step === 'up' ? field.selectionStart === 0 : field.selectionEnd === field.value.length;
};

/* The outline beside the draft: points to push around before and while you
   write. Enter, Tab and Shift-Tab, Alt+↑/↓ to move a point with what hangs
   from it, ⌘↑/⌘↓ to fold. Drag a point by its mark to move it here, or onto
   the page to write it out; ⌘↵ writes it out where you last were. */
const NotebookOutline = ({ points = [], written = new Set(), createId, onChange, onWriteOut, onGoTo }) => {
  const inputs = useRef(new Map());
  const dragging = useRef(null);
  const [focusId, setFocusId] = useState(null);
  const [dropAt, setDropAt] = useState(null);
  const shown = visiblePoints(points);

  useEffect(() => {
    if (!focusId) return;
    inputs.current.get(focusId)?.focus();
    setFocusId(null);
  }, [focusId, points]);

  const change = (next, focus) => {
    if (next !== points) onChange(next);
    if (focus) setFocusId(focus);
  };
  const newPoint = () => ({ id: createId(), text: '', depth: 0, folded: false, blockId: '' });
  const add = (index) => {
    const result = addPoint(points, index, newPoint());
    change(result.points, result.points[result.index].id);
  };
  const write = (index) => {
    const result = writeOut(points, index, createId);
    if (result && onWriteOut(result.nodes)) onChange(result.points);
  };

  const keyDown = (event, index, at) => {
    if (event.nativeEvent?.isComposing) return;
    const point = points[index];
    const primary = event.metaKey || event.ctrlKey;
    const step = event.key === 'ArrowUp' ? 'up' : event.key === 'ArrowDown' ? 'down' : null;
    const handled = (() => {
      if (event.key === 'Enter' && primary) { write(index); return true; }
      if (event.key === 'Enter') { add(index); return true; }
      if (event.key === 'Tab') { change(shiftBranch(points, index, event.shiftKey ? -1 : 1), point.id); return true; }
      if (step && event.altKey) { change(moveBranch(points, index, step), point.id); return true; }
      if (step && primary) {
        if (hasChildren(points, index) && Boolean(point.folded) === (step === 'down')) change(toggleFold(points, index), point.id);
        return true;
      }
      if (step && atEdge(event.currentTarget, step)) { const next = shown[at + (step === 'up' ? -1 : 1)]; if (next) setFocusId(next.point.id); return Boolean(next); }
      if (event.key === 'Backspace' && !point.text && points.length > 1 && !hasChildren(points, index)) {
        change(removePoint(points, index), shown[Math.max(0, at - 1)].point.id);
        return true;
      }
      return false;
    })();
    if (handled) event.preventDefault();
  };

  const startDrag = (event, index) => {
    const result = writeOut(points, index, createId);
    dragging.current = { index, result, inRail: false };
    event.dataTransfer.effectAllowed = 'copyMove';
    event.dataTransfer.setData(OUTLINE_DRAG, points[index].id);
    if (result) {
      event.dataTransfer.setData('text/html', writtenHtml(result.nodes));
      event.dataTransfer.setData('text/plain', points[index].text);
    }
  };
  /* Landing on the page writes the point out; the outline only remembers where it went. */
  const endDrag = (event) => {
    const drag = dragging.current;
    dragging.current = null;
    setDropAt(null);
    if (drag && !drag.inRail && drag.result && event.dataTransfer.dropEffect !== 'none') onChange(drag.result.points);
  };
  const over = (event, before) => {
    if (!dragging.current) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropAt(before);
  };
  const drop = (event, before) => {
    if (!dragging.current) return;
    event.preventDefault();
    dragging.current.inRail = true;
    change(dropBranch(points, dragging.current.index, before));
    setDropAt(null);
  };

  return (
    <section className="notebook-outline" aria-labelledby="notebook-outline-title">
      <header>
        <h2 id="notebook-outline-title">Outline</h2>
        <p>Push the points around here. Drag one onto the page, or press ⌘↵, and it goes into the draft as a heading, with what hangs under it in pencil.</p>
      </header>
      <ol className="notebook-outline__points" onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDropAt(null); }}>
        {shown.map(({ point, index }, at) => {
          const inDraft = Boolean(point.blockId) && written.has(point.blockId);
          const children = hasChildren(points, index);
          return (
            <li
              key={point.id}
              style={{ '--depth': point.depth }}
              className={[inDraft ? 'is-written' : '', point.folded ? 'is-folded' : '', dropAt === index ? 'is-drop-before' : ''].filter(Boolean).join(' ')}
              onDragOver={(event) => over(event, index)}
              onDrop={(event) => drop(event, index)}
            >
              <button
                type="button"
                className="notebook-outline__mark"
                draggable
                onDragStart={(event) => startDrag(event, index)}
                onDragEnd={endDrag}
                onClick={() => change(toggleFold(points, index), point.id)}
                aria-label={children ? (point.folded ? `Unfold ${point.text || 'point'}` : `Fold ${point.text || 'point'}`) : `Drag ${point.text || 'point'}`}
                aria-expanded={children ? !point.folded : undefined}
              />
              <textarea
                ref={(node) => { if (node) { inputs.current.set(point.id, node); fit(node); } else inputs.current.delete(point.id); }}
                rows={1}
                value={point.text}
                maxLength={500}
                aria-label="Point"
                placeholder={points.length === 1 ? 'The first point' : ''}
                onChange={(event) => { fit(event.target); onChange(points.map(item => (item.id === point.id ? { ...item, text: event.target.value.replace(/\n/g, ' ') } : item))); }}
                onKeyDown={(event) => keyDown(event, index, at)}
              />
              <span className="notebook-outline__actions">
                {inDraft
                  ? <button type="button" onClick={() => onGoTo(point.blockId)}>Go to it</button>
                  : point.text.trim() ? <button type="button" onClick={() => write(index)}>Write it out</button> : null}
              </span>
            </li>
          );
        })}
        <li
          className={`notebook-outline__end${dropAt === points.length ? ' is-drop-before' : ''}`}
          onDragOver={(event) => over(event, points.length)}
          onDrop={(event) => drop(event, points.length)}
        >
          <button type="button" onClick={() => { const point = newPoint(); change([...points, point], point.id); }}>{points.length ? 'Add a point' : 'Start an outline'}</button>
        </li>
      </ol>
    </section>
  );
};

export default NotebookOutline;
