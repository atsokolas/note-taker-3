import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAgentRail } from './AgentRailContext';
import { mapAgentStructureProposal, sourceLabelForAgentMessage } from './agentConversationModel';
import StructureProposalReview from '../components/agent/StructureProposalReview';
import useAgentReviewState from '../components/agent/useAgentReviewState';
import '../styles/agent-rail.css';

// The agent's side of the page. One instance, mounted at the shell, so it is
// still there after the column changes — the rail is not a panel that opens,
// it is where the agent lives. It retrieves; the human accepts. Nothing it
// finds is written down until someone says so.

const ASK_PLACEHOLDER = 'Bring evidence or counterevidence';

/**
 * Certainty about where the agent is looking. Zero is not an empty state to
 * hide — a reader who knows nothing is bound can trust the silence that follows.
 */
const describeBoundCorpus = (count) => (
  count === 0 ? 'no bound sources' : `${count} bound source${count === 1 ? '' : 's'}`
);
const NOTE_ARRIVAL_MS = 220;
const NOOP_ASYNC = async () => {};

const fieldLabel = (field) => {
  if (field === 'why') return 'Why';
  if (field === 'against') return 'Against';
  if (field === 'criteria') return 'Change';
  return field;
};

/* One retrieved line, in the state the product is actually about: the sentence,
   where it came from, and what the human can do with it.
 *
 * Two things this carries that a bare proposal did not.
 *
 * Provenance. A retrieved sentence with no source is an assertion, and the
 * whole contract here is that the agent retrieves rather than knows. The line
 * under the sentence says where it was found; if nothing came back with a
 * source, it says that too, because "unattributed" is information.
 *
 * And Another. Retrieval returns a list. Showing exactly one result as though
 * it were the result quietly overclaims — so when the ask came back with more
 * than one candidate, the human can see the next one instead of accepting the
 * first thing offered. Accept always writes the candidate on screen.
 */
const RailProposal = ({ proposal, busy, onAccept, onDismiss }) => {
  const [choosing, setChoosing] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [arriving, setArriving] = useState(true);
  const [index, setIndex] = useState(0);
  const leaveTimer = useRef(null);

  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  useEffect(() => {
    const reduce = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (reduce) {
      setArriving(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setArriving(false), NOTE_ARRIVAL_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const candidates = [proposal, ...(Array.isArray(proposal.alternatives) ? proposal.alternatives : [])];
  const shown = candidates[index] || proposal;
  const fields = Array.isArray(proposal.fields) && proposal.fields.length ? proposal.fields : ['against'];

  const leave = (run) => {
    setLeaving(true);
    window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(run, 200);
  };

  /* Accept writes what is on screen, not what arrived first. */
  const acceptShown = (field) => onAccept({ ...proposal, ...shown, id: proposal.id }, field);

  return (
    <div className={`agent-rail__proposal${leaving ? ' is-leaving' : ''}${arriving ? ' is-arriving' : ''}`}>
      <p className="agent-rail__proposal-sentence">{shown.sentence}</p>
      <p className="agent-rail__proposal-source">
        {shown.source || 'No source came back with this.'}
      </p>
      {proposal.origin ? <p className="agent-rail__proposal-origin">{proposal.origin}</p> : null}
      <span className="agent-rail__actions">
        {choosing || fields.length === 1 ? (
          fields.map(field => (
            <button
              key={field}
              type="button"
              disabled={busy}
              onClick={() => leave(() => acceptShown(field))}
            >
              {fields.length === 1 ? 'Accept' : fieldLabel(field)}
            </button>
          ))
        ) : (
          <button type="button" disabled={busy} onClick={() => setChoosing(true)}>Accept</button>
        )}
        {candidates.length > 1 ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => { setChoosing(false); setIndex((current) => (current + 1) % candidates.length); }}
          >
            Another
          </button>
        ) : null}
        <button type="button" disabled={busy} onClick={() => leave(() => onDismiss(proposal.id))}>Dismiss</button>
      </span>
      {candidates.length > 1 ? (
        <p className="agent-rail__proposal-count">
          {index + 1} of {candidates.length} retrieved
        </p>
      ) : null}
    </div>
  );
};

const AgentRail = () => {
  const {
    surface,
    proposals,
    messages,
    threadId,
    activity,
    busy,
    canAsk,
    availabilityReason,
    error,
    draft,
    setDraft,
    ask,
    accept,
    dismissProposal
  } = useAgentRail();
  const [reviewError, setReviewError] = useState('');
  const reportReviewError = useCallback((message) => setReviewError(String(message || '')), []);
  const {
    pendingStructureProposals,
    resolvedStructureProposals,
    structureProposalLoadingId,
    structureProposalOperationLoadingId,
    loadStructureProposals,
    handleUpdateStructureProposalOperationStatus,
    handleBulkUpdateStructureProposalOperationStatus,
    handleApplyStructureProposal,
    handleRejectStructureProposal,
    handleRollbackStructureProposal
  } = useAgentReviewState({
    activeThreadId: threadId,
    mapStructureProposal: mapAgentStructureProposal,
    loadRuns: NOOP_ASYNC,
    loadHarnessMetrics: NOOP_ASYNC,
    setError: reportReviewError
  });

  useEffect(() => {
    if (threadId) loadStructureProposals(threadId);
  }, [loadStructureProposals, threadId]);

  const submit = (event) => {
    event.preventDefault();
    const question = draft.trim();
    if (!question || busy) return;
    setDraft('');
    ask(question);
  };

  const lines = Array.isArray(surface.lines) ? surface.lines : [];
  const visibleMessages = messages
    .filter(message => !proposals.some(proposal => proposal.sentence === message.text))
    .slice(-6);
  const quiet = !visibleMessages.length && !proposals.length && !lines.length && !busy && !error;
  // A surface that has not taught the rail how to retrieve says so, rather than
  // offering an input that would swallow the question.
  const quietLine = surface.empty
    || (canAsk ? 'Nothing to retrieve until you ask.' : availabilityReason || 'Nothing to retrieve here yet.');
  const askPlaceholder = surface.askPlaceholder || ASK_PLACEHOLDER;
  const caption = surface.caption || 'Retrieves. You accept.';

  return (
    <aside
      className="agent-rail"
      aria-label={surface.roleLabel || 'Agent'}
      data-agent-contract={surface.contractId || undefined}
      data-agent-presentation="rail"
      data-agent-actions={Array.isArray(surface.supportedActions) ? surface.supportedActions.join(' ') : undefined}
      data-agent-proposal-policy={surface.proposalPolicy || undefined}
    >
      <div className="agent-rail__identity">
        <span
          key={surface.id || 'idle'}
          className={`agent-rail__thread${busy ? ' is-working' : ''}`}
          aria-hidden="true"
        >
          <span className="agent-rail__thread-knot" />
        </span>
        <p className="agent-rail__eyebrow">{surface.roleLabel || 'Agent'}</p>
      </div>

      {surface.roleDescription ? (
        <p className="agent-rail__role-description">{surface.roleDescription}</p>
      ) : null}

      {surface.subject ? (
        <p className="agent-rail__subject" key={surface.id || surface.subject}>
          <span>Now with</span>
          {surface.subject}
          {surface.boundSources === null ? null : (
            <small className="agent-rail__envelope">{describeBoundCorpus(surface.boundSources)}</small>
          )}
        </p>
      ) : null}

      {lines.length ? (
        <ul className="agent-rail__lines">
          {lines.map(line => <li key={line.id || line.text}>{line.text || line}</li>)}
        </ul>
      ) : null}

      {visibleMessages.length ? (
        <ol className="agent-rail__conversation" aria-live="polite">
          {visibleMessages.map(message => (
            <li key={message.id} className={`agent-rail__message agent-rail__message--${message.role}`}>
              <span>{message.role === 'user' ? 'You' : 'Noeis'}</span>
              <p>{message.text}</p>
              {sourceLabelForAgentMessage(message) ? (
                <small>{sourceLabelForAgentMessage(message)}</small>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}

      {proposals.length ? (
        <div className="agent-rail__proposals" aria-live="polite">
          {proposals.map(proposal => (
            <RailProposal
              key={proposal.id}
              proposal={proposal}
              busy={busy}
              onAccept={accept}
              onDismiss={dismissProposal}
            />
          ))}
        </div>
      ) : null}

      {pendingStructureProposals.length ? (
        <section className="agent-rail__review-stage" aria-label="Review staged organization plan">
          <p className="agent-rail__review-label">Review before anything changes</p>
          {pendingStructureProposals.map(proposal => (
            <StructureProposalReview
              key={proposal.structureProposalId}
              proposal={proposal}
              isLoading={structureProposalLoadingId === proposal.structureProposalId}
              activeOperationId={structureProposalOperationLoadingId}
              onApply={handleApplyStructureProposal}
              onReject={handleRejectStructureProposal}
              onUpdateOperationStatus={handleUpdateStructureProposalOperationStatus}
              onBulkUpdateOperationStatus={handleBulkUpdateStructureProposalOperationStatus}
            />
          ))}
        </section>
      ) : null}

      {resolvedStructureProposals.some(proposal => ['applied', 'partially_applied'].includes(proposal.status)) ? (
        <section className="agent-rail__review-stage" aria-label="Recent organization plan">
          <p className="agent-rail__review-label">Recent applied plan</p>
          {resolvedStructureProposals
            .filter(proposal => ['applied', 'partially_applied'].includes(proposal.status))
            .slice(0, 1)
            .map(proposal => (
              <StructureProposalReview
                key={proposal.structureProposalId}
                proposal={proposal}
                isLoading={structureProposalLoadingId === proposal.structureProposalId}
                activeOperationId={structureProposalOperationLoadingId}
                onRollback={handleRollbackStructureProposal}
              />
            ))}
        </section>
      ) : null}

      {busy ? <p className="agent-rail__status" role="status">{activity || 'Thinking…'}</p> : null}
      {error ? <p className="agent-rail__error" role="alert">{error}</p> : null}
      {reviewError ? <p className="agent-rail__error" role="alert">{reviewError}</p> : null}

      {/* An empty rail says so in a sentence. It does not draw a dashed box
          around the absence. */}
      {quiet ? (
        <p className="agent-rail__quiet">{quietLine}</p>
      ) : null}

      <form className="agent-rail__ask" onSubmit={submit}>
        <label className="sr-only" htmlFor="agent-rail-ask">Ask the agent</label>
        <input
          id="agent-rail-ask"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={askPlaceholder}
          title={askPlaceholder}
          autoComplete="off"
          /* Always typeable. A disabled field on a page that has nothing to
             retrieve reads as a broken rail rather than an idle one; the ask
             itself says when there is nothing to ask against. */
        />
        <button type="submit" disabled={busy || !draft.trim()}>Ask</button>
      </form>
      <p className="agent-rail__caption">{threadId ? 'One conversation, wherever you go.' : caption}</p>
    </aside>
  );
};

export default AgentRail;
