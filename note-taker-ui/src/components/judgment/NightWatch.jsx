import React, { useCallback, useEffect, useState } from 'react';
import { useSystemStatusControls } from '../../system/SystemStatusContext';
import {
  acceptWatchProposal,
  getCaseWatch,
  killCaseWatch,
  openCaseWatch,
  reverseWatchProposal
} from '../../api/judgmentResolution';

const NightWatch = ({ pageId }) => {
  const systemStatus = useSystemStatusControls();
  const [watch, setWatch] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [purpose, setPurpose] = useState('');
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!pageId) return;
    try {
      const next = await getCaseWatch({ pageId });
      setWatch(next?.watch || next);
      setError('');
    } catch (_loadError) {
      setError('The watch could not be read.');
    }
  }, [pageId]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (intent, work, receiptTitle) => {
    if (busy) return;
    setBusy(intent);
    setError('');
    try {
      const result = await work();
      setWatch(result?.watch || result);
      if (receiptTitle && result?.receipt) {
        systemStatus.setLatestReceipt?.({
          id: result.receipt.id || `watch:${intent}`,
          title: receiptTitle,
          summary: result.watch?.note || result.silence || receiptTitle,
          completedAt: new Date().toISOString()
        });
      }
    } catch (_workError) {
      setError('The watch could not be changed.');
    } finally {
      setBusy('');
    }
  };

  const proposals = Array.isArray(watch?.proposals) ? watch.proposals : [];
  if (watch?.killed) {
    return (
      <section className="night-watch">
        <p className="night-watch__silence">The watch was killed. Nothing writes itself in.</p>
      </section>
    );
  }
  if ((!watch || watch.silent) && !open && !proposals.length) {
    return (
      <section className="night-watch">
        <button type="button" className="night-watch__quiet" onClick={() => setOpen(true)}>
          Name a watch
        </button>
        {watch?.note ? <p className="night-watch__silence">{watch.note}</p> : null}
      </section>
    );
  }

  return (
    <section className="night-watch" aria-labelledby="night-watch-title">
      <h2 id="night-watch-title">The night watch</h2>
      {watch?.purpose ? <p className="night-watch__purpose">{watch.purpose}</p> : null}
      {watch?.note ? <p className="night-watch__silence">{watch.note}</p> : null}
      {proposals.map((row) => (
        <article key={row.id}>
          <p>{row.summary}</p>
          <small>{row.generatedLabel}</small>
          {row.source?.title ? <p>{row.source.title}</p> : null}
          <span>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => run('accept', () => acceptWatchProposal({ pageId, proposalId: row.id }), 'You accepted the watch’s note.')}
            >
              Accept
            </button>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => run('reverse', () => reverseWatchProposal({ pageId, proposalId: row.id }), 'You reversed the note.')}
            >
              Reverse
            </button>
          </span>
        </article>
      ))}
      {open || !watch?.purpose ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!purpose) return;
            run('open', () => openCaseWatch({ pageId, purpose }), 'A watch was named.').then(() => {
              setPurpose('');
              setOpen(false);
            });
          }}
        >
          <label>
            What it watches
            <input value={purpose} onChange={(event) => setPurpose(event.target.value)} />
          </label>
          <button type="submit" disabled={Boolean(busy) || !purpose}>Set the watch</button>
        </form>
      ) : (
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => run('kill', () => killCaseWatch({ pageId }), 'The watch was killed.')}
        >
          Kill the watch
        </button>
      )}
      {error ? <p className="night-watch__error" role="alert">{error}</p> : null}
    </section>
  );
};

export default NightWatch;
