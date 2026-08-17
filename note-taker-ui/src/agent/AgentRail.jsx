import React, { useState } from 'react';
import { useAgentRail } from './AgentRailContext';
import '../styles/agent-rail.css';

// The agent's side of the page. One instance, mounted at the shell, so it is
// still there after the column changes — the rail is not a panel that opens,
// it is where the agent lives. It retrieves; the human accepts. Nothing it
// finds is written down until someone says so.

const ASK_PLACEHOLDER = 'Bring evidence, counterevidence, or what moved overnight';

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
  const [index, setIndex] = useState(0);

  const candidates = [proposal, ...(Array.isArray(proposal.alternatives) ? proposal.alternatives : [])];
  const shown = candidates[index] || proposal;
  const fields = Array.isArray(proposal.fields) && proposal.fields.length ? proposal.fields : ['against'];

  const leave = (run) => {
    setLeaving(true);
    window.setTimeout(run, 200);
  };

  /* Accept writes what is on screen, not what arrived first. */
  const acceptShown = (field) => onAccept({ ...proposal, ...shown, id: proposal.id }, field);

  return (
    <div className={`agent-rail__proposal${leaving ? ' is-leaving' : ''}`}>
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
              {fields.length === 1 ? 'Accept' : field === 'why' ? 'Why' : 'Against'}
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
