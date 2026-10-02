import React, { useEffect, useRef, useState } from 'react';
import { notebookTargetText } from '../../../utils/notebookWorkbench';
import { readTighterCuts, renderReadTighterOriginal } from '../../../utils/notebookReadTighter';

// The document owns the alternatives. This strip lists them and adds one more.
const NotebookAlternativesRail = ({
  trial,
  trials,
  preview,
  status,
  onChoose,
  onChange,
  onPreview,
  onAdd,
  onKeep,
  onClose,
  onDiscard,
  onReview,
  onAsk,
  onRescue,
  unsupportedReason = '',
  partnerOptionsStatus = 'idle',
  partnerOptionsNotice = '',
  onRequestPartnerOptions = null
}) => {
  const root = useRef(null);
  const field = useRef(null);
  const [draft, setDraft] = useState('');
  const [partnerOpen, setPartnerOpen] = useState(false);
  const tighter = trial.intent === 'tighter';
  const originalText = notebookTargetText(trial.target);
  useEffect(() => { const frame = window.requestAnimationFrame(() => root.current?.focus({ preventScroll: true })); return () => window.cancelAnimationFrame(frame); }, []);
  useEffect(() => {
    setDraft('');
    const frame = window.requestAnimationFrame(() => { if (!trial.alternative) field.current?.focus({ preventScroll: true }); });
    return () => window.cancelAnimationFrame(frame);
  }, [trial.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const choices = (trials.some(item => item.id === trial.id) ? trials : [...trials, trial])
    .filter(item => String(item.alternative || '').trim());
  const selected = preview === 'original' ? 0 : Math.max(0, choices.findIndex(item => item.id === trial.id) + 1);
  const choose = (index) => index === 0 ? onPreview('original') : onChoose(choices[index - 1]);
  const ready = status === 'ready' && Boolean(String(trial.alternative || '').trim());
  const originalParts = tighter && trial.alternative.trim()
    ? renderReadTighterOriginal(originalText, trial.alternative)
    : null;
  const cuts = tighter && trial.alternative.trim() ? readTighterCuts(originalText, trial.alternative) : [];
  const commitDraft = () => {
    const wording = draft.trim();
    if (!wording) return;
    if (!String(trial.alternative || '').trim()) {
      onChange(wording);
      onPreview('trial');
    } else onAdd(wording);
    setDraft('');
  };
  const leave = () => {
    commitDraft();
    onClose();
  };
  const renderOriginalBody = () => {
    if (!originalParts) return <span>{originalText}</span>;
    return originalParts.map((part, index) => (
      part.kind === 'text'
        ? <span key={`t-${index}`}>{part.text}</span>
        : <span key={`c-${part.id || index}`} className="notebook-alternatives__cut-mark">{part.text}</span>
    ));
  };
  return (
    <section ref={root} tabIndex={-1} className={`notebook-alternatives${tighter ? ' is-tighter' : ''}`} aria-label={tighter ? 'Read tighter' : 'Alternatives'} onKeyDown={event => {
      if (event.isComposing || event.defaultPrevented) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); leave(); return; }
      if (event.target.tagName === 'TEXTAREA') return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        choose((selected + (event.key === 'ArrowDown' ? 1 : -1) + choices.length + 1) % (choices.length + 1));
      } else if (event.key === 'Enter' && (event.target === root.current || event.target.hasAttribute('data-compare')) && preview !== 'original' && ready) { event.preventDefault(); onKeep(); }
    }}>
      <header>
        <span>{tighter ? 'Read tighter' : 'Alternatives'}</span>
        <button type="button" onClick={leave} aria-label="Close alternatives">×</button>
      </header>
      {unsupportedReason ? <p role="status" className="notebook-workbench__notice">{unsupportedReason}</p> : null}
      {partnerOptionsNotice ? <p role="status" className="notebook-workbench__notice">{partnerOptionsNotice}</p> : null}
      {status !== 'ready' ? <p role="status" className="notebook-workbench__notice">{status === 'stale' ? 'This passage changed. Your alternatives are still here.' : 'The original passage is gone. Your alternatives are still here.'}{status === 'stale' ? <button type="button" onClick={onReview}>Review current passage</button> : null}</p> : null}
      <div role="group" aria-label="Compare wording">
        <button type="button" data-compare="" className="notebook-alternatives__choice" aria-pressed={preview === 'original'} onClick={() => onPreview('original')}>
          <span className="notebook-alternatives__passage">{renderOriginalBody()}</span>
          <small>original</small>
        </button>
        {cuts.map((cut) => (
          <button type="button" key={cut.id} className="notebook-alternatives__rescue" onClick={() => onRescue?.(cut)}>
            Rescue “{cut.phrase}”
          </button>
        ))}
        {choices.map(item => (
          <div key={item.id} className="notebook-alternatives__row">
            <button type="button" data-compare="" className="notebook-alternatives__choice" aria-pressed={preview === 'trial' && item.id === trial.id} onClick={() => onChoose(item)}>
              <span>{item.alternative}</span>
              {item.partnerExplanation ? <small>{item.partnerExplanation}</small> : null}
              {item.origin === 'partner' && !item.partnerExplanation ? <small>partner proposal</small> : null}
            </button>
            {preview === 'trial' && item.id === trial.id ? (
              <div className="notebook-alternatives__choice-actions">
                <button type="button" disabled={!ready} onClick={onKeep}>{tighter ? 'Keep tighter read' : 'Keep wording'}</button>
                <button type="button" onClick={onDiscard}>Discard</button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <label className="notebook-alternatives__edit">
        <span className="sr-only">Add another wording</span>
        <textarea
          ref={field}
          rows={3}
          maxLength={30000}
          value={draft}
          placeholder={tighter ? 'A tighter read…' : 'Another way…'}
          aria-label="Add another wording"
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              commitDraft();
            }
          }}
        />
      </label>
      <p className="sr-only" role="status">{preview === 'original' ? 'Reading original' : 'Preview. The draft is unchanged.'}</p>
      <div className="notebook-alternatives__more">
        <button type="button" aria-expanded={partnerOpen} onClick={() => setPartnerOpen(open => !open)}>Partner</button>
        {partnerOpen ? (
          <div>
            {!tighter ? (
              <button type="button" disabled={status !== 'ready' || partnerOptionsStatus === 'loading'} onClick={() => onRequestPartnerOptions?.()}>
                {partnerOptionsStatus === 'loading' ? 'Partner options…' : 'Partner options'}
              </button>
            ) : null}
            <button type="button" onClick={onAsk}>{tighter ? 'Ask for a tighter read' : 'Ask Partner'}</button>
            <p>Suggestions stay in this list until you keep one.</p>
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default NotebookAlternativesRail;
