import React, { useEffect, useState } from 'react';
import {
  adoptWikiCurrentResearchHead,
  getWikiFirstHeadCandidate,
  reviewWikiFirstHeadCandidate
} from '../../api/wiki';
import { useSystemStatusControls } from '../../system/SystemStatusContext';
import { Button } from '../ui';
import renderTiptapDoc from './renderTiptapDoc';
import '../../styles/wiki-first-head-review.css';

const WikiFirstHeadReview = ({ page, pageId, onPageUpdate }) => {
  const systemStatus = useSystemStatusControls();
  const firstHeadAwaiting = page?.aiState?.candidateStatus === 'awaiting_first_head_acceptance';
  const maintenanceAwaiting = page?.aiState?.candidateStatus === 'awaiting_maintenance_acceptance';
  const awaiting = firstHeadAwaiting || maintenanceAwaiting;
  const accepted = page?.investmentDossier?.firstHead?.status === 'accepted';
  const legacyHeadAvailable = Boolean(
    page?.investmentDossier?.version
    && !accepted
    && !awaiting
    && Number(page?.wordCount || 0) > 0
    && Number(page?.sourceCount || 0) > 0
    && Number(page?.claimCount || 0) > 0
  );
  const hasOwnerJudgment = Boolean(String(page?.judgment?.currentJudgment || '').trim());
  const [candidate, setCandidate] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!awaiting || !pageId) {
      setCandidate(null);
      return undefined;
    }
    setError('');
    getWikiFirstHeadCandidate(pageId)
      .then(result => {
        if (!cancelled) setCandidate(result);
      })
      .catch(requestError => {
        if (!cancelled) setError(requestError?.response?.data?.error || requestError?.message || 'Could not load the research candidate.');
      });
    return () => { cancelled = true; };
  }, [awaiting, pageId]);

  const adoptCurrentHead = async () => {
    if (busy || !confirmed || !hasOwnerJudgment) return;
    setBusy('adopt');
    setError('');
    systemStatus.clearRecoverableFailure?.();
    systemStatus.setBackgroundWork?.({
      label: 'Trusted research head',
      stage: 'Adopting reviewed article'
    });
    try {
      const result = await adoptWikiCurrentResearchHead(pageId);
      if (result?.page) onPageUpdate?.(result.page);
      systemStatus.setLatestReceipt?.({
        title: result?.receipt?.title || 'Current trusted head adopted',
        summary: result?.receipt?.summary || '',
        status: 'completed',
        href: `/wiki/workspace?page=${encodeURIComponent(pageId)}`
      });
    } catch (requestError) {
      const message = requestError?.response?.data?.error || requestError?.message || 'Could not adopt the current research head.';
      setError(message);
      systemStatus.setRecoverableFailure?.({
        stage: 'Trusted research head',
        message,
        retryable: true
      });
    } finally {
      setBusy('');
      systemStatus.setBackgroundWork?.(null);
    }
  };

  if (!awaiting) {
    if (accepted) return (
      <section className="wiki-first-head is-accepted" aria-label="First trusted head">
        <p className="wiki-first-head__eyebrow">Research head</p>
        <p><strong>Owner accepted.</strong> Future evidence creates reviewable maintenance candidates.</p>
      </section>
    );
    if (!legacyHeadAvailable) return null;
    return (
      <section className="wiki-first-head is-adoption" aria-labelledby="wiki-legacy-head-title">
        <p className="wiki-first-head__eyebrow">Legacy research head</p>
        <h2 id="wiki-legacy-head-title">Adopt this exact article as the trusted head</h2>
        <p>
          This dossier predates explicit first-head acceptance. Adoption records your approval of the current private
          article without changing its claims, sources, valuation, or evidence clock.
        </p>
        <dl className="wiki-first-head__facts">
          <div><dt>Words</dt><dd>{Number(page?.wordCount || 0).toLocaleString()}</dd></div>
          <div><dt>Claims</dt><dd>{Number(page?.claimCount || 0).toLocaleString()}</dd></div>
          <div><dt>Sources</dt><dd>{Number(page?.sourceCount || 0).toLocaleString()}</dd></div>
        </dl>
        {hasOwnerJudgment ? (
          <>
            <label className="wiki-first-head__confirmation">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={event => setConfirmed(event.target.checked)}
                disabled={Boolean(busy)}
              />
              I reviewed this exact article and want it to become the trusted private research head.
            </label>
            <div className="wiki-first-head__actions">
              <Button type="button" onClick={adoptCurrentHead} disabled={!confirmed || Boolean(busy)}>
                {busy === 'adopt' ? 'Adopting…' : 'Adopt current head'}
              </Button>
            </div>
          </>
        ) : (
          <p className="wiki-first-head__error" role="status">
            Record your actual current judgment in the Decision record below before adopting this research head.
          </p>
        )}
        {error ? <p className="wiki-first-head__error" role="alert">{error}</p> : null}
      </section>
    );
  }

  const reviewKind = candidate?.kind || (firstHeadAwaiting ? 'first_head' : 'maintenance');
  const firstHeadReview = reviewKind === 'first_head';
  const summary = candidate?.summary
    || (firstHeadReview ? page?.aiState?.firstHeadCandidateSummary : page?.aiState?.maintenanceCandidateSummary)
    || {};
  const candidatePage = candidate?.candidate || null;

  const decide = async (decision) => {
    if (busy || (decision === 'accept' && !confirmed)) return;
    setBusy(decision);
    setError('');
    systemStatus.clearRecoverableFailure?.();
    systemStatus.setBackgroundWork?.({
      label: 'First trusted head',
      stage: decision === 'accept' ? 'Accepting reviewed research' : 'Rejecting candidate'
    });
    try {
      const result = await reviewWikiFirstHeadCandidate(pageId, decision);
      if (result?.page) onPageUpdate?.(result.page);
      systemStatus.setLatestReceipt?.({
        title: result?.receipt?.title || (decision === 'accept' ? 'First trusted head accepted.' : 'Research candidate rejected.'),
        summary: result?.receipt?.summary || '',
        status: decision === 'accept' ? 'completed' : 'needs_review',
        href: `/wiki/workspace?page=${encodeURIComponent(pageId)}`
      });
    } catch (requestError) {
      const message = requestError?.response?.data?.error || requestError?.message || 'Could not record the first-head decision.';
      setError(message);
      systemStatus.setRecoverableFailure?.({
        stage: 'First trusted head',
        message,
        retryable: true
      });
    } finally {
      setBusy('');
      systemStatus.setBackgroundWork?.(null);
    }
  };

  return (
    <section className="wiki-first-head is-review" aria-labelledby="wiki-first-head-title">
      <div className="wiki-first-head__heading">
        <div>
          <p className="wiki-first-head__eyebrow">Owner acceptance required</p>
          <h2 id="wiki-first-head-title">
            {firstHeadReview ? 'Review the first trusted head' : 'Review the maintenance candidate'}
          </h2>
        </div>
        <span>Private candidate</span>
      </div>
      <p>
        The generated research has not replaced your trusted private page. Read the candidate, then explicitly accept or reject it.
      </p>
      <dl className="wiki-first-head__facts">
        <div><dt>Words</dt><dd>{Number(summary.wordCount || 0).toLocaleString()}</dd></div>
        <div><dt>Claims</dt><dd>{Number(summary.claimCount || 0).toLocaleString()}</dd></div>
        <div><dt>Sources</dt><dd>{Number(summary.sourceCount || 0).toLocaleString()}</dd></div>
      </dl>
      <details className="wiki-first-head__preview" open>
        <summary>Read candidate article</summary>
        {candidatePage?.body ? (
          <article>{renderTiptapDoc(candidatePage.body)}</article>
        ) : (
          <p>{error || 'Loading the candidate…'}</p>
        )}
      </details>
      <label className="wiki-first-head__confirmation">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={event => setConfirmed(event.target.checked)}
          disabled={Boolean(busy)}
        />
        I reviewed this exact candidate and want it to become the trusted private research head.
      </label>
      <div className="wiki-first-head__actions">
        <Button type="button" onClick={() => decide('accept')} disabled={!confirmed || Boolean(busy)}>
          {busy === 'accept' ? 'Accepting…' : firstHeadReview ? 'Accept trusted head' : 'Accept maintenance'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => decide('reject')} disabled={Boolean(busy)}>
          {busy === 'reject' ? 'Rejecting…' : 'Reject draft'}
        </Button>
      </div>
      {error ? <p className="wiki-first-head__error" role="alert">{error}</p> : null}
    </section>
  );
};

export default WikiFirstHeadReview;
