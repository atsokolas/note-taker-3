import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  getJudgmentResponseThread,
  reviewObservationLineage,
  saveJudgmentResponseThread
} from '../../api/judgmentResolution';
import { normalizeSpaces } from '../../utils/editorialText';
import JudgmentObservationLineage from './JudgmentObservationLineage';

const clean = value => normalizeSpaces(value);
const choices = [
  ['keep', 'Keep'],
  ['narrow', 'Narrow'],
  ['different', 'Different'],
  ['uncertain', 'Uncertain']
];
const actions = [
  ['unchanged', 'Unchanged'],
  ['change', 'Changes'],
  ['not_reconsidered', 'Not reconsidered']
];
const blank = {
  response: '', proposedView: '', reason: '', action: '', proposedAction: '',
  returnQuestion: '', activeField: '', caretOffset: 0, version: 0
};

const DossierResearchReview = ({
  pageId, review, busy = false, error = '', expanded, onExpandedChange, onKeep, onRevise
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const routedObservation = params.get('observation') || '';
  const routedView = params.get('contextView') || 'response';
  const routedAccountId = params.get('sourceEvent') || '';
  const routeMatches = params.get('context') === 'judgment-observation'
    && String(routedObservation) === String(review?.id || '');
  const domSuffix = String(review?.id || 'observation').replace(/[^a-zA-Z0-9_-]/g, '-');
  const panelId = `judgment-research-review-panel-${domSuffix}`;
  const titleId = `judgment-research-review-title-${domSuffix}`;
  const [localContext, setLocalContext] = useState({ view: 'response', accountId: '' });
  const contextView = routeMatches && ['lineage', 'account'].includes(routedView) ? routedView : localContext.view;
  const accountId = routeMatches ? routedAccountId : localContext.accountId;
  const routeDepth = routeMatches ? Math.max(0, Number(location.state?.judgmentContextDepth) || 0) : 0;
  const [localOpen, setLocalOpen] = useState(false);
  const open = expanded === undefined ? localOpen : expanded;
  const setOpen = useCallback(next => {
    if (expanded === undefined) setLocalOpen(next);
    onExpandedChange?.(next);
  }, [expanded, onExpandedChange]);
  const [stage, setStage] = useState('write');
  const [draft, setDraft] = useState(blank);
  const [observation, setObservation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState('');
  const [lineageBusy, setLineageBusy] = useState('');
  const dirty = useRef(false);
  const editSerial = useRef(0);
  const draftRef = useRef(blank);
  const savingRef = useRef(false);
  const sectionRef = useRef(null);
  const cueRef = useRef(null);
  const closeRef = useRef(null);
  const fieldRefs = useRef({});
  const routedRef = useRef(false);
  const lineageCueRef = useRef(null);
  const returnAccountRef = useRef('');

  const contextLocation = useCallback((view, sourceEventId = '') => {
    const next = new URLSearchParams(location.search);
    next.set('context', 'judgment-observation');
    next.delete('contextTool');
    next.set('observation', review.id);
    next.set('contextView', view);
    if (sourceEventId) next.set('sourceEvent', sourceEventId);
    else next.delete('sourceEvent');
    return { pathname: location.pathname, search: next.toString(), hash: location.hash };
  }, [location.hash, location.pathname, location.search, review?.id]);

  const openContext = useCallback((view = 'response', sourceEventId = '') => {
    const depth = routeMatches ? routeDepth + 1 : 1;
    setLocalContext({ view, accountId: sourceEventId });
    setOpen(true);
    navigate(contextLocation(view, sourceEventId), {
      state: { ...location.state, judgmentContextDepth: depth }
    });
  }, [contextLocation, location.state, navigate, routeDepth, routeMatches, setOpen]);

  const clearContext = useCallback(() => {
    setLocalContext({ view: 'response', accountId: '' });
    if (routeMatches && routeDepth > 0) {
      navigate(-routeDepth);
      return;
    }
    const next = new URLSearchParams(location.search);
    ['context', 'contextTool', 'observation', 'contextView', 'sourceEvent'].forEach(key => next.delete(key));
    navigate({ pathname: location.pathname, search: next.toString(), hash: location.hash }, { replace: true });
  }, [location.hash, location.pathname, location.search, navigate, routeDepth, routeMatches]);

  const closePanel = useCallback(() => {
    clearContext();
    setOpen(false);
    window.requestAnimationFrame(() => cueRef.current?.focus({ preventScroll: true }));
  }, [clearContext, setOpen]);

  const backContext = useCallback(() => {
    if (contextView === 'account') returnAccountRef.current = accountId;
    if (contextView === 'account') setLocalContext({ view: 'lineage', accountId: '' });
    else if (contextView === 'lineage') setLocalContext({ view: 'response', accountId: '' });
    if (routeMatches && routeDepth > 1) {
      navigate(-1);
      return;
    }
    if (contextView === 'account') {
      navigate(contextLocation('lineage'), { replace: true, state: { ...location.state, judgmentContextDepth: 1 } });
      return;
    }
    if (contextView === 'lineage') {
      navigate(contextLocation('response'), { replace: true, state: { ...location.state, judgmentContextDepth: 1 } });
    }
  }, [accountId, contextLocation, contextView, location.state, navigate, routeDepth, routeMatches]);

  useEffect(() => {
    if (routeMatches) {
      routedRef.current = true;
      if (!open) setOpen(true);
      return;
    }
    if (routedRef.current) {
      routedRef.current = false;
      if (open) setOpen(false);
    }
  }, [open, routeMatches, setOpen]);

  useEffect(() => {
    if (open && contextView === 'response' && lineageCueRef.current) {
      lineageCueRef.current.focus({ preventScroll: true });
    }
  }, [contextView, open]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (!review?.id || review.status !== 'awaiting_review') return undefined;
    let cancelled = false;
    setLoading(true);
    getJudgmentResponseThread({ pageId, observationId: review.id })
      .then(result => {
        if (cancelled) return;
        setObservation(result.observation || null);
        const restored = result.draft ? { ...blank, ...result.draft } : blank;
        draftRef.current = restored;
        setDraft(restored);
      })
      .catch(failure => {
        if (!cancelled) setLocalError(failure?.response?.data?.error || 'Your response thread could not be opened.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [pageId, review?.id, review?.status]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (contextView === 'response') closePanel();
        else backContext();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.classList.add('judgment-response-open');
    const resumed = draftRef.current.version > 0
      ? fieldRefs.current[draftRef.current.activeField]
      : null;
    (resumed || closeRef.current)?.focus({ preventScroll: true });
    if (resumed?.setSelectionRange) {
      const caret = Math.min(draftRef.current.caretOffset || 0, resumed.value.length);
      resumed.setSelectionRange(caret, caret);
    }

    const mobile = window.matchMedia?.('(max-width: 640px)')?.matches;
    const background = [];
    if (mobile && sectionRef.current) {
      let branch = sectionRef.current;
      while (branch.parentElement && branch !== document.body) {
        const parent = branch.parentElement;
        for (const node of parent.children) {
          if (node !== branch) {
            background.push({
              node,
              inert: node.inert,
              ariaHidden: node.getAttribute('aria-hidden')
            });
          }
        }
        branch = parent;
      }
    }
    background.forEach(({ node }) => {
      node.inert = true;
      node.setAttribute('aria-hidden', 'true');
    });
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('judgment-response-open');
      background.forEach(({ node, inert, ariaHidden }) => {
        node.inert = inert;
        if (ariaHidden == null) node.removeAttribute('aria-hidden');
        else node.setAttribute('aria-hidden', ariaHidden);
      });
    };
  }, [backContext, closePanel, contextView, open]);

  const change = useCallback((field, value, caretOffset = 0) => {
    dirty.current = true;
    editSerial.current += 1;
    setDraft(current => {
      const next = { ...current, [field]: value, activeField: field, caretOffset };
      draftRef.current = next;
      return next;
    });
  }, []);

  const save = useCallback(async (overrides = {}) => {
    if (!review?.id || savingRef.current) return null;
    const snapshot = draftRef.current;
    const savedSerial = editSerial.current;
    savingRef.current = true;
    setSaving(true);
    setLocalError('');
    try {
      const result = await saveJudgmentResponseThread({
        pageId,
        observationId: review.id,
        expectedVersion: snapshot.version || 0,
        ...snapshot,
        ...overrides
      });
      setDraft(current => {
        const next = editSerial.current === savedSerial
          ? { ...current, ...result.draft }
          : { ...result.draft, ...current, version: result.draft.version };
        draftRef.current = next;
        return next;
      });
      setObservation(current => ({ ...current, ...result.observation }));
      dirty.current = editSerial.current !== savedSerial;
      return result.draft;
    } catch (failure) {
      const latest = failure?.response?.data?.latest;
      if (latest) {
        const restored = { ...blank, ...latest };
        draftRef.current = restored;
        setDraft(restored);
      }
      dirty.current = false;
      setLocalError(failure?.response?.data?.error || failure?.message || 'Your place could not be saved.');
      return null;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [pageId, review?.id]);

  const reviewLineage = useCallback(async (family, action) => {
    if (!family?.familyId || lineageBusy) return;
    setLineageBusy(family.familyId);
    setLocalError('');
    try {
      await reviewObservationLineage({
        familyId: family.familyId,
        expectedVersion: family.version,
        action
      });
      const result = await getJudgmentResponseThread({ pageId, observationId: review.id });
      setObservation(result.observation || null);
      if (action === 'reject' && !(result.observation?.lineage?.families || []).length) backContext();
    } catch (failure) {
      setLocalError(failure?.response?.data?.error || 'That source relationship could not be recorded.');
    } finally {
      setLineageBusy('');
    }
  }, [backContext, lineageBusy, pageId, review?.id]);

  useEffect(() => {
    if (!dirty.current || loading || saving) return undefined;
    const timer = window.setTimeout(() => save(), 650);
    return () => window.clearTimeout(timer);
  }, [draft, loading, save, saving]);

  if (!review || review.status !== 'awaiting_review') return null;
  const comparison = review.provenance?.comparison || {};
  const changes = (Array.isArray(comparison.claimChanges) ? comparison.claimChanges : []).slice(0, 3);
  const baseClaim = observation?.baseClaim || review.provenance?.judgmentAtAcceptance || '';
  const criterion = observation?.criterionSnapshot?.text || '';
  const currentTest = observation?.currentCriterion?.text || '';
  const testChanged = Boolean(criterion && currentTest && clean(criterion) !== clean(currentTest));
  const lineage = observation?.lineage || { state: 'unknown', families: [], proposals: [] };
  const acceptedFamilies = Array.isArray(lineage.families) ? lineage.families : [];
  const lineageDocuments = acceptedFamilies.reduce((total, family) => total + (Number(family.documentCount) || 0), 0);
  const lineageLabel = acceptedFamilies.length === 1 ? clean(acceptedFamilies[0].label) : '';
  const needsView = draft.response === 'narrow' || draft.response === 'different';
  const canPreview = Boolean(draft.response && (!needsView || clean(draft.proposedView)));

  const pause = async () => {
    if (!clean(draft.returnQuestion)) return;
    const saved = await save();
    if (saved) {
      setStage('write');
      closePanel();
    }
  };

  const record = async () => {
    if (!canPreview) return;
    const uncertainQuestion = draft.response === 'uncertain'
      ? draft.returnQuestion || 'What would let me decide?'
      : '';
    const saved = await save(uncertainQuestion ? { returnQuestion: uncertainQuestion } : {});
    if (!saved) return;
    if (saved.response === 'keep') {
      const resolved = await onKeep?.();
      if (!resolved) return;
      return;
    }
    if (saved.response === 'narrow' || saved.response === 'different') {
      await onRevise?.(saved.proposedView);
      closePanel();
      return;
    }
    setStage('write');
    closePanel();
  };

  return (
    <section
      ref={sectionRef}
      className={`judgment-research-review${open ? ' is-open' : ''}`}
      aria-labelledby={open ? titleId : undefined}
      role={open ? 'dialog' : undefined}
      aria-modal={open ? 'true' : undefined}
    >
      {!open ? (
        <button
          ref={cueRef}
          className="judgment-research-review__cue"
          type="button"
          aria-expanded="false"
          aria-controls={panelId}
          onClick={() => openContext('response')}
          disabled={loading}
        >
          <span>Accepted research · your view is unchanged</span>
          <strong>{draft.returnQuestion ? `Pick up: ${draft.returnQuestion}` : clean(comparison.headline) || clean(review.title)}</strong>
          <i aria-hidden="true">]</i>
        </button>
      ) : (
        <div id={panelId} className="judgment-research-review__panel">
          <header>
            <div>
              <p className="judgment-research-review__eyebrow">Observation beside your view</p>
              <h2 id={titleId}>{clean(comparison.headline) || clean(review.title)}</h2>
            </div>
            <button ref={closeRef} type="button" className="judgment-research-review__close" aria-label="Close response" onClick={closePanel}>×</button>
          </header>

          {contextView !== 'response' ? (
            <JudgmentObservationLineage
              lineage={lineage}
              mode={contextView}
              accountId={accountId}
              returnAccountId={returnAccountRef.current}
              busyFamilyId={lineageBusy}
              onBack={backContext}
              onReviewProposal={reviewLineage}
              onOpenAccount={sourceEventId => {
                returnAccountRef.current = sourceEventId;
                openContext('account', sourceEventId);
              }}
            />
          ) : stage === 'preview' ? (
            <div className="judgment-research-review__preview" aria-live="polite">
              <p className="judgment-research-review__preview-label">Nothing has changed yet</p>
              <dl>
                <div><dt>Your view</dt><dd>{baseClaim || 'No original view was retained with this observation.'}</dd></div>
                <div><dt>Your response</dt><dd>{choices.find(([key]) => key === draft.response)?.[1]}</dd></div>
                {needsView ? <div><dt>Proposed view</dt><dd>{draft.proposedView}</dd></div> : null}
                <div><dt>Action</dt><dd>{actions.find(([key]) => key === draft.action)?.[1] || 'Not answered'}</dd></div>
              </dl>
              <p>{draft.response === 'keep'
                ? 'Recording will close this observation and leave the held view unchanged.'
                : draft.response === 'uncertain'
                  ? 'Recording will keep this private thread open without changing the view or resolving the observation.'
                  : 'Recording will prepare the proposed wording for the existing judgment-change review. The held view will remain unchanged until you accept it there.'}</p>
              <div className="judgment-research-review__actions">
                <button type="button" disabled={busy || saving} onClick={record}>{busy || saving ? 'Recording…' : 'Record this response'}</button>
                <button type="button" className="is-quiet" disabled={busy || saving} onClick={() => setStage('write')}>Keep editing</button>
              </div>
            </div>
          ) : (
            <>
              <div className="judgment-research-review__beside">
                <div>
                  <span>What you held</span>
                  <blockquote>{baseClaim || 'No original view was retained with this observation.'}</blockquote>
                </div>
                <div>
                  <span>The test it met</span>
                  <blockquote>{criterion || 'No test was recorded when this observation arrived.'}</blockquote>
                </div>
                {testChanged ? (
                  <div>
                    <span>Your current test</span>
                    <blockquote>{currentTest}</blockquote>
                    <small>This observation remains tied to the earlier test.</small>
                  </div>
                ) : null}
              </div>
              {(observation?.sourceLabel || observation?.sourceEventId || lineage.state !== 'unknown') ? (
                <div className="judgment-research-review__provenance">
                  <p>
                    {observation.sourceLabel ? `Recorded from ${observation.sourceLabel}.` : 'The source label was not retained.'}
                    {observation.sourceEventId ? ' Its exact accepted source event is retained.' : ' No exact source event was retained.'}
                  </p>
                  {lineageDocuments ? (
                    <button ref={lineageCueRef} type="button" onClick={() => openContext('lineage')}>
                      {lineageDocuments} documents · {lineageLabel || (lineage.state === 'mixed' ? 'several recorded origins' : 'recorded common origin')}
                    </button>
                  ) : lineage.state === 'proposed' ? (
                    <button ref={lineageCueRef} type="button" onClick={() => openContext('lineage')}>A common origin has been proposed</button>
                  ) : (
                    <small>No common origin is recorded; independence is unknown.</small>
                  )}
                </div>
              ) : null}
              {clean(comparison.summary) ? <p>{comparison.summary}</p> : null}
              {changes.length ? (
                <ul>
                  {changes.map((item, index) => (
                    <li key={`${item.kind || 'change'}:${item.title || index}`}>
                      <strong>{clean(item.title) || 'Decision-relevant claim changed'}</strong>
                      {clean(item.detail) ? <span>{item.detail}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              <Link to={`/wiki/workspace?page=${encodeURIComponent(pageId)}#wiki-dossier-review`}>Read the accepted research</Link>

              <fieldset className="judgment-research-review__choices">
                <legend>What do you make of it?</legend>
                <div>{choices.map(([value, label]) => (
                  <button key={value} type="button" aria-pressed={draft.response === value} onClick={() => change('response', value)}>{label}</button>
                ))}</div>
              </fieldset>
              {needsView ? (
                <label>Proposed wording
                  <textarea ref={node => { fieldRefs.current.proposedView = node; }} rows={3} value={draft.proposedView} onChange={event => change('proposedView', event.target.value, event.target.selectionStart)} placeholder="Write the view you would hold instead." />
                </label>
              ) : null}
              <label>Why?
                <textarea ref={node => { fieldRefs.current.reason = node; }} rows={2} value={draft.reason} onChange={event => change('reason', event.target.value, event.target.selectionStart)} placeholder="Optional. Keep the reason in your own words." />
              </label>

              <fieldset className="judgment-research-review__choices">
                <legend>What happens to the action?</legend>
                <div>{actions.map(([value, label]) => (
                  <button key={value} type="button" aria-pressed={draft.action === value} onClick={() => change('action', value)}>{label}</button>
                ))}</div>
              </fieldset>
              {draft.action === 'change' ? (
                <label>Changed action
                  <textarea ref={node => { fieldRefs.current.proposedAction = node; }} rows={2} value={draft.proposedAction} onChange={event => change('proposedAction', event.target.value, event.target.selectionStart)} placeholder="What will you do differently?" />
                </label>
              ) : null}

              <label className="judgment-research-review__return">Pause with a question
                <input ref={node => { fieldRefs.current.returnQuestion = node; }} value={draft.returnQuestion} onChange={event => change('returnQuestion', event.target.value, event.target.selectionStart)} placeholder="What should be waiting when you return?" />
              </label>
              <div className="judgment-research-review__actions">
                <button type="button" disabled={!canPreview || busy || saving} onClick={() => setStage('preview')}>Preview response</button>
                <button type="button" className="is-quiet" disabled={!clean(draft.returnQuestion) || saving} onClick={pause}>{saving ? 'Saving…' : 'Leave this for me'}</button>
              </div>
            </>
          )}
          {saving ? <p className="judgment-research-review__saved" role="status">Saving your place…</p> : null}
          {localError || error ? <p className="judgment-research-review__error" role="alert">{localError || error}</p> : null}
        </div>
      )}
    </section>
  );
};

export default DossierResearchReview;
