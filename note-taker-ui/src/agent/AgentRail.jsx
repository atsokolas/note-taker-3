import React, { useState } from 'react';
import { useAgentRail } from './AgentRailContext';
import '../styles/agent-rail.css';

// The agent's side of the page. One instance, mounted at the shell, so it is
// still there after the column changes — the rail is not a panel that opens,
// it is where the agent lives. It retrieves; the human accepts. Nothing it
// finds is written down until someone says so.

const ASK_PLACEHOLDER = 'Bring evidence, counterevidence, or what moved overnight';

/* One retrieved line. Accept resolves in place into the choice of field when
   there is a choice to make — the human decides which of the two it is. */
const RailProposal = ({ proposal, busy, onAccept, onDismiss }) => {
  const [choosing, setChoosing] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const fields = Array.isArray(proposal.fields) && proposal.fields.length ? proposal.fields : ['against'];

  const leave = (run) => {
    setLeaving(true);
    window.setTimeout(run, 200);
  };

  return (
    <div className={`agent-rail__proposal${leaving ? ' is-leaving' : ''}`}>
      <p className="agent-rail__proposal-sentence">{proposal.sentence}</p>
      {proposal.origin ? <p className="agent-rail__proposal-origin">{proposal.origin}</p> : null}
      <span className="agent-rail__actions">
        {choosing || fields.length === 1 ? (
          fields.map(field => (
            <button
              key={field}
              type="button"
              disabled={busy}
              onClick={() => leave(() => onAccept(proposal, field))}
            >
              {fields.length === 1 ? 'Accept' : field === 'why' ? 'Why' : 'Against'}
            </button>
          ))
        ) : (
          <button type="button" disabled={busy} onClick={() => setChoosing(true)}>Accept</button>
        )}
        <button type="button" disabled={busy} onClick={() => leave(() => onDismiss(proposal.id))}>Dismiss</button>
      </span>
    </div>
  );
};

const AgentRail = () => {
  const { surface, proposals, busy, canAsk, error, ask, accept, dismissProposal } = useAgentRail();
  const [draft, setDraft] = useState('');

  const submit = (event) => {
    event.preventDefault();
    const question = draft.trim();
    if (!question || busy || !canAsk) return;
    setDraft('');
    ask(question);
  };

  const lines = Array.isArray(surface.lines) ? surface.lines : [];
  const quiet = !proposals.length && !lines.length && !busy && !error;
  // A surface that has not taught the rail how to retrieve says so, rather than
  // offering an input that would swallow the question.
  const quietLine = surface.empty
    || (canAsk ? 'Nothing to retrieve until you ask.' : 'Nothing to retrieve here yet.');

  return (
    <aside className="agent-rail" aria-label="Agent">
      <p className="agent-rail__eyebrow">Agent</p>

      {surface.subject ? <p className="agent-rail__subject">{surface.subject}</p> : null}

      {lines.length ? (
        <ul className="agent-rail__lines">
          {lines.map(line => <li key={line.id || line.text}>{line.text || line}</li>)}
        </ul>
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

      {busy ? <p className="agent-rail__status" role="status">Looking…</p> : null}
      {error ? <p className="agent-rail__error" role="alert">{error}</p> : null}

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
          placeholder={ASK_PLACEHOLDER}
          autoComplete="off"
          disabled={!canAsk}
        />
        <button type="submit" disabled={busy || !canAsk || !draft.trim()}>Ask</button>
      </form>
      <p className="agent-rail__caption">Retrieves. You accept.</p>
    </aside>
  );
};

export default AgentRail;
