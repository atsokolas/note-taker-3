import React, { useEffect, useRef } from 'react';
import { notebookTargetText } from '../../../utils/notebookWorkbench';
import { readTighterCuts, renderReadTighterOriginal } from '../../../utils/notebookReadTighter';

// Replaces the trial form in the right workbench. The document owns the
// alternatives; this strip only edits and previews those existing records.
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
  onScope,
  onClose,
  onDiscard,
  onReview,
  onAsk,
  onRescue,
  unsupportedReason = ''
}) => {
  const root = useRef(null);
  const field = useRef(null);
  const tighter = trial.intent === 'tighter';
  const originalText = notebookTargetText(trial.target);
  useEffect(() => { const frame = window.requestAnimationFrame(() => root.current?.focus({ preventScroll: true })); return () => window.cancelAnimationFrame(frame); }, []);
  useEffect(() => { const frame = window.requestAnimationFrame(() => { if (!trial.alternative) field.current?.focus({ preventScroll: true }); }); return () => window.cancelAnimationFrame(frame); }, [trial.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const choices = trials.some(item => item.id === trial.id) ? trials : [...trials, trial];
  const selected = preview === 'original' ? 0 : choices.findIndex(item => item.id === trial.id) + 1;
  const choose = (index) => index === 0 ? onPreview('original') : onChoose(choices[index - 1]);
  const ready = status === 'ready' && Boolean(trial.alternative.trim());
  const originalParts = tighter && trial.alternative.trim()
    ? renderReadTighterOriginal(originalText, trial.alternative)
    : null;
  const cutPhrases = tighter && trial.alternative.trim()
    ? readTighterCuts(originalText, trial.alternative).map((item) => item.text.trim()).filter(Boolean)
    : [];
  const renderOriginalBody = () => {
    if (!originalParts) return <span>{originalText}</span>;
    return originalParts.map((part, index) => (
      part.kind === 'text'
        ? <span key={`t-${index}`}>{part.text}</span>
        : <span key={`c-${index}`} className="notebook-alternatives__cut-mark">{part.text}</span>
    ));
  };
  return (
    <section ref={root} tabIndex={-1} className={`notebook-alternatives${tighter ? ' is-tighter' : ''}`} aria-label={tighter ? 'Read tighter' : 'Try another wording'} onKeyDown={event => {
      if (event.isComposing || event.defaultPrevented) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); return; }
      if (event.target.tagName === 'TEXTAREA') return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        choose((selected + (event.key === 'ArrowDown' ? 1 : -1) + choices.length + 1) % (choices.length + 1));
      } else if (event.key === 'Enter' && (event.target === root.current || event.target.hasAttribute('data-compare')) && preview !== 'original' && ready) { event.preventDefault(); onKeep(); }
    }}>
      <header>
        {tighter ? <span>Read tighter</span> : (
          <div role="group" aria-label="Wording scope">{['word', 'sentence', 'paragraph'].map(scope => <button type="button" key={scope} aria-pressed={(trial.target.scope || 'paragraph') === scope} onClick={() => onScope(scope)}>{scope}</button>)}</div>
        )}
        <button type="button" onClick={onClose} aria-label="Close alternatives">×</button>
      </header>
      {unsupportedReason ? <p role="status" className="notebook-workbench__notice">{unsupportedReason}</p> : null}
      {status !== 'ready' ? <p role="status" className="notebook-workbench__notice">{status === 'stale' ? 'This passage changed. Your alternatives are still here.' : 'The original passage is gone. Your alternatives are still here.'}{status === 'stale' ? <button type="button" onClick={onReview}>Review current passage</button> : null}</p> : null}
      <div role="group" aria-label="Compare wording">
        <button type="button" data-compare="" className="notebook-alternatives__choice" aria-pressed={preview === 'original'} onClick={() => onPreview('original')}><span className="notebook-alternatives__passage">{renderOriginalBody()}</span><small>original</small></button>
        {choices.map(item => <button key={item.id} type="button" data-compare="" className="notebook-alternatives__choice" aria-pressed={preview === 'trial' && item.id === trial.id} onClick={() => onChoose(item)}><span>{item.alternative || (tighter ? 'Write a tighter read or ask Partner…' : 'Write another way…')}</span>{item.origin === 'partner' ? <small>partner proposal</small> : null}</button>)}
      </div>
      {cutPhrases.length ? (
        <ul className="notebook-alternatives__rescues" aria-label="Proposed cuts">
          {cutPhrases.map((phrase) => (
            <li key={phrase}>
              <button type="button" className="notebook-alternatives__rescue" onClick={() => onRescue?.(phrase)}>
                Rescue “{phrase}”
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {tighter && trial.alternative.trim() ? <p className="notebook-alternatives__hint">Strikethrough marks proposed cuts · rescue brings a phrase back into the preview only</p> : null}
      <label className="notebook-alternatives__edit"><span>{tighter ? 'Tighter read' : 'Edit this alternative'}</span><textarea ref={field} rows={4} maxLength={30000} value={trial.alternative} onChange={event => onChange(event.target.value)} /></label>
      <div className="notebook-alternatives__actions">
        {!tighter ? <button type="button" onClick={onAdd} disabled={choices.length >= 12}>+ another</button> : null}
        <button type="button" onClick={onAsk}>{tighter ? 'Ask Partner' : 'ask'}</button>
      </div>
      <div className="notebook-alternatives__actions"><button type="button" disabled={!ready} onClick={() => onPreview('trial')}>Read in place</button><button type="button" disabled={!ready || preview === 'original'} onClick={onKeep}>{tighter ? 'Keep tighter read' : 'Keep wording'}</button></div>
      <button type="button" className="notebook-alternatives__discard" onClick={onDiscard}>Discard this alternative</button>
      <p className="notebook-alternatives__hint" role="status">{preview === 'original' ? 'Reading original' : 'Preview · draft unchanged'}</p>
      <p className="notebook-alternatives__hint">↑ ↓ compare · Enter keep · Esc close</p>
    </section>
  );
};

export default NotebookAlternativesRail;
