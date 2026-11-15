import React, { useEffect, useRef } from 'react';
import WorkIcon from './WorkIcon';

// Native disclosures keep the tools in the tab order, beside the place they affect.
export default function WorkMenu({ label, icon, children, className = '' }) {
  const menu = useRef(null);
  useEffect(() => {
    const dismiss = event => { if (menu.current && !menu.current.contains(event.target)) menu.current.open = false; };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);
  return <details ref={menu} className={`work-menu ${className}`} onBlur={event => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
  }} onKeyDown={event => {
    if (event.defaultPrevented || event.key !== 'Escape' || !event.currentTarget.open) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.open = false;
    event.currentTarget.querySelector('summary').focus();
  }}>
    <summary aria-label={label}>{icon ? <WorkIcon name={icon} /> : label}{icon ? null : <WorkIcon name="down" />}</summary>
    <div className="work-menu-body">{children}</div>
  </details>;
}
