import React, { useCallback, useMemo, useState } from 'react';
import { Button } from '../ui';
import { armEdgarWatch } from '../../api/wiki';

const normalizeId = (value = '') => String(value || '').trim();

export const isCompanyDossierPage = (page = {}) => (
  String(page?.pageType || '').toLowerCase() === 'entity'
);

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

export const formatEdgarWatchReceipt = (watch = {}) => {
  const ticker = normalizeId(watch.ticker).toUpperCase();
  const cik = normalizeId(watch.cik);
  const label = ticker || cik || 'company';
  const checked = formatWatchDate(watch.lastCheckedAt);
  return `EDGAR watcher armed for ${label} · last filing checked ${checked}`;
};

const isEdgarWatchArmed = (watch = {}) => {
  if (!watch || typeof watch !== 'object') return false;
  const status = String(watch.status || '').toLowerCase();
  if (status === 'error') return false;
  return Boolean(normalizeId(watch.ticker) || normalizeId(watch.cik));
};

const parseIdentifier = (raw = '') => {
  const value = normalizeId(raw);
  if (!value) return { ticker: '', cik: '' };
  const digitsOnly = value.replace(/\D/g, '');
  if (/^\d+$/.test(value) || (digitsOnly.length >= 4 && digitsOnly.length === value.replace(/[\s.-]/g, '').length)) {
    return { ticker: '', cik: digitsOnly.padStart(10, '0') };
  }
  return { ticker: value.toUpperCase(), cik: '' };
};

const WikiEdgarWatchControl = ({ pageId, page, onPageUpdate }) => {
  const meta = useMemo(() => pageMeta(page), [page]);
  const watch = page?.externalWatches?.edgar || {};
  const armed = isEdgarWatchArmed(watch);
  const watchError = String(watch.status || '').toLowerCase() === 'error'
    ? (watch.errorMessage || 'EDGAR watch failed.')
    : '';
  const [identifier, setIdentifier] = useState(() => (
    normalizeId(watch.ticker || watch.cik || meta.ticker || meta.symbol || '')
  ));
  const [submitError, setSubmitError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = useCallback(async (event) => {
    event.preventDefault();
    const parsed = parseIdentifier(identifier);
    if (!parsed.ticker && !parsed.cik) {
      setSubmitError('Enter a ticker symbol or CIK.');
      return;
    }
    setBusy(true);
    setSubmitError('');
    try {
      const result = await armEdgarWatch(pageId, parsed);
      if (result?.page) onPageUpdate?.(result.page);
    } catch (error) {
      setSubmitError(error?.message || 'Failed to arm EDGAR watch.');
    } finally {
      setBusy(false);
    }
  }, [identifier, onPageUpdate, pageId]);

  if (!isCompanyDossierPage(page)) return null;

  return (
    <section
      className={`wiki-read__edgar-watch${armed ? ' is-armed' : ''}${watchError || submitError ? ' is-error' : ''}`}
      aria-label="SEC EDGAR filing watch"
    >
      <div className="wiki-read__edgar-watch-copy">
        <span className="wiki-read__edgar-watch-kicker">Research connector</span>
        <h3>Track SEC filings</h3>
        <p className="wiki-read__edgar-watch-disclaimer">
          Research only. Noeis watches read-only public SEC filings for this dossier.
          No trading, brokerage access, or investment advice.
        </p>
        {armed ? (
          <>
            <p className="wiki-read__edgar-watch-receipt" role="status">
              {formatEdgarWatchReceipt(watch)}
            </p>
            {watch.companyName ? (
              <p className="wiki-read__edgar-watch-meta">{watch.companyName}</p>
            ) : null}
          </>
        ) : (
          <p>
            Arm an EDGAR watcher to ingest new 10-K, 10-Q, 8-K, and 13F filings as sources on this company dossier.
          </p>
        )}
        {watchError ? (
          <p className="wiki-read__edgar-watch-error" role="alert">{watchError}</p>
        ) : null}
        {submitError ? (
          <p className="wiki-read__edgar-watch-error" role="alert">{submitError}</p>
        ) : null}
      </div>
      <form className="wiki-read__edgar-watch-form" onSubmit={handleSubmit}>
        <label htmlFor={`wiki-edgar-watch-${pageId}`}>
          Ticker or CIK
        </label>
        <div className="wiki-read__edgar-watch-input-row">
          <input
            id={`wiki-edgar-watch-${pageId}`}
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="AAPL or 0000320193"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            disabled={busy}
          />
          <Button type="submit" variant="secondary" disabled={busy}>
            {busy ? 'Arming...' : armed ? 'Update watch' : 'Track SEC filings'}
          </Button>
        </div>
      </form>
    </section>
  );
};

export default WikiEdgarWatchControl;
