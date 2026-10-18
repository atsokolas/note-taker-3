import React, { useEffect, useState } from 'react';
import { canExplainBack, explainBack } from '../../api/readingRoom';

/**
 * Explain it back: two sentences in your own words, read against the piece
 * and your marks. Shown only when there is a model to read them; without one
 * the end of the article stays as it was.
 */
export default function ExplainItBack({ articleId }) {
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [state, setState] = useState({ status: 'idle', missed: [], error: '' });

  useEffect(() => {
    let live = true;
    setAvailable(false);
    setOpen(false);
    setState({ status: 'idle', missed: [], error: '' });
    if (!articleId) return undefined;
    canExplainBack(articleId)
      .then((value) => { if (live) setAvailable(value); })
      .catch(() => {});
    return () => { live = false; };
  }, [articleId]);

  if (!available) return null;
  if (!open) {
    return (
      <p className="explain-back" data-reader-control>
        <button type="button" className="explain-back__open" onClick={() => setOpen(true)}>Explain it back</button>
      </p>
    );
  }

  const submit = async (event) => {
    event.preventDefault();
    setState({ status: 'reading', missed: [], error: '' });
    try {
      const result = await explainBack(articleId, text);
      setState({ status: 'done', missed: Array.isArray(result?.missed) ? result.missed : [], error: '' });
    } catch (error) {
      setState({
        status: 'error',
        missed: [],
        error: error?.response?.data?.error || 'Could not compare this time. Your words are still here.'
      });
    }
  };

  return (
    <form className="explain-back is-open" onSubmit={submit} data-reader-control data-testid="explain-back">
      <label className="explain-back__label" htmlFor={`explain-back-${articleId}`}>Explain it back in two sentences</label>
      <textarea
        id={`explain-back-${articleId}`}
        value={text}
        rows={3}
        maxLength={800}
        onChange={(event) => setText(event.target.value)}
        placeholder="What was this piece saying, in your own words?"
      />
      <div className="explain-back__actions">
        <button type="submit" disabled={state.status === 'reading' || text.trim().length < 20}>
          {state.status === 'reading' ? 'Reading it against the piece…' : 'Compare'}
        </button>
        <button type="button" onClick={() => setOpen(false)}>Not now</button>
      </div>
      <div aria-live="polite">
        {state.status === 'error' ? <p className="explain-back__note">{state.error}</p> : null}
        {state.status === 'done' && !state.missed.length ? (
          <p className="explain-back__note">You have the thread. Nothing central is missing.</p>
        ) : null}
        {state.status === 'done' && state.missed.length ? (
          <div className="explain-back__missed">
            <p className="explain-back__note">What you left out</p>
            <ul>
              {state.missed.map((row) => (
                <li key={row.quote}>
                  <p>{row.point}</p>
                  <blockquote>{row.quote}</blockquote>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </form>
  );
}
