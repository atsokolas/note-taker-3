import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { createWikiPage, listWikiPages, updateWikiPage } from '../api/wiki';
import { useNoeisAgentSurface } from '../agent/AgentRailContext';
import JudgmentShelf from '../components/collection/JudgmentShelf';
import JudgmentView from '../components/judgment/JudgmentView';
import { buildJudgmentIndex, createJudgment, oneSentence } from './judgmentModel';
import { buildJudgmentSurfaceDescriptor } from './judgmentSurfaceModel';
import '../styles/judgment.css';

// Judgment.
//
// The room holds views: sentences you think are true. The index is the list
// of them, and the hold form when there are none. Opening one shows the View.

const HOLD_EXAMPLE = 'Costco’s membership model makes it recession-resistant.';

const HoldForm = ({ alone, onClose }) => {
  const navigate = useNavigate();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    const sentence = oneSentence(draft);
    if (!sentence || busy) return;
    setBusy(true);
    setError('');
    try {
      const held = await createJudgment(sentence, { createPage: createWikiPage, updatePage: updateWikiPage });
      navigate(`/judgment/${held.id}`);
    } catch (failure) {
      setError(failure?.message || 'That view could not be held.');
      setBusy(false);
    }
  };

  return (
    <form className={`judgment-hold${alone ? ' is-alone' : ''}`} onSubmit={submit}>
      <label htmlFor="judgment-new-claim">One sentence you think is true.</label>
      <input
        id="judgment-new-claim"
        value={draft}
        onChange={event => setDraft(event.target.value)}
        placeholder={HOLD_EXAMPLE}
        disabled={busy}
        autoFocus={!alone}
      />
      <span className="judgment-actions">
        <button type="submit" disabled={busy || !draft.trim()}>{busy ? 'Holding it…' : 'Hold it'}</button>
        {!alone ? <button type="button" className="is-quiet" onClick={onClose} disabled={busy}>Not now</button> : null}
        {error ? <span className="judgment-error" role="alert">{error}</span> : null}
      </span>
    </form>
  );
};

const JudgmentIndex = ({ items, loading, error, setAsideView }) => {
  const [holding, setHolding] = useState(false);
  const shown = items.filter(item => (setAsideView ? item.state === 'parked' : item.state !== 'parked'));
  const alone = !items.length && !loading && !error;

  useNoeisAgentSurface('agent-surface.judgment', buildJudgmentSurfaceDescriptor(), { subject: 'Your views.' }, {});

  return (
    <main className="judgment judgment-index" aria-labelledby="judgment-index-title">
      <h1 className="judgment-index__title" id="judgment-index-title">{setAsideView ? 'Set aside' : 'Views'}</h1>
      {!setAsideView && (alone || holding)
        ? <HoldForm alone={alone} onClose={() => setHolding(false)} />
        : null}
      {!setAsideView && !alone && !holding ? (
        <button type="button" className="judgment-index__hold" onClick={() => setHolding(true)}>Hold a view</button>
      ) : null}
      {loading && !items.length ? <p className="judgment-quiet" role="status">Reading back what you hold…</p> : null}
      {shown.length ? (
        <ul className="judgment-index__list">
          {shown.map(item => (
            <li key={item.id}>
              <Link to={`/judgment/${item.id}`}>{item.sentence}</Link>
              {item.card ? <p>{item.card}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {setAsideView && !loading && !shown.length ? <p className="judgment-quiet">Nothing set aside.</p> : null}
      {error ? <p className="judgment-error" role="alert">{error}</p> : null}
    </main>
  );
};

const Judgment = () => {
  const { pageId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const setAsideView = searchParams.get('view') === 'parked';
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    document.body.classList.add('judgment-route');
    return () => document.body.classList.remove('judgment-route');
  }, []);

  const load = useCallback(() => {
    let cancelled = false;
    listWikiPages({ projection: 'judgment', limit: 500 })
      .then(rows => { if (!cancelled) setPages(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (!cancelled) setError('Could not read your views.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  useEffect(load, [load, pageId]);

  const items = useMemo(() => buildJudgmentIndex(pages), [pages]);

  return (
    <div className="judgment-room">
      <div className="judgment-room__content">
        {pageId ? (
          <JudgmentView
            key={pageId}
            pageId={pageId}
            initialPage={pages.find(page => String(page?._id || '') === String(pageId)) || null}
          />
        ) : (
          <JudgmentIndex items={items} loading={loading} error={error} setAsideView={setAsideView} />
        )}
      </div>
      <aside className="judgment-room__shelf">
        <JudgmentShelf items={items} activeId={pageId} setAsideView={setAsideView} />
      </aside>
    </div>
  );
};

export default Judgment;
