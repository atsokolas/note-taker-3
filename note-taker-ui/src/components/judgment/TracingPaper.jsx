import React, { useCallback, useEffect, useState } from 'react';
import { usePrefersReducedMotion } from '../../hooks/useMotionPreferences';
import { chooseCaseStress, draftCaseStress, getCaseStress } from '../../api/judgmentResolution';
import { STRESS_KIND } from '../../pages/institutionModel';

const TracingPaper = ({ pageId }) => {
  const reduced = usePrefersReducedMotion();
  const [overlay, setOverlay] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [turned, setTurned] = useState('');
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!pageId) return;
    try {
      const next = await getCaseStress({ pageId });
      setOverlay(next);
      setError('');
    } catch (_loadError) {
      setError('The tracing paper could not be read.');
    }
  }, [pageId]);

  useEffect(() => {
    load();
  }, [load]);

  const sheets = Array.isArray(overlay?.sheets) ? overlay.sheets : [];
  const live = overlay?.live || {};

  const run = async (intent, work) => {
    if (busy) return;
    setBusy(intent);
    setError('');
    try {
      const result = await work();
      setOverlay(result?.overlay || result);
    } catch (_workError) {
      setError('That sheet could not be changed.');
    } finally {
      setBusy('');
    }
  };

  if (!sheets.length && !open) {
    return (
      <section className={`tracing-paper${reduced ? ' is-still' : ''}`}>
        <button type="button" className="tracing-paper__quiet" onClick={() => setOpen(true)}>
          Lay tracing paper
        </button>
      </section>
    );
  }

  return (
    <section className={`tracing-paper${reduced ? ' is-still' : ''}`} aria-labelledby="tracing-paper-title">
      <h2 id="tracing-paper-title">Tracing paper</h2>
      {live.claim ? <p className="tracing-paper__live">{live.claim}</p> : null}
      {sheets.map((sheet) => (
        <article key={sheet._id || sheet.createdAt || sheet.line} className="tracing-paper__sheet">
          <p className="tracing-paper__kind">{STRESS_KIND[sheet.kind] || sheet.kind}</p>
          <p>{sheet.line}</p>
          <small>{sheet.generatedLabel}</small>
          <p className="tracing-paper__uncertainty">{sheet.uncertainty}</p>
          {!sheet.choice ? (
            <span>
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => run('keep', () => chooseCaseStress({
                  pageId, scenarioId: sheet._id, choice: 'keep'
                }))}
              >
                Keep the live posture
              </button>
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => run('change', () => chooseCaseStress({
                  pageId, scenarioId: sheet._id, choice: 'change'
                }))}
              >
                Change it
              </button>
            </span>
          ) : (
            <p className="tracing-paper__choice">
              {sheet.choice === 'change' ? 'You changed the posture.' : 'You kept the live posture.'}
            </p>
          )}
        </article>
      ))}
      {open || !sheets.length ? (
        <form
          className="tracing-paper__form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!turned) return;
            run('draft', () => draftCaseStress({
              pageId,
              kind: 'alternative_future',
              modifiedAssumptions: [{
                from: live.assumptions?.[0]?.text || '',
                to: turned
              }]
            })).then(() => {
              setTurned('');
              setOpen(false);
            });
          }}
        >
          <label>
            If this assumption turned
            <input value={turned} onChange={(event) => setTurned(event.target.value)} />
          </label>
          <button type="submit" disabled={Boolean(busy) || !turned}>Lay the sheet</button>
        </form>
      ) : (
        <button type="button" className="tracing-paper__quiet" onClick={() => setOpen(true)}>
          Another sheet
        </button>
      )}
      {error ? <p className="tracing-paper__error" role="alert">{error}</p> : null}
    </section>
  );
};

export default TracingPaper;
