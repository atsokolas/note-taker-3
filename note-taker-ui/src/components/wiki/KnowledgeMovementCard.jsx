import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { startKnowledgeMovementInvestigation } from '../../api/knowledgeMovements';
import '../../styles/knowledge-movements.css';
import { describeAffectedRest, describeConsequenceDelta } from './consequenceDelta';

const KINDS = new Set([
  'claim_changed', 'new_evidence', 'contradiction', 'question_answerable',
  'connection_formed', 'decision_due', 'outcome_due', 'outcome_reviewed'
]);
const MATERIALITY = new Set(['critical', 'major', 'supporting']);
const REVIEW_STATES = new Set(['current', 'candidate']);
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,199}$/;
const clean = value => String(value || '').trim();
const safeIdentifier = value => {
  const id = clean(value);
  return SAFE_IDENTIFIER.test(id) ? id : '';
};
const safeInternalHref = value => {
  const href = clean(value);
  return href.startsWith('/') && !href.startsWith('//') ? href : '';
};
const safeHref = value => {
  const internal = safeInternalHref(value);
  if (internal) return { href: internal, external: false };
  try {
    const parsed = new URL(clean(value));
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    return { href: parsed.href, external: true };
  } catch (_error) {
    return null;
  }
};
const optionalClaimId = value => {
  if (value === undefined || value === null || value === '') return { value: '', valid: true };
  if (typeof value !== 'string') return { value: '', valid: false };
  const id = value.trim();
  return { value: id, valid: Boolean(id && id.length <= 240) };
};
const refs = value => (Array.isArray(value) ? value.filter(Boolean) : []);
const normalizeRef = value => {
  const destination = safeHref(value?.href);
  const title = clean(value?.title);
  if (!destination || !title) return null;
  return { ...value, ...destination, title };
};
const boundedText = (value, limit) => clean(value).slice(0, limit);
const normalizeReviewedOutcome = (value, kind) => {
  if (kind !== 'outcome_reviewed' || !value || typeof value !== 'object') return null;
  const result = boundedText(value.result, 40);
  const calibrationNote = boundedText(value.calibrationNote, 1200);
  const lesson = boundedText(value.lesson, 1200);
  if (!result || result === 'unknown' || !calibrationNote || !lesson) return null;
  const processScore = Number(value.processScore);
  return {
    result,
    summary: boundedText(value.summary, 800),
    processScore: Number.isFinite(processScore) ? processScore : null,
    calibrationNote,
    lesson,
    observedAt: boundedText(value.observedAt, 80),
    reviewedAt: boundedText(value.reviewedAt, 80)
  };
};

export const normalizeKnowledgeMovement = value => {
  if (!value || typeof value !== 'object') return null;
  const id = clean(value.id);
  const kind = clean(value.kind);
  const title = clean(value.title);
  const whyItMatters = clean(value.whyItMatters);
  const subjectDestination = safeHref(value.subject?.href);
  if (!id || !KINDS.has(kind) || !title || !whyItMatters || !subjectDestination) return null;
  const nextHref = safeInternalHref(value.nextAction?.href);
  const requestedIntent = clean(value.nextAction?.intent);
  const wikiPageId = clean(value.nextAction?.wikiPageId);
  const revisionId = clean(value.nextAction?.revisionId);
  const claimId = optionalClaimId(value.nextAction?.claimId);
  const decisionId = safeIdentifier(value.nextAction?.decisionId);
  const intent = requestedIntent === 'start_investigation'
    && OBJECT_ID_PATTERN.test(wikiPageId)
    && OBJECT_ID_PATTERN.test(revisionId)
    && claimId.valid
    ? requestedIntent
    : requestedIntent === 'review_decision' && wikiPageId && decisionId
      ? requestedIntent
      : requestedIntent === 'investigate_movement'
        ? requestedIntent
        : '';
  return {
    ...value,
    id,
    kind,
    title,
    whyItMatters,
    materiality: MATERIALITY.has(value.materiality) ? value.materiality : 'supporting',
    reviewState: REVIEW_STATES.has(value.reviewState) ? value.reviewState : 'candidate',
    subject: { ...value.subject, ...subjectDestination },
    subjects: refs(value.subjects).map(normalizeRef).filter(Boolean),
    evidence: refs(value.evidence).map(normalizeRef).filter(Boolean),
    affected: refs(value.affected).map(normalizeRef).filter(Boolean),
    unresolved: refs(value.unresolved).map(normalizeRef).filter(Boolean),
    nextAction: nextHref && clean(value.nextAction?.label)
      ? {
          ...value.nextAction,
          href: nextHref,
          label: clean(value.nextAction.label),
          intent,
          wikiPageId: intent === 'start_investigation' || intent === 'review_decision' ? wikiPageId : '',
          revisionId: intent === 'start_investigation' ? revisionId : '',
          claimId: intent === 'start_investigation' ? claimId.value : '',
          decisionId: intent === 'review_decision' ? decisionId : ''
        }
      : null,
    reviewedOutcome: normalizeReviewedOutcome(value.reviewedOutcome, kind),
    facts: refs(value.provenance?.deterministicFacts).map(clean).filter(Boolean)
  };
};

const kindLabel = kind => ({
  contradiction: 'Contradiction',
  claim_changed: 'Accepted change',
  new_evidence: 'New evidence',
  question_answerable: 'Question evidence',
  connection_formed: 'Connection formed',
  decision_due: 'Decision review',
  outcome_due: 'Outcome review',
  outcome_reviewed: 'Outcome retained'
}[kind] || 'Movement');

const countLabel = (count, singular, plural = `${singular}s`) => (
  `${count} ${count === 1 ? singular : plural}`
);

const KnowledgeRefList = ({ label, items }) => {
  if (!items.length) return null;
  return (
    <div className="knowledge-movement__ref-group">
      <p>{label}</p>
      <ul>
        {items.map(item => (
          <li key={`${item.type || 'ref'}:${item.id || item.href}`}>
            {item.external
              ? <a href={item.href} target="_blank" rel="noreferrer">{item.title}</a>
              : <Link to={item.href}>{item.title}</Link>}
          </li>
        ))}
      </ul>
    </div>
  );
};

/* The delta, above the fold and in the order the reader needs it: what
   changed, what it touches of theirs, and what is being asked. The lead card
   sends one restrained thread down the affected list — the Consequence
   Ripple — so the eye follows the change into the beliefs it reached. */
const ConsequenceDelta = ({ delta, dominant = false }) => {
  if (!delta.affects.length && !delta.asks) return null;
  const rest = describeAffectedRest(delta.affectedRest);
  return (
    <div className={`knowledge-movement__delta${dominant ? ' is-rippling' : ''}`}>
      {delta.affects.length ? (
        <div className="knowledge-movement__affects">
          <p className="knowledge-movement__delta-label">What it affects</p>
          <ul>
            {delta.affects.map(ref => (
              <li key={ref.id}>
                {ref.external
                  ? <a href={ref.href} target="_blank" rel="noreferrer">{ref.title}</a>
                  : <Link to={ref.href}>{ref.title}</Link>}
              </li>
            ))}
            {rest ? <li className="knowledge-movement__affects-rest">{rest}</li> : null}
          </ul>
        </div>
      ) : null}
      {delta.asks ? (
        <div className="knowledge-movement__asks">
          <p className="knowledge-movement__delta-label">What I need from you</p>
          <p className="knowledge-movement__asks-line">{delta.asks}</p>
        </div>
      ) : null}
    </div>
  );
};

const KnowledgeMovementCard = ({ movement, dominant = false }) => {
  const item = normalizeKnowledgeMovement(movement);
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');
  if (!item) return null;

  const shouldStartInvestigation = item.nextAction?.intent === 'start_investigation';
  const isDecisionReview = item.kind === 'decision_due'
    || item.kind === 'outcome_due'
    || item.nextAction?.intent === 'review_decision';
  const handleNextAction = async event => {
    if (isDecisionReview) {
      // Navigate via the supplied href. Never imply an outcome was inferred.
      return;
    }
    if (!shouldStartInvestigation || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (starting) return;
    setStarting(true);
    setStartError('');
    try {
      const response = await startKnowledgeMovementInvestigation({
        wikiPageId: item.nextAction.wikiPageId,
        revisionId: item.nextAction.revisionId,
        claimId: item.nextAction.claimId
      });
      const destination = safeInternalHref(response?.concept?.href);
      if (!destination) throw new Error('The investigation did not return a safe destination.');
      navigate(destination);
    } catch (_error) {
      setStartError('We could not start this investigation. Try again, or open the Wiki page.');
    } finally {
      setStarting(false);
    }
  };

  return (
    <article
      className={`knowledge-movement${dominant ? ' knowledge-movement--dominant' : ''}`}
      data-materiality={item.materiality}
      data-kind={item.kind}
    >
      <div className="knowledge-movement__register">
        <span>{kindLabel(item.kind)}</span>
        <span>{item.materiality}</span>
        <span>{item.reviewState === 'candidate' ? 'Review required' : 'Current Wiki'}</span>
      </div>
      <h3>
        {item.subject.external
          ? <a href={item.subject.href} target="_blank" rel="noreferrer">{item.title}</a>
          : <Link to={item.subject.href}>{item.title}</Link>}
      </h3>
      <p className="knowledge-movement__why">{item.whyItMatters}</p>
      <ConsequenceDelta delta={describeConsequenceDelta(item)} dominant={dominant} />
      {item.reviewedOutcome ? (
        <section className="knowledge-movement__reviewed-outcome" aria-label="Reviewed outcome">
          <p className="knowledge-movement__outcome-question">Did the judgment hold?</p>
          <div className="knowledge-movement__outcome-result">
            <span>Observed result</span>
            <strong>{item.reviewedOutcome.result}</strong>
            {item.reviewedOutcome.summary ? <p>{item.reviewedOutcome.summary}</p> : null}
          </div>
          <div className="knowledge-movement__outcome-calibration">
            <span>Calibration</span>
            <p>{item.reviewedOutcome.calibrationNote}</p>
          </div>
          <div className="knowledge-movement__outcome-lesson">
            <span>Retained lesson</span>
            <p>{item.reviewedOutcome.lesson}</p>
          </div>
        </section>
      ) : null}
      {isDecisionReview ? (
        <p className="knowledge-movement__why knowledge-movement__why--decision" role="note">
          Review the decision you set. Noeis has not inferred an outcome.
        </p>
      ) : null}
      {/* The affected count moved into the delta above, which names them
          instead. What stays here is what the delta does not say. */}
      <div className="knowledge-movement__counts" aria-label="Movement scope">
        <span>{countLabel(item.evidence.length, 'evidence source')}</span>
        {item.unresolved.length ? <span>{countLabel(item.unresolved.length, 'unresolved item')}</span> : null}
      </div>
      <div className="knowledge-movement__footer">
        {item.nextAction ? (
          <Link
            className="knowledge-movement__action"
            to={item.nextAction.href}
            onClick={handleNextAction}
            aria-disabled={starting || undefined}
          >
            {starting
              ? 'Starting investigation…'
              : (isDecisionReview ? (item.nextAction.label || 'Review decision') : item.nextAction.label)}
            {' '}
            <span aria-hidden="true">→</span>
          </Link>
        ) : null}
        {startError ? <p className="knowledge-movement__action-error" role="status">{startError}</p> : null}
        {item.facts.length || item.evidence.length || item.unresolved.length ? (
          <details className="knowledge-movement__facts">
            <summary>Sources and provenance</summary>
            {/* What a change affected is consequence, not provenance, and it
                is named above the fold now. This disclosure keeps what the
                delta does not say: where the change came from, and what it
                left open. */}
            <KnowledgeRefList label="Evidence" items={item.evidence} />
            <KnowledgeRefList label="Unresolved" items={item.unresolved} />
            {item.facts.length ? (
              <div className="knowledge-movement__ref-group">
                <p>Deterministic facts</p>
                <ul>
                  {item.facts.map(fact => <li key={fact}>{fact}</li>)}
                </ul>
              </div>
            ) : null}
          </details>
        ) : null}
      </div>
    </article>
  );
};

export const KnowledgeMovementLead = ({
  movements = [],
  loading = false,
  error = '',
  onRetry
}) => {
  const items = movements.map(normalizeKnowledgeMovement).filter(Boolean);
  const reviewedIndex = items.findIndex(item => item.kind === 'outcome_reviewed' && item.reviewedOutcome);
  const prioritized = reviewedIndex > 0
    ? [items[reviewedIndex], ...items.slice(0, reviewedIndex), ...items.slice(reviewedIndex + 1)]
    : items;
  const [lead, ...supporting] = prioritized;
  const consequentialCount = items.filter(item => (
    item.kind === 'contradiction'
    || item.kind === 'claim_changed'
    || item.kind === 'decision_due'
    || item.kind === 'outcome_due'
    || ['critical', 'major'].includes(item.materiality)
  )).length;

  return (
    <section
      className={`knowledge-movements${lead ? ' knowledge-movements--active' : ''}`}
      aria-labelledby="knowledge-movements-title"
      aria-busy={loading || undefined}
    >
      <div className="knowledge-movements__heading">
        <p className="wiki-index__eyebrow">What changed</p>
        <h2 id="knowledge-movements-title">
          {loading
            ? 'Checking what may change your understanding.'
            : lead
              ? lead.kind === 'outcome_reviewed' && lead.reviewedOutcome
                ? 'A judgment returned with evidence.'
                : consequentialCount > 0
                ? `${consequentialCount === 1 ? 'One consequential update' : `${consequentialCount} consequential updates`} ${consequentialCount === 1 ? 'needs' : 'need'} attention.`
                : 'Recent evidence was connected to your Wiki.'
              : 'Nothing material changed since your last review.'}
        </h2>
      </div>

      {error ? (
        <div className="knowledge-movements__error" role="status">
          <p>We could not check for consequential changes. Your Wiki is still available below.</p>
          {onRetry ? <button type="button" onClick={onRetry}>Try again</button> : null}
        </div>
      ) : null}

      {!error && lead ? (
        <ol className="knowledge-movements__list">
          <li><KnowledgeMovementCard movement={lead} dominant /></li>
          {supporting.map(item => (
            <li key={item.id}><KnowledgeMovementCard movement={item} /></li>
          ))}
        </ol>
      ) : null}

      {!loading && !error && !lead ? (
        <p className="knowledge-movements__quiet">
          No accepted claim, material contradiction, reviewed evidence, or due decision moved.
        </p>
      ) : null}
    </section>
  );
};

export default KnowledgeMovementCard;
