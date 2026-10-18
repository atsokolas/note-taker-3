import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/* The shapes footnote references take in saved articles: a Pandoc or
   Markdown `#fn1`, the DPUB role, a Wikipedia `#cite_note`, a `#footnote-2`,
   or any in-page link set in a superscript. */
const FOOTNOTE_REF = [
  'a[role="doc-noteref"]',
  'a[href^="#fn"]',
  'a[href^="#footnote"]',
  'a[href^="#cite_note"]',
  'sup a[href^="#"]'
].join(', ');
const BACKLINK = /[↩︎⤴↑^]+\s*$/u;

const escapeId = (id) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/["\\]/g, '\\$&'));

/** The footnote a reference points at, as text, or null if it is not here. */
export const footnoteFor = (root, link) => {
  if (!root || !link?.matches?.(FOOTNOTE_REF)) return null;
  let id = '';
  try {
    id = decodeURIComponent(String(link.getAttribute('href') || '').slice(1));
  } catch (_error) {
    return null;
  }
  if (!id) return null;
  const target = root.querySelector(`[id="${escapeId(id)}"], a[name="${escapeId(id)}"]`);
  const note = target?.matches('a[name]') ? target.closest('li, p, div') : target;
  if (!note || note.contains(link)) return null;
  const copy = note.cloneNode(true);
  copy.querySelectorAll('[role="doc-backlink"], a[href^="#fnref"], a[href^="#cite_ref"], .mw-cite-backlink').forEach((node) => node.remove());
  const text = copy.textContent.replace(/\s+/g, ' ').replace(BACKLINK, '').trim();
  return text ? { id, text } : null;
};

/* Footnotes open in place: a small note beside the reference instead of a
   jump to the bottom of the page. Esc or a click elsewhere closes it, and
   focus goes back to the reference. */
export default function FootnotePeek({ contentRef }) {
  const [open, setOpen] = useState(null);
  const noteRef = useRef(null);
  const current = useRef(null);
  const show = useCallback((next) => {
    current.current?.link.removeAttribute('aria-expanded');
    if (next) {
      next.link.setAttribute('aria-expanded', 'true');
      next.link.setAttribute('aria-controls', 'footnote-peek');
    }
    current.current = next;
    setOpen(next);
  }, []);
  const close = useCallback((restoreFocus = true) => {
    const link = current.current?.link;
    show(null);
    if (restoreFocus) link?.focus?.();
  }, [show]);

  useEffect(() => {
    const root = contentRef?.current;
    if (!root) return undefined;
    const click = (event) => {
      const link = event.target?.closest?.('a');
      const note = link && root.contains(link) ? footnoteFor(root, link) : null;
      if (!note) return;
      event.preventDefault();
      if (current.current?.link === link) return show(null);
      const rect = link.getBoundingClientRect();
      show({ link, text: note.text, top: rect.bottom + window.scrollY + 6, left: rect.left + window.scrollX });
    };
    root.addEventListener('click', click);
    return () => {
      root.removeEventListener('click', click);
      show(null);
    };
  }, [contentRef, show]);

  useEffect(() => {
    if (!open) return undefined;
    const key = (event) => { if (event.key === 'Escape') close(); };
    const away = (event) => {
      if (noteRef.current?.contains(event.target) || open.link.contains(event.target)) return;
      close(false);
    };
    document.addEventListener('keydown', key);
    document.addEventListener('pointerdown', away);
    return () => {
      document.removeEventListener('keydown', key);
      document.removeEventListener('pointerdown', away);
    };
  }, [open, close]);

  /* Keep the note on the page at phone widths. */
  useLayoutEffect(() => {
    const node = noteRef.current;
    if (!node || !open) return;
    const width = node.offsetWidth || 0;
    const max = window.scrollX + document.documentElement.clientWidth - width - 16;
    node.style.left = `${Math.max(window.scrollX + 16, Math.min(open.left, max))}px`;
    node.focus?.({ preventScroll: true });
  }, [open]);

  if (!open) return null;
  return (
    <aside
      ref={noteRef}
      id="footnote-peek"
      className="footnote-peek"
      role="note"
      aria-label="Footnote"
      tabIndex={-1}
      style={{ top: open.top, left: open.left }}
      data-reader-control
    >
      {open.text}
    </aside>
  );
}
