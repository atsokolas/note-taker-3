import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AGENT_DISPLAY_NAME } from '../constants/agentIdentity';
import { useAgentRail } from './AgentRailContext';
import { answeredWithoutModel, mapAgentStructureProposal, sourcesReadFor } from './agentConversationModel';
import StructureProposalReview from '../components/agent/StructureProposalReview';
import useAgentReviewState from '../components/agent/useAgentReviewState';
import '../styles/agent-rail.css';

// The Partner. One panel, opened with ⌘J in every room, mounted once at the
// shell so its conversation survives the column changing. Only the scope
// changes from room to room. It reads and proposes; the reader clicks.

const NOTE_ARRIVAL_MS = 220;
const NOOP_ASYNC = async () => {};

// Wording to try in a draft is something the Partner wrote. A reply that is
// mostly quotation, or put together without the model, is evidence instead.
const QUOTATION_RE = /“[^”]*”|"[^"]*"/g;
const isWording = (message = {}) => {
  const text = String(message.text || '').trim();
  const quoted = (text.match(QUOTATION_RE) || []).join('').length;
  return Boolean(text) && !answeredWithoutModel(message) && quoted * 2 < text.length;
};

const fieldLabel = (field) => {
  if (field === 'why') return 'For';
  if (field === 'against') return 'Against';
  if (field === 'criteria') return 'Would change my mind';
  return field;
};

/* One proposed line: the sentence, where it came from, and the reader's
   choice. When retrieval returned more than one candidate, Another shows the
   next, so accepting the first is a choice. Accept writes what is on screen. */
const Proposal = ({ proposal, busy, onAccept, onDismiss }) => {
  const [choosing, setChoosing] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [arriving, setArriving] = useState(true);
  const [index, setIndex] = useState(0);
  const leaveTimer = useRef(null);

  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
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
            <button key={field} type="button" disabled={busy} onClick={() => leave(() => acceptShown(field))}>
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
            onClick={() => { setChoosing(false); setIndex(current => (current + 1) % candidates.length); }}
          >
            Another
          </button>
        ) : null}
        <button type="button" disabled={busy} onClick={() => leave(() => onDismiss(proposal.id))}>Not now</button>
      </span>
      {candidates.length > 1 ? (
        <p className="agent-rail__proposal-count">{index + 1} of {candidates.length}</p>
      ) : null}
    </div>
  );
};

const PartnerPanel = () => {
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
    dismissProposal,
    tryWording
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
  const visibleMessages = messages.slice(-6);
  const canTryWording = (surface.supportedActions || []).includes('try-wording');
  // A reply that can be accepted is offered where it was said, so the
  // conversation keeps its order. Anything else waits below it.
  const proposalFor = message => (message.role === 'assistant'
    ? proposals.find(proposal => proposal.messageId === message.id)
    : null);
  const inlineProposalIds = new Set(visibleMessages.map(proposalFor).filter(Boolean).map(proposal => proposal.id));
  const waiting = proposals.filter(proposal => !inlineProposalIds.has(proposal.id));
  const lastReply = [...visibleMessages].reverse().find(message => message.role === 'assistant' && message.text);
  const read = lastReply ? sourcesReadFor(lastReply) : [];
  // The last plan applied stays one click from undone.
  const applied = resolvedStructureProposals.find(proposal => ['applied', 'partially_applied'].includes(proposal.status));
  const caption = canAsk ? surface.caption : availabilityReason;

  return (
    <aside
      className="agent-rail"
      aria-label={AGENT_DISPLAY_NAME}
      data-agent-contract={surface.contractId || undefined}
      data-agent-actions={Array.isArray(surface.supportedActions) ? surface.supportedActions.join(' ') : undefined}
      data-agent-proposal-policy={surface.proposalPolicy || undefined}
    >
      <div className="agent-rail__identity">
        <span key={surface.id || 'idle'} className={`agent-rail__thread${busy ? ' is-working' : ''}`} aria-hidden="true">
          <span className="agent-rail__thread-knot" />
        </span>
        <p className="agent-rail__eyebrow">{AGENT_DISPLAY_NAME}</p>
        <span className="agent-rail__scope" key={surface.scope}>{surface.scope || 'everything'}</span>
      </div>

      {surface.subject ? (
        <p className="agent-rail__subject" key={surface.id || surface.subject}>{surface.subject}</p>
      ) : null}

      {lines.length ? (
        <ul className="agent-rail__lines">
          {lines.map(line => <li key={line.id || line.text}>{line.text || line}</li>)}
        </ul>
      ) : null}

      {visibleMessages.length ? (
        <ol className="agent-rail__conversation" aria-live="polite">
          {visibleMessages.map((message) => {
            const proposal = proposalFor(message);
            return (
              <li key={message.id} className={`agent-rail__message agent-rail__message--${message.role}`}>
                <span>{message.role === 'user' ? 'You' : AGENT_DISPLAY_NAME}</span>
                {proposal ? (
                  <Proposal proposal={proposal} busy={busy} onAccept={accept} onDismiss={dismissProposal} />
                ) : (
                  <p>{message.text}</p>
                )}
                {answeredWithoutModel(message) ? <small>From your passages while the Partner rests.</small> : null}
                {canTryWording && message.role === 'assistant' && isWording(message) ? (
                  <span className="agent-rail__actions">
                    <button type="button" onClick={() => tryWording(message.text)}>Try wording</button>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}

      {waiting.length || pendingStructureProposals.length ? (
        <section className="agent-rail__section" aria-label="Waiting for you" aria-live="polite">
          <p className="agent-rail__label">Waiting for you</p>
          {waiting.map(proposal => (
            <Proposal key={proposal.id} proposal={proposal} busy={busy} onAccept={accept} onDismiss={dismissProposal} />
          ))}
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

      {applied ? (
        <StructureProposalReview
          proposal={applied}
          isLoading={structureProposalLoadingId === applied.structureProposalId}
          activeOperationId={structureProposalOperationLoadingId}
          onRollback={handleRollbackStructureProposal}
        />
      ) : null}

      {read.length ? (
        <section className="agent-rail__section" aria-label="What it read">
          <p className="agent-rail__label">What it read</p>
          <ul className="agent-rail__lines">
            {read.map(source => (
              <li key={source.key}>{source.href ? <Link to={source.href}>{source.title}</Link> : source.title}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {busy ? <p className="agent-rail__status" role="status">{activity || 'Reading…'}</p> : null}
      {error ? <p className="agent-rail__error" role="alert">{error}</p> : null}
      {reviewError ? <p className="agent-rail__error" role="alert">{reviewError}</p> : null}

      <form className="agent-rail__ask" onSubmit={submit}>
        <label className="sr-only" htmlFor="agent-rail-ask">Ask the Partner</label>
        <input
          id="agent-rail-ask"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={surface.askPlaceholder || 'Ask about this'}
          autoComplete="off"
        />
        <button type="submit" disabled={busy || !draft.trim()}>Ask</button>
      </form>
      {caption ? <p className="agent-rail__caption">{caption}</p> : null}
    </aside>
  );
};

export default PartnerPanel;
