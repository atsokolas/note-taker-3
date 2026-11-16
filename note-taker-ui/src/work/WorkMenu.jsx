import React, { useEffect, useRef } from 'react';
import WorkIcon from './WorkIcon';
import './work-actions.css';

// Disclosures keep forms in their normal tab order; action lists add arrow-key navigation.
export default function WorkMenu({ label, icon, children, className = '', actions = false }) {
  const menu = useRef(null);
  const body = useRef(null);
  const close = () => {
    if (!menu.current?.open) return;
    const restoreFocus = body.current?.contains(document.activeElement);
    menu.current.open = false;
    if (restoreFocus) menu.current.querySelector('summary').focus({ preventScroll: true });
  };
  const position = () => {
    if (!actions || !menu.current?.open || !body.current) return;
    const anchor = menu.current.querySelector('summary').getBoundingClientRect();
    const panel = body.current;
    const gap = 8;
    const width = Math.min(220, window.innerWidth - gap * 2);
    panel.style.width = `${width}px`;
    panel.style.left = `${Math.max(gap, Math.min(anchor.right - width, window.innerWidth - width - gap))}px`;
    panel.style.top = `${Math.max(gap, Math.min(anchor.bottom + gap, window.innerHeight - panel.offsetHeight - gap))}px`;
  };
  useEffect(() => {
    const dismiss = event => { if (menu.current && !menu.current.contains(event.target)) close(); };
    document.addEventListener('pointerdown', dismiss);
    window.addEventListener('resize', close);
    const scroll = event => { if (actions && !body.current?.contains(event.target)) close(); };
    document.addEventListener('scroll', scroll, true);
    return () => { document.removeEventListener('pointerdown', dismiss); window.removeEventListener('resize', close); document.removeEventListener('scroll', scroll, true); };
  }, [actions]);
  return <details ref={menu} className={`work-menu ${actions ? 'work-action-menu' : ''} ${className}`} onToggle={position} onBlur={event => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) close();
  }} onKeyDown={event => {
    if (event.defaultPrevented) return;
    const trigger = event.currentTarget.querySelector('summary');
    if (event.key === 'Escape' && event.currentTarget.open) {
      event.preventDefault(); event.stopPropagation(); close(); trigger.focus();
    } else if (actions && !event.target.closest('input, select, textarea, [contenteditable="true"]') && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation(); event.currentTarget.open = true; position();
      const buttons = [...body.current.querySelectorAll('button:not(:disabled)')];
      const index = buttons.indexOf(document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' || (event.key === 'ArrowUp' && index < 0) ? buttons.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }
  }}>
    <summary aria-label={label} onClick={actions ? event => {
      event.preventDefault();
      if (menu.current.open) close();
      else { menu.current.open = true; position(); }
    } : undefined}>{icon ? <WorkIcon name={icon} /> : label}{icon ? null : <WorkIcon name="down" />}</summary>
    <div ref={body} className="work-menu-body" onClickCapture={actions ? event => {
      if (event.target.closest('button:not(:disabled)')) { close(); menu.current.querySelector('summary').focus(); }
    } : undefined}>{children}</div>
  </details>;
}
