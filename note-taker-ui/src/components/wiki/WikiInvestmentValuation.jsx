import React, { useMemo, useState } from 'react';
import { refreshInvestmentValuation } from '../../api/wiki';
import { useSystemStatusControls } from '../../system/SystemStatusContext';
import { Button } from '../ui';
import '../../styles/wiki-investment-valuation.css';

const clean = value => String(value || '').trim();

const displayDate = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  }).format(date);
};

const numberLabel = (value, maximumFractionDigits = 1) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits,
    minimumFractionDigits: 0
  }).format(number);
};

const percentLabel = (value, maximumFractionDigits = 1) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `${numberLabel(number * 100, maximumFractionDigits)}%`;
};

const metricLabel = value => clean(value)
  .replace(/_/g, ' ')
  .replace(/\b\w/g, character => character.toUpperCase());

const sourceId = source => clean(source?._id || source?.id);

const initialForm = (page = {}, valuation = {}) => {
  const hurdle = page?.investmentDossier?.hurdle || valuation?.hurdle || {};
  const defaultSource = (page?.sourceRefs || []).find(source => (
    sourceId(source) && source?.metadata?.marketSnapshot !== true
  ));
  return {
    asOf: valuation?.asOf ? String(valuation.asOf).slice(0, 10) : '',
    price: valuation?.price ?? '',
    dilutedShares: valuation?.dilutedShares ?? '',
    netCashOrDebt: valuation?.netCashOrDebt ?? '0',
    unitScale: valuation?.unitScale || 'millions',
    operatingMetric: valuation?.operatingBase?.metric || 'free_cash_flow',
    operatingPeriod: valuation?.operatingBase?.period || '',
    operatingBase: valuation?.operatingBase?.value ?? '',
    operatingDerivation: valuation?.operatingBase?.derivation || '',
    operatingSourceRefId: valuation?.operatingBase?.sourceRefIds?.[0] || sourceId(defaultSource),
    terminalMultiples: (valuation?.hurdle?.terminalMultiples || [15, 20, 25, 30]).join(', '),
    marketSourceTitle: '',
    marketSourceUrl: '',
    annualReturn: hurdle.annualReturn,
    horizonYears: hurdle.horizonYears
  };
};

const parseTerminalMultiples = value => Array.from(new Set(
  clean(value)
    .split(',')
    .map(entry => Number(entry.trim()))
    .filter(number => Number.isFinite(number) && number > 0)
));

const ValuationSummary = ({ valuation }) => {
  const scale = valuation.unitScale || 'millions';
  const unit = scale === 'billions' ? 'B' : 'M';
  const scenarios = Array.isArray(valuation.scenarios) ? valuation.scenarios : [];
  return (
    <>
      <div className="wiki-valuation__facts">
        <div>
          <span>Price snapshot</span>
          <strong>${numberLabel(valuation.price, 2)}</strong>
          <small>{displayDate(valuation.asOf)}</small>
        </div>
        <div>
          <span>Enterprise value</span>
          <strong>${numberLabel(valuation.enterpriseValue)}{unit}</strong>
          <small>{numberLabel(valuation.currentOperatingMultiple)}× current operating base</small>
        </div>
        <div>
          <span>Owner hurdle</span>
          <strong>{percentLabel(valuation.hurdle?.annualReturn)}</strong>
          <small>{numberLabel(valuation.hurdle?.horizonYears, 0)}-year horizon</small>
        </div>
        <div>
          <span>Operating base</span>
          <strong>${numberLabel(valuation.operatingBase?.value)}{unit}</strong>
          <small>{metricLabel(valuation.operatingBase?.metric)} · {valuation.operatingBase?.period}</small>
        </div>
      </div>
      <div className="wiki-valuation__table-wrap">
        <table className="wiki-valuation__table">
          <caption>What the current price requires</caption>
          <thead>
            <tr>
              <th scope="col">Terminal multiple</th>
              <th scope="col">Required operating value</th>
              <th scope="col">Required annual growth</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map(row => (
              <tr key={row.terminalMultiple}>
                <td>{numberLabel(row.terminalMultiple)}×</td>
                <td>${numberLabel(row.requiredOperatingValue)}{unit}</td>
                <td>{percentLabel(row.requiredCagr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="wiki-valuation__derivation">
        <strong>Operating-base derivation:</strong> {valuation.operatingBase?.derivation}
      </p>
      {Array.isArray(valuation.sources) && valuation.sources.length ? (
        <p className="wiki-valuation__sources">
          <strong>Inputs:</strong>{' '}
          {valuation.sources.map((source, index) => (
            <React.Fragment key={`${source.url}-${source.title}-${index}`}>
              {index ? ' · ' : ''}
              {source.url ? <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a> : source.title}
            </React.Fragment>
          ))}
        </p>
      ) : null}
    </>
  );
};

const WikiInvestmentValuation = ({
  page = null,
  pageId = '',
  valuation: publicValuation = null,
  readOnly = false,
  onPageUpdate
}) => {
  const systemStatus = useSystemStatusControls();
  const valuation = publicValuation || page?.investmentDossier?.valuation || {};
  const complete = valuation?.status === 'complete' && (valuation?.scenarios || []).length > 0;
  const [form, setForm] = useState(() => initialForm(page || {}, valuation));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const operatingSources = useMemo(
    () => (page?.sourceRefs || []).filter(source => (
      sourceId(source) && source?.metadata?.marketSnapshot !== true
    )),
    [page?.sourceRefs]
  );

  if (readOnly && !complete) return null;

  const setValue = (key, value) => setForm(current => ({ ...current, [key]: value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setStatus('');
    systemStatus.setBackgroundWork({
      label: 'Investment expectations',
      stage: 'Recalculating the price-implied operating outcome'
    });
    try {
      const result = await refreshInvestmentValuation(pageId, {
        asOf: form.asOf,
        price: Number(form.price),
        dilutedShares: Number(form.dilutedShares),
        netCashOrDebt: Number(form.netCashOrDebt || 0),
        unitScale: form.unitScale,
        operatingMetric: form.operatingMetric,
        operatingPeriod: clean(form.operatingPeriod),
        operatingBase: Number(form.operatingBase),
        operatingDerivation: clean(form.operatingDerivation),
        operatingSourceRefId: form.operatingSourceRefId,
        terminalMultiples: parseTerminalMultiples(form.terminalMultiples),
        marketSourceTitle: clean(form.marketSourceTitle),
        marketSourceUrl: clean(form.marketSourceUrl)
      });
      const nextPage = result?.page;
      if (nextPage) onPageUpdate?.(nextPage);
      setStatus(result?.receipt?.summary || 'Implied expectations refreshed.');
      systemStatus.setLatestReceipt({
        title: result?.receipt?.title || 'Investment expectations refreshed',
        summary: result?.receipt?.summary || 'The valuation snapshot was recalculated without advancing the SEC clock.',
        status: 'completed',
        href: `/wiki/workspace?page=${encodeURIComponent(pageId)}`
      });
      systemStatus.clearRecoverableFailure();
    } catch (submitError) {
      const message = submitError?.response?.data?.error || submitError?.message || 'Could not refresh investment expectations.';
      setError(message);
      systemStatus.setRecoverableFailure({
        stage: 'Investment expectations',
        message,
        retryable: true
      });
    } finally {
      setBusy(false);
      systemStatus.setBackgroundWork(null);
    }
  };

  return (
    <section className={`wiki-valuation${complete ? ' is-complete' : ' is-awaiting'}`} aria-label="Implied expectations">
      <div className="wiki-valuation__header">
        <div>
          <p>Expectations clock</p>
          <h2>Implied expectations</h2>
        </div>
        <span>{complete ? `Price refreshed ${displayDate(valuation.asOf)}` : 'Awaiting explicit market inputs'}</span>
      </div>
      {complete ? <ValuationSummary valuation={valuation} /> : (
        <p className="wiki-valuation__empty">
          Add a dated price, reported operating base, and source trail to calculate what performance the current security price requires.
        </p>
      )}
      {!readOnly ? (
        <details className="wiki-valuation__editor" open={!complete}>
          <summary>{complete ? 'Refresh assumptions' : 'Calculate implied expectations'}</summary>
          <form onSubmit={handleSubmit}>
            <p>
              The expectations clock is separate from the filing clock. Refreshing price inputs does not rewrite the accepted company evidence.
            </p>
            <div className="wiki-valuation__form-grid">
              <label>
                Price as of
                <input type="date" value={form.asOf} onChange={event => setValue('asOf', event.target.value)} required disabled={busy} />
              </label>
              <label>
                Share price
                <span className="wiki-valuation__input-affix"><b>$</b><input aria-label="Share price" type="number" min="0.0001" step="0.01" value={form.price} onChange={event => setValue('price', event.target.value)} required disabled={busy} /></span>
              </label>
              <label>
                Calculation scale
                <select value={form.unitScale} onChange={event => setValue('unitScale', event.target.value)} disabled={busy}>
                  <option value="millions">USD millions</option>
                  <option value="billions">USD billions</option>
                </select>
              </label>
              <label>
                Diluted shares ({form.unitScale})
                <input type="number" min="0.0001" step="any" value={form.dilutedShares} onChange={event => setValue('dilutedShares', event.target.value)} required disabled={busy} />
              </label>
              <label>
                Net debt; negative for net cash ({form.unitScale})
                <input type="number" step="any" value={form.netCashOrDebt} onChange={event => setValue('netCashOrDebt', event.target.value)} required disabled={busy} />
              </label>
              <label>
                Operating metric
                <select value={form.operatingMetric} onChange={event => setValue('operatingMetric', event.target.value)} disabled={busy}>
                  <option value="free_cash_flow">Free cash flow</option>
                  <option value="operating_income">Operating income</option>
                  <option value="ebitda">EBITDA</option>
                  <option value="net_income">Net income</option>
                </select>
              </label>
              <label>
                Operating period
                <input value={form.operatingPeriod} onChange={event => setValue('operatingPeriod', event.target.value)} placeholder="FY2026 trailing twelve months" required disabled={busy} />
              </label>
              <label>
                Operating base ({form.unitScale})
                <input type="number" min="0.0001" step="any" value={form.operatingBase} onChange={event => setValue('operatingBase', event.target.value)} required disabled={busy} />
              </label>
              <label>
                Terminal multiples
                <input value={form.terminalMultiples} onChange={event => setValue('terminalMultiples', event.target.value)} placeholder="15, 20, 25, 30" required disabled={busy} />
              </label>
              <label>
                Operating evidence
                <select value={form.operatingSourceRefId} onChange={event => setValue('operatingSourceRefId', event.target.value)} required disabled={busy}>
                  <option value="">Choose an attached source</option>
                  {operatingSources.map(source => (
                    <option value={sourceId(source)} key={sourceId(source)}>{source.title || source.url || 'Attached source'}</option>
                  ))}
                </select>
              </label>
              <label className="wiki-valuation__wide">
                Operating-base derivation
                <textarea value={form.operatingDerivation} onChange={event => setValue('operatingDerivation', event.target.value)} rows={2} placeholder="Explain the reported inputs and normalization." required disabled={busy} />
              </label>
              <label>
                Market source title
                <input value={form.marketSourceTitle} onChange={event => setValue('marketSourceTitle', event.target.value)} placeholder="Exchange closing-price page" disabled={busy} />
              </label>
              <label>
                Market source URL
                <input type="url" value={form.marketSourceUrl} onChange={event => setValue('marketSourceUrl', event.target.value)} placeholder="https://…" required disabled={busy} />
              </label>
            </div>
            <div className="wiki-valuation__hurdle">
              Owner hurdle: <strong>{percentLabel(form.annualReturn)}</strong> over <strong>{numberLabel(form.horizonYears, 0)} years</strong>. Change the decision record to revise it.
            </div>
            <Button type="submit" variant="secondary" disabled={busy || operatingSources.length === 0}>
              {busy ? 'Recalculating…' : complete ? 'Refresh expectations' : 'Calculate expectations'}
            </Button>
            {status ? <p className="wiki-valuation__status" role="status">{status}</p> : null}
            {error ? <p className="wiki-index__error" role="alert">{error}</p> : null}
          </form>
        </details>
      ) : null}
    </section>
  );
};

export default WikiInvestmentValuation;
