import React, { useEffect, useMemo, useState } from 'react';
import {
  restoreInitialWikiJudgment,
  saveInitialWikiJudgment,
  updateWikiPage
} from '../../api/wiki';
import { useSystemStatusControls } from '../../system/SystemStatusContext';

const clone = value => JSON.parse(JSON.stringify(value || {}));
const labelFor = value => String(value || '').replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
const dateInput = value => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};
const dateLabel = (value, fallback) => {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};
const confidenceLabel = value => (value == null || value === '' ? 'Not set' : `${Math.round(Number(value) * 100)}%`);

const emptyItem = kind => ({
  ...(kind === 'assumptions' ? { text: '', status: 'unreviewed', confidence: null } : {}),
  ...(kind === 'unknowns' ? { question: '', priority: 'medium', status: 'open', answer: '' } : {}),
  ...(kind === 'falsifiers' ? { text: '', observableSignal: '', status: 'unobserved' } : {}),
  ...(kind === 'decisions' ? {
    summary: '', decisionType: 'research', status: 'planned', rationale: '', expectedOutcome: '', horizon: '', reviewAt: null, createdBy: 'user'
  } : {}),
  _draftKey: `${kind}-${Date.now()}-${Math.random()}`
});

const ReadList = ({ title, items, empty, renderItem }) => (
  <details className="wiki-thesis__ledger-section">
    <summary>{title}<span>{items.length}</span></summary>
    {items.length ? <ul>{items.map((item, index) => <li key={item.assumptionId || item.unknownId || item.falsifierId || item.decisionId || index}>{renderItem(item)}</li>)}</ul> : <p>{empty}</p>}
  </details>
);

const Field = ({ label, children }) => <label className="wiki-thesis__field"><span>{label}</span>{children}</label>;

const WikiLivingThesis = ({ page, pageId, onPageUpdate }) => {
  const systemStatus = useSystemStatusControls();
  const judgment = page?.judgment;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => clone(judgment));
  const [claimDrafts, setClaimDrafts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setDraft(clone(judgment));
    setClaimDrafts((page?.claims || []).map(claim => ({
      claimId: claim.claimId,
      epistemicStatus: claim.epistemicStatus || 'plausible_hypothesis',
      materiality: claim.materiality || 'supporting',
      implication: claim.implication || '',
      falsifierIds: claim.falsifierIds || []
    })));
  }, [judgment, page?.claims]);

  const claimsById = useMemo(() => new Map((page?.claims || []).map(claim => [claim.claimId, claim])), [page?.claims]);
  if (!judgment?.kind) return null;

  const setValue = (field, value) => setDraft(current => ({ ...current, [field]: value }));
  const setCausalSummary = value => setDraft(current => ({
    ...current,
    causalModel: { summary: value, nodes: [], edges: [] }
  }));
  const addItem = kind => setDraft(current => ({ ...current, [kind]: [...(current[kind] || []), emptyItem(kind)] }));
  const changeItem = (kind, index, field, value) => setDraft(current => ({
    ...current,
    [kind]: (current[kind] || []).map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item))
  }));
  const removeItem = (kind, index) => setDraft(current => ({
    ...current,
    [kind]: (current[kind] || []).filter((_item, itemIndex) => itemIndex !== index)
  }));
  const changeClaim = (index, field, value) => setClaimDrafts(current => current.map((item, itemIndex) => (
    itemIndex === index ? { ...item, [field]: value } : item
  )));

  const cleanDraft = () => {
    const next = clone(draft);
    next.causalModel = { summary: next.causalModel?.summary || '', nodes: [], edges: [] };
    ['assumptions', 'unknowns', 'falsifiers', 'decisions'].forEach((kind) => {
      next[kind] = (next[kind] || []).map(({ _draftKey, ...item }) => item);
    });
    return next;
  };

  const save = async () => {
    setBusy(true); setError(''); setStatus('');
    systemStatus.setBackgroundWork({ label: 'Living thesis', stage: 'Saving judgment contract' });
    try {
      const updated = await updateWikiPage(pageId, { judgment: cleanDraft(), claimUpdates: claimDrafts });
      onPageUpdate?.(updated);
      setEditing(false);
      setStatus('Living thesis saved.');
      systemStatus.setLatestReceipt({ title: 'Living thesis saved', summary: 'Judgment and ledger metadata were preserved.', status: 'completed', href: `/wiki/workspace?page=${encodeURIComponent(pageId)}` });
    } catch (saveError) {
      const message = saveError?.response?.data?.error || 'Could not save the living thesis.';
      setError(message);
      systemStatus.setRecoverableFailure({ stage: 'Living thesis', message, retryable: true, retry: save });
    } finally {
      systemStatus.setBackgroundWork(null); setBusy(false);
    }
  };

  const saveInitial = async () => {
    if (!window.confirm('Preserve this as the starting belief? This creates the immutable day-zero snapshot; it does not prove the thesis.')) return;
    setBusy(true); setError(''); setStatus('');
    systemStatus.setBackgroundWork({ label: 'Living thesis', stage: 'Preserving starting belief' });
    try {
      const result = await saveInitialWikiJudgment(pageId);
      onPageUpdate?.(result.page);
      setStatus('Initial judgment saved. The starting belief is preserved; the thesis is not proven.');
      systemStatus.setLatestReceipt({ title: 'Initial judgment saved', summary: 'Day-zero belief preserved without implying proof.', status: 'completed', href: `/wiki/workspace?page=${encodeURIComponent(pageId)}` });
    } catch (snapshotError) {
      const message = snapshotError?.response?.data?.error || 'Could not preserve the initial judgment.';
      setError(message);
      systemStatus.setRecoverableFailure({ stage: 'Initial judgment', message, retryable: true, retry: saveInitial });
    } finally {
      systemStatus.setBackgroundWork(null); setBusy(false);
    }
  };

  const restoreInitial = async () => {
    if (!window.confirm('Restore the entire thesis contract to the preserved day-zero snapshot? A new revision will record this restore.')) return;
    setBusy(true); setError(''); setStatus('');
    try {
      const result = await restoreInitialWikiJudgment(pageId);
      onPageUpdate?.(result.page);
      setStatus('Initial judgment restored and recorded in revision history.');
    } catch (restoreError) {
      setError(restoreError?.response?.data?.error || 'Could not restore the initial judgment.');
    } finally { setBusy(false); }
  };

  return (
    <section className="wiki-thesis" aria-label="Living thesis contract">
      <div className="wiki-thesis__heading">
        <div><p>Living thesis</p><h2>{judgment.governingQuestion || 'No governing question recorded'}</h2></div>
        <button type="button" onClick={() => setEditing(current => !current)} disabled={busy}>{editing ? 'Close editor' : 'Edit thesis'}</button>
      </div>
      <div className="wiki-thesis__judgment">
        <span>Current judgment</span>
        <p>{judgment.currentJudgment || 'No current judgment recorded.'}</p>
      </div>
      <dl className="wiki-thesis__facts">
        <div><dt>Confidence</dt><dd>{confidenceLabel(judgment.confidence)}</dd></div>
        <div><dt>Status</dt><dd>{labelFor(judgment.status || 'framing')}</dd></div>
        <div><dt>Posture</dt><dd>{labelFor(judgment.decisionPosture || 'investigate')}</dd></div>
        <div><dt>Last reviewed</dt><dd>{dateLabel(judgment.lastReviewedAt, 'Not reviewed yet')}</dd></div>
        <div><dt>Next review</dt><dd>{dateLabel(judgment.nextReviewAt, judgment.nextReviewTrigger || 'Not scheduled')}</dd></div>
      </dl>
      <p className="wiki-thesis__causal"><strong>Causal model</strong>{judgment.causalModel?.summary || 'No causal model recorded.'}</p>

      {editing ? (
        <div className="wiki-thesis__editor">
          <div className="wiki-thesis__form-grid">
            <Field label="Governing question"><textarea value={draft.governingQuestion || ''} onChange={event => setValue('governingQuestion', event.target.value)} /></Field>
            <Field label="Current judgment"><textarea value={draft.currentJudgment || ''} onChange={event => setValue('currentJudgment', event.target.value)} /></Field>
            <Field label="Confidence (0–1)"><input type="number" min="0" max="1" step="0.01" value={draft.confidence ?? ''} onChange={event => setValue('confidence', event.target.value === '' ? null : Number(event.target.value))} /></Field>
            <Field label="Status"><select value={draft.status || 'framing'} onChange={event => setValue('status', event.target.value)}>{['framing', 'researching', 'challenged', 'decision_ready', 'monitoring', 'closed', 'archived'].map(value => <option key={value} value={value}>{labelFor(value)}</option>)}</select></Field>
            <Field label="Decision posture"><select value={draft.decisionPosture || 'investigate'} onChange={event => setValue('decisionPosture', event.target.value)}>{['investigate', 'watch', 'act', 'avoid', 'no_action', 'closed'].map(value => <option key={value} value={value}>{labelFor(value)}</option>)}</select></Field>
            <Field label="Next review"><input type="date" value={dateInput(draft.nextReviewAt)} onChange={event => setValue('nextReviewAt', event.target.value || null)} /></Field>
            <Field label="Next review trigger"><input value={draft.nextReviewTrigger || ''} onChange={event => setValue('nextReviewTrigger', event.target.value)} /></Field>
            <Field label="Strongest counterargument"><textarea value={draft.strongestCounterargument || ''} onChange={event => setValue('strongestCounterargument', event.target.value)} /></Field>
            <Field label="Causal model summary"><textarea value={draft.causalModel?.summary || ''} onChange={event => setCausalSummary(event.target.value)} /><small>Graph nodes and edges are reserved for a later structure informed by observed thesis friction.</small></Field>
          </div>

          {['assumptions', 'unknowns', 'falsifiers', 'decisions'].map(kind => (
            <details className="wiki-thesis__edit-list" key={kind} open>
              <summary>{labelFor(kind)}<span>{(draft[kind] || []).length}</span></summary>
              {(draft[kind] || []).map((item, index) => (
                <div className="wiki-thesis__edit-row" key={item.assumptionId || item.unknownId || item.falsifierId || item.decisionId || item._draftKey || index}>
                  {kind === 'assumptions' ? <>
                    <Field label="Assumption"><input value={item.text || ''} onChange={event => changeItem(kind, index, 'text', event.target.value)} /></Field>
                    <Field label="Status"><select value={item.status || 'unreviewed'} onChange={event => changeItem(kind, index, 'status', event.target.value)}>{['unreviewed', 'holds', 'weakened', 'failed'].map(value => <option key={value} value={value}>{labelFor(value)}</option>)}</select></Field>
                  </> : null}
                  {kind === 'unknowns' ? <>
                    <Field label="Question"><input value={item.question || ''} onChange={event => changeItem(kind, index, 'question', event.target.value)} /></Field>
                    <Field label="Priority"><select value={item.priority || 'medium'} onChange={event => changeItem(kind, index, 'priority', event.target.value)}>{['critical', 'high', 'medium', 'low'].map(value => <option key={value} value={value}>{labelFor(value)}</option>)}</select></Field>
                    <Field label="Status"><select value={item.status || 'open'} onChange={event => changeItem(kind, index, 'status', event.target.value)}>{['open', 'researching', 'answered', 'deferred'].map(value => <option key={value} value={value}>{labelFor(value)}</option>)}</select></Field>
                    <Field label="Answer"><input value={item.answer || ''} onChange={event => changeItem(kind, index, 'answer', event.target.value)} /></Field>
                  </> : null}
                  {kind === 'falsifiers' ? <>
                    <Field label="Falsifier"><input value={item.text || ''} onChange={event => changeItem(kind, index, 'text', event.target.value)} /></Field>
                    <Field label="Observable signal"><input value={item.observableSignal || ''} onChange={event => changeItem(kind, index, 'observableSignal', event.target.value)} /></Field>
                    <Field label="Status"><select value={item.status || 'unobserved'} onChange={event => changeItem(kind, index, 'status', event.target.value)}>{['unobserved', 'warning', 'triggered', 'retired'].map(value => <option key={value} value={value}>{labelFor(value)}</option>)}</select></Field>
                  </> : null}
                  {kind === 'decisions' ? <>
                    <Field label="Decision record"><input value={item.summary || ''} onChange={event => changeItem(kind, index, 'summary', event.target.value)} /></Field>
                    <Field label="Type"><select value={item.decisionType || 'research'} onChange={event => changeItem(kind, index, 'decisionType', event.target.value)}>{['research', 'outreach', 'product', 'operating', 'investment', 'no_action', 'close'].map(value => <option key={value} value={value}>{labelFor(value)}</option>)}</select></Field>
                    <Field label="Rationale"><textarea value={item.rationale || ''} onChange={event => changeItem(kind, index, 'rationale', event.target.value)} /></Field>
                    <Field label="Expected outcome"><textarea value={item.expectedOutcome || ''} onChange={event => changeItem(kind, index, 'expectedOutcome', event.target.value)} /></Field>
                    <Field label="Horizon"><input value={item.horizon || ''} onChange={event => changeItem(kind, index, 'horizon', event.target.value)} /></Field>
                    <Field label="Review date"><input type="date" value={dateInput(item.reviewAt)} onChange={event => changeItem(kind, index, 'reviewAt', event.target.value || null)} /></Field>
                    <small>Records a decision; performs no external action.</small>
                  </> : null}
                  <button type="button" className="wiki-thesis__remove" onClick={() => removeItem(kind, index)}>Remove</button>
                </div>
              ))}
              <button type="button" onClick={() => addItem(kind)}>Add {kind.slice(0, -1)}</button>
            </details>
          ))}

          <details className="wiki-thesis__edit-list" open>
            <summary>Claims ledger<span>{claimDrafts.length}</span></summary>
            {claimDrafts.length ? claimDrafts.map((item, index) => {
              const claim = claimsById.get(item.claimId) || {};
              const inconsistent = item.epistemicStatus === 'established_fact' && ['unsupported', 'conflicted'].includes(claim.support);
              return <div className="wiki-thesis__edit-row" key={item.claimId}>
                <p><strong>{claim.text || item.claimId}</strong><small>Evidence support: {labelFor(claim.support || 'unsupported')}</small></p>
                {inconsistent ? <p className="wiki-thesis__warning">Established fact is inconsistent with current evidence support.</p> : null}
                <Field label="Epistemic status"><select value={item.epistemicStatus} onChange={event => changeClaim(index, 'epistemicStatus', event.target.value)}>{['established_fact', 'supported_interpretation', 'plausible_hypothesis', 'speculation', 'rejected'].map(value => <option key={value} value={value}>{labelFor(value)}</option>)}</select></Field>
                <Field label="Materiality"><select value={item.materiality} onChange={event => changeClaim(index, 'materiality', event.target.value)}>{['critical', 'major', 'supporting', 'context'].map(value => <option key={value} value={value}>{labelFor(value)}</option>)}</select></Field>
                <Field label="Implication"><input value={item.implication || ''} onChange={event => changeClaim(index, 'implication', event.target.value)} /></Field>
              </div>;
            }) : <p>No claims recorded yet.</p>}
          </details>
          <div className="wiki-thesis__actions"><button type="button" onClick={save} disabled={busy}>Save thesis contract</button><button type="button" onClick={() => setEditing(false)} disabled={busy}>Cancel</button></div>
        </div>
      ) : null}

      <div className="wiki-thesis__ledger" aria-label="Thesis ledger">
        <ReadList title="Assumptions" items={judgment.assumptions || []} empty="No critical assumptions recorded." renderItem={item => <><strong>{item.text}</strong><small>{labelFor(item.status)}</small></>} />
        <ReadList title="Unknowns" items={judgment.unknowns || []} empty="No unknowns recorded." renderItem={item => <><strong>{item.question}</strong><small>{labelFor(item.priority)} · {labelFor(item.status)}</small></>} />
        <ReadList title="Falsifiers" items={judgment.falsifiers || []} empty="No falsifiers recorded." renderItem={item => <><strong>{item.text}</strong><small>{item.observableSignal || labelFor(item.status)}</small></>} />
        <ReadList title="Decisions" items={judgment.decisions || []} empty="No action or explicit no-action decision recorded." renderItem={item => <><strong>{item.summary}</strong><small>{labelFor(item.decisionType)} · {labelFor(item.status)} · record only</small></>} />
        <ReadList title="Claims" items={page.claims || []} empty="No claims recorded yet." renderItem={item => <><strong>{item.text}</strong><small>{labelFor(item.epistemicStatus || 'plausible_hypothesis')} · {labelFor(item.materiality || 'supporting')} · evidence {labelFor(item.support || 'unsupported')}</small>{item.epistemicStatus === 'established_fact' && ['unsupported', 'conflicted'].includes(item.support) ? <em>Inconsistent: established fact without supporting evidence.</em> : null}</>} />
      </div>
      <div className="wiki-thesis__snapshot">
        {judgment.initialRevisionId ? <>
          <p><strong>Initial judgment saved.</strong> Day-zero belief is preserved; this does not prove the thesis.</p>
          <button type="button" onClick={restoreInitial} disabled={busy}>Restore initial judgment</button>
        </> : <>
          <p>Preserve the starting belief before research changes it.</p>
          <button type="button" onClick={saveInitial} disabled={busy}>Save initial judgment</button>
        </>}
      </div>
      {status ? <p className="wiki-thesis__status" role="status">{status}</p> : null}
      {error ? <p className="wiki-thesis__error" role="alert">{error}</p> : null}
    </section>
  );
};

export default WikiLivingThesis;
