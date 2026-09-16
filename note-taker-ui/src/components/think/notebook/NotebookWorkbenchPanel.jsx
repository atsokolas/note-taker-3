import React, { useEffect, useRef, useState } from 'react';
import { QuietButton } from '../../ui';

const SourceRow = ({ item, used, targets, onInsert, onRemove, onGoTo }) => (
  <article className={`notebook-workbench__row${used ? ' is-used' : ''}`}>
    <div>
      <span className="notebook-workbench__eyebrow">{item.kind}</span>
      {item.sourcePath ? <a href={item.sourcePath}>{item.title || 'Untitled source'}</a> : <strong>{item.title || 'Untitled source'}</strong>}
      {item.text ? <p>{item.text}</p> : null}
    </div>
    <div className="notebook-workbench__row-actions">
      {used && targets.length <= 1 ? <QuietButton onClick={() => onGoTo(targets[0])}>In your draft · Go to passage</QuietButton> : null}
      {used && targets.length > 1 ? (
        <span className="notebook-workbench__citation-choices" aria-label="Citations in this draft">
          <span>In your draft</span>
          {targets.map((blockId, index) => <QuietButton key={blockId} onClick={() => onGoTo(blockId)}>Passage {index + 1}</QuietButton>)}
        </span>
      ) : null}
      {!used ? <QuietButton onClick={onInsert}>Insert here</QuietButton> : null}
      <QuietButton onClick={onRemove}>Remove from note</QuietButton>
    </div>
  </article>
);

const NotebookWorkbenchPanel = ({
  mode = 'material',
  workingState,
  targetStatus,
  citationTargets,
  asidePieces = [],
  activeTrial = null,
  trialStatus = null,
  thoughtTarget = null,
  onChooseSource,
  onInsertMaterial,
  onRemoveMaterial,
  onGoToMaterial,
  onJot,
  onInsertThought,
  onGoToThought,
  onDiscardThought,
  onRestoreAside,
  onChangeTrial,
  onPreviewTrial,
  onKeepOriginal,
  onUseTrial,
  onReviewTrial,
  onDiscardTrial,
  onSaveNextLine,
  onGoToNextLine,
  onClearNextLine
}) => {
  const [jot, setJot] = useState('');
  const [nextLine, setNextLine] = useState(workingState.nextTimeLine?.text || '');
  const jotRef = useRef(null);

  useEffect(() => {
    setNextLine(workingState.nextTimeLine?.text || '');
  }, [workingState.nextTimeLine?.text]);

  if (mode === 'trial' && activeTrial) {
    return (
      <section className="notebook-workbench" aria-label="Try another wording">
        <header>
          <span className="notebook-workbench__eyebrow">PRIVATE EXPERIMENT</span>
          <h2>Try another wording</h2>
          <p>The draft stays unchanged until you use this version.</p>
        </header>
        {trialStatus === 'stale' ? (
          <div className="notebook-workbench__notice" role="status">
            This paragraph changed. Your trial is safe beside it.
            <QuietButton onClick={onReviewTrial}>Review against the current paragraph</QuietButton>
          </div>
        ) : trialStatus === 'missing' ? (
          <p className="notebook-workbench__notice" role="status">The original paragraph is gone. Keep the trial or choose another passage.</p>
        ) : null}
        <label className="notebook-workbench__field">
          <span>Alternative</span>
          <textarea value={activeTrial.alternative || ''} onChange={(event) => onChangeTrial(event.target.value)} rows={8} />
        </label>
        <div className="notebook-workbench__actions">
          <QuietButton onClick={() => onPreviewTrial('original')}>Original</QuietButton>
          <QuietButton onClick={() => onPreviewTrial('trial')}>Read it in place</QuietButton>
          <QuietButton disabled={!activeTrial.alternative?.trim() || trialStatus !== 'ready'} onClick={onUseTrial}>Use this version</QuietButton>
          <QuietButton onClick={onKeepOriginal}>Keep my original</QuietButton>
          <QuietButton onClick={onDiscardTrial}>Discard trial</QuietButton>
        </div>
      </section>
    );
  }

  return (
    <section className="notebook-workbench" aria-label="Material beside this note">
      <header>
        <span className="notebook-workbench__eyebrow">MATERIAL</span>
        <h2>Beside this note</h2>
        <p>Sources and unfinished possibilities stay here until you place them.</p>
      </header>

      <div className={`notebook-workbench__target is-${targetStatus || 'missing'}`} role="status">
        {targetStatus === 'ready'
          ? 'Passage will go here. Your place is held.'
          : 'Choose a passage in the draft before inserting material.'}
      </div>

      <div className="notebook-workbench__source-actions" role="group" aria-label="Keep material beside this note">
        <QuietButton onClick={() => onChooseSource('highlight')}>Keep a passage beside</QuietButton>
        <QuietButton onClick={() => onChooseSource('article')}>Keep a source beside</QuietButton>
      </div>

      {workingState.materials.length ? (
        <div className="notebook-workbench__list">
          {workingState.materials.map(item => {
            const targets = citationTargets?.(item) || (item.insertedBlockId ? [item.insertedBlockId] : []);
            const used = targets.length > 0;
            return (
              <SourceRow
                key={item.id}
                item={item}
                used={used}
                targets={targets}
                onInsert={() => onInsertMaterial(item)}
                onRemove={() => onRemoveMaterial(item.id)}
                onGoTo={onGoToMaterial}
              />
            );
          })}
        </div>
      ) : <p className="notebook-workbench__empty">Nothing waiting beside this note.</p>}

      <div className="notebook-workbench__section">
        <div className="notebook-workbench__section-title">
          <h3>Loose thoughts</h3>
          <QuietButton onClick={() => jotRef.current?.focus()}>Jot something</QuietButton>
        </div>
        <label className="notebook-workbench__field">
          <span className="sr-only">Hold a thought</span>
          <textarea ref={jotRef} value={jot} onChange={(event) => setJot(event.target.value)} placeholder={thoughtTarget ? 'Keep the digression here…' : 'Choose a passage, then hold a thought…'} rows={3} />
        </label>
        <QuietButton disabled={!jot.trim()} onClick={() => { onJot(jot); setJot(''); }}>Hold this thought</QuietButton>
        {workingState.looseThoughts.map(item => (
          <article className="notebook-workbench__row" key={item.id}>
            <p>{item.text}</p>
            <div className="notebook-workbench__row-actions">
              <QuietButton onClick={() => onGoToThought(item)}>Back to my sentence</QuietButton>
              <QuietButton onClick={() => onInsertThought(item)}>Put into the draft</QuietButton>
              <QuietButton onClick={() => onDiscardThought(item.id)}>Discard</QuietButton>
            </div>
          </article>
        ))}
      </div>

      {asidePieces.length ? (
        <div className="notebook-workbench__section">
          <h3>Trying without</h3>
          {asidePieces.map(piece => (
            <article className="notebook-workbench__row" key={piece.id}>
              <p>{piece.label || 'Set-aside passage'}</p>
              <QuietButton onClick={() => onRestoreAside(piece.id)}>Bring back</QuietButton>
            </article>
          ))}
        </div>
      ) : null}

      <div className="notebook-workbench__section">
        <h3>Next time</h3>
        <label className="notebook-workbench__field">
          <span>Leave myself a line</span>
          <textarea value={nextLine} onChange={(event) => setNextLine(event.target.value)} rows={2} />
        </label>
        <div className="notebook-workbench__row-actions">
          <QuietButton disabled={!nextLine.trim()} onClick={() => onSaveNextLine(nextLine)}>Save this line</QuietButton>
          {workingState.nextTimeLine?.text ? <QuietButton onClick={onGoToNextLine}>Pick up here</QuietButton> : null}
          {workingState.nextTimeLine?.text ? <QuietButton onClick={onClearNextLine}>Clear this line</QuietButton> : null}
        </div>
      </div>
    </section>
  );
};

export default NotebookWorkbenchPanel;
