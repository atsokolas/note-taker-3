import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePrefersReducedMotion } from '../../hooks/useMotionPreferences';
import {
  acceptCaseLineage,
  getCaseLineage,
  proposeCaseLineage,
  rejectCaseLineage
} from '../../api/judgmentResolution';
import { casePath, hasThread } from '../../pages/institutionModel';

const AriadneLineage = ({ pageId }) => {
  const reduced = usePrefersReducedMotion();
  const [thread, setThread] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [toPageId, setToPageId] = useState('');
  const [shared, setShared] = useState('');
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!pageId) return;
    try {
      const next = await getCaseLineage({ pageId });
      setThread(next);
      setError('');
    } catch (_loadError) {
      setError('The thread could not be read.');
    }
  }, [pageId]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (intent, work) => {
    if (busy) return;
    setBusy(intent);
    setError('');
    try {
      const result = await work();
      setThread(result?.thread || result);
    } catch (_workError) {
      setError('That thread could not be changed.');
    } finally {
      setBusy('');
    }
  };

  const knots = Array.isArray(thread?.knots) ? thread.knots : [];
  const cut = Array.isArray(thread?.cut) ? thread.cut : [];
  const contradictions = Array.isArray(thread?.contradictions) ? thread.contradictions : [];
  if (!hasThread(thread) && !open && !cut.length) {
    return (
      <section className={`ariadne-lineage${reduced ? ' is-still' : ''}`}>
        <button type="button" className="ariadne-lineage__quiet" onClick={() => setOpen(true)}>
          Thread a later case
        </button>
      </section>
    );
  }

  return (
    <section className={`ariadne-lineage${reduced ? ' is-still' : ''}`} aria-labelledby="ariadne-lineage-title">
      <h2 id="ariadne-lineage-title">A quiet thread</h2>
      {knots.length ? (
        <ol>
          {knots.map((knot) => (
            <li key={`${knot.fromPageId}:${knot.toPageId}:${knot.object?.text || knot.kind}`}>
              <p>{knot.line}</p>
              {knot.toPageId && knot.toPageId !== pageId ? (
                <Link to={casePath(knot.toPageId)}>The later case</Link>
              ) : null}
              {knot.fromPageId && knot.fromPageId !== pageId ? (
                <Link to={casePath(knot.fromPageId)}>The earlier case</Link>
              ) : null}
              {knot.status === 'proposed' ? (
                <span>
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => run('accept', () => acceptCaseLineage({ pageId, linkId: knot._id || knot.id }))}
                  >
                    Keep this thread
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => run('reject', () => rejectCaseLineage({ pageId, linkId: knot._id || knot.id }))}
                  >
                    Cut it
                  </button>
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="ariadne-lineage__silence">No shared assumption is named yet.</p>
      )}
      {contradictions.length ? (
        <p className="ariadne-lineage__part">The contradiction stays on the paper.</p>
      ) : null}
      {open || !knots.length ? (
        <form
          className="ariadne-lineage__form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!toPageId || !shared) return;
            run('propose', () => proposeCaseLineage({
              pageId,
              toPageId,
              kind: 'assumption',
              object: { kind: 'assumption', text: shared }
            })).then(() => {
              setToPageId('');
              setShared('');
              setOpen(false);
            });
          }}
        >
          <label>
            The other case
            <input value={toPageId} onChange={(event) => setToPageId(event.target.value)} />
          </label>
          <label>
            What they share
            <input value={shared} onChange={(event) => setShared(event.target.value)} />
          </label>
          <button type="submit" disabled={Boolean(busy) || !toPageId || !shared}>Thread them</button>
        </form>
      ) : (
        <button type="button" className="ariadne-lineage__quiet" onClick={() => setOpen(true)}>
          Thread another case
        </button>
      )}
      {error ? <p className="ariadne-lineage__error" role="alert">{error}</p> : null}
    </section>
  );
};

export default AriadneLineage;
