import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getConceptInvestigation } from '../../../api/concepts';
import '../../../styles/concept-investigation.css';

const safeInternalHref = value => (
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
);

const InvestigationLink = ({ reference, children }) => (
  safeInternalHref(reference?.href) ? (
    <Link to={reference.href}>{children || reference.title}</Link>
  ) : <span>{children || reference?.title}</span>
);

const EvidenceColumn = ({ title, items = [], empty }) => (
  <section className="concept-investigation__column">
    <header>
      <h3>{title}</h3>
      <span>{items.length}</span>
    </header>
    {items.length ? (
      <ul>
        {items.map(item => (
          <li key={`${item?.ref?.type || 'source'}:${item?.ref?.id || item?.excerpt}`}>
            <InvestigationLink reference={item.ref}>{item?.ref?.title || 'Source evidence'}</InvestigationLink>
            {item.excerpt ? <p>{item.excerpt}</p> : null}
          </li>
        ))}
      </ul>
    ) : <p className="concept-investigation__quiet">{empty}</p>}
  </section>
);

const ConceptInvestigationPanel = ({
  conceptId,
  loadedConceptId = '',
  wikiPageId,
  revisionId = '',
  claimId = '',
  onRunWorkbenchAction,
  workbenchBusy = false,
  onClose
}) => {
  const [requestVersion, setRequestVersion] = useState(0);
  const [verifiedConceptId, setVerifiedConceptId] = useState('');
  const [state, setState] = useState({ loading: true, error: '', investigation: null });
  const identityMismatch = Boolean(
    conceptId && loadedConceptId && String(conceptId) !== String(loadedConceptId)
  );
  const identityReady = Boolean(
    conceptId && String(verifiedConceptId) === String(conceptId)
  );

  useEffect(() => {
    if (!conceptId || identityMismatch) {
      setVerifiedConceptId('');
      return;
    }
    if (loadedConceptId && String(loadedConceptId) === String(conceptId)) {
      setVerifiedConceptId(String(conceptId));
    }
  }, [conceptId, identityMismatch, loadedConceptId]);

  useEffect(() => {
    let active = true;
    if (!conceptId || !wikiPageId) {
      setState({ loading: false, error: 'This investigation link is missing exact context.', investigation: null });
      return () => { active = false; };
    }
    if (identityMismatch) {
      setState({ loading: false, error: 'The selected Concept does not match this investigation link.', investigation: null });
      return () => { active = false; };
    }
    if (!identityReady) {
      setState({ loading: false, error: '', investigation: null });
      return () => { active = false; };
    }

    setState(previous => ({ ...previous, loading: true, error: '' }));
    getConceptInvestigation({ conceptId, wikiPageId, revisionId, claimId })
      .then(payload => {
        if (!active) return;
        const investigation = payload?.investigation || null;
        if (String(investigation?.concept?.id || '') !== String(conceptId)) {
          setState({ loading: false, error: 'The investigation response did not match the requested Concept.', investigation: null });
          return;
        }
        setState({ loading: false, error: '', investigation });
      })
      .catch(error => {
        if (!active) return;
        setState({
          loading: false,
          error: error?.response?.data?.error || 'Could not load this investigation.',
          investigation: null
        });
      });
    return () => { active = false; };
  }, [claimId, conceptId, identityMismatch, identityReady, requestVersion, revisionId, wikiPageId]);

  const investigation = state.investigation;
  const candidate = investigation?.proposals?.candidateWikiRevision;
  const workbenchChanges = investigation?.proposals?.workbenchChanges || [];
  const agentSuggestions = investigation?.proposals?.agentSuggestions || [];
  const proposalCount = (
    (investigation?.proposals?.workbenchChanges?.length || 0)
    + (investigation?.proposals?.agentSuggestions?.length || 0)
    + (candidate ? 1 : 0)
  );
  const investigationActions = [
    investigation?.actions?.findContraryEvidence,
    investigation?.actions?.compareHistoricalCases,
    investigation?.actions?.traceCitationsBackward,
    investigation?.actions?.draftWikiRevision
  ].filter(Boolean);

  const runInvestigationAction = action => {
    if (action?.intent !== 'find_contrary_evidence' || action?.enabled === false || workbenchBusy) return;
    onRunWorkbenchAction?.(action.intent);
  };

  return (
    <section className="concept-investigation" aria-labelledby="concept-investigation-title">
      <header className="concept-investigation__header">
        <div>
          <span className="concept-investigation__eyebrow">ΚΡΙΣΙΣ · INVESTIGATION CONTEXT</span>
          <h2 id="concept-investigation-title">What changed around this Concept</h2>
          <p>Read-only context from the exact Wiki revision. Nothing here changes your accepted knowledge.</p>
        </div>
        <button type="button" onClick={onClose}>Close context</button>
      </header>

      {!identityMismatch && conceptId && wikiPageId && !identityReady ? (
        <p className="concept-investigation__status">Loading the exact Concept identity…</p>
      ) : null}
      {identityReady && state.loading ? <p className="concept-investigation__status">Tracing the exact revision and source record…</p> : null}
      {!state.loading && state.error ? (
        <div className="concept-investigation__status is-error" role="alert">
          <p>{state.error}</p>
          {!identityMismatch && conceptId && wikiPageId ? (
            <button type="button" onClick={() => setRequestVersion(value => value + 1)}>Retry</button>
          ) : null}
        </div>
      ) : null}

      {!state.loading && investigation ? (
        <div className="concept-investigation__body">
          <div className="concept-investigation__framing">
            <div>
              <span>Governing question</span>
              <h3>{investigation.framing?.governingQuestion?.text || 'No governing question is recorded.'}</h3>
            </div>
            <div>
              <span>Working synthesis</span>
              <p>{investigation.framing?.workingSynthesis?.text || 'No working synthesis is recorded.'}</p>
            </div>
          </div>

          <div className="concept-investigation__facts">
            <span>{investigation.entryContext?.reviewState === 'candidate' ? 'Candidate revision' : 'Current revision'}</span>
            <span>Acceptance {investigation.currentWiki?.acceptanceState || 'unverified'}</span>
            <span>{proposalCount} {proposalCount === 1 ? 'proposal' : 'proposals'} kept separate</span>
            {investigation.entryContext?.page ? (
              <InvestigationLink reference={investigation.entryContext.page}>Open Wiki evidence</InvestigationLink>
            ) : null}
          </div>

          <div className="concept-investigation__evidence">
            <EvidenceColumn title="Support" items={investigation.evidence?.support} empty="No current support is attached." />
            <EvidenceColumn title="Tension" items={investigation.evidence?.tension} empty="No current tension is attached." />
            <EvidenceColumn title="Context" items={investigation.evidence?.context} empty="No additional context is attached." />
          </div>

          <div className="concept-investigation__judgment-grid">
            <section>
              <span>Strongest counterargument</span>
              <p>{investigation.strongestCounterargument?.text || 'Not recorded.'}</p>
            </section>
            <section>
              <span>What remains unknown</span>
              {investigation.unknowns?.length ? (
                <ul>{investigation.unknowns.map(item => <li key={item.text}>{item.text}</li>)}</ul>
              ) : <p>Nothing is explicitly recorded.</p>}
            </section>
            <section>
              <span>What would change my mind</span>
              {investigation.whatWouldChangeMyMind?.length ? (
                <ul>{investigation.whatWouldChangeMyMind.map(item => <li key={item.text}>{item.text}</li>)}</ul>
              ) : <p>No falsifier is recorded.</p>}
            </section>
            {investigation.causalModel?.summary ? (
              <section>
                <span>Causal model</span>
                <p>{investigation.causalModel.summary}</p>
              </section>
            ) : null}
          </div>

          <div className="concept-investigation__state">
            <section>
              <span>Current Wiki claim · acceptance unverified</span>
              {investigation.currentWiki?.claim ? (
                <InvestigationLink reference={investigation.currentWiki.claim}>
                  {investigation.currentWiki.claim.title}
                </InvestigationLink>
              ) : <p>This page-scoped investigation does not select one claim.</p>}
            </section>
            <section>
              <span>Proposed — not applied</span>
              {!candidate && !workbenchChanges.length && !agentSuggestions.length ? (
                <p>No pending proposal is attached.</p>
              ) : (
                <ul>
                  {workbenchChanges.map(item => (
                    <li key={`workbench:${item.id || item.title}`}>
                      <strong>{item.title || 'Workbench change'}</strong>
                      {item.summary ? <p>{item.summary}</p> : null}
                    </li>
                  ))}
                  {agentSuggestions.map(item => (
                    <li key={`agent:${item.id || item.title}`}>
                      <strong>{item.title || 'Agent suggestion'}</strong>
                      {item.summary ? <p>{item.summary}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {candidate ? (
            <div className="concept-investigation__candidate">
              <div>
                <span>Proposed, not accepted</span>
                <h3>{candidate.title}</h3>
                <p>{candidate.summary}</p>
              </div>
              {candidate.ref ? <InvestigationLink reference={candidate.ref}>Review candidate in Wiki</InvestigationLink> : null}
            </div>
          ) : null}
          <footer className="concept-investigation__actions">
            {investigationActions.map(action => {
              const executable = action.intent === 'find_contrary_evidence' && action.enabled !== false;
              const disabled = !executable || workbenchBusy;
              const reason = executable
                ? (workbenchBusy ? 'The Concept workbench is already running an action.' : '')
                : (action.unavailableReason || 'This capability is not available in this investigation yet.');
              return (
                <div key={action.intent} className="concept-investigation__action">
                  <button
                    type="button"
                    disabled={disabled}
                    title={reason}
                    onClick={() => runInvestigationAction(action)}
                  >
                    {action.label}
                  </button>
                  {reason ? <span>{reason}</span> : null}
                </div>
              );
            })}
          </footer>
        </div>
      ) : null}
    </section>
  );
};

export default ConceptInvestigationPanel;
