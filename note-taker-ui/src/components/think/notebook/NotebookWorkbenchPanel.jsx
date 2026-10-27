import React, { useEffect, useRef, useState } from 'react';
import { Button } from '../../ui';
import { sourceTitle } from '../../../utils/sourceDisplayText';

const SourceRow = ({ item, used, targets, onInsert, onRemove, onGoTo }) => (
  <article className={`notebook-workbench__row${used ? ' is-used' : ''}`}>
    <div>
      <span className="notebook-workbench__eyebrow">{item.kind}</span>
      {item.sourcePath ? <a href={item.sourcePath}>{sourceTitle(item)}</a> : <strong>{sourceTitle(item)}</strong>}
      {item.text ? <p>{item.text}</p> : null}
    </div>
    <div className="notebook-workbench__row-actions">
      {used && targets.length <= 1 ? <Button variant="quiet" onClick={() => onGoTo(targets[0])}>In your draft · Go to passage</Button> : null}
      {used && targets.length > 1 ? (
        <span className="notebook-workbench__citation-choices" aria-label="Citations in this draft">
          <span>In your draft</span>
          {targets.map((blockId, index) => <Button variant="quiet" key={blockId} onClick={() => onGoTo(blockId)}>Passage {index + 1}</Button>)}
        </span>
      ) : null}
      {!used ? <Button variant="quiet" onClick={onInsert}>Insert here</Button> : null}
      <Button variant="quiet" onClick={onRemove}>Remove from note</Button>
    </div>
  </article>
);

const NotebookWorkbenchPanel = ({
  mode = 'material',
  splitDrawer = false,
  workingState,
  targetStatus,
  citationTargets,
  asidePieces = [],
  activeTrial = null,
  trialStatus = null,
  thoughtTarget = null,
  onChooseSource,
  onOpenTrial,
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
  const simpleScratchpad = splitDrawer && mode === 'scratchpad';
  const NextTimeSection = simpleScratchpad ? 'details' : 'div';

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
            <Button variant="quiet" onClick={onReviewTrial}>Review against the current paragraph</Button>
          </div>
        ) : trialStatus === 'missing' ? (
          <p className="notebook-workbench__notice" role="status">The original paragraph is gone. Keep the trial or choose another passage.</p>
        ) : null}
        <label className="notebook-workbench__field">
          <span>Alternative</span>
          <textarea value={activeTrial.alternative || ''} onChange={(event) => onChangeTrial(event.target.value)} rows={8} />
        </label>
        <div className="notebook-workbench__actions">
          <Button variant="quiet" onClick={() => onPreviewTrial('original')}>Original</Button>
          <Button variant="quiet" onClick={() => onPreviewTrial('trial')}>Read it in place</Button>
          <Button variant="quiet" disabled={!activeTrial.alternative?.trim() || trialStatus !== 'ready'} onClick={onUseTrial}>Use this version</Button>
          <Button variant="quiet" onClick={onKeepOriginal}>Keep my original</Button>
          <Button variant="quiet" onClick={onDiscardTrial}>Discard trial</Button>
        </div>
      </section>
    );
  }

  return (
    <section className={`notebook-workbench${simpleScratchpad ? ' notebook-scratchpad' : ''}`} aria-label={mode === 'scratchpad' ? 'Scratchpad' : 'Material beside this note'}>
      {!splitDrawer || mode !== 'scratchpad' ? <>
      <header>
        <span className="notebook-workbench__eyebrow">MATERIAL</span>
        <h2>Beside this note</h2>
        <p>Sources and unfinished possibilities stay here until you place them.</p>
      </header>

      <div className={`notebook-workbench__target is-${targetStatus || 'missing'}`} role="status">
        {targetStatus === 'ready'
          ? 'Your place is held.'
          : 'Choose a passage in the draft before inserting material.'}
      </div>

      <div className="notebook-workbench__source-actions" role="group" aria-label="Keep material beside this note">
        <Button variant="quiet" onClick={() => onChooseSource('highlight')}>Keep a passage beside</Button>
        <Button variant="quiet" onClick={() => onChooseSource('article')}>Keep a source beside</Button>
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

        {splitDrawer && workingState.trials.length ? <details className="notebook-workbench__section">
          <summary>Wording to revisit · {workingState.trials.length}</summary>
          {workingState.trials.map(trial => <div className="notebook-workbench__row" key={trial.id}><p>{trial.alternative || 'Unfinished alternative'}</p><Button variant="quiet" onClick={() => onOpenTrial?.(trial)}>Open alternative</Button></div>)}
        </details> : null}
      </> : null}
      {!splitDrawer || mode !== 'material' ? <>
      <div className="notebook-workbench__section">
        {!simpleScratchpad ? <div className="notebook-workbench__section-title">
          <h3>Loose thoughts</h3>
          <Button variant="quiet" onClick={() => jotRef.current?.focus()}>Jot something</Button>
        </div> : null}
        <label className="notebook-workbench__field">
          <span className="sr-only">Hold a thought</span>
          <textarea ref={jotRef} value={jot} onChange={(event) => setJot(event.target.value)} placeholder={simpleScratchpad ? 'A thought for later…' : thoughtTarget ? 'Keep the digression here…' : 'Choose a passage, then hold a thought…'} rows={3} />
        </label>
        <Button variant="quiet" disabled={!jot.trim()} onClick={() => { onJot(jot); setJot(''); }}>{simpleScratchpad ? 'Keep thought' : 'Hold this thought'}</Button>
        {workingState.looseThoughts.map(item => (
          <article className="notebook-workbench__row" key={item.id}>
            <p>{simpleScratchpad ? <button type="button" className="notebook-scratchpad__thought" title="Back to passage" onClick={() => onGoToThought(item)}>{item.text}</button> : item.text}</p>
            <div className="notebook-workbench__row-actions">
              {simpleScratchpad ? <>
                <Button variant="quiet" aria-label="Insert thought into draft" title="Insert into draft" onClick={() => onInsertThought(item)}>+</Button>
                <Button variant="quiet" aria-label="Discard thought" title="Discard thought" onClick={() => onDiscardThought(item.id)}>×</Button>
              </> : <>
                <Button variant="quiet" onClick={() => onGoToThought(item)}>Back to my sentence</Button>
                <Button variant="quiet" onClick={() => onInsertThought(item)}>Put into the draft</Button>
                <Button variant="quiet" onClick={() => onDiscardThought(item.id)}>Discard</Button>
              </>}
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
              <Button variant="quiet" onClick={() => onRestoreAside(piece.id)}>Bring back</Button>
            </article>
          ))}
        </div>
      ) : null}

      <NextTimeSection className="notebook-workbench__section">
        {simpleScratchpad ? <summary>Next time{workingState.nextTimeLine?.text ? ' · a line waiting' : ''}</summary> : <h3>Next time</h3>}
        <label className="notebook-workbench__field">
          <span>Leave myself a line</span>
          <textarea value={nextLine} onChange={(event) => setNextLine(event.target.value)} rows={2} />
        </label>
        <div className="notebook-workbench__row-actions">
          <Button variant="quiet" disabled={!nextLine.trim()} onClick={() => onSaveNextLine(nextLine)}>Save this line</Button>
          {workingState.nextTimeLine?.text ? <Button variant="quiet" onClick={onGoToNextLine}>Pick up here</Button> : null}
          {workingState.nextTimeLine?.text ? <Button variant="quiet" onClick={onClearNextLine}>Clear this line</Button> : null}
        </div>
      </NextTimeSection>
      </> : null}
    </section>
  );
};

export default NotebookWorkbenchPanel;
