import React, { useEffect, useMemo, useRef, useState } from 'react';
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

const itemKey = (item, index) => item.assumptionId || item.unknownId || item.falsifierId || item.decisionId || item.claimId || item._draftKey || index;

const ReadList = ({ title, items, empty, renderItem, section, activeSection, onEdit, children }) => {
  const editing = activeSection === section;
  return (
    <details className="wiki-thesis__ledger-section" open={editing || undefined}>
      <summary>{title}<span>{items.length}</span></summary>
      <div className="wiki-thesis__ledger-content">
        {editing ? children : (
          <>
            <div className="wiki-thesis__section-tools">
              <button type="button" className="wiki-thesis__text-action" data-editor-trigger={section} onClick={event => onEdit(section, event)} disabled={Boolean(activeSection)}>
                Edit {title.toLowerCase()}
              </button>
            </div>
            {items.length ? (
              <ul>{items.map((item, index) => <li key={itemKey(item, index)}>{renderItem(item)}</li>)}</ul>
            ) : <p className="wiki-thesis__empty">{empty}</p>}
          </>
        )}
      </div>
    </details>
  );
};

const Field = ({ label, children }) => <label className="wiki-thesis__field"><span>{label}</span>{children}</label>;

const WikiLivingThesis = ({ page, pageId, onPageUpdate }) => {
  const systemStatus = useSystemStatusControls();
  const judgment = page?.judgment;
  const [activeSection, setActiveSection] = useState(null);
  const [openingSection, setOpeningSection] = useState(null);
  const [closingSection, setClosingSection] = useState(null);
  const [draft, setDraft] = useState(() => clone(judgment));
  const [claimDrafts, setClaimDrafts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const editorRef = useRef(null);
  const rootRef = useRef(null);
  const triggerSectionRef = useRef(null);
  const closeTimerRef = useRef(null);
  const settleFrameRef = useRef(null);

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

  useEffect(() => () => window.clearTimeout(closeTimerRef.current), []);

  useEffect(() => {
    if (!activeSection || closingSection) return undefined;
    const frame = window.requestAnimationFrame(() => {
      settleFrameRef.current = window.requestAnimationFrame(() => setOpeningSection(null));
      const target = editorRef.current?.querySelector('textarea, input, select, button');
      target?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(settleFrameRef.current);
    };
  }, [activeSection, closingSection]);

  const claimsById = useMemo(() => new Map((page?.claims || []).map(claim => [claim.claimId, claim])), [page?.claims]);
  if (!judgment?.kind) return null;

  const setValue = (field, value) => setDraft(current => ({ ...current, [field]: value }));
  const setCausalSummary = value => setDraft(current => ({
    ...current,
    causalModel: {
      ...(current.causalModel || {}),
      summary: value,
      nodes: Array.isArray(current.causalModel?.nodes) ? current.causalModel.nodes : [],
      edges: Array.isArray(current.causalModel?.edges) ? current.causalModel.edges : []
    }
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
    next.causalModel = {
      summary: next.causalModel?.summary || '',
      nodes: Array.isArray(next.causalModel?.nodes) ? next.causalModel.nodes : [],
      edges: Array.isArray(next.causalModel?.edges) ? next.causalModel.edges : []
    };
    ['assumptions', 'unknowns', 'falsifiers', 'decisions'].forEach((kind) => {
      next[kind] = (next[kind] || []).map(({ _draftKey, ...item }) => item);
    });
    return next;
  };

  const resetDraft = () => {
    setDraft(clone(judgment));
    setClaimDrafts((page?.claims || []).map(claim => ({
      claimId: claim.claimId,
      epistemicStatus: claim.epistemicStatus || 'plausible_hypothesis',
      materiality: claim.materiality || 'supporting',
      implication: claim.implication || '',
      falsifierIds: claim.falsifierIds || []
    })));
  };

  const finishClose = ({ reset = false } = {}) => {
    if (reset) resetDraft();
    setActiveSection(null);
    setOpeningSection(null);
    setClosingSection(null);
    window.requestAnimationFrame(() => {
      const section = triggerSectionRef.current;
      rootRef.current?.querySelector(`[data-editor-trigger="${section}"]`)?.focus();
    });
  };

  const closeEditor = ({ reset = false, immediate = false } = {}) => {
    if (!activeSection) return;
    window.clearTimeout(closeTimerRef.current);
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (immediate) {
      finishClose({ reset });
      return;
    }
    setClosingSection(activeSection);
    closeTimerRef.current = window.setTimeout(() => finishClose({ reset }), reduceMotion ? 120 : 180);
  };

  const openEditor = (section, event) => {
    window.clearTimeout(closeTimerRef.current);
    triggerSectionRef.current = section;
    setOpeningSection(section);
    setClosingSection(null);
    setActiveSection(section);
    setError('');
    setStatus('');
  };

  const handleEditorKeyDown = event => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    closeEditor({ reset: true, immediate: true });
  };

  const save = async () => {
    setBusy(true); setError(''); setStatus('');
    systemStatus.setBackgroundWork({ label: 'Living thesis', stage: 'Saving judgment contract' });
    try {
      const updated = await updateWikiPage(pageId, { judgment: cleanDraft(), claimUpdates: claimDrafts });
      onPageUpdate?.(updated);
      setStatus('Living thesis saved.');
      closeEditor();
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
    <section className="wiki-thesis" aria-label="Living thesis contract" ref={rootRef}>
      <div
        className={`wiki-thesis__primary${activeSection === 'core' ? ' is-editing' : ''}`}
        ref={activeSection === 'core' ? editorRef : undefined}
        data-editor-section={activeSection === 'core' ? 'core' : undefined}
        data-motion-state={closingSection === 'core' ? 'closing' : openingSection === 'core' ? 'opening' : 'open'}
        onKeyDown={activeSection === 'core' ? handleEditorKeyDown : undefined}
      >
        <div className="wiki-thesis__heading">
          <div className="wiki-thesis__question">
            <p>Governing question</p>
            {activeSection === 'core' ? (
              <textarea aria-label="Governing question" value={draft.governingQuestion || ''} onChange={event => setValue('governingQuestion', event.target.value)} />
            ) : <h2>{judgment.governingQuestion || 'No governing question recorded'}</h2>}
          </div>
          <button
            type="button"
            className="wiki-thesis__edit-trigger"
            data-editor-trigger="core"
            aria-expanded={activeSection === 'core'}
            aria-controls="wiki-thesis-core-editor"
            onClick={event => activeSection === 'core' ? closeEditor({ reset: true }) : openEditor('core', event)}
            disabled={busy || Boolean(activeSection && activeSection !== 'core')}
          >
            {activeSection === 'core' ? 'Cancel editing' : 'Edit thesis'}
          </button>
        </div>

        <div className="wiki-thesis__judgment" id="wiki-thesis-core-editor">
          <span>Current judgment</span>
          {activeSection === 'core' ? (
            <textarea aria-label="Current judgment" value={draft.currentJudgment || ''} onChange={event => setValue('currentJudgment', event.target.value)} />
          ) : <p>{judgment.currentJudgment || 'No current judgment recorded.'}</p>}
        </div>

        <dl className="wiki-thesis__facts" aria-label="Judgment register">
          <div><dt>Confidence</dt><dd>{activeSection === 'core' ? <input aria-label="Confidence (0–1)" type="number" min="0" max="1" step="0.01" value={draft.confidence ?? ''} onChange={event => setValue('confidence', event.target.value === '' ? null : Number(event.target.value))} /> : confidenceLabel(judgment.confidence)}</dd></div>
          <div><dt>Status</dt><dd>{activeSection === 'core' ? <select aria-label="Status" value={draft.status || 'framing'} onChange={event => setValue('status', event.target.value)}>{['framing', 'researching', 'challenged', 'decision_ready', 'monitoring', 'closed', 'archived'].map(value => <option key={value} value={value}>{labelFor(value)}</option>)}</select> : labelFor(judgment.status || 'framing')}</dd></div>
          <div><dt>Posture</dt><dd>{activeSection === 'core' ? <select aria-label="Decision posture" value={draft.decisionPosture || 'investigate'} onChange={event => setValue('decisionPosture', event.target.value)}>{['investigate', 'watch', 'act', 'avoid', 'no_action', 'closed'].map(value => <option key={value} value={value}>{labelFor(value)}</option>)}</select> : labelFor(judgment.decisionPosture || 'investigate')}</dd></div>
          <div><dt>Last reviewed</dt><dd>{dateLabel(judgment.lastReviewedAt, 'Not reviewed yet')}</dd></div>
          <div><dt>Next review</dt><dd>{activeSection === 'core' ? <><input aria-label="Next review date" type="date" value={dateInput(draft.nextReviewAt)} onChange={event => setValue('nextReviewAt', event.target.value || null)} /><input aria-label="Next review trigger" value={draft.nextReviewTrigger || ''} onChange={event => setValue('nextReviewTrigger', event.target.value)} placeholder="Review trigger" /></> : dateLabel(judgment.nextReviewAt, judgment.nextReviewTrigger || 'Not scheduled')}</dd></div>
        </dl>
        {activeSection === 'core' ? <div className="wiki-thesis__inline-actions"><button type="button" className="wiki-thesis__primary-action" onClick={save} disabled={busy}>Save thesis</button><button type="button" className="wiki-thesis__text-action" onClick={() => closeEditor({ reset: true })} disabled={busy}>Cancel</button></div> : null}
      </div>

      <section
        className={`wiki-thesis__narrative${activeSection === 'causal' ? ' is-editing' : ''}`}
        ref={activeSection === 'causal' ? editorRef : undefined}
        data-editor-section={activeSection === 'causal' ? 'causal' : undefined}
        data-motion-state={closingSection === 'causal' ? 'closing' : openingSection === 'causal' ? 'opening' : 'open'}
        onKeyDown={activeSection === 'causal' ? handleEditorKeyDown : undefined}
      >
        <div className="wiki-thesis__section-heading"><h3>Causal narrative</h3>{activeSection !== 'causal' ? <button type="button" className="wiki-thesis__text-action" data-editor-trigger="causal" onClick={event => openEditor('causal', event)} disabled={Boolean(activeSection)}>Edit narrative</button> : null}</div>
        {activeSection === 'causal' ? <>
          <textarea aria-label="Causal narrative" value={draft.causalModel?.summary || ''} onChange={event => setCausalSummary(event.target.value)} />
          <Field label="Strongest counterargument"><textarea value={draft.strongestCounterargument || ''} onChange={event => setValue('strongestCounterargument', event.target.value)} /></Field>
          <div className="wiki-thesis__inline-actions"><button type="button" className="wiki-thesis__primary-action" onClick={save} disabled={busy}>Save narrative</button><button type="button" className="wiki-thesis__text-action" onClick={() => closeEditor({ reset: true })}>Cancel</button></div>
        </> : <>
          <p>{judgment.causalModel?.summary || 'No causal narrative recorded.'}</p>
          {judgment.strongestCounterargument ? <p className="wiki-thesis__counterargument"><span>Strongest counterargument</span>{judgment.strongestCounterargument}</p> : null}
        </>}
      </section>

      <div className="wiki-thesis__ledger" aria-label="Thesis ledger">
        {['assumptions', 'unknowns', 'falsifiers', 'decisions'].map(kind => {
          const sourceItems = judgment[kind] || [];
          const emptyCopy = {
            assumptions: 'No critical assumptions recorded.',
            unknowns: 'No unknowns recorded.',
            falsifiers: 'No falsifiers recorded.',
            decisions: 'No action or explicit no-action decision recorded.'
          }[kind];
          const renderReadItem = item => ({
            assumptions: <><strong>{item.text}</strong><small>{labelFor(item.status)}</small></>,
            unknowns: <><strong>{item.question}</strong><small>{labelFor(item.priority)} · {labelFor(item.status)}</small></>,
            falsifiers: <><strong>{item.text}</strong><small>{item.observableSignal || labelFor(item.status)}</small></>,
            decisions: <><strong>{item.summary}</strong><small>{labelFor(item.decisionType)} · {labelFor(item.status)} · record only</small></>
          }[kind]);
          return (
            <ReadList key={kind} title={labelFor(kind)} section={kind} activeSection={activeSection} onEdit={openEditor} items={sourceItems} empty={emptyCopy} renderItem={renderReadItem}>
              <div
                className="wiki-thesis__edit-surface"
                ref={activeSection === kind ? editorRef : undefined}
                data-editor-section={activeSection === kind ? kind : undefined}
                data-motion-state={closingSection === kind ? 'closing' : openingSection === kind ? 'opening' : 'open'}
                onKeyDown={handleEditorKeyDown}
              >
                {(draft[kind] || []).map((item, index) => (
                  <div className="wiki-thesis__edit-row" key={itemKey(item, index)}>
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
                  <button type="button" className="wiki-thesis__remove" aria-label={`Remove ${kind.slice(0, -1)} ${index + 1}`} onClick={() => removeItem(kind, index)}>Remove</button>
                </div>
              ))}
                <div className="wiki-thesis__edit-footer"><button type="button" onClick={() => addItem(kind)}>Add {kind.slice(0, -1)}</button><div className="wiki-thesis__inline-actions"><button type="button" className="wiki-thesis__primary-action" onClick={save} disabled={busy}>Save {kind}</button><button type="button" className="wiki-thesis__text-action" onClick={() => closeEditor({ reset: true })}>Cancel</button></div></div>
              </div>
            </ReadList>
          );
        })}

        <ReadList
          title="Claims"
          section="claims"
          activeSection={activeSection}
          onEdit={openEditor}
          items={page.claims || []}
          empty="No claims recorded yet."
          renderItem={item => <><strong>{item.text}</strong><small>{labelFor(item.epistemicStatus || 'plausible_hypothesis')} · {labelFor(item.materiality || 'supporting')} · evidence {labelFor(item.support || 'unsupported')}</small>{item.epistemicStatus === 'established_fact' && ['unsupported', 'conflicted'].includes(item.support) ? <em>Inconsistent: established fact without supporting evidence.</em> : null}</>}
        >
          <div
            className="wiki-thesis__edit-surface"
            ref={activeSection === 'claims' ? editorRef : undefined}
            data-editor-section={activeSection === 'claims' ? 'claims' : undefined}
            data-motion-state={closingSection === 'claims' ? 'closing' : openingSection === 'claims' ? 'opening' : 'open'}
            onKeyDown={handleEditorKeyDown}
          >
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
            <div className="wiki-thesis__inline-actions"><button type="button" className="wiki-thesis__primary-action" onClick={save} disabled={busy}>Save claims</button><button type="button" className="wiki-thesis__text-action" onClick={() => closeEditor({ reset: true })}>Cancel</button></div>
          </div>
        </ReadList>
      </div>
      <div className="wiki-thesis__snapshot">
        {judgment.initialRevisionId ? <>
          <p><span>Initial judgment</span><strong>Starting belief preserved.</strong> This permanent snapshot does not prove the thesis.</p>
          <button type="button" onClick={restoreInitial} disabled={busy}>Restore initial judgment</button>
        </> : <>
          <p><span>Initial judgment</span><strong>Preserve the starting belief once.</strong> Save edits first; the snapshot is permanent and does not prove the thesis.</p>
          <button type="button" className="wiki-thesis__snapshot-action" onClick={saveInitial} disabled={busy || Boolean(activeSection)}>Save initial judgment</button>
        </>}
      </div>
      {status ? <p className="wiki-thesis__status" role="status">{status}</p> : null}
      {error ? <p className="wiki-thesis__error" role="alert">{error}</p> : null}
    </section>
  );
};

export default WikiLivingThesis;
