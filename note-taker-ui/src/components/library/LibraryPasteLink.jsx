import React, { useEffect, useRef, useState } from 'react';
import { importPastedUrl, startBook } from '../../api/imports';
import { setArticlePlacement } from '../../api/articles';

/* What a person pastes is rarely a clean URL: a bare domain, a trailing space,
   a link copied with its angle brackets. Anything that reads as a web address
   becomes one; anything else is not a link. */
export const linkFrom = (value = '') => {
  const text = String(value || '').trim().replace(/^<|>$/g, '');
  if (!text || /\s/.test(text)) return '';
  const candidate = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(candidate);
    // A bare number parses as an IPv4 host, so the dot is asked of what was typed.
    return /^https?:$/.test(url.protocol) && url.hostname.includes('.') && text.includes('.') ? url.toString() : '';
  } catch (_) {
    return '';
  }
};

/* Several links copied from a note or a group chat: every written-out web
   address in it, once each. Words between them are not taken for domains. */
export const linksFrom = (value = '') => {
  const written = String(value || '').match(/<?https?:\/\/[^\s<>"]+/gi) || [];
  const links = [...new Set(written.map(linkFrom).filter(Boolean))];
  return links.length ? links : [linkFrom(value)].filter(Boolean);
};

/* Words that are not a link are the book you are reading: "Middlemarch",
   or "Middlemarch by George Eliot". */
export const bookFrom = (value = '') => {
  const text = String(value || '').trim();
  if (!text || linksFrom(text).length) return null;
  const by = text.toLowerCase().lastIndexOf(' by ');
  return by > 0 ? { title: text.slice(0, by).trim(), author: text.slice(by + 4).trim() } : { title: text, author: '' };
};

const savedOn = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
};

/* Where a link goes, said as the sentence under the field; tapping the
   phrase moves it to the other place. */
const GOES = { later: 'on your nightstand', stream: 'in your Library, already read' };
const PLACE = { later: 'on your nightstand', stream: 'in your Library', setAside: 'on your desk' };
const capital = text => text.replace(/^./, c => c.toUpperCase());

/**
 * The nightstand: paste a link you mean to come back to, and it waits there;
 * one you have already read goes straight into the Library. Either way it can
 * be filed as it lands. Where it goes is one sentence under the field, set
 * before the paste, so saving stays one step: paste, and it is put away.
 * A link handed in from elsewhere (the share sheet, a bookmarklet) saves the
 * same way, as soon as the field is shown.
 */
export default function LibraryPasteLink({ folders = [], folderId = '', link = '', onSaved, onOpen, onShowNightstand, children }) {
  const [value, setValue] = useState('');
  const [where, setWhere] = useState('later');
  const [folder, setFolder] = useState(folderId);
  const [state, setState] = useState({ phase: 'idle' });
  const [why, setWhy] = useState(null);

  const saveOne = url => importPastedUrl({ url, placement: where, folderId: folder });

  const save = async (raw) => {
    const links = linksFrom(raw);
    if (!links.length) return start(bookFrom(raw));
    setWhy(null);
    setValue('');
    if (links.length > 1) return saveAll(links);
    setState({ phase: 'saving' });
    try {
      const { article, existing } = await saveOne(links[0]);
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

  /* A book opens at its desk, the one you already had if an import brought it. */
  const start = async (book) => {
    if (!book) return;
    setValue('');
    setState({ phase: 'starting' });
    try {
      const { article } = await startBook(book);
      setState({ phase: 'idle' });
      onSaved?.(article);
      onOpen?.(article._id);
    } catch (_) {
      setState({ phase: 'problem', line: 'That book did not start. Try it again.' });
    }
  };

  /* One after another, so the titles arrive in the order they were pasted
     and a slow page holds up nothing but itself. */
  const saveAll = async (links) => {
    const landed = [];
    let missed = 0;
    for (const url of links) {
      setState({ phase: 'many', landed: [...landed], missed, total: links.length });
      try {
        const { article } = await saveOne(url);
        landed.push(article);
        onSaved?.(article);
      } catch (_) {
        missed += 1;
      }
    }
    setState({ phase: 'many', landed, missed, total: links.length, done: true });
  };

  const handedIn = useRef(false);
  useEffect(() => {
    if (!link || handedIn.current) return;
    handedIn.current = true;
    save(link);
  });

  const keepWhy = async (event) => {
    event.preventDefault();
    const reason = String(why || '').trim();
    setWhy(null);
    if (!reason) return;
    const saved = await setArticlePlacement(state.article._id, 'later', reason).catch(() => null);
    if (saved) setState({ ...state, article: { ...state.article, placementReason: saved.placementReason } });
  };

  const { phase, article, line } = state;
  const book = bookFrom(value);
  const titleOf = piece => (
    <button type="button" className="library-paste-link__title" onClick={() => onOpen?.(piece._id)}>
      {piece.title || 'Untitled'}
    </button>
  );
  const since = phase === 'existing' ? savedOn(article?.createdAt) : '';
  const place = [PLACE[article?.placement] || '', article?.folder?.name ? `in ${article.folder.name}` : '']
    .filter(Boolean).join(', ');
  const waiting = article?.placement === 'later';
  const nightstand = waiting && onShowNightstand ? (
    <> <button type="button" className="library-paste-link__more" onClick={onShowNightstand}>See the nightstand</button></>
  ) : null;
  /* Why it waits, in the reader's words: shown back on the nightstand, at the
     top of the piece, and in the Morning Paper. */
  const reason = waiting ? (
    article.placementReason
      ? <> <span className="library-paste-link__why">{article.placementReason}</span></>
      : why === null
        ? <> <button type="button" className="library-paste-link__more" onClick={() => setWhy('')}>Add why</button></>
        : null
  ) : null;
  const sorted = [...folders].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const filedIn = folders.find(item => String(item._id) === String(folder))?.name;
  const many = phase === 'many' ? (
    <>
      {state.done
        ? (state.landed.length ? `${state.landed.length} ${PLACE[where]}` : 'None of those saved')
        : `Saving ${state.landed.length + state.missed + 1} of ${state.total}…`}
      {state.landed.length ? ': ' : ''}
      {state.landed.map((piece, index) => (
        <React.Fragment key={piece._id}>{index ? ' · ' : ''}{titleOf(piece)}</React.Fragment>
      ))}
      {state.done && state.missed ? `. ${state.missed} could not be read.` : ''}
    </>
  ) : null;

  return (
    <form
      className="library-paste-link"
      noValidate
      onSubmit={(event) => { event.preventDefault(); save(value); }}
    >
      <div className="library-paste-link__line">
        <input
          aria-label="Paste a link to save"
          enterKeyHint="go"
          autoCapitalize="off"
          value={value}
          placeholder="Paste a link, or name the book you’re reading"
          disabled={phase === 'saving' || phase === 'starting' || (phase === 'many' && !state.done)}
          onChange={(event) => {
            setValue(event.target.value);
            if (phase === 'problem') setState({ phase: 'idle' });
          }}
          onPaste={(event) => {
            const pasted = event.clipboardData?.getData('text') || '';
            if (value.trim() || !linksFrom(pasted).length) return;
            event.preventDefault();
            save(pasted);
          }}
        />
        {value.trim() && !['saving', 'starting'].includes(phase) ? <button type="submit" className="library-paste-link__save">{book ? 'Start' : 'Save'}</button> : null}
      </div>
      {book ? (
        <p className="library-paste-link__route">
          Opens <cite>{book.title}</cite>{book.author ? `, by ${book.author},` : ''} at its desk, where you type as you read.
        </p>
      ) : (
      <p className="library-paste-link__route">
        Goes{' '}
        <button
          type="button"
          className="library-paste-link__choice"
          aria-label={`Goes ${GOES[where]}. Change`}
          onClick={() => setWhere(where === 'later' ? 'stream' : 'later')}
        >
          {GOES[where]}
        </button>
        {sorted.length ? (
          <>
            {', '}
            <label className="library-paste-link__choice library-paste-link__folder">
              <span aria-hidden="true">{filedIn ? `in ${filedIn}` : 'unfiled'}</span>
              <select aria-label="Folder" value={folder} onChange={(event) => setFolder(event.target.value)}>
                <option value="">Unfiled</option>
                {sorted.map(item => <option key={item._id} value={item._id}>{item.name}</option>)}
              </select>
            </label>
          </>
        ) : null}
        .{children ? <> {children}</> : null}
      </p>
      )}
      <p className="library-paste-link__receipt" role="status" aria-live="polite">
        {phase === 'saving' ? 'Reading the page…' : null}
        {phase === 'starting' ? 'Finding the book…' : null}
        {phase === 'saved' ? <>{capital(place)}: {titleOf(article)}{reason}{nightstand}</> : null}
        {phase === 'existing' ? <>Already yours{since ? ` since ${since}` : ''}{place ? `, ${place}` : ''}: {titleOf(article)}{reason}{nightstand}</> : null}
        {many}
        {phase === 'problem' ? line : null}
      </p>
      {why !== null ? (
        <div className="library-paste-link__why-line">
          <input
            aria-label="Why you saved it"
            value={why}
            maxLength={280}
            autoFocus
            enterKeyHint="done"
            placeholder="Sam sent this · for the hiring question"
            onChange={(event) => setWhy(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') keepWhy(event);
              if (event.key === 'Escape') setWhy(null);
            }}
            onBlur={keepWhy}
          />
        </div>
      ) : null}
    </form>
  );
}
