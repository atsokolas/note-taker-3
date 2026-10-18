import React, { useState } from 'react';
import { importPastedUrl } from '../../api/imports';

/* What a person pastes is rarely a clean URL: a bare domain, a trailing space,
   a link copied with its angle brackets. Anything that reads as a web address
   becomes one; anything else is not a link. */
export const linkFrom = (value = '') => {
  const text = String(value || '').trim().replace(/^<|>$/g, '');
  if (!text || /\s/.test(text)) return '';
  const candidate = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(candidate);
    return /^https?:$/.test(url.protocol) && url.hostname.includes('.') ? url.toString() : '';
  } catch (_) {
    return '';
  }
};

const savedOn = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
};

/**
 * The quickest way into the Library: paste what you are reading. The server
 * reads the page and files it; a link you already hold opens the copy you
 * have instead of making a second one.
 */
export default function LibraryPasteLink({ onSaved, onOpen }) {
  const [value, setValue] = useState('');
  const [state, setState] = useState({ phase: 'idle' });

  const save = async (raw) => {
    const url = linkFrom(raw);
    if (!url) {
      setState({ phase: 'problem', line: 'That does not look like a link.' });
      return;
    }
    setState({ phase: 'saving' });
    try {
      const { article, existing } = await importPastedUrl({ url });
      setValue('');
      setState({ phase: existing ? 'existing' : 'saved', article });
      if (!existing) onSaved?.(article);
    } catch (error) {
      const status = error?.response?.status;
      setState({
        phase: 'problem',
        line: status === 422 || status === 400
          ? 'Noeis could not read that page. Some sites only show their text to a signed-in browser.'
          : 'That did not save. Try it again.'
      });
    }
  };

  const { phase, article, line } = state;
  const title = article ? (
    <button type="button" className="library-paste-link__title" onClick={() => onOpen?.(article._id)}>
      {article.title || 'Untitled'}
    </button>
  ) : null;
  const since = phase === 'existing' ? savedOn(article?.createdAt) : '';

  return (
    <form
      className="library-paste-link"
      noValidate
      onSubmit={(event) => { event.preventDefault(); save(value); }}
    >
      <label className="library-paste-link__field">
        <span className="sr-only">Paste a link to what you are reading</span>
        <input
          aria-label="Paste a link to what you are reading"
          type="url"
          inputMode="url"
          value={value}
          placeholder="Paste a link to what you are reading"
          disabled={phase === 'saving'}
          onChange={(event) => {
            setValue(event.target.value);
            if (phase === 'problem') setState({ phase: 'idle' });
          }}
          onPaste={(event) => {
            const pasted = event.clipboardData?.getData('text') || '';
            if (value.trim() || !linkFrom(pasted)) return;
            event.preventDefault();
            setValue(pasted.trim());
            save(pasted);
          }}
        />
        <kbd aria-hidden="true">↵</kbd>
      </label>
      <p className="library-paste-link__receipt" role="status" aria-live="polite">
        {phase === 'saving' ? 'Reading the page…' : null}
        {phase === 'saved' ? <>Saved. {title} is at the top of your Library.</> : null}
        {phase === 'existing' ? <>Already yours{since ? ` since ${since}` : ''}: {title}</> : null}
        {phase === 'problem' ? line : null}
      </p>
    </form>
  );
}
