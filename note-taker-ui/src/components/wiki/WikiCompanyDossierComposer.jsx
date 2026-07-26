import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createCompanyDossier } from '../../api/wiki';
import { useSystemStatusControls } from '../../system/SystemStatusContext';
import { wikiPagePath } from '../../utils/wikiFeatureFlags';
import { Button } from '../ui';

const WikiCompanyDossierComposer = ({ className = '', onCreated }) => {
  const navigate = useNavigate();
  const systemStatus = useSystemStatusControls();
  const [open, setOpen] = useState(false);
  const [ticker, setTicker] = useState('');
  const [startingJudgment, setStartingJudgment] = useState('');
  const [requiredReturn, setRequiredReturn] = useState('10');
  const [horizonYears, setHorizonYears] = useState('5');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setStatus('');
    setError('');
    systemStatus.setBackgroundWork?.({
      label: 'Company dossier',
      stage: 'Resolving the company and attaching free SEC filings'
    });
    try {
      const result = await createCompanyDossier({
        ticker: ticker.trim().toUpperCase(),
        startingJudgment: startingJudgment.trim(),
        requiredReturn: Number(requiredReturn) / 100,
        horizonYears: Number(horizonYears)
      });
      const page = result?.page || {};
      const id = page?._id || page?.id;
      if (!id) throw new Error('The dossier was created without a page id.');
      const href = wikiPagePath(id);
      const partial = result?.receipt?.status === 'partial' || Boolean(result?.watchResult?.watchError);
      const receiptStatus = partial ? 'completed_with_warnings' : 'completed';
      systemStatus.setLatestReceipt({
        title: result.action === 'existing' ? 'Opened existing company dossier.' : result.receipt?.title || 'Created company dossier.',
        summary: result.receipt?.summary || `${result.company?.ticker || ticker.toUpperCase()} is ready for review.`,
        status: receiptStatus,
        href
      });
      systemStatus.clearRecoverableFailure?.();
      onCreated?.(page);
      navigate(result.action === 'existing' || partial ? href : `${href}&build=1`, { replace: false });
      setStatus(result.receipt?.summary || (
        result.action === 'existing'
          ? 'Opened the existing dossier without creating a duplicate.'
          : 'Company dossier created and ready for first-head review.'
      ));
    } catch (submitError) {
      const response = submitError?.response?.data || {};
      const message = response.error || submitError?.message || 'Failed to create company dossier.';
      setError(message);
      systemStatus.setRecoverableFailure?.({
        stage: response.code === 'DOSSIER_INPUT_CONFLICT' ? 'Existing dossier conflict' : 'Company dossier creation',
        message,
        retryable: response.code !== 'DOSSIER_INPUT_CONFLICT'
      });
    } finally {
      setBusy(false);
      systemStatus.setBackgroundWork?.(null);
    }
  };

  return (
    <section className={`wiki-company-dossier${className ? ` ${className}` : ''}`}>
      <button
        className="wiki-company-dossier__toggle"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        Create a maintained company dossier
      </button>
      {open ? (
        <form onSubmit={handleSubmit} className="wiki-company-dossier__form">
          <p>Your judgment stays yours. Noeis uses free SEC filings and opens a private draft for review.</p>
          <label>
            Ticker
            <input aria-label="Company ticker" value={ticker} onChange={event => setTicker(event.target.value)} placeholder="AMD" disabled={busy} />
          </label>
          <label>
            Starting judgment
            <textarea
              aria-label="Starting investment judgment"
              value={startingJudgment}
              onChange={event => setStartingJudgment(event.target.value)}
              placeholder="What do you currently believe, and why might the market be wrong?"
              rows={3}
              disabled={busy}
            />
          </label>
          <div className="wiki-company-dossier__assumptions">
            <label>
              Required annual return
              <span><input aria-label="Required annual return" type="number" min="1" max="100" step="0.5" value={requiredReturn} onChange={event => setRequiredReturn(event.target.value)} disabled={busy} />%</span>
            </label>
            <label>
              Horizon
              <span><input aria-label="Investment horizon" type="number" min="1" max="20" step="1" value={horizonYears} onChange={event => setHorizonYears(event.target.value)} disabled={busy} /> years</span>
            </label>
          </div>
          <Button type="submit" variant="secondary" disabled={busy || !ticker.trim() || startingJudgment.trim().length < 20}>
            {busy ? 'Attaching SEC filings…' : 'Create dossier'}
          </Button>
          {status ? <p className="wiki-company-dossier__status" role="status">{status}</p> : null}
          {error ? <p className="wiki-index__error" role="alert">{error}</p> : null}
        </form>
      ) : null}
    </section>
  );
};

export default WikiCompanyDossierComposer;
