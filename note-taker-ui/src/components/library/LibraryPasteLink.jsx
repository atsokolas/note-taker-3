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

const WHERE = [
  ['later', 'To read later'],
  ['stream', 'Already read']
];
const PLACE = { later: 'on your nightstand', stream: 'in your Library', setAside: 'on your desk' };

/**
 * The nightstand: paste a link you mean to come back to, and it waits there;
 * one you have already read goes straight into the Library. Either way it can
 * be filed as it lands. The choices are set before the paste, so saving stays
 * one step: paste, and it is put away.
 */
export default function LibraryPasteLink({ folders = [], folderId = '', onSaved, onOpen, onShowNightstand }) {
  const [value, setValue] = useState('');
  const [where, setWhere] = useState('later');
  const [folder, setFolder] = useState(folderId);
  const [state, setState] = useState({ phase: 'idle' });

  const save = async (raw) => {
    const url = linkFrom(raw);
    if (!url) {
      setState({ phase: 'problem', line: 'That does not look like a link.' });
      return;
    }
    setState({ phase: 'saving' });
    try {
      const { article, existing } = await importPastedUrl({ url, placement: where, folderId: folder });
      setValue('');
      setState({ phase: existing ? 'existing' : 'saved', article });
      onSaved?.(article);
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
  const place = [PLACE[article?.placement] || '', article?.folder?.name ? `in ${article.folder.name}` : '']
    .filter(Boolean).join(', ');
  const nightstand = article?.placement === 'later' && onShowNightstand ? (
    <> <button type="button" className="library-paste-link__more" onClick={onShowNightstand}>See the nightstand</button></>
  ) : null;
  const sorted = [...folders].sort((a, b) => String(a.name).localeCompare(String(b.name)));

  return (
    <form
      className="library-paste-link"
      noValidate
      onSubmit={(event) => { event.preventDefault(); save(value); }}
    >
      <label className="library-paste-link__field">
        <input
          aria-label="Paste a link to save"
          type="url"
          inputMode="url"
          value={value}
          placeholder="Paste a link you found"
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
      <div className="library-paste-link__choices">
        <div className="library-paste-link__where" role="radiogroup" aria-label="Where it goes">
          {WHERE.map(([key, label]) => (
            <label key={key}>
              <input type="radio" name="library-paste-where" value={key} checked={where === key} onChange={() => setWhere(key)} />
              {label}
            </label>
          ))}
        </div>
        {sorted.length ? (
          <label className="library-paste-link__folder">
            <span>File in</span>
            <select value={folder} onChange={(event) => setFolder(event.target.value)}>
              <option value="">No folder</option>
              {sorted.map(item => <option key={item._id} value={item._id}>{item.name}</option>)}
            </select>
          </label>
        ) : null}
      </div>
      <p className="library-paste-link__receipt" role="status" aria-live="polite">
        {phase === 'saving' ? 'Reading the page…' : null}
        {phase === 'saved' ? <>{place.replace(/^./, c => c.toUpperCase())}: {title}{nightstand}</> : null}
        {phase === 'existing' ? <>Already yours{since ? ` since ${since}` : ''}{place ? `, ${place}` : ''}: {title}{nightstand}</> : null}
        {phase === 'problem' ? line : null}
      </p>
    </form>
  );
}
