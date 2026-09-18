import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { updateHighlight } from '../../api/highlights';

// A thought remains the existing highlight's note. The host only places its
// editor beside the passage; it introduces no second annotation store.
export default function PassageThought({
  articleId,
  highlight,
  contentRef,
  contentHtml,
  onSaved,
  onClose
}) {
  const [host, setHost] = useState(null);
  const [note, setNote] = useState(highlight.note || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const field = useRef(null);
  const previousFocus = useRef(document.activeElement);
  useLayoutEffect(() => {
    const root = contentRef.current;
    const mark = [
      ...(root?.querySelectorAll('[data-highlight-id]') || [])
    ].find((node) => node.dataset.highlightId === `highlight-${highlight._id}`);
    if (!mark) {
      setHost(null);
      return undefined;
    }
    const node = document.createElement('aside');
    node.dataset.readerControl = '';
    node.className = 'article-passage-thought';
    (mark.closest('p, li, blockquote, h2, h3') || mark).after(node);
    setHost(node);
    return () => node.remove();
  }, [contentRef, contentHtml, highlight._id]);
  useEffect(() => {
    field.current?.focus({ preventScroll: true });
    field.current?.closest('.article-passage-thought')?.scrollIntoView?.({
      block: 'nearest',
      behavior: 'smooth'
    });
  }, [host]);
  const close = () => {
    onClose();
    previousFocus.current?.focus?.({ preventScroll: true });
  };
  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const saved = await updateHighlight({
        articleId,
        highlightId: highlight._id,
        payload: { note }
      });
      onSaved?.(highlight._id, { ...highlight, ...saved, note });
      close();
    } catch (_) {
      setError('Your thought did not save. It is still here; please retry.');
    } finally {
      setSaving(false);
    }
  };
  const editor = (
    <form
      onSubmit={save}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          close();
        }
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter')
          save(event);
      }}
    >
      <label>
        Your thought
        <textarea
          ref={field}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="What does this passage leave you thinking?"
          maxLength={10000}
          rows={3}
        />
      </label>
      {!host ? <blockquote>{highlight.text}</blockquote> : null}
      <div>
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Keep thought'}
        </button>
        <button type="button" onClick={close} disabled={saving}>
          Close
        </button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
  return host ? (
    createPortal(editor, host)
  ) : (
    <aside className="article-passage-thought" data-reader-control>
      {editor}
    </aside>
  );
}
