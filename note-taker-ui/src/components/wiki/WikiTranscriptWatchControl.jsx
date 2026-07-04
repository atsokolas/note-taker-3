import React, { useCallback, useMemo, useState } from 'react';
import { Button } from '../ui';
import { armTranscriptWatch } from '../../api/wiki';
import { isCompanyDossierPage } from './WikiEdgarWatchControl';

const normalizeId = (value = '') => String(value || '').trim();

const pageMeta = (page = {}) => {
  const value = page || {};
  return (
    value.infobox && typeof value.infobox === 'object' ? value.infobox :
      value.metadata && typeof value.metadata === 'object' ? value.metadata :
        value.meta && typeof value.meta === 'object' ? value.meta :
        {}
  );
};

const formatWatchDate = (value) => {
  if (!value) return 'not yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'not yet';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const transcriptWatchState = (watch = {}) => {
  const value = watch && typeof watch === 'object' ? watch : {};
  const ticker = normalizeId(value.ticker).toUpperCase();
  const status = String(value.status || '').toLowerCase();
  const errorMessage = normalizeId(value.errorMessage);
  const lastCheckedAt = value.lastCheckedAt || null;
  const armed = Boolean(ticker) && status !== 'error';
  const queued = armed && !lastCheckedAt;
  return {
    ticker,
    status,
    errorMessage,
    lastCheckedAt,
    lastTranscriptAt: value.lastTranscriptAt || null,
    lastTranscriptKey: normalizeId(value.lastTranscriptKey),
    armed,
    queued,
    watchError: status === 'error' ? (errorMessage || 'Earnings transcript watch failed.') : ''
  };
};

export const formatTranscriptWatchReceipt = (watch = {}) => {
  const state = transcriptWatchState(watch);
  const label = state.ticker || 'company';
  if (state.queued) {
    return `Transcript watcher queued for ${label} · first sync pending`;
  }
  const checked = formatWatchDate(state.lastCheckedAt);
  const transcriptDate = state.lastTranscriptAt ? formatWatchDate(state.lastTranscriptAt) : '';
  const suffix = transcriptDate ? ` · latest call ${transcriptDate}` : '';
  return `Transcript watcher armed for ${label} · last checked ${checked}${suffix}`;
};

const isProviderKeyError = (message = '') => /FMP_API_KEY|provider key|financial modeling prep/i.test(String(message || ''));

const WikiTranscriptWatchControl = ({ pageId, page, onPageUpdate }) => {
  const meta = useMemo(() => pageMeta(page), [page]);
  const watch = page?.externalWatches?.transcripts || page?.externalWatches?.transcript;
  const state = transcriptWatchState(watch);
  const [ticker, setTicker] = useState(() => (
    normalizeId(state.ticker || meta.ticker || meta.symbol || '')
  ));
  const [submitError, setSubmitError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = useCallback(async (event) => {
    event.preventDefault();
    const symbol = normalizeId(ticker).toUpperCase();
    if (!symbol) {
      setSubmitError('Enter a ticker symbol.');
      return;
    }
    setBusy(true);
    setSubmitError('');
    try {
      const result = await armTranscriptWatch(pageId, { ticker: symbol });
      if (result?.page) onPageUpdate?.(result.page);
    } catch (error) {
      setSubmitError(error?.message || 'Failed to arm earnings transcript watch.');
    } finally {
      setBusy(false);
    }
  }, [onPageUpdate, pageId, ticker]);

  if (!isCompanyDossierPage(page)) return null;

  const activeError = state.watchError || submitError;
  const providerKeyMissing = isProviderKeyError(activeError);
  const syncing = busy;
  const queued = !busy && state.queued;

  return (
    <section
      className={`wiki-read__transcript-watch${state.armed ? ' is-armed' : ''}${activeError ? ' is-error' : ''}${syncing ? ' is-syncing' : ''}${queued ? ' is-queued' : ''}`}
      aria-label="Earnings transcript watch"
    >
      <div className="wiki-read__transcript-watch-copy">
        <span className="wiki-read__transcript-watch-kicker">Research connector</span>
        <h4>Track earnings transcripts</h4>
        <p className="wiki-read__transcript-watch-disclaimer">
          Research only. Noeis watches read-only public earnings call transcripts for this dossier.
          No trading, brokerage access, or investment advice.
        </p>
        {syncing ? (
          <p className="wiki-read__transcript-watch-status" role="status">Syncing transcript watch…</p>
        ) : null}
        {!syncing && state.armed ? (
          <p className="wiki-read__transcript-watch-receipt" role="status">
            {formatTranscriptWatchReceipt(watch)}
          </p>
        ) : null}
        {!syncing && !state.armed ? (
          <p>
            Arm a transcript watcher to ingest new earnings call transcripts as sources on this company dossier.
          </p>
        ) : null}
        {activeError ? (
          <p className="wiki-read__transcript-watch-error" role="alert">
            {providerKeyMissing
              ? 'Provider API key missing on server. Transcript sync is unavailable until FMP_API_KEY is configured.'
              : activeError}
          </p>
        ) : null}
      </div>
      <form className="wiki-read__transcript-watch-form" onSubmit={handleSubmit}>
        <label htmlFor={`wiki-transcript-watch-${pageId}`}>
          Ticker
        </label>
        <div className="wiki-read__transcript-watch-input-row">
          <input
            id={`wiki-transcript-watch-${pageId}`}
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="AAPL"
            value={ticker}
            onChange={(event) => setTicker(event.target.value)}
            disabled={busy}
          />
          <Button type="submit" variant="secondary" disabled={busy}>
            {busy ? 'Arming...' : state.armed ? 'Update watch' : 'Track transcripts'}
          </Button>
        </div>
      </form>
    </section>
  );
};

export default WikiTranscriptWatchControl;
