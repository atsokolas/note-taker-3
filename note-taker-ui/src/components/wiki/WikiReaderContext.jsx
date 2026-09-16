import React from 'react';
import { Link } from 'react-router-dom';
import { wikiReadPath } from '../../utils/wikiFeatureFlags';
import { displayWikiPageTitle } from './wikiRepoDossierModel';
import { candidateFootprint, historicalRevisionSnapshot } from './wikiReaderContextModel';
import { wikiRevisionLabel } from './wikiCopyReference';

const clean = (value) => String(value || '').trim();

const PanelHeader = ({ label, onClose, onBack, backLabel }) => (
  <header className="wiki-reader-context__head">
    <div>
      {onBack ? (
        <button type="button" className="wiki-reader-context__back" onClick={onBack}>
          ← Back to {backLabel}
        </button>
      ) : null}
      <span className="wiki-reader-context__kicker">{label}</span>
    </div>
    <button type="button" className="wiki-reader-context__close" onClick={onClose} aria-label="Return to the page">
      ×
    </button>
  </header>
);

const Quote = ({ children }) => (
  <blockquote className="wiki-reader-context__quote">{children}</blockquote>
);

const WikiReaderContext = ({
  panel = null,
  page = null,
  candidate = null,
  revisions = [],
  preview = false,
  surroundingOpen = false,
  privateReason = '',
  thought = '',
  onClose,
  onBack,
  onOpenSource,
  onToggleSurround,
  onPreview,
  onAccept,
  onKeepCurrent,
  onNotNow,
  onOpenHistoryRevision,
  onSeenChanges,
  onPrivateReasonChange,
  onThoughtChange,
  onContinueInThink,
  onFollowPage,
  onCopyReference,
  onShowInPage,
  acceptBusy = '',
  acceptError = '',
  stale = false
}) => {
  if (!panel) return null;
  const backLabel = {
    review: 'the proposed revision',
    evidence: 'this sentence',
    sources: 'the source list',
    history: 'page history',
    related: 'the connected idea',
    since: 'the change'
  }[panel.returnTo] || 'the previous view';

  if (panel.type === 'source') {
    const source = panel.source || {};
    const surround = panel.surround || {};
    return (
      <div className="wiki-reader-context">
        <PanelHeader label="The source, in context" onClose={onClose} onBack={onBack} backLabel={backLabel} />
        <p className="wiki-reader-context__meta">
          {clean(source.kind || source.type || 'Source')}
          {source.date || source.createdAt ? ` · ${new Date(source.date || source.createdAt).toLocaleDateString()}` : ''}
        </p>
        <h2>{clean(source.title) || 'Untitled source'}</h2>
        {panel.checking ? (
          <p className="wiki-reader-context__checking">
            <span className="wiki-reader-context__kicker">{preview ? 'Proposed sentence' : 'You were checking'}</span>
            {panel.checking}
          </p>
        ) : null}
        {surroundingOpen && surround.aroundBefore ? (
          <p className="wiki-reader-context__neighbor">
            <span className="wiki-reader-context__kicker">Before this passage</span>
            {surround.aroundBefore}
          </p>
        ) : null}
        {surround.excerpt ? <Quote>{surround.excerpt}</Quote> : <p>Source text unavailable. No replacement excerpt has been invented.</p>}
        {surroundingOpen && surround.aroundAfter ? (
          <p className="wiki-reader-context__neighbor">
            <span className="wiki-reader-context__kicker">After this passage</span>
            {surround.aroundAfter}
          </p>
        ) : null}
        <button
          type="button"
          className="wiki-reader-context__text"
          onClick={onToggleSurround}
          aria-expanded={surroundingOpen}
          disabled={!surround.canExpand}
        >
          {surround.canExpand
            ? (surroundingOpen ? 'Back to the cited passage' : 'Read a little around it')
            : 'No surrounding text available'}
        </button>
        {clean(source.limit || source.boundary) ? (
          <p className="wiki-reader-context__boundary">
            <span className="wiki-reader-context__kicker">What this does not settle</span>
            {clean(source.limit || source.boundary)}
          </p>
        ) : null}
        {panel.checking ? (
          <button type="button" className="wiki-reader-context__primary" onClick={onCopyReference}>
            Copy these words + reference
          </button>
        ) : null}
      </div>
    );
  }

  if (panel.type === 'sources') {
    const sources = Array.isArray(page?.sourceRefs) ? page.sourceRefs : [];
    return (
      <div className="wiki-reader-context">
        <PanelHeader label="Sources" onClose={onClose} onBack={onBack} backLabel={backLabel} />
        <h2>Behind this page</h2>
        <p className="wiki-reader-context__quiet">
          References in {wikiRevisionLabel({ page, revisionId: panel.revisionId, historical: panel.historical })}.
          {preview ? ' Proposed sources are not silently added here.' : ''}
        </p>
        {sources.length ? sources.map((source, index) => (
          <button
            key={source._id || source.id || `${source.title}-${index}`}
            type="button"
            className="wiki-reader-context__link"
            onClick={() => onOpenSource?.(source, index + 1)}
          >
            {source.title || 'Untitled source'}
          </button>
        )) : <p>No sources are attached to this page. That is not a claim that the page is verified.</p>}
      </div>
    );
  }

  if (panel.type === 'review') {
    const currentText = clean(panel.currentText);
    const proposedText = clean(panel.proposedText);
    const footprint = candidateFootprint({ current: page, candidate });
    return (
      <div className="wiki-reader-context">
        <PanelHeader label="Proposed revision" onClose={onClose} />
        <h2>{clean(panel.title) || 'A proposed revision, not yet the page.'}</h2>
        {clean(panel.reason) ? <p>{panel.reason}</p> : null}
        <div className="wiki-reader-context__footprint">
          <span className="wiki-reader-context__kicker">The whole change</span>
          <p>
            <strong>{footprint.changedCount} passage {footprint.changedCount === 1 ? 'change' : 'changes'}.</strong>
            {' '}{footprint.addedSourceCount} source {footprint.addedSourceCount === 1 ? 'is' : 'are'} added.
          </p>
          <p>{footprint.untouchedCount} other passages stay as they are.</p>
        </div>
        {currentText ? (
          <>
            <span className="wiki-reader-context__kicker">Current</span>
            <p className="wiki-reader-context__old">{currentText}</p>
          </>
        ) : null}
        {proposedText ? (
          <>
            <span className="wiki-reader-context__kicker">Proposed · not accepted</span>
            <p className="wiki-reader-context__new">{proposedText}</p>
          </>
        ) : null}
        {stale ? (
          <p className="wiki-reader-context__error" role="status">
            The current page changed after this proposal was prepared. Your newer version will not be replaced.
          </p>
        ) : (
          <div className="wiki-reader-context__actions">
            <button type="button" onClick={onPreview}>
              {preview ? 'Back to current version' : 'Read it in the page'}
            </button>
            <button type="button" className="wiki-reader-context__primary" onClick={onAccept} disabled={Boolean(acceptBusy)}>
              {acceptBusy === 'accept' ? 'Accepting…' : 'Accept revision'}
            </button>
            <button type="button" onClick={onKeepCurrent} disabled={Boolean(acceptBusy)}>
              Keep current version
            </button>
            <button type="button" onClick={onNotNow}>Not now</button>
          </div>
        )}
        {acceptError ? <p className="wiki-reader-context__error" role="alert">{acceptError}</p> : null}
      </div>
    );
  }

  if (panel.type === 'history') {
    const events = Array.isArray(revisions) ? revisions : [];
    return (
      <div className="wiki-reader-context">
        <PanelHeader label="Page history" onClose={onClose} />
        <h2>How the page changed</h2>
        <p className="wiki-reader-context__quiet">Recorded versions and reasons — not a claim about what you privately believed.</p>
        {events.length ? events.map((revision) => {
          const snapshot = historicalRevisionSnapshot(revision);
          const available = Boolean(snapshot);
          return (
            <div key={revision._id || revision.id} className="wiki-reader-context__history">
              <span className="wiki-reader-context__meta">
                {wikiRevisionLabel({
                  page: snapshot || page,
                  revisionId: revision._id || revision.id,
                  historical: true
                })}
              </span>
              <p>{clean(revision.reason || revision.summary?.reason || revision.summary) || 'No reason recorded.'}</p>
              {available ? (
                <button type="button" className="wiki-reader-context__text" onClick={() => onOpenHistoryRevision?.(revision)}>
                  Read this version
                </button>
              ) : (
                <p className="wiki-reader-context__quiet">No retained snapshot. Earlier words have not been reconstructed.</p>
              )}
            </div>
          );
        }) : (
          <p>No earlier snapshot is supplied for this page.</p>
        )}
      </div>
    );
  }

  if (panel.type === 'related') {
    const related = panel.page || {};
    const relatedId = related._id || related.id;
    return (
      <div className="wiki-reader-context">
        <PanelHeader label="Connected idea" onClose={onClose} onBack={onBack} backLabel={backLabel} />
        <h2>{displayWikiPageTitle(related, 'Untitled page')}</h2>
        {related.summary ? <Quote>{related.summary}</Quote> : null}
        {clean(panel.relation) ? <p className="wiki-reader-context__quiet">{panel.relation}</p> : null}
        <div className="wiki-reader-context__actions">
          {relatedId ? (
            <button type="button" className="wiki-reader-context__primary" onClick={() => onFollowPage?.(relatedId)}>
              Open this page
            </button>
          ) : null}
          <button type="button" onClick={onClose}>Stay here</button>
        </div>
      </div>
    );
  }

  if (panel.type === 'thought') {
    return (
      <div className="wiki-reader-context">
        <PanelHeader label="Take it further" onClose={onClose} />
        <h2>Keep the question open.</h2>
        <p className="wiki-reader-context__meta">
          From {displayWikiPageTitle(page, 'this page')} · {wikiRevisionLabel({ page, revisionId: panel.revisionId, historical: panel.historical })}
        </p>
        {panel.text ? <Quote>{panel.text}</Quote> : null}
        <label className="wiki-reader-context__kicker" htmlFor="wiki-private-thought">Your thought · private</label>
        <textarea
          id="wiki-private-thought"
          className="wiki-reader-context__field"
          value={thought}
          onChange={(event) => onThoughtChange?.(event.target.value)}
          placeholder="What does this make you question?"
        />
        <p className="wiki-reader-context__quiet">Saved privately on this device. Not part of the Wiki page.</p>
        <button type="button" className="wiki-reader-context__primary" onClick={onContinueInThink}>
          Take this into Think
        </button>
      </div>
    );
  }

  if (panel.type === 'reason') {
    return (
      <div className="wiki-reader-context">
        <PanelHeader label="A note for future you" onClose={onClose} />
        <h2>Why I changed it.</h2>
        <p className="wiki-reader-context__quiet">Optional. The revision was already accepted. This note is private.</p>
        <label className="wiki-reader-context__kicker" htmlFor="wiki-private-reason">Your reason · private</label>
        <textarea
          id="wiki-private-reason"
          className="wiki-reader-context__field"
          value={privateReason}
          onChange={(event) => onPrivateReasonChange?.(event.target.value)}
          placeholder="What persuaded you?"
        />
        <p className="wiki-reader-context__quiet">Not in the public page.</p>
      </div>
    );
  }

  if (panel.type === 'since') {
    const changes = Array.isArray(panel.changes) ? panel.changes : [];
    return (
      <div className="wiki-reader-context">
        <PanelHeader label="Since you last read" onClose={onClose} />
        <h2>You do not need to read it all again.</h2>
        {changes.length ? changes.map((change) => (
          <div key={change.id} className="wiki-reader-context__history">
            <span className="wiki-reader-context__kicker">{change.kind}</span>
            <p>{clean((change.after || change.before)?.text)}</p>
          </div>
        )) : <p>No paragraph wording or citation changes between these two stored versions.</p>}
        <div className="wiki-reader-context__actions">
          <button type="button" className="wiki-reader-context__primary" onClick={onShowInPage}>
            Show only what changed
          </button>
          <button type="button" onClick={onSeenChanges}>I’ve seen these changes</button>
        </div>
        <p className="wiki-reader-context__quiet">Seen is only a reading marker. It does not accept a candidate or set a reviewed date.</p>
      </div>
    );
  }

  if (panel.type === 'reference') {
    return (
      <div className="wiki-reader-context">
        <PanelHeader label="A sentence with its moment" onClose={onClose} />
        <h2>The words, as they were.</h2>
        {panel.text ? <Quote>{panel.text}</Quote> : <p>This historical snapshot is unavailable. Current text will not be substituted silently.</p>}
        <p className="wiki-reader-context__quiet">{panel.label || wikiRevisionLabel({ page, revisionId: panel.revisionId, historical: panel.historical, proposed: panel.proposed })}</p>
        <div className="wiki-reader-context__actions">
          {panel.text ? <button type="button" className="wiki-reader-context__primary" onClick={onCopyReference}>Copy these words + reference</button> : null}
          {panel.pageId ? <Link className="wiki-reader-context__text" to={wikiReadPath(panel.pageId, panel.revisionId ? `rev=${encodeURIComponent(panel.revisionId)}` : '')}>Open this version</Link> : null}
        </div>
      </div>
    );
  }

  return null;
};

export default WikiReaderContext;
