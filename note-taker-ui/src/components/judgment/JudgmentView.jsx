import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getWikiPage,
  proposeJudgmentChange,
  resolveJudgmentChange,
  updateWikiPage
} from '../../api/wiki';
import { recordJudgmentVerdict, setJudgmentResolution } from '../../api/judgmentResolution';
import { useNoeisAgentSurface } from '../../agent/AgentRailContext';
import { rememberOpenedJudgment } from '../reader/folioModel';
import { buildJudgmentSurfaceDescriptor } from '../../pages/judgmentSurfaceModel';
import {
  CONFIDENCE,
  VERDICTS,
  acceptProposalIntoJudgment,
  formatLedgerDate,
  oneSentence,
  parkJudgment,
  projectView,
  resumeJudgment
} from '../../pages/judgmentModel';

// The View.
//
// One sentence, large. How long you have held it and how sure you are. The
// passages for it and against it, side by side. What would change your mind.
// A record of what happened. Two things you can do: revise it, or say how it
// turned out. Nothing else is on the page.

const UNDO_MS = 6000;

const messageOf = (failure, fallback) => failure?.response?.data?.error || failure?.message || fallback;

/* Undo, not confirm. The action happens at once; for six seconds a line in
   place offers it back. `settle` runs when the window closes unanswered —
   or when the page goes away first. */
export const useUndo = () => {
  const [pending, setPending] = useState(null);
  const pendingRef = useRef(null);
  const timer = useRef(0);

  const close = useCallback((run) => {
    window.clearTimeout(timer.current);
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    if (current) run(current);
  }, []);

  useEffect(() => () => {
    window.clearTimeout(timer.current);
    pendingRef.current?.settle?.();
  }, []);

  const offer = useCallback((next) => {
    close(previous => previous.settle?.());
    pendingRef.current = next;
    setPending(next);
    timer.current = window.setTimeout(() => close(current => current.settle?.()), UNDO_MS);
  }, [close]);

  const undo = useCallback(() => close(current => current.undo?.()), [close]);
  return { pending, offer, undo };
};

export const UndoLine = ({ pending, onUndo, at }) => (
  pending && pending.at === at ? (
    <p className="judgment-undo" role="status">
      {pending.label} <button type="button" onClick={onUndo}>Undo</button>
    </p>
  ) : null
);

const SourceLink = ({ href, children }) => {
  if (!href) return <span>{children}</span>;
  if (href.startsWith('/')) return <Link to={href}>{children}</Link>;
  return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
};

const PassageColumn = ({ title, passages }) => (
  <section className="judgment-column" aria-label={title}>
    <h2>{title}</h2>
    {passages.length ? (
      <ul>
        {passages.map(passage => (
          <li key={passage.id}>
            <blockquote>{passage.text}</blockquote>
            {passage.source || passage.at ? (
              <p className="judgment-column__cite">
                {passage.source ? <SourceLink href={passage.href}>{passage.source}</SourceLink> : null}
                {passage.source && passage.at ? ' · ' : null}
                {passage.at ? <time dateTime={passage.at}>{formatLedgerDate(passage.at)}</time> : null}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    ) : <p className="judgment-quiet">Nothing yet.</p>}
  </section>
);

const toDateInput = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};

/* What would change my mind: one line, and an optional date by which to ask. */
const TheTest = ({ test, onSave }) => {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(test.text);
  const [by, setBy] = useState(toDateInput(test.by));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const open = () => {
    setText(test.text);
    setBy(toDateInput(test.by));
    setError('');
    setEditing(true);
  };

  const save = async (event) => {
    event.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await onSave({ criteria: text.trim(), horizonAt: by ? new Date(`${by}T12:00:00`).toISOString() : null });
      setEditing(false);
    } catch (failure) {
      setError(messageOf(failure, 'That did not save.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="judgment-test" aria-labelledby="judgment-test-title">
      <h2 id="judgment-test-title">What would change my mind</h2>
      {editing ? (
        <form className="judgment-test__form" onSubmit={save}>
          <input
            aria-label="In one line"
            value={text}
            autoFocus
            placeholder="Two quarters of falling renewals."
            onChange={event => setText(event.target.value)}
          />
          <label>
            By when <span className="judgment-quiet">(optional)</span>
            <input type="date" value={by} onChange={event => setBy(event.target.value)} />
          </label>
          <span className="judgment-actions">
            <button type="submit" disabled={busy || !text.trim()}>{busy ? 'Saving…' : 'Save'}</button>
            <button type="button" className="is-quiet" onClick={() => setEditing(false)} disabled={busy}>Never mind</button>
          </span>
          {error ? <p className="judgment-error" role="alert">{error}</p> : null}
        </form>
      ) : (
        <button type="button" className={`judgment-test__line${test.text ? '' : ' is-empty'}`} onClick={open}>
          {test.text || 'Say what would change your mind.'}
          {test.text && test.by ? <span className="judgment-test__by"> By {formatLedgerDate(test.by)}.</span> : null}
        </button>
      )}
    </section>
  );
};

const Record = ({ lines }) => (
  <ol className="judgment-record">
    {lines.map(line => (
      <li key={line.id}>
        <time dateTime={line.at}>{formatLedgerDate(line.at)}</time>
        <span>
          {line.text}
          {line.was ? <> <s>{line.was}</s></> : null}
        </span>
      </li>
    ))}
  </ol>
);

const JudgmentView = ({ pageId, initialPage = null, children = null }) => {
  const [page, setPage] = useState(initialPage);
  const [loading, setLoading] = useState(!initialPage);
  const [error, setError] = useState('');
  const [revising, setRevising] = useState(false);
  const [draft, setDraft] = useState('');
  const [resolving, setResolving] = useState(false);
  const [busy, setBusy] = useState(false);
  const { pending, offer, undo } = useUndo();
  const pageRef = useRef(page);
  pageRef.current = page;

  useEffect(() => { rememberOpenedJudgment(pageId); }, [pageId]);

  useEffect(() => {
    let cancelled = false;
    getWikiPage(pageId, { reader: 1 })
      .then(loaded => { if (!cancelled) setPage(loaded); })
      .catch(failure => { if (!cancelled) setError(messageOf(failure, 'Could not open this view.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [pageId]);

  const view = useMemo(() => (page ? projectView(page) : null), [page]);
  const mergeJudgment = useCallback((judgment) => {
    if (judgment) setPage(current => ({ ...current, judgment }));
  }, []);

  /* The page shows the write before the server answers; a write that does not
     land puts the page back and says so. */
  const commit = useCallback(async (judgment) => {
    const before = pageRef.current?.judgment;
    setError('');
    mergeJudgment(judgment);
    try {
      const saved = await updateWikiPage(pageId, { judgment });
      if (saved?.judgment) mergeJudgment(saved.judgment);
    } catch (failure) {
      mergeJudgment(before);
      setError(messageOf(failure, 'That did not save.'));
      throw failure;
    }
  }, [mergeJudgment, pageId]);

  const run = useCallback(async (action) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (failure) {
      setError(messageOf(failure, 'That did not save.'));
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const choose = (value) => commit({ ...pageRef.current.judgment, confidence: value }).catch(() => {});

  const revise = (event) => {
    event.preventDefault();
    const next = oneSentence(draft);
    if (!next || next === view.claim) {
      setRevising(false);
      return;
    }
    run(async () => {
      const proposal = await proposeJudgmentChange(pageId, next);
      const resolved = await resolveJudgmentChange(pageId, proposal.id, 'accept');
      if (resolved?.page) setPage(resolved.page);
      setRevising(false);
    });
  };

  const resolve = (result) => run(async () => {
    const saved = await recordJudgmentVerdict({ pageId, expectedClaim: view.claim, result });
    mergeJudgment(saved.judgment);
    setResolving(false);
  });

  const saveTest = async ({ criteria, horizonAt }) => {
    const saved = await setJudgmentResolution({ pageId, expectedClaim: view.claim, criteria, horizonAt });
    mergeJudgment(saved.judgment);
  };

  const setAside = () => run(async () => {
    await commit(parkJudgment(pageRef.current));
    offer({
      at: 'record',
      label: 'Set aside.',
      undo: () => commit(resumeJudgment(pageRef.current)).catch(() => {})
    });
  });
  const pickUp = () => run(() => commit(resumeJudgment(pageRef.current)));

  const boundSources = view
    ? [...view.forPassages, ...view.againstPassages].filter(passage => passage.source).length
    : 0;
  useNoeisAgentSurface(
    'agent-surface.judgment',
    buildJudgmentSurfaceDescriptor({ page, pageId }),
    { subject: view?.claim || '', boundSources, empty: 'Nothing to retrieve until you ask.' },
    { onAccept: (proposal, field) => commit(acceptProposalIntoJudgment(pageRef.current, proposal, field)) }
  );

  if (loading) {
    return <main className="judgment" aria-busy="true"><p className="judgment-quiet" role="status">Opening the view…</p></main>;
  }

  if (!view?.claim) {
    return (
      <main className="judgment">
        <Link className="judgment-back" to="/judgment">← Views</Link>
        <p className="judgment-quiet">{error || 'There is no view on this page.'}</p>
      </main>
    );
  }

  return (
    <main className="judgment judgment-view" aria-labelledby="judgment-sentence">
      <Link className="judgment-back" to="/judgment">← Views</Link>

      <header className="judgment-view__head">
        {revising ? (
          <form className="judgment-view__revise" onSubmit={revise}>
            <textarea
              id="judgment-sentence"
              aria-label="The view, revised"
              className="judgment-view__sentence"
              rows={2}
              value={draft}
              autoFocus
              onChange={event => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) revise(event);
                if (event.key === 'Escape') setRevising(false);
              }}
            />
            <span className="judgment-actions">
              <button type="submit" disabled={busy || !oneSentence(draft)}>{busy ? 'Holding it…' : 'Hold this instead'}</button>
              <button type="button" className="is-quiet" onClick={() => setRevising(false)} disabled={busy}>Never mind</button>
            </span>
          </form>
        ) : (
          <h1 id="judgment-sentence" className="judgment-view__sentence">{view.claim}</h1>
        )}
        <p className="judgment-view__standing">
          {view.heldSince ? `Held since ${formatLedgerDate(view.heldSince)}` : 'Held'}
          {view.resolved ? ` · ${view.resolved}` : ''}
        </p>
        <div className="judgment-view__sure" role="group" aria-label="How sure you are">
          {CONFIDENCE.map(option => (
            <button
              key={option.word}
              type="button"
              aria-pressed={view.confidence === option.word}
              onClick={() => choose(option.value)}
            >
              {option.word}
            </button>
          ))}
        </div>
      </header>

      {children}

      <div className="judgment-view__columns">
        <PassageColumn title="For" passages={view.forPassages} />
        <PassageColumn title="Against" passages={view.againstPassages} />
      </div>

      <TheTest key={`${view.test.text}:${view.test.by}`} test={view.test} onSave={saveTest} />

      <section className="judgment-view__record" aria-labelledby="judgment-record-title">
        <h2 id="judgment-record-title">Record</h2>
        <Record lines={view.record} />
        <UndoLine pending={pending} onUndo={undo} at="record" />
        {pending?.at === 'record' ? null : (
          <p className="judgment-view__record-foot">
            {view.parked
              ? <button type="button" onClick={pickUp} disabled={busy}>Pick it back up</button>
              : <button type="button" onClick={setAside} disabled={busy}>Set aside</button>}
          </p>
        )}
      </section>

      {resolving ? (
        <div className="judgment-view__resolve" role="group" aria-label="How it turned out">
          <span>Did it hold up?</span>
          {VERDICTS.map(option => (
            <button key={option.result} type="button" onClick={() => resolve(option.result)} disabled={busy}>
              {option.word}
            </button>
          ))}
          <button type="button" className="is-quiet" onClick={() => setResolving(false)} disabled={busy}>Too early to say</button>
        </div>
      ) : (
        <div className="judgment-view__actions">
          <button type="button" onClick={() => { setDraft(view.claim); setRevising(true); }} disabled={busy || revising}>Revise</button>
          <button type="button" onClick={() => setResolving(true)} disabled={busy}>Resolve</button>
        </div>
      )}

      {error ? <p className="judgment-error" role="alert">{error}</p> : null}
    </main>
  );
};

export default JudgmentView;
