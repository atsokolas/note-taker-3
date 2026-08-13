import React, { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { getDecisions } from '../api/decisions';
import { getWikiPage, listWikiPages, updateWikiPage } from '../api/wiki';
import ThoughtPartnerPanel from '../components/agent/ThoughtPartnerPanel';
import DecisionCreateForm from '../components/wiki/decisions/DecisionCreateForm';
import DecisionReviewPanel from '../components/wiki/decisions/DecisionReviewPanel';
import '../styles/judgment-room.css';

const JUDGMENT_VIEWS = [
  { id: 'dossiers', label: 'Dossiers', note: 'Grounded cases' },
  { id: 'decisions', label: 'Decisions', note: 'As made' },
  { id: 'reviews', label: 'Reviews due', note: 'Human-set clocks' },
  { id: 'outcomes', label: 'Outcomes', note: 'Never inferred' },
  { id: 'lessons', label: 'Lessons', note: 'Human-confirmed' }
];

const WIKI_PAGE_CACHE_KEY = 'noeis.wiki.frontPageSnapshot.v1';
const WIKI_PAGE_CACHE_MAX_AGE_MS = 36 * 60 * 60 * 1000;
const ARTIFICIAL_PREVIEW_ID = 'artificial-northstar-compute';
const artificialPreviewHref = (anchor = '') => `/judgment?preview=artificial${anchor ? `#${anchor}` : ''}`;

const ARTIFICIAL_JUDGMENT_PAGE = {
  _id: ARTIFICIAL_PREVIEW_ID,
  title: 'Northstar Compute — capacity before conviction',
  investmentDossier: { version: 2, company: { ticker: 'SYNTH' } },
  sourceRefs: [
    { _id: 'artificial-source-ref-1', title: 'Synthetic contract cohort memo', href: artificialPreviewHref('source-record') },
    { _id: 'artificial-source-ref-2', title: 'Synthetic capacity schedule', href: artificialPreviewHref('source-record') },
    { _id: 'artificial-source-ref-3', title: 'Synthetic financing scenario', href: artificialPreviewHref('source-record') },
    { _id: 'artificial-source-ref-4', title: 'Synthetic customer concentration review', href: artificialPreviewHref('source-record') },
    { _id: 'artificial-source-ref-5', title: 'Synthetic signed-capacity update', href: artificialPreviewHref('source-record') }
  ],
  judgment: {
    kind: 'thesis',
    currentJudgment: 'The demand thesis held, but the decision was early because contracted capacity mattered more than announced capacity.',
    falsifiers: [
      { text: 'Committed backlog converts below 70% for two consecutive review periods.' },
      { text: 'Customer concentration rises while renewal duration shortens.' },
      { text: 'Incremental capacity requires returns below the portfolio hurdle rate.' }
    ],
    unknowns: [
      { question: 'How much pricing power survives the next supply cycle?' },
      { question: 'Can the company fund the next build without weakening per-share economics?' }
    ],
    decisions: [
      { decisionId: 'artificial-decision-1' },
      { decisionId: 'artificial-decision-2' },
      { decisionId: 'artificial-decision-3' }
    ]
  }
};

const ARTIFICIAL_DECISION_ITEM = {
  version: 1,
  id: `${ARTIFICIAL_PREVIEW_ID}:artificial-decision-1`,
  identity: { pageId: ARTIFICIAL_PREVIEW_ID, decisionId: 'artificial-decision-1' },
  page: { title: ARTIFICIAL_JUDGMENT_PAGE.title, href: artificialPreviewHref('current-thesis') },
  subject: { title: 'Open a starter position, not a full position', href: artificialPreviewHref('decision-record') },
  decision: {
    summary: 'Open a 1.5% starter position and require contract conversion before adding.',
    rationale: 'At decision time, owned research supported durable demand, but the evidence for capacity conversion and financing discipline was incomplete.',
    expectedOutcome: 'Backlog converts into contracted revenue without weakening per-share economics.',
    status: 'reviewed',
    acceptedAt: '2025-11-14T12:00:00.000Z'
  },
  dueState: 'settled',
  outcome: {
    state: 'observed',
    result: 'Partially right, poorly timed',
    observedAt: '2026-08-01T12:00:00.000Z',
    summary: 'Demand remained strong, but delayed capacity conversion and financing needs made the original entry premature.',
    calibrationNote: 'The thesis was directionally right. The decision confused announced capacity with economically productive capacity.',
    lesson: 'For capital-intensive growth, size the position to verified contract conversion—not narrative demand.'
  },
  continuity: {
    complete: true,
    acceptedRevisionId: 'artificial-revision-2025-11-14',
    immutableSnapshotHash: 'artificial-preview-not-persisted'
  },
  links: {
    claims: {
      resolved: [
        { id: 'artificial-claim-1', title: 'Demand exceeds near-term deliverable capacity', href: artificialPreviewHref('current-thesis') },
        { id: 'artificial-claim-2', title: 'Contract conversion is the binding variable', href: artificialPreviewHref('falsifiers') },
        { id: 'artificial-claim-3', title: 'Financing discipline determines per-share value', href: artificialPreviewHref('decision-record') }
      ],
      missingIds: []
    },
    sources: {
      resolved: [
        { id: 'artificial-source-1', sourceRefId: 'artificial-source-ref-1', title: 'Synthetic contract cohort memo', href: artificialPreviewHref('source-record') },
        { id: 'artificial-source-2', sourceRefId: 'artificial-source-ref-2', title: 'Synthetic capacity schedule', href: artificialPreviewHref('source-record') },
        { id: 'artificial-source-3', sourceRefId: 'artificial-source-ref-3', title: 'Synthetic financing scenario', href: artificialPreviewHref('source-record') }
      ],
      missingIds: []
    }
  }
};

const ARTIFICIAL_REVIEW_DECISION_ITEM = {
  ...ARTIFICIAL_DECISION_ITEM,
  id: `${ARTIFICIAL_PREVIEW_ID}:artificial-decision-2`,
  identity: { pageId: ARTIFICIAL_PREVIEW_ID, decisionId: 'artificial-decision-2' },
  subject: { title: 'Wait for signed capacity before adding', href: artificialPreviewHref('decision-record') },
  decision: {
    summary: 'Wait for signed capacity before increasing the position.',
    rationale: 'The retained lesson now requires contract conversion before narrative demand can justify additional sizing.',
    expectedOutcome: 'Signed capacity reaches the threshold without weakening financing discipline.',
    status: 'planned',
    acceptedAt: '2026-08-08T12:00:00.000Z',
    reviewAt: '2026-08-20T12:00:00.000Z'
  },
  dueState: 'upcoming',
  outcome: { state: 'awaiting_observation', result: 'unknown' },
  continuity: {
    complete: true,
    acceptedRevisionId: 'artificial-revision-2026-08-08',
    immutableSnapshotHash: 'artificial-preview-review-not-persisted'
  }
};

const ARTIFICIAL_OUTCOME_DECISION_ITEM = {
  ...ARTIFICIAL_DECISION_ITEM,
  id: `${ARTIFICIAL_PREVIEW_ID}:artificial-decision-3`,
  identity: { pageId: ARTIFICIAL_PREVIEW_ID, decisionId: 'artificial-decision-3' },
  subject: { title: 'Run the contract-conversion test', href: artificialPreviewHref('decision-record') },
  decision: {
    summary: 'Run the contract-conversion test before the next allocation review.',
    rationale: 'The position was held constant while the team waited for observable contract conversion.',
    expectedOutcome: 'At least 70% of committed backlog converts without an adverse financing event.',
    status: 'taken',
    acceptedAt: '2026-07-14T12:00:00.000Z',
    outcomeDueAt: '2026-08-16T12:00:00.000Z'
  },
  dueState: 'none',
  outcome: { state: 'awaiting_observation', result: 'unknown' },
  continuity: {
    complete: true,
    acceptedRevisionId: 'artificial-revision-2026-07-14',
    immutableSnapshotHash: 'artificial-preview-outcome-not-persisted'
  }
};

const ARTIFICIAL_DECISION_ITEMS = [
  ARTIFICIAL_DECISION_ITEM,
  ARTIFICIAL_REVIEW_DECISION_ITEM,
  ARTIFICIAL_OUTCOME_DECISION_ITEM
];

const ARTIFICIAL_DECISION_COUNTS = {
  upcoming_review: 1,
  awaiting_outcome: 1,
  reviewed: 1
};

const ARTIFICIAL_BOARD_EVIDENCE = [
  {
    id: 'signed-capacity',
    date: 'Aug 09',
    source: 'Synthetic signed-capacity update',
    fact: 'Seventy-six percent of committed backlog is now attached to signed capacity.'
  },
  {
    id: 'financing-scenario',
    date: 'Aug 06',
    source: 'Synthetic financing scenario',
    fact: 'The next build can be funded inside the current per-share return hurdle.'
  },
  {
    id: 'concentration-review',
    date: 'Aug 02',
    source: 'Synthetic customer concentration review',
    fact: 'Renewal duration improved while the largest customer share declined.'
  }
];

const ARTIFICIAL_RETRIEVAL_CORPUS = [
  {
    id: 'retrieval-contract-cohort',
    date: 'Jul 28',
    source: 'Synthetic contract cohort memo',
    fact: 'The newest cohort moved from reservation to signed capacity eleven weeks faster than the prior cohort.',
    why: 'Direct evidence about contract conversion speed.',
    relation: 'support',
    terms: 'contract conversion backlog signed capacity demand cohort'
  },
  {
    id: 'retrieval-financing-caveat',
    date: 'Jul 19',
    source: 'Synthetic lender covenant note',
    fact: 'A second build would narrow covenant headroom unless contracted revenue begins before construction drawdown.',
    why: 'Challenges the assumption that capacity can be financed without constraining per-share returns.',
    relation: 'tension',
    terms: 'financing risk covenant funding build dilution per share returns counter evidence'
  },
  {
    id: 'retrieval-customer-call',
    date: 'Jul 12',
    source: 'Synthetic customer interview highlight',
    fact: 'One large customer intends to dual-source once competing capacity becomes available next year.',
    why: 'A forward signal that concentration and pricing power may weaken.',
    relation: 'tension',
    terms: 'customer concentration renewal pricing power supply cycle counter evidence'
  },
  {
    id: 'retrieval-capacity-ledger',
    date: 'Aug 11',
    source: 'Synthetic capacity commissioning ledger',
    fact: 'The first expansion reached productive utilization four weeks later than the original operating plan.',
    why: 'Shows what changed after the decision and bears directly on timing.',
    relation: 'change',
    terms: 'changed since decision timing capacity productive utilization delay outcome'
  },
  {
    id: 'retrieval-pricing-study',
    date: 'Jun 30',
    source: 'Synthetic supply-cycle study',
    fact: 'Comparable markets lost twelve percent of price realization within two quarters of supply normalization.',
    why: 'Tests whether the retained pricing-power assumption survives new supply.',
    relation: 'tension',
    terms: 'pricing power supply cycle normalization falsifier margin counter evidence'
  }
];

const RETRIEVAL_CONTEXTS = {
  general: { label: 'Whole case', placeholder: 'Find in my Library…' },
  claim: { label: 'Accepted claim', placeholder: 'Find support or tension for this claim…' },
  falsifier: { label: 'Falsifier', placeholder: 'Find signs this condition is occurring…' },
  decision: { label: 'Frozen decision', placeholder: 'What has changed since this decision?' },
  lesson: { label: 'Retained lesson', placeholder: 'Where else might this lesson apply?' }
};

const ARTIFICIAL_BOARD_STORAGE_KEY = 'noeis.judgment.artificialBoard.v1';
const ARTIFICIAL_BOARD_ACCEPTED_CLAIM = {
  id: 'accepted-contract-conversion',
  text: 'Contract conversion is the binding variable.',
  acceptedAt: 'Nov 14, 2025'
};

const defaultArtificialBoardState = () => ({
  evidence: ARTIFICIAL_BOARD_EVIDENCE.map(item => ({ ...item })),
  acceptedClaims: [{ ...ARTIFICIAL_BOARD_ACCEPTED_CLAIM }],
  proposals: [{
    id: 'proposal-contract-threshold',
    sourceId: 'signed-capacity',
    text: 'The contract-conversion threshold may now be satisfied; review before accepting.'
  }],
  counterSignals: [],
  nextJudgmentGrounds: []
});

const readArtificialBoardState = () => {
  try {
    const value = JSON.parse(window.localStorage?.getItem(ARTIFICIAL_BOARD_STORAGE_KEY) || 'null');
    if (!value || !Array.isArray(value.evidence) || !value.evidence.length) return defaultArtificialBoardState();
    return {
      evidence: value.evidence,
      acceptedClaims: Array.isArray(value.acceptedClaims) ? value.acceptedClaims : [{ ...ARTIFICIAL_BOARD_ACCEPTED_CLAIM }],
      proposals: Array.isArray(value.proposals) ? value.proposals : [],
      counterSignals: Array.isArray(value.counterSignals) ? value.counterSignals : [],
      nextJudgmentGrounds: Array.isArray(value.nextJudgmentGrounds) ? value.nextJudgmentGrounds : []
    };
  } catch (_error) {
    return defaultArtificialBoardState();
  }
};

const artificialSurfaceHref = (mode) => `/judgment?preview=artificial&view=dossiers&mode=${mode}`;

const ArtificialJudgmentBoard = () => {
  const [initialBoardState] = useState(readArtificialBoardState);
  const [evidence, setEvidence] = useState(initialBoardState.evidence);
  const [acceptedClaims, setAcceptedClaims] = useState(initialBoardState.acceptedClaims);
  const [selectedId, setSelectedId] = useState(initialBoardState.evidence[0].id);
  const [draggedId, setDraggedId] = useState('');
  const [proposals, setProposals] = useState(initialBoardState.proposals);
  const [counterSignals, setCounterSignals] = useState(initialBoardState.counterSignals);
  const [nextJudgmentGrounds, setNextJudgmentGrounds] = useState(initialBoardState.nextJudgmentGrounds);
  const [addingEvidence, setAddingEvidence] = useState(false);
  const [evidenceDraft, setEvidenceDraft] = useState({ source: '', fact: '' });
  const [retrievalContext, setRetrievalContext] = useState('general');
  const [retrievalQuery, setRetrievalQuery] = useState('');
  const [retrievalMode, setRetrievalMode] = useState('all');
  const [retrievalResults, setRetrievalResults] = useState([]);
  const [retrievalOpen, setRetrievalOpen] = useState(false);
  const [receipt, setReceipt] = useState('Select or move an evidence slip. Accepted knowledge stays unchanged.');
  const selectedEvidence = evidence.find(item => item.id === selectedId) || evidence[0];

  useEffect(() => {
    try {
      window.localStorage?.setItem(ARTIFICIAL_BOARD_STORAGE_KEY, JSON.stringify({
        evidence,
        acceptedClaims,
        proposals,
        counterSignals,
        nextJudgmentGrounds
      }));
    } catch (_error) {
      // The sandbox remains usable for the session when browser storage is unavailable.
    }
  }, [acceptedClaims, counterSignals, evidence, nextJudgmentGrounds, proposals]);

  const connectEvidence = (evidenceId = selectedId) => {
    const selected = evidence.find(item => item.id === evidenceId);
    if (!selected) return;
    setSelectedId(selected.id);
    setProposals(current => current.some(item => item.sourceId === selected.id)
      ? current
      : [...current, {
          id: `proposal-${selected.id}`,
          sourceId: selected.id,
          text: `${selected.fact} This remains a proposal until explicitly reviewed.`
        }]);
    setReceipt(`Proposal prepared from ${selected.source}. The accepted claim was not changed.`);
  };

  const moveEvidence = (lane) => {
    const evidenceId = draggedId || selectedId;
    const selected = evidence.find(item => item.id === evidenceId);
    if (!selected) return;
    setSelectedId(selected.id);
    if (lane === 'suggests') connectEvidence(selected.id);
    if (lane === 'breaks') {
      setCounterSignals(current => current.includes(selected.id) ? current : [...current, selected.id]);
      setReceipt(`${selected.source} was added as a counter-signal to examine. Falsifiers remain human-confirmed.`);
    }
    if (lane === 'decision') {
      setNextJudgmentGrounds(current => current.includes(selected.id) ? current : [...current, selected.id]);
      setReceipt(`${selected.source} is prepared as grounds for the next judgment. The frozen decision remains unchanged.`);
    }
    setDraggedId('');
  };

  const laneDropProps = (lane) => ({
    onDragOver: (event) => event.preventDefault(),
    onDrop: (event) => {
      event.preventDefault();
      moveEvidence(lane);
    }
  });

  const addEvidence = (event) => {
    event.preventDefault();
    const source = evidenceDraft.source.trim();
    const fact = evidenceDraft.fact.trim();
    if (!source || !fact) return;
    const item = { id: `local-${Date.now()}`, date: 'Now', source, fact };
    setEvidence(current => [item, ...current]);
    setSelectedId(item.id);
    setEvidenceDraft({ source: '', fact: '' });
    setAddingEvidence(false);
    setReceipt(`${source} added to this local sandbox. It is not part of your real Library.`);
  };

  const acceptProposal = (proposal) => {
    setAcceptedClaims(current => [...current, {
      id: `accepted-${proposal.id}`,
      text: proposal.text.replace(/ This remains a proposal until explicitly reviewed\.$/, ''),
      acceptedAt: 'Just now · sandbox'
    }]);
    setProposals(current => current.filter(item => item.id !== proposal.id));
    setReceipt('Proposal accepted inside the sandbox. The original accepted claim and frozen decision remain intact.');
  };

  const dismissProposal = (proposalId) => {
    setProposals(current => current.filter(item => item.id !== proposalId));
    setReceipt('Proposal dismissed. No accepted knowledge changed.');
  };

  const resetBoard = () => {
    const next = defaultArtificialBoardState();
    setEvidence(next.evidence);
    setAcceptedClaims(next.acceptedClaims);
    setProposals(next.proposals);
    setCounterSignals(next.counterSignals);
    setNextJudgmentGrounds(next.nextJudgmentGrounds);
    setSelectedId(next.evidence[0].id);
    setAddingEvidence(false);
    setEvidenceDraft({ source: '', fact: '' });
    setRetrievalContext('general');
    setRetrievalQuery('');
    setRetrievalMode('all');
    setRetrievalResults([]);
    setRetrievalOpen(false);
    setReceipt('Artificial case reset to its starting state.');
  };

  const retrieveFromLibrary = (event, override = {}) => {
    event?.preventDefault?.();
    const query = String(override.query ?? retrievalQuery).trim();
    const mode = override.mode || retrievalMode;
    const context = override.context || retrievalContext;
    const contextTerms = {
      claim: 'contract conversion support tension',
      falsifier: 'falsifier counter evidence occurring',
      decision: 'changed since decision timing outcome',
      lesson: 'financing position size lesson',
      general: ''
    }[context];
    const words = `${query} ${contextTerms}`.toLowerCase().split(/\W+/).filter(word => word.length > 2);
    const scored = ARTIFICIAL_RETRIEVAL_CORPUS
      .filter(item => mode === 'all' || item.relation === mode)
      .map(item => ({
        ...item,
        score: words.reduce((total, word) => total + (`${item.terms} ${item.source} ${item.fact}`.toLowerCase().includes(word) ? 1 : 0), 0)
      }))
      .sort((left, right) => right.score - left.score || left.source.localeCompare(right.source));
    const matches = scored.filter(item => item.score > 0);
    setRetrievalResults((matches.length ? matches : scored).slice(0, 4));
    setRetrievalOpen(true);
    setReceipt(`Retrieved ${Math.min((matches.length ? matches : scored).length, 4)} synthetic Library passage${(matches.length ? matches : scored).length === 1 ? '' : 's'} for review.`);
  };

  const runQuickRetrieval = (query, mode = 'all') => {
    setRetrievalQuery(query);
    setRetrievalMode(mode);
    retrieveFromLibrary(null, { query, mode });
  };

  const placeRetrievedEvidence = (item, destination = 'evidence') => {
    setEvidence(current => current.some(candidate => candidate.id === item.id) ? current : [{
      id: item.id,
      date: item.date,
      source: item.source,
      fact: item.fact
    }, ...current]);
    setSelectedId(item.id);
    if (destination === 'breaks') {
      setCounterSignals(current => current.includes(item.id) ? current : [...current, item.id]);
      setReceipt(`${item.source} placed on the Board as counter-evidence to examine.`);
    } else if (destination === 'decision') {
      setNextJudgmentGrounds(current => current.includes(item.id) ? current : [...current, item.id]);
      setReceipt(`${item.source} placed on the Board as grounds for the next judgment.`);
    } else {
      setReceipt(`${item.source} placed on the Board with its Library provenance intact.`);
    }
  };

  const focusRetrieval = (context, suggestedQuery = '') => {
    const nextMode = context === 'decision' ? 'change' : context === 'falsifier' ? 'tension' : 'all';
    setRetrievalContext(context);
    setRetrievalQuery(suggestedQuery);
    setRetrievalMode(nextMode);
    setRetrievalResults([]);
    setRetrievalOpen(true);
    window.requestAnimationFrame(() => document.getElementById('judgment-library-retrieval')?.focus());
  };

  return (
    <div className="judgment-board-shell">
      <header className="judgment-board__header">
        <div>
          <p className="judgment-room__eyebrow">Living sandbox · persists in this browser</p>
          <h1>Northstar Compute</h1>
          <p>Capacity before conviction</p>
        </div>
        <nav className="judgment-surface-toggle" aria-label="Judgment surface">
          <Link to={artificialSurfaceHref('case')}>Case</Link>
          <span aria-current="page">Board</span>
        </nav>
      </header>

      <div className="judgment-board__body">
        <div className="judgment-board__viewport" aria-label="Northstar Compute judgment board">
          <div className="judgment-board__lanes">
            <section className="judgment-board__lane judgment-board__lane--evidence" aria-labelledby="board-evidence-title">
              <header><span>01</span><h2 id="board-evidence-title">Evidence</h2><small>Library ground</small></header>
              <div className="judgment-board__stack">
                <section className={`judgment-retrieval${retrievalOpen ? ' is-open' : ''}`} aria-label="Retrieve from Library">
                  <form onSubmit={retrieveFromLibrary}>
                    <label htmlFor="judgment-library-retrieval">
                      <span>{RETRIEVAL_CONTEXTS[retrievalContext].label}</span>
                      <div>
                        <input
                          id="judgment-library-retrieval"
                          value={retrievalQuery}
                          onFocus={() => setRetrievalOpen(true)}
                          onChange={(event) => setRetrievalQuery(event.target.value)}
                          placeholder={RETRIEVAL_CONTEXTS[retrievalContext].placeholder}
                        />
                        <button type="submit" disabled={!retrievalQuery.trim()} aria-label="Retrieve from Library">↗</button>
                      </div>
                    </label>
                  </form>
                  <div className="judgment-retrieval__modes" aria-label="Retrieval mode">
                    {[
                      ['all', 'All'],
                      ['support', 'Support'],
                      ['tension', 'Tension'],
                      ['change', 'Changed']
                    ].map(([id, label]) => (
                      <button
                        type="button"
                        key={id}
                        className={retrievalMode === id ? 'is-active' : ''}
                        onClick={() => {
                          setRetrievalMode(id);
                          if (retrievalQuery.trim()) retrieveFromLibrary(null, { mode: id });
                        }}
                      >{label}</button>
                    ))}
                  </div>
                  {!retrievalResults.length ? (
                    <div className="judgment-retrieval__prompts" aria-label="Suggested Library retrievals">
                      <button type="button" onClick={() => runQuickRetrieval('financing risk', 'tension')}>Financing risk</button>
                      <button type="button" onClick={() => runQuickRetrieval('contract conversion', 'support')}>Contract conversion</button>
                      <button type="button" onClick={() => runQuickRetrieval('what changed since the decision', 'change')}>What changed?</button>
                    </div>
                  ) : (
                    <div className="judgment-retrieval__results" aria-live="polite">
                      <header><span>{retrievalResults.length} passages</span><button type="button" onClick={() => setRetrievalResults([])}>Clear</button></header>
                      {retrievalResults.map(item => {
                        const alreadyPlaced = evidence.some(candidate => candidate.id === item.id);
                        return (
                          <article className="judgment-retrieval__result" key={item.id}>
                            <span>{item.date} · Library · {item.relation}</span>
                            <strong>{item.source}</strong>
                            <blockquote>{item.fact}</blockquote>
                            <p>{item.why}</p>
                            <div>
                              <button type="button" disabled={alreadyPlaced} onClick={() => placeRetrievedEvidence(item)}>{alreadyPlaced ? 'On board' : 'Add here'}</button>
                              <button type="button" onClick={() => placeRetrievedEvidence(item, 'breaks')}>Test thesis</button>
                              <button type="button" onClick={() => placeRetrievedEvidence(item, 'decision')}>Next judgment</button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
                <button type="button" className="judgment-board__add" onClick={() => setAddingEvidence(current => !current)}>
                  {addingEvidence ? 'Close' : 'Add evidence'}
                </button>
                {addingEvidence ? (
                  <form className="judgment-board__composer" onSubmit={addEvidence}>
                    <label>
                      <span>Source</span>
                      <input value={evidenceDraft.source} onChange={(event) => setEvidenceDraft(current => ({ ...current, source: event.target.value }))} placeholder="Article, memo, conversation…" />
                    </label>
                    <label>
                      <span>What did you learn?</span>
                      <textarea value={evidenceDraft.fact} onChange={(event) => setEvidenceDraft(current => ({ ...current, fact: event.target.value }))} placeholder="Record one observable fact…" />
                    </label>
                    <button type="submit" disabled={!evidenceDraft.source.trim() || !evidenceDraft.fact.trim()}>Add to board</button>
                  </form>
                ) : null}
                {evidence.map(item => (
                  <button
                    type="button"
                    key={item.id}
                    draggable
                    className={`judgment-board__slip${selectedId === item.id ? ' is-selected' : ''}`}
                    onClick={() => {
                      setSelectedId(item.id);
                      setReceipt(`${item.source} selected. Its provenance is visible in the margin.`);
                    }}
                    onDragStart={(event) => {
                      setDraggedId(item.id);
                      event.dataTransfer?.setData('text/plain', item.id);
                    }}
                    onDragEnd={() => setDraggedId('')}
                  >
                    <span>{item.date} · Library</span>
                    <strong>{item.source}</strong>
                    <p>{item.fact}</p>
                  </button>
                ))}
              </div>
            </section>

            <section className="judgment-board__lane" aria-labelledby="board-suggests-title" {...laneDropProps('suggests')}>
              <header><span>02</span><h2 id="board-suggests-title">What it suggests</h2><small>Review before trust</small></header>
              {acceptedClaims.map(claim => (
                <button type="button" className="judgment-board__card judgment-board__card--accepted judgment-board__card--focusable" key={claim.id} onClick={() => focusRetrieval('claim', 'support or tension for contract conversion')}>
                  <span>Accepted claim</span>
                  <h3>{claim.text}</h3>
                  <p>Accepted revision · {claim.acceptedAt}</p>
                </button>
              ))}
              {proposals.map(proposal => (
                <article className="judgment-board__card judgment-board__card--proposal" key={proposal.id}>
                  <span>Agent proposal · Review</span>
                  <h3>{proposal.text}</h3>
                  <p>Grounded in {evidence.find(item => item.id === proposal.sourceId)?.source || 'retained local evidence'}</p>
                  <div className="judgment-board__card-actions">
                    <button type="button" onClick={() => acceptProposal(proposal)}>Accept</button>
                    <button type="button" onClick={() => dismissProposal(proposal.id)}>Dismiss</button>
                  </div>
                </article>
              ))}
              <p className="judgment-board__drop-note">Drop evidence here to prepare a proposal—not an accepted claim.</p>
            </section>

            <section className="judgment-board__lane" aria-labelledby="board-break-title" {...laneDropProps('breaks')}>
              <header><span>03</span><h2 id="board-break-title">What could break it</h2><small>Disconfirming tests</small></header>
              <button type="button" className="judgment-board__card judgment-board__card--focusable" onClick={() => focusRetrieval('falsifier', 'backlog conversion below seventy percent')}>
                <span>Falsifier</span>
                <h3>Backlog conversion falls below 70% for two review periods.</h3>
              </button>
              <article className="judgment-board__card">
                <span>Open question</span>
                <h3>How much pricing power survives the next supply cycle?</h3>
              </article>
              {counterSignals.map(id => {
                const signal = evidence.find(item => item.id === id);
                return signal ? (
                  <article className="judgment-board__card judgment-board__card--signal" key={id}>
                    <span>Counter-signal to examine</span>
                    <h3>{signal.fact}</h3>
                    <p>{signal.source}</p>
                  </article>
                ) : null;
              })}
              <p className="judgment-board__drop-note">Drop evidence here to test it against the thesis.</p>
            </section>

            <section className="judgment-board__lane" aria-labelledby="board-decision-title" {...laneDropProps('decision')}>
              <header><span>04</span><h2 id="board-decision-title">Decision & lesson</h2><small>Frozen, then learned</small></header>
              <button type="button" className="judgment-board__card judgment-board__card--decision judgment-board__card--focusable" onClick={() => focusRetrieval('decision', 'what changed since the decision')}>
                <span>Frozen decision · Nov 14, 2025</span>
                <h3>Open a 1.5% starter position and require contract conversion before adding.</h3>
                <p>Original grounds remain immutable.</p>
              </button>
              <article className="judgment-board__card">
                <span>Expected outcome</span>
                <h3>Backlog converts without weakening per-share economics.</h3>
              </article>
              <button type="button" className="judgment-board__card judgment-board__card--lesson judgment-board__card--focusable" onClick={() => focusRetrieval('lesson', 'where else does verified conversion matter')}>
                <span>Retained lesson</span>
                <h3>Size capital-intensive growth to verified conversion—not narrative demand.</h3>
              </button>
              {nextJudgmentGrounds.map(id => {
                const ground = evidence.find(item => item.id === id);
                return ground ? (
                  <article className="judgment-board__card judgment-board__card--next" key={id}>
                    <span>Prepared for next judgment</span>
                    <h3>{ground.fact}</h3>
                    <p>{ground.source} · editable in the next decision</p>
                  </article>
                ) : null;
              })}
              <p className="judgment-board__drop-note">A drop here prepares the next judgment. It never rewrites this one.</p>
            </section>
          </div>
        </div>

        <aside className="judgment-board__partner" aria-label="Judgment partner for selected evidence">
          <header>
            <p className="judgment-room__eyebrow">Judgment partner</p>
            <h2>Selected evidence</h2>
          </header>
          <div className="judgment-board__selection">
            <span>{selectedEvidence.date} · Library</span>
            <strong>{selectedEvidence.source}</strong>
            <p>{selectedEvidence.fact}</p>
          </div>
          <div className="judgment-board__provenance" aria-label="Selected evidence provenance">
            <span>Source</span><i aria-hidden="true" />
            <span>Proposal</span><i aria-hidden="true" />
            <span>Next judgment</span>
          </div>
          <div className="judgment-board__partner-actions">
            <button type="button" onClick={() => moveEvidence('breaks')}>Find counter-evidence</button>
            <button type="button" onClick={() => connectEvidence()}>Connect to claim</button>
            <button type="button" onClick={() => moveEvidence('decision')}>Challenge the decision</button>
            <button type="button" onClick={() => setAddingEvidence(true)}>Add a new observation</button>
            <button type="button" onClick={() => focusRetrieval('general')}>Retrieve from Library</button>
          </div>
          <p className="judgment-board__receipt" role="status">{receipt}</p>
          <button type="button" className="judgment-board__reset" onClick={resetBoard}>Reset artificial case</button>
        </aside>
      </div>
    </div>
  );
};

const clean = (value) => String(value || '').trim();
const idOf = (value) => clean(value?._id || value?.id || value);
const list = (value) => (Array.isArray(value) ? value : []);
const safeHref = (value) => {
  const href = clean(value);
  return href.startsWith('/') && !href.startsWith('//') ? href : '';
};
const sourceRefHref = (ref) => {
  const explicit = safeHref(ref?.href);
  if (explicit) return explicit;
  const type = clean(ref?.type).toLowerCase();
  const objectId = idOf(ref?.objectId);
  if (!objectId) return '';
  if (type === 'article') return `/library?articleId=${encodeURIComponent(objectId)}`;
  if (type === 'highlight') {
    const parentId = idOf(ref?.parentId || ref?.articleId);
    return parentId
      ? `/library?articleId=${encodeURIComponent(parentId)}&highlightId=${encodeURIComponent(objectId)}`
      : `/library?highlightId=${encodeURIComponent(objectId)}`;
  }
  if (type === 'concept') return `/think?tab=concepts&conceptId=${encodeURIComponent(objectId)}`;
  if (type === 'question') return `/think?tab=questions&questionId=${encodeURIComponent(objectId)}`;
  if (type === 'notebook' || type === 'note') return `/think?tab=notebook&entryId=${encodeURIComponent(objectId)}`;
  return '';
};
const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const artificialJudgmentReply = (prompt) => {
  const question = clean(prompt).toLowerCase();
  if (/source|evidence|ground|receipt/.test(question)) {
    return 'Five synthetic receipts ground this case. The capacity schedule and contract cohort memo support demand, while the financing scenario is the evidence that should have constrained position size.';
  }
  if (/change|mind|falsif|wrong/.test(question)) {
    return 'The case changes if backlog conversion stays below 70%, concentration rises while renewal duration falls, or new capacity cannot clear the portfolio hurdle rate.';
  }
  if (/lesson|learn|mistake|timing|assumption/.test(question)) {
    return 'The decision treated announced capacity as if it were already contracted, financed, and productive. The thesis survived; the sizing rule did not.';
  }
  return 'The durable distinction is thesis versus decision quality: demand evidence remained intact, but contract conversion and financing discipline were not strong enough to justify full sizing.';
};

const readWikiPageCache = () => {
  try {
    const parsed = JSON.parse(window.localStorage?.getItem(WIKI_PAGE_CACHE_KEY) || 'null');
    const cachedAt = Number(parsed?.cachedAt);
    if (!Number.isFinite(cachedAt) || Date.now() - cachedAt > WIKI_PAGE_CACHE_MAX_AGE_MS) return [];
    return Array.isArray(parsed?.pages) ? parsed.pages : [];
  } catch (_error) {
    return [];
  }
};

const writeWikiPageCache = (pages) => {
  try {
    const previous = JSON.parse(window.localStorage?.getItem(WIKI_PAGE_CACHE_KEY) || 'null') || {};
    window.localStorage?.setItem(WIKI_PAGE_CACHE_KEY, JSON.stringify({
      ...previous,
      cachedAt: Date.now(),
      pages: Array.isArray(pages) ? pages : []
    }));
  } catch (_error) {
    // Cache is a private perceived-speed affordance. Storage failures must not
    // block the exact server read models.
  }
};

const isJudgmentPage = (page) => Boolean(
  page?.investmentDossier?.version
  || page?.judgment?.kind
  || list(page?.judgment?.decisions).length
);

const normalizedView = (value) => (
  JUDGMENT_VIEWS.some(option => option.id === value) ? value : 'dossiers'
);

export const resolveJudgmentView = (search = '') => {
  const id = normalizedView(new URLSearchParams(search).get('view'));
  return JUDGMENT_VIEWS.find(option => option.id === id) || JUDGMENT_VIEWS[0];
};

export const loadJudgmentDecisionIndex = async () => {
  let cursor = '';
  let firstPage = null;
  const items = [];
  const seenCursors = new Set();
  do {
    const page = await getDecisions({
      filter: 'all',
      limit: 100,
      windowDays: 365,
      ...(cursor ? { cursor } : {})
    });
    if (!firstPage) firstPage = page;
    items.push(...list(page?.items));
    const nextCursor = clean(page?.nextCursor);
    if (!nextCursor) break;
    if (seenCursors.has(nextCursor)) throw new Error('Decision pagination repeated a cursor.');
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  } while (cursor);
  return { ...(firstPage || {}), items, nextCursor: null };
};

export const decisionMatchesJudgmentView = (item, view) => {
  if (!item) return false;
  if (view === 'reviews') return ['overdue', 'upcoming'].includes(clean(item?.dueState));
  if (view === 'outcomes') return clean(item?.outcome?.state) !== 'observed'
    && clean(item?.decision?.status) === 'taken';
  if (view === 'lessons') return clean(item?.outcome?.state) === 'observed'
    && Boolean(clean(item?.outcome?.lesson));
  return true;
};

export const buildJudgmentCases = (pages = [], decisions = []) => {
  const decisionPages = new Map();
  list(decisions).forEach((item) => {
    const pageId = clean(item?.identity?.pageId);
    if (!pageId) return;
    if (!decisionPages.has(pageId)) decisionPages.set(pageId, []);
    decisionPages.get(pageId).push(item);
  });

  const cases = new Map();
  list(pages).filter(isJudgmentPage).forEach((page) => {
    const pageId = idOf(page);
    if (!pageId) return;
    cases.set(pageId, {
      pageId,
      title: clean(page?.title) || 'Untitled case',
      page,
      decisions: decisionPages.get(pageId) || []
    });
  });
  decisionPages.forEach((pageDecisions, pageId) => {
    if (cases.has(pageId)) return;
    const page = pageDecisions[0]?.page || {};
    cases.set(pageId, {
      pageId,
      title: clean(page?.title) || 'Untitled case',
      page,
      decisions: pageDecisions
    });
  });
  return [...cases.values()].sort((left, right) => {
    const decisionDelta = right.decisions.length - left.decisions.length;
    return decisionDelta || left.title.localeCompare(right.title);
  });
};

const exactCaseHref = ({ view, pageId, decisionId = '', preview = false }) => {
  const query = new URLSearchParams({ view, page: pageId });
  if (decisionId) query.set('decision', decisionId);
  if (preview) query.set('preview', 'artificial');
  return `/judgment?${query.toString()}`;
};

const groundingFor = (item) => ({
  claims: list(item?.links?.claims?.resolved),
  sources: list(item?.links?.sources?.resolved),
  missingClaims: list(item?.links?.claims?.missingIds),
  missingSources: list(item?.links?.sources?.missingIds)
});

export const evidenceDeltaFor = (page, item) => {
  const frozenIds = new Set(list(item?.links?.sources?.resolved)
    .map(source => clean(source?.sourceRefId))
    .filter(Boolean));
  return list(page?.sourceRefs).map(ref => ({
    id: idOf(ref),
    title: clean(ref?.title || ref?.label || ref?.url || idOf(ref)) || 'Untitled source',
    href: sourceRefHref(ref)
  })).filter(ref => ref.id && !frozenIds.has(ref.id));
};

export const nextJudgmentAction = (item) => {
  const status = clean(item?.decision?.status).toLowerCase();
  if (!item) return {
    id: 'record',
    title: 'Record the first judgment',
    note: 'Freeze the accepted claim revision, exact grounds, expected result, and review clock.'
  };
  if (status === 'planned') return {
    id: 'decide',
    title: 'Take or cancel the planned judgment',
    note: 'The original basis stays immutable whichever path you choose.'
  };
  if (status === 'taken') return {
    id: 'outcome',
    title: 'Record what actually happened',
    note: 'Attach exact outcome evidence, then separate result quality from process quality.'
  };
  return {
    id: 'compound',
    title: 'Carry the lesson into the next judgment',
    note: 'Review evidence outside the frozen grounds, then record a new decision against current accepted knowledge.'
  };
};

const EvidenceDelta = ({ sources }) => (
  <section className="judgment-workbench__delta" aria-labelledby="judgment-evidence-delta-title">
    <div>
      <p className="judgment-room__eyebrow">Evidence delta</p>
      <h3 id="judgment-evidence-delta-title">Current sources outside the frozen grounds</h3>
      <p>This is an exact identity difference, not a claim that every source arrived later.</p>
    </div>
    {sources.length ? (
      <ol>
        {sources.map(source => (
          <li key={source.id}>
            {source.href ? <Link to={source.href}>{source.title}</Link> : <span>{source.title}</span>}
            <small>Not bound to this decision-time snapshot</small>
          </li>
        ))}
      </ol>
    ) : <p className="judgment-case__unavailable">No additional current source identities are available.</p>}
  </section>
);

const EvidenceMargin = ({ before, after, evidenceCount, previewMode }) => (
  <aside className="judgment-chapter-editor__margin" aria-label="Proposed knowledge change">
    <p className="judgment-room__eyebrow">Evidence margin</p>
    <dl>
      <div><dt>Before</dt><dd>{before || 'No accepted value.'}</dd></div>
      <div><dt>Proposed</dt><dd>{after || 'Remove the current value.'}</dd></div>
      <div><dt>Current evidence</dt><dd>{evidenceCount} source {evidenceCount === 1 ? 'identity' : 'identities'} outside the frozen decision grounds.</dd></div>
    </dl>
    <small>{previewMode ? 'Artificial preview · local and unsaved.' : 'Saving creates a new Wiki revision; prior decision grounds stay frozen.'}</small>
  </aside>
);

const saveJudgmentContract = async ({ page, pageId, previewMode, updates, onPageUpdate }) => {
  const nextPage = {
    ...page,
    judgment: { ...(page?.judgment || {}), ...updates }
  };
  if (previewMode) {
    onPageUpdate?.(nextPage);
    return nextPage;
  }
  const updated = await updateWikiPage(pageId, { judgment: nextPage.judgment });
  onPageUpdate?.(updated);
  return updated;
};

const ThesisChapterEditor = ({ page, pageId, previewMode, evidenceDelta, onPageUpdate, onClose }) => {
  const accepted = clean(page?.judgment?.currentJudgment);
  const [draft, setDraft] = useState(accepted);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const changed = clean(draft) && clean(draft) !== accepted;

  const save = async (event) => {
    event.preventDefault();
    if (!changed || busy) return;
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      await saveJudgmentContract({
        page,
        pageId,
        previewMode,
        updates: { currentJudgment: clean(draft) },
        onPageUpdate
      });
      setSaved(true);
    } catch (saveError) {
      setError(saveError?.response?.data?.error || saveError?.message || 'Could not revise the thesis.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="judgment-chapter-editor" aria-label="Revise current thesis" onSubmit={save}>
      <div className="judgment-chapter-editor__fields">
        <label>
          Revised thesis
          <textarea
            aria-label="Revised current thesis"
            value={draft}
            onChange={event => { setDraft(event.target.value); setSaved(false); }}
            rows={5}
            disabled={busy}
          />
        </label>
        <div className="judgment-chapter-editor__actions">
          <button type="submit" disabled={!changed || busy}>{busy ? 'Accepting…' : 'Accept thesis revision'}</button>
          <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
        </div>
        {error ? <p className="judgment-case__error" role="alert">{error}</p> : null}
        {saved ? <p className="judgment-chapter-editor__receipt" role="status">{previewMode ? 'Preview thesis revised locally. Nothing was saved.' : 'Thesis revision accepted. The historical decision record remains unchanged.'}</p> : null}
      </div>
      <EvidenceMargin before={accepted} after={clean(draft)} evidenceCount={evidenceDelta.length} previewMode={previewMode} />
    </form>
  );
};

const FalsifierChapterEditor = ({ page, pageId, previewMode, evidenceDelta, onPageUpdate, onClose }) => {
  const [falsifierDrafts, setFalsifierDrafts] = useState(() => list(page?.judgment?.falsifiers).map(item => ({ ...item })));
  const [unknownDrafts, setUnknownDrafts] = useState(() => list(page?.judgment?.unknowns).map(item => ({ ...item })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const acceptedSummary = `${list(page?.judgment?.falsifiers).length} conditions · ${list(page?.judgment?.unknowns).length} open questions`;
  const proposedSummary = `${falsifierDrafts.filter(item => clean(item.text)).length} conditions · ${unknownDrafts.filter(item => clean(item.question)).length} open questions`;

  const change = (setter, index, field, value) => setter(current => current.map((item, itemIndex) => (
    itemIndex === index ? { ...item, [field]: value } : item
  )));

  const save = async (event) => {
    event.preventDefault();
    if (busy) return;
    const falsifiers = falsifierDrafts
      .filter(item => clean(item.text))
      .map(item => ({ ...item, text: clean(item.text), observableSignal: clean(item.observableSignal), status: clean(item.status) || 'unobserved' }));
    const unknowns = unknownDrafts
      .filter(item => clean(item.question))
      .map(item => ({ ...item, question: clean(item.question), priority: clean(item.priority) || 'medium', status: clean(item.status) || 'open' }));
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      await saveJudgmentContract({ page, pageId, previewMode, updates: { falsifiers, unknowns }, onPageUpdate });
      setSaved(true);
    } catch (saveError) {
      setError(saveError?.response?.data?.error || saveError?.message || 'Could not update the falsifier ledger.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="judgment-chapter-editor" aria-label="Update falsifiers and open questions" onSubmit={save}>
      <div className="judgment-chapter-editor__fields">
        <section>
          <div className="judgment-chapter-editor__subhead"><h3>Observable conditions</h3><button type="button" onClick={() => setFalsifierDrafts(current => [...current, { text: '', observableSignal: '', status: 'unobserved' }])}>Add condition</button></div>
          {falsifierDrafts.map((item, index) => (
            <div className="judgment-chapter-editor__row" key={item.falsifierId || `falsifier-${index}`}>
              <label>Condition<textarea aria-label={`Falsifier ${index + 1}`} value={item.text || ''} onChange={event => change(setFalsifierDrafts, index, 'text', event.target.value)} rows={2} /></label>
              <label>Observable signal<input aria-label={`Observable signal ${index + 1}`} value={item.observableSignal || ''} onChange={event => change(setFalsifierDrafts, index, 'observableSignal', event.target.value)} /></label>
              <label>Status<select aria-label={`Falsifier status ${index + 1}`} value={item.status || 'unobserved'} onChange={event => change(setFalsifierDrafts, index, 'status', event.target.value)}><option value="unobserved">unobserved</option><option value="warning">warning</option><option value="triggered">triggered</option><option value="retired">retired</option></select></label>
              <button type="button" className="judgment-chapter-editor__remove" onClick={() => setFalsifierDrafts(current => current.filter((_row, rowIndex) => rowIndex !== index))}>Remove</button>
            </div>
          ))}
        </section>
        <section>
          <div className="judgment-chapter-editor__subhead"><h3>Open questions</h3><button type="button" onClick={() => setUnknownDrafts(current => [...current, { question: '', priority: 'medium', status: 'open' }])}>Add question</button></div>
          {unknownDrafts.map((item, index) => (
            <div className="judgment-chapter-editor__row is-question" key={item.unknownId || `unknown-${index}`}>
              <label>Question<textarea aria-label={`Open question ${index + 1}`} value={item.question || ''} onChange={event => change(setUnknownDrafts, index, 'question', event.target.value)} rows={2} /></label>
              <label>Priority<select aria-label={`Question priority ${index + 1}`} value={item.priority || 'medium'} onChange={event => change(setUnknownDrafts, index, 'priority', event.target.value)}><option value="critical">critical</option><option value="high">high</option><option value="medium">medium</option><option value="low">low</option></select></label>
              <label>Status<select aria-label={`Question status ${index + 1}`} value={item.status || 'open'} onChange={event => change(setUnknownDrafts, index, 'status', event.target.value)}><option value="open">open</option><option value="researching">researching</option><option value="answered">answered</option><option value="deferred">deferred</option></select></label>
              <button type="button" className="judgment-chapter-editor__remove" onClick={() => setUnknownDrafts(current => current.filter((_row, rowIndex) => rowIndex !== index))}>Remove</button>
            </div>
          ))}
        </section>
        <div className="judgment-chapter-editor__actions">
          <button type="submit" disabled={busy}>{busy ? 'Accepting…' : 'Accept ledger revision'}</button>
          <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
        </div>
        {error ? <p className="judgment-case__error" role="alert">{error}</p> : null}
        {saved ? <p className="judgment-chapter-editor__receipt" role="status">{previewMode ? 'Preview ledger revised locally. Nothing was saved.' : 'Falsifier ledger revision accepted.'}</p> : null}
      </div>
      <EvidenceMargin before={acceptedSummary} after={proposedSummary} evidenceCount={evidenceDelta.length} previewMode={previewMode} />
    </form>
  );
};

const ArtificialDecisionChapterEditor = ({ onClose }) => {
  const [summary, setSummary] = useState('Require signed capacity before increasing the position.');
  const [rationale, setRationale] = useState('The demand thesis remains intact, but conversion evidence should determine position size.');
  const [expectedOutcome, setExpectedOutcome] = useState('Contract conversion clears the threshold without weakening financing discipline.');
  const [recorded, setRecorded] = useState(false);
  return (
    <form className="judgment-chapter-editor is-single" aria-label="Record preview judgment" onSubmit={(event) => { event.preventDefault(); setRecorded(true); }}>
      <div className="judgment-chapter-editor__fields">
        <label>Decision summary<input aria-label="Preview decision summary" value={summary} onChange={event => { setSummary(event.target.value); setRecorded(false); }} /></label>
        <label>Rationale<textarea aria-label="Preview decision rationale" value={rationale} onChange={event => { setRationale(event.target.value); setRecorded(false); }} rows={3} /></label>
        <label>Expected outcome<textarea aria-label="Preview expected outcome" value={expectedOutcome} onChange={event => { setExpectedOutcome(event.target.value); setRecorded(false); }} rows={3} /></label>
        <div className="judgment-chapter-editor__actions">
          <button type="submit" disabled={!clean(summary) || !clean(rationale) || !clean(expectedOutcome)}>Freeze preview judgment</button>
          <button type="button" onClick={onClose}>Cancel</button>
        </div>
        {recorded ? <p className="judgment-chapter-editor__receipt" role="status">Preview judgment frozen locally. The prior decision remains immutable; nothing was saved.</p> : null}
      </div>
      <EvidenceMargin before="Existing reviewed decision" after={clean(summary)} evidenceCount={2} previewMode />
    </form>
  );
};

const ArtificialDecisionTransitionEditor = ({ onClose }) => {
  const [status, setStatus] = useState('');
  return (
    <section className="judgment-chapter-editor is-single" aria-label="Preview decision transitions">
      <div className="judgment-chapter-editor__fields">
        <p>The original rationale is frozen. Choose only whether this planned judgment was taken or cancelled.</p>
        <div className="judgment-chapter-editor__actions">
          <button type="button" onClick={() => setStatus('taken')}>Mark taken</button>
          <button type="button" onClick={() => setStatus('cancelled')}>Cancel decision</button>
          <button type="button" onClick={onClose}>Close</button>
        </div>
        {status ? <p className="judgment-chapter-editor__receipt" role="status">Preview decision marked {status}. The frozen rationale remains visible; nothing was saved.</p> : null}
      </div>
      <EvidenceMargin before="Planned decision" after={status ? `Decision marked ${status}` : 'Choose a disposition'} evidenceCount={2} previewMode />
    </section>
  );
};

const ArtificialOutcomeChapterEditor = ({ onClose }) => {
  const [summary, setSummary] = useState('Signed capacity crossed the threshold without an adverse financing event.');
  const [result, setResult] = useState('mixed');
  const [lesson, setLesson] = useState('Size capital-intensive growth positions to verified contract conversion.');
  const [recorded, setRecorded] = useState(false);
  return (
    <form className="judgment-chapter-editor is-single" aria-label="Record preview outcome" onSubmit={(event) => { event.preventDefault(); setRecorded(true); }}>
      <div className="judgment-chapter-editor__fields">
        <label>Observed result<textarea aria-label="Preview observed result" value={summary} onChange={event => { setSummary(event.target.value); setRecorded(false); }} rows={3} /></label>
        <label>Result<select aria-label="Preview outcome result" value={result} onChange={event => { setResult(event.target.value); setRecorded(false); }}><option value="positive">positive</option><option value="mixed">mixed</option><option value="negative">negative</option></select></label>
        <label>Lesson<textarea aria-label="Preview outcome lesson" value={lesson} onChange={event => { setLesson(event.target.value); setRecorded(false); }} rows={3} /></label>
        <div className="judgment-chapter-editor__actions">
          <button type="submit" disabled={!clean(summary) || !clean(lesson)}>Record preview outcome</button>
          <button type="button" onClick={onClose}>Cancel</button>
        </div>
        {recorded ? <p className="judgment-chapter-editor__receipt" role="status">Preview outcome recorded as {result}. A real outcome requires exact owned evidence and creates an immutable receipt.</p> : null}
      </div>
      <EvidenceMargin before="No observed outcome" after={clean(lesson)} evidenceCount={2} previewMode />
    </form>
  );
};

const Grounding = ({ item }) => {
  const grounding = groundingFor(item);
  if (!item) return <p className="judgment-case__unavailable">No accepted decision grounds yet.</p>;
  return (
    <div className="judgment-case__grounding" aria-label="Accepted grounds">
      <span>{grounding.claims.length} accepted Wiki claim{grounding.claims.length === 1 ? '' : 's'}</span>
      <span>{grounding.sources.length} owned Library source{grounding.sources.length === 1 ? '' : 's'}</span>
      {grounding.missingClaims.length || grounding.missingSources.length ? (
        <span className="is-incomplete">Some exact grounds are unavailable.</span>
      ) : null}
    </div>
  );
};

const Chapter = ({ number, title, children, item, id, actionLabel = '', expanded = false, onAction }) => (
  <section className="judgment-case__chapter" id={id}>
    <span className="judgment-case__number" aria-hidden="true">{number}</span>
    <div className="judgment-case__chapter-body">
      <div className="judgment-case__chapter-heading">
        <h2>{title}</h2>
        {actionLabel ? <button type="button" aria-expanded={expanded} onClick={onAction}>{expanded ? 'Close' : actionLabel}</button> : null}
      </div>
      {children}
    </div>
    <Grounding item={item} />
  </section>
);

const TruthList = ({ items, empty }) => {
  const rows = list(items).map(item => clean(item?.text || item?.question || item)).filter(Boolean);
  if (!rows.length) return <p className="judgment-case__unavailable">{empty}</p>;
  return <ul className="judgment-case__truth-list">{rows.map(row => <li key={row}>{row}</li>)}</ul>;
};

const TraceNode = ({ label, href, state = '', detail = '' }) => (
  <li className={state ? `is-${state}` : undefined}>
    <span aria-hidden="true" />
    <div>
      <strong>{label}</strong>
      {href ? <Link to={href}>{detail || 'View exact record'} →</Link> : <small>{detail || 'Not yet recorded'}</small>}
    </div>
  </li>
);

const Judgment = () => {
  const location = useLocation();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const previewMode = params.get('preview') === 'artificial';
  const surfaceMode = previewMode && params.get('mode') === 'board' ? 'board' : 'case';
  const activeView = resolveJudgmentView(location.search);
  const initialPages = useMemo(
    () => (previewMode ? [ARTIFICIAL_JUDGMENT_PAGE] : readWikiPageCache()),
    [previewMode]
  );
  const [pages, setPages] = useState(initialPages);
  const [decisionData, setDecisionData] = useState(previewMode
    ? { items: ARTIFICIAL_DECISION_ITEMS, counts: ARTIFICIAL_DECISION_COUNTS }
    : { items: [], counts: null });
  const [fullPage, setFullPage] = useState(previewMode ? ARTIFICIAL_JUDGMENT_PAGE : null);
  const [loading, setLoading] = useState(previewMode ? false : !initialPages.length);
  const [pageLoading, setPageLoading] = useState(false);
  const [error, setError] = useState('');
  const [decisionIndexError, setDecisionIndexError] = useState('');
  const [previewPrompt, setPreviewPrompt] = useState('');
  const [previewExchange, setPreviewExchange] = useState({
    question: 'Which assumption created the timing error?',
    answer: artificialJudgmentReply('Which assumption created the timing error?')
  });
  const [workbenchRefreshing, setWorkbenchRefreshing] = useState(false);
  const [workbenchError, setWorkbenchError] = useState('');
  const [activeChapterEditor, setActiveChapterEditor] = useState('');

  const askArtificialJudgment = (event) => {
    event.preventDefault();
    const question = clean(previewPrompt);
    if (!question) return;
    setPreviewExchange({ question, answer: artificialJudgmentReply(question) });
    setPreviewPrompt('');
  };

  useEffect(() => {
    if (previewMode) {
      setPages([ARTIFICIAL_JUDGMENT_PAGE]);
      setDecisionData({
        items: ARTIFICIAL_DECISION_ITEMS,
        counts: ARTIFICIAL_DECISION_COUNTS
      });
      setLoading(false);
      setError('');
      setDecisionIndexError('');
      return undefined;
    }
    let cancelled = false;
    let pagesSettled = false;
    let decisionsSettled = false;
    let failures = 0;
    if (!initialPages.length) setLoading(true);
    setError('');
    setDecisionIndexError('');
    const finish = ({ source, failed = false, hasCases = false }) => {
      if (source === 'pages') pagesSettled = true;
      if (source === 'decisions') decisionsSettled = true;
      if (failed) failures += 1;
      if (cancelled) return;
      // Decisions and dossier pages are independent read models. Reveal the
      // casebook as soon as either honest source arrives instead of letting a
      // slow page index hide receipt-verified decisions that are already ready.
      if (initialPages.length || source === 'pages' || hasCases || (pagesSettled && decisionsSettled)) {
        setLoading(false);
      }
      if (pagesSettled && decisionsSettled && failures === 2) {
        setError('Could not open the living casebook.');
      }
    };
    listWikiPages({ limit: 500, includeLowQuality: 1 })
      .then((value) => {
        if (!cancelled) {
          setPages(value);
          writeWikiPageCache(value);
        }
        finish({ source: 'pages' });
      }, () => finish({ source: 'pages', failed: true }));
    loadJudgmentDecisionIndex()
      .then((value) => {
        if (!cancelled) setDecisionData(value);
        finish({ source: 'decisions', hasCases: Boolean(value?.items?.length) });
      }, () => {
        if (!cancelled) setDecisionIndexError('Decision history is temporarily unavailable. No absence has been inferred.');
        finish({ source: 'decisions', failed: true });
      });
    return () => { cancelled = true; };
  }, [initialPages.length, previewMode]);

  const allCases = useMemo(
    () => buildJudgmentCases(pages, decisionData.items),
    [pages, decisionData.items]
  );
  const visibleCases = useMemo(() => {
    if (activeView.id === 'dossiers') return allCases;
    return allCases.filter(caseItem => caseItem.decisions.some(
      item => decisionMatchesJudgmentView(item, activeView.id)
    ));
  }, [activeView.id, allCases]);

  const requestedPageId = clean(params.get('page'));
  const selectedCase = visibleCases.find(item => item.pageId === requestedPageId)
    || allCases.find(item => item.pageId === requestedPageId)
    || visibleCases[0]
    || allCases[0]
    || null;
  const requestedDecisionId = clean(params.get('decision'));
  const matchingDecisions = selectedCase?.decisions.filter(
    item => activeView.id === 'dossiers' || decisionMatchesJudgmentView(item, activeView.id)
  ) || [];
  const selectedDecision = matchingDecisions.find(
    item => clean(item?.identity?.decisionId) === requestedDecisionId
  ) || matchingDecisions[0] || selectedCase?.decisions[0] || null;

  useEffect(() => {
    setActiveChapterEditor('');
  }, [activeView.id, selectedCase?.pageId, selectedDecision?.identity?.decisionId]);

  useEffect(() => {
    const pageId = selectedCase?.pageId;
    if (!pageId) {
      setFullPage(null);
      return undefined;
    }
    if (previewMode) {
      setFullPage(selectedCase.page || ARTIFICIAL_JUDGMENT_PAGE);
      setPageLoading(false);
      return undefined;
    }
    let cancelled = false;
    setPageLoading(true);
    getWikiPage(pageId).then((page) => {
      if (!cancelled) setFullPage(page);
    }).catch(() => {
      if (!cancelled) setFullPage(selectedCase.page || null);
    }).finally(() => {
      if (!cancelled) setPageLoading(false);
    });
    return () => { cancelled = true; };
  }, [previewMode, selectedCase?.page, selectedCase?.pageId]);

  const page = fullPage || selectedCase?.page || null;
  const decision = selectedDecision?.decision || null;
  const outcome = selectedDecision?.outcome || null;
  const observed = clean(outcome?.state) === 'observed';
  const continuityComplete = selectedDecision?.continuity?.complete === true;
  const pageHref = safeHref(selectedDecision?.page?.href)
    || (selectedCase?.pageId ? `/wiki/workspace?page=${encodeURIComponent(selectedCase.pageId)}` : '');
  const decisionHref = safeHref(selectedDecision?.subject?.href) || pageHref;
  const grounding = groundingFor(selectedDecision);
  const firstClaimHref = safeHref(grounding.claims[0]?.href);
  const firstSourceHref = safeHref(grounding.sources[0]?.href);
  const currentJudgment = clean(page?.judgment?.currentJudgment);
  const falsifiers = list(page?.judgment?.falsifiers);
  const unknowns = list(page?.judgment?.unknowns);
  const acceptedRevisionId = clean(selectedDecision?.continuity?.acceptedRevisionId);
  const evidenceDelta = useMemo(
    () => evidenceDeltaFor(page, selectedDecision),
    [page, selectedDecision]
  );
  const retainedLessons = useMemo(() => list(decisionData.items)
    .filter(item => clean(item?.outcome?.state) === 'observed' && clean(item?.outcome?.lesson))
    .map(item => ({
      pageId: clean(item?.identity?.pageId),
      decisionId: clean(item?.identity?.decisionId),
      caseTitle: clean(item?.page?.title),
      lesson: clean(item?.outcome?.lesson),
      calibrationNote: clean(item?.outcome?.calibrationNote),
      outcomeReceiptId: clean(item?.outcome?.receiptId),
      acceptedRevisionId: clean(item?.continuity?.acceptedRevisionId)
    })), [decisionData.items]);
  const nextAction = nextJudgmentAction(selectedDecision);
  const caseDecisionCount = selectedCase?.decisions.length || 0;
  const viewLede = decisionIndexError
    ? decisionIndexError
    : activeView.id === 'dossiers'
    ? `${caseDecisionCount} recorded judgment${caseDecisionCount === 1 ? '' : 's'} connect this living case to decisions, outcomes, and retained lessons.`
    : activeView.id === 'decisions'
      ? clean(decision?.summary) || 'No accepted decision is attached to this case.'
      : activeView.id === 'reviews'
        ? `Review ${formatDate(decision?.reviewAt) || 'clock unavailable'} · test the original grounds against current accepted knowledge.`
        : activeView.id === 'outcomes'
          ? `Expected: ${clean(decision?.expectedOutcome) || 'No expected outcome was recorded.'}`
          : clean(outcome?.lesson) || 'No human-confirmed lesson is available.';
  const showThesis = ['dossiers', 'reviews', 'lessons'].includes(activeView.id);
  const showFalsifiers = ['dossiers', 'reviews'].includes(activeView.id);
  const showDecision = !decisionIndexError && ['dossiers', 'decisions', 'reviews', 'outcomes'].includes(activeView.id);
  const showOutcome = !decisionIndexError && ['dossiers', 'outcomes', 'lessons'].includes(activeView.id);
  const viewCounts = {
    dossiers: allCases.length,
    decisions: decisionIndexError ? '—' : allCases.reduce((count, item) => count + item.decisions.length, 0),
    reviews: decisionIndexError ? '—' : Number(decisionData.counts?.upcoming_review || 0),
    outcomes: decisionIndexError ? '—' : Number(decisionData.counts?.awaiting_outcome || 0),
    lessons: decisionIndexError ? '—' : Number(decisionData.counts?.reviewed || 0)
  };

  const stateMemo = !selectedDecision
    ? 'No accepted decision is attached to this case yet.'
    : !continuityComplete
      ? 'The historical chain is incomplete. Interpretation is paused.'
      : observed
        ? clean(outcome?.calibrationNote) || 'An observed outcome is recorded with exact evidence.'
        : 'Original grounds are preserved. No outcome has been inferred.';
  const partnerTitle = {
    dossiers: 'Case curator',
    decisions: 'Decision historian',
    reviews: 'Review partner',
    outcomes: 'Outcome recorder',
    lessons: 'Learning partner'
  }[activeView.id] || 'Judgment partner';
  const memo = activeView.id === 'dossiers'
    ? `${caseDecisionCount} judgment${caseDecisionCount === 1 ? '' : 's'} remain${caseDecisionCount === 1 ? 's' : ''} connected to this case without rewriting ${caseDecisionCount === 1 ? 'its' : 'their'} original grounds.`
    : activeView.id === 'decisions'
      ? clean(decision?.rationale) || stateMemo
      : activeView.id === 'reviews'
        ? `Review ${formatDate(decision?.reviewAt) || 'clock unavailable'}. Re-test the frozen rationale; do not infer an outcome.`
        : activeView.id === 'outcomes'
          ? `Expected result: ${(clean(decision?.expectedOutcome) || 'not recorded').replace(/[.!?]+$/, '')}. Attach observed evidence before judging it.`
          : stateMemo;
  const railPrimaryAction = {
    dossiers: { label: 'Review the case history', href: '#current-thesis' },
    decisions: { label: 'Inspect this exact decision', href: '#decision-record' },
    reviews: { label: nextAction.title, href: '#judgment-workbench' },
    outcomes: { label: nextAction.title, href: '#judgment-workbench' },
    lessons: { label: 'Reground in the retained lesson', href: '#outcome-lesson' }
  }[activeView.id];

  const refreshJudgment = async () => {
    if (previewMode || !selectedCase?.pageId) return;
    setWorkbenchRefreshing(true);
    setWorkbenchError('');
    try {
      const [nextPage, nextDecisions] = await Promise.all([
        getWikiPage(selectedCase.pageId),
        loadJudgmentDecisionIndex()
      ]);
      setFullPage(nextPage);
      setDecisionData(nextDecisions);
      setPages(current => current.map(candidate => (
        idOf(candidate) === selectedCase.pageId ? nextPage : candidate
      )));
    } catch (refreshError) {
      setWorkbenchError(
        refreshError?.response?.data?.error
        || refreshError?.message
        || 'The judgment was recorded, but this case could not refresh.'
      );
    } finally {
      setWorkbenchRefreshing(false);
    }
  };

  const acceptPageUpdate = (updatedPage) => {
    if (!updatedPage) return;
    setFullPage(updatedPage);
    if (!previewMode) {
      setPages(current => current.map(candidate => (
        idOf(candidate) === selectedCase?.pageId ? updatedPage : candidate
      )));
    }
  };

  const toggleChapterEditor = (id) => {
    setActiveChapterEditor(current => current === id ? '' : id);
  };

  const openChapterEditor = (id) => {
    setActiveChapterEditor(id);
    window.requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
      document.getElementById(id === 'outcome' ? 'outcome-lesson' : 'decision-record')
        ?.scrollIntoView?.({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    });
  };

  const decisionEditor = previewMode
    ? clean(decision?.status) === 'planned'
      ? <ArtificialDecisionTransitionEditor onClose={() => setActiveChapterEditor('')} />
      : <ArtificialDecisionChapterEditor onClose={() => setActiveChapterEditor('')} />
    : ['planned', 'taken'].includes(clean(decision?.status)) ? (
    <DecisionReviewPanel
      pageId={selectedCase?.pageId}
      decisionId={selectedDecision?.identity?.decisionId}
      page={page}
      onPageRefresh={refreshJudgment}
    />
  ) : (
    <DecisionCreateForm page={page} pageId={selectedCase?.pageId} onCreated={refreshJudgment} />
  );

  const outcomeEditor = observed
    ? (previewMode
      ? <ArtificialDecisionChapterEditor onClose={() => setActiveChapterEditor('')} />
      : <DecisionCreateForm page={page} pageId={selectedCase?.pageId} onCreated={refreshJudgment} />)
    : previewMode
      ? <ArtificialOutcomeChapterEditor onClose={() => setActiveChapterEditor('')} />
      : <DecisionReviewPanel
          pageId={selectedCase?.pageId}
          decisionId={selectedDecision?.identity?.decisionId}
          page={page}
          onPageRefresh={refreshJudgment}
        />;

  return (
    <section className="judgment-room noeis-editorial">
      {surfaceMode === 'board' ? <ArtificialJudgmentBoard /> : (
      <div className="judgment-casebook-shell">
        <aside className="judgment-room__rail" aria-label="Judgment sections">
          <p className="judgment-room__rail-label">Casebook</p>
          <nav>
            {JUDGMENT_VIEWS.map(option => (
              <NavLink
                key={option.id}
                className={`judgment-room__rail-link${activeView.id === option.id ? ' is-active' : ''}`}
                to={previewMode ? `/judgment?preview=artificial&view=${option.id}` : `/judgment?view=${option.id}`}
                aria-current={activeView.id === option.id ? 'page' : undefined}
              >
                <span>{option.label}</span>
                <small>{option.note}</small>
                <em>{viewCounts[option.id]}</em>
              </NavLink>
            ))}
          </nav>
          {visibleCases.length ? (
            <div className="judgment-room__cases">
              <p className="judgment-room__rail-label">Living cases</p>
              {visibleCases.map(caseItem => {
                const decisionId = caseItem.decisions[0]?.identity?.decisionId || '';
                return (
                  <Link
                    key={caseItem.pageId}
                    className={selectedCase?.pageId === caseItem.pageId ? 'is-active' : undefined}
                    to={exactCaseHref({ view: activeView.id, pageId: caseItem.pageId, decisionId, preview: previewMode })}
                  >
                    {caseItem.title}
                  </Link>
                );
              })}
            </div>
          ) : null}
        </aside>

        <main className="judgment-case" aria-busy={loading || pageLoading || undefined}>
          {loading ? <p className="judgment-case__loading" role="status">Opening your living casebook…</p> : null}
          {error ? <p className="judgment-case__error" role="alert">{error}</p> : null}
          {decisionIndexError ? <p className="judgment-case__error" role="alert">{decisionIndexError}</p> : null}
          {!loading && !error && !selectedCase ? (
            <div className="judgment-case__empty">
              <p className="judgment-room__eyebrow">Judgment</p>
              <h1>No living cases yet</h1>
              <p>Accept a grounded Wiki claim before recording a consequential decision.</p>
              <Link to="/wiki">Open Wiki</Link>
            </div>
          ) : null}
          {selectedCase ? (
            <>
              <header className="judgment-case__heading">
                <div className="judgment-case__heading-row">
                  <p className="judgment-room__eyebrow">{previewMode ? 'Artificial preview · ' : ''}Judgment · {activeView.label}</p>
                  {previewMode ? (
                    <nav className="judgment-surface-toggle" aria-label="Judgment surface">
                      <span aria-current="page">Case</span>
                      <Link to={artificialSurfaceHref('board')}>Board</Link>
                    </nav>
                  ) : null}
                </div>
                <h1>{selectedCase.title}</h1>
                <p className="judgment-case__lede">{viewLede}</p>
                {previewMode ? <p className="judgment-case__preview-note">Fictional · local · unsaved</p> : null}
              </header>

              {!decisionIndexError ? <section className="judgment-case__timefold" aria-label="Judgment time comparison">
                <div>
                  <span>At decision</span>
                  <p>{clean(decision?.rationale) || 'No accepted decision-time rationale is available.'}</p>
                  {decision?.acceptedAt ? <small>{formatDate(decision.acceptedAt)}</small> : null}
                </div>
                <i aria-hidden="true">→</i>
                <div>
                  <span>Now</span>
                  <p>{observed
                    ? clean(outcome?.summary) || 'An outcome was observed.'
                    : currentJudgment || 'No later outcome or judgment has been accepted.'}</p>
                  {observed && outcome?.observedAt ? <small>{formatDate(outcome.observedAt)}</small> : null}
                </div>
              </section> : null}

              {!decisionIndexError ? <section className="judgment-workbench" id="judgment-workbench" aria-labelledby="judgment-workbench-title">
                <header>
                  <div>
                    <p className="judgment-room__eyebrow">Next judgment action</p>
                    <h2 id="judgment-workbench-title">{nextAction.title}</h2>
                  </div>
                  <span>{clean(selectedDecision?.decision?.status) || 'no decision'}</span>
                  <p>{nextAction.note}</p>
                </header>

                <div className="judgment-workbench__live">
                  {selectedDecision ? <EvidenceDelta sources={evidenceDelta} /> : null}
                  <button
                    type="button"
                    className="judgment-workbench__continue"
                    onClick={() => openChapterEditor(nextAction.id === 'outcome' ? 'outcome' : 'decision')}
                  >
                    Continue in {nextAction.id === 'outcome' ? 'Outcome & lesson' : 'Decision record'}
                  </button>
                  {workbenchRefreshing ? <p role="status">Refreshing the casebook…</p> : null}
                  {workbenchError ? <p className="judgment-case__error" role="alert">{workbenchError}</p> : null}
                </div>
              </section> : null}

              {previewMode ? (
                <details className="judgment-case__source-ledger" id="source-record">
                  <summary>
                    <span>Grounding ledger</span>
                    <strong>{grounding.sources.length} synthetic receipts</strong>
                  </summary>
                  <ol>
                    {grounding.sources.map(source => (
                      <li key={source.id || source.sourceRefId}>{source.title}</li>
                    ))}
                  </ol>
                  <p>Preview evidence only. Nothing here is saved to Library or accepted as knowledge.</p>
                </details>
              ) : null}

              <div className="judgment-case__chapters">
                {showThesis ? (
                  <Chapter
                    number="1"
                    title="Current thesis"
                    item={selectedDecision}
                    id="current-thesis"
                    actionLabel="Revise thesis"
                    expanded={activeChapterEditor === 'thesis'}
                    onAction={() => toggleChapterEditor('thesis')}
                  >
                    <p>{currentJudgment || clean(decision?.rationale) || 'No accepted current thesis is available.'}</p>
                    {activeChapterEditor === 'thesis' ? (
                      <ThesisChapterEditor
                        key={selectedCase.pageId}
                        page={page}
                        pageId={selectedCase.pageId}
                        previewMode={previewMode}
                        evidenceDelta={evidenceDelta}
                        onPageUpdate={acceptPageUpdate}
                        onClose={() => setActiveChapterEditor('')}
                      />
                    ) : null}
                  </Chapter>
                ) : null}
                {showFalsifiers ? (
                  <Chapter
                    number="2"
                    title="What would change my mind"
                    item={selectedDecision}
                    id="falsifiers"
                    actionLabel="Update conditions"
                    expanded={activeChapterEditor === 'falsifiers'}
                    onAction={() => toggleChapterEditor('falsifiers')}
                  >
                    <TruthList items={falsifiers} empty="No accepted falsifiers are recorded." />
                    {unknowns.length ? <TruthList items={unknowns} empty="" /> : null}
                    {activeChapterEditor === 'falsifiers' ? (
                      <FalsifierChapterEditor
                        key={selectedCase.pageId}
                        page={page}
                        pageId={selectedCase.pageId}
                        previewMode={previewMode}
                        evidenceDelta={evidenceDelta}
                        onPageUpdate={acceptPageUpdate}
                        onClose={() => setActiveChapterEditor('')}
                      />
                    ) : null}
                  </Chapter>
                ) : null}
                {showDecision ? (
                  <Chapter
                    number="3"
                    title="Decision record"
                    item={selectedDecision}
                    id="decision-record"
                    actionLabel={['planned', 'taken'].includes(clean(decision?.status)) ? 'Review decision' : 'Record next judgment'}
                    expanded={activeChapterEditor === 'decision'}
                    onAction={() => toggleChapterEditor('decision')}
                  >
                    {decision ? (
                      <>
                        <p><strong>{decision.summary}</strong></p>
                        {decision.expectedOutcome ? <p>Expected: {decision.expectedOutcome}</p> : null}
                        <p className={continuityComplete ? 'judgment-case__verified' : 'judgment-case__blocked'}>
                          {continuityComplete
                            ? `Continuity verified${acceptedRevisionId ? ` · accepted revision ${acceptedRevisionId}` : ''}`
                            : 'Continuity incomplete. Noeis will not reconstruct missing grounds.'}
                        </p>
                      </>
                    ) : <p className="judgment-case__unavailable">No accepted decision is attached.</p>}
                    {activeChapterEditor === 'decision' ? <div className="judgment-chapter-editor__canonical">{decisionEditor}</div> : null}
                  </Chapter>
                ) : null}
                {showOutcome ? (
                  <Chapter
                    number="4"
                    title="Outcome & lesson"
                    item={selectedDecision}
                    id="outcome-lesson"
                    actionLabel={observed ? 'Use lesson in next judgment' : 'Record outcome'}
                    expanded={activeChapterEditor === 'outcome'}
                    onAction={() => toggleChapterEditor('outcome')}
                  >
                    {observed ? (
                      <>
                        <p><strong>{clean(outcome?.result) || 'Observed'}</strong>{outcome?.observedAt ? ` · ${formatDate(outcome.observedAt)}` : ''}</p>
                        {outcome?.summary ? <p>{outcome.summary}</p> : null}
                        {outcome?.lesson ? <blockquote>{outcome.lesson}</blockquote> : <p>No confirmed lesson is recorded.</p>}
                      </>
                    ) : clean(outcome?.state) === 'review_incomplete' ? (
                      <p className="judgment-case__blocked">Outcome review is incomplete. It is not treated as observed.</p>
                    ) : (
                      <p className="judgment-case__unavailable">Noeis has not inferred an outcome.</p>
                    )}
                    {activeChapterEditor === 'outcome' ? <div className="judgment-chapter-editor__canonical">{outcomeEditor}</div> : null}
                  </Chapter>
                ) : null}
              </div>
              {decisionHref ? <Link className="judgment-case__reground" to={decisionHref}>Reground in the exact record →</Link> : null}
            </>
          ) : null}
        </main>

        <aside className="judgment-partner" aria-label="Judgment partner">
          <header>
            <p className="judgment-room__eyebrow">Persistent agent</p>
            <h2>{partnerTitle}</h2>
          </header>
          <section className="judgment-partner__memo" aria-label="Calibration memo">
            <span>Calibration memo</span>
            <p>{memo}</p>
          </section>
          {selectedCase ? (
            <nav className="judgment-partner__actions" aria-label="Case actions">
              <a href={railPrimaryAction.href}>{railPrimaryAction.label} →</a>
              {decisionHref ? <Link to={decisionHref}>Review original grounds →</Link> : null}
              {firstClaimHref ? <Link to={firstClaimHref}>Inspect an accepted claim →</Link> : null}
              {firstSourceHref ? <Link to={firstSourceHref}>Return to Library evidence →</Link> : null}
            </nav>
          ) : null}
          {previewMode ? (
            <section className="judgment-partner__preview-agent" aria-label="Artificial judgment partner preview">
              <p className="judgment-room__eyebrow">Ask about this case</p>
              <div className="judgment-partner__preview-exchange" aria-live="polite">
                <p>“{previewExchange.question}”</p>
                <blockquote>{previewExchange.answer}</blockquote>
              </div>
              <div className="judgment-partner__preview-prompts" aria-label="Preview questions">
                <button type="button" onClick={() => setPreviewPrompt('What evidence grounds this case?')}>Grounds</button>
                <button type="button" onClick={() => setPreviewPrompt('What would change my mind?')}>Falsifiers</button>
              </div>
              <form onSubmit={askArtificialJudgment}>
                <textarea
                  aria-label="Preview agent question"
                  value={previewPrompt}
                  onChange={(event) => setPreviewPrompt(event.target.value)}
                  placeholder="Ask what held, changed, or was missed…"
                />
                <button type="submit" disabled={!clean(previewPrompt)}>Ask preview</button>
              </form>
              <small>Runs locally for this fictional case. No message or judgment is saved.</small>
            </section>
          ) : (
            <ThoughtPartnerPanel
              contextType={selectedCase ? 'wiki' : 'global'}
              contextId={selectedCase?.pageId || 'judgment-index'}
              contextTitle={selectedCase?.title || 'Judgment'}
              title="Ask about this case"
              subtitle="Grounded in accepted knowledge"
              placeholder="Ask what changed, what held, or what you missed…"
              emptyStateText="Challenge the grounds, compare the expected outcome, or identify missing evidence."
              promptTemplates={[
                'Challenge the accepted grounds behind this decision.',
                'What has changed since this decision was made?',
                'Which retained lesson from prior decisions applies here?',
                'What outcome evidence is still missing?'
              ]}
              contextMetadata={{
                pageId: selectedCase?.pageId || null,
                decisionId: selectedDecision?.identity?.decisionId || null,
                acceptedRevisionId: acceptedRevisionId || null,
                summary: decision?.summary || 'Living Judgment casebook.',
                lesson: outcome?.lesson || null,
                calibrationNote: outcome?.calibrationNote || null,
                evidenceDelta: evidenceDelta.map(source => ({ id: source.id, title: source.title })),
                retainedLessons,
                nextActions: [
                  'Review the immutable decision-time grounds.',
                  'Compare this case against receipt-bound lessons from prior decisions.',
                  'Separate observed outcomes from interpretation.',
                  'Require human confirmation before retaining a lesson.'
                ]
              }}
            />
          )}
        </aside>

        <aside className="judgment-trace" aria-label="Judgment trace">
          <header>
            <p className="judgment-room__eyebrow">Judgment trace</p>
            <p>Evidence to learning, without rewriting history.</p>
          </header>
          <ol>
            <TraceNode label="Source" href={firstSourceHref} detail={grounding.sources[0]?.title || 'No exact source'} state={firstSourceHref ? 'verified' : 'missing'} />
            <TraceNode label="Claim" href={firstClaimHref} detail={grounding.claims[0]?.title || 'No accepted claim'} state={firstClaimHref ? 'verified' : 'missing'} />
            <TraceNode label="Decision" href={decisionHref} detail={decision?.summary || 'No accepted decision'} state={continuityComplete ? 'verified' : 'missing'} />
            <TraceNode label="Outcome" href={observed ? decisionHref : ''} detail={observed ? clean(outcome?.result) || 'Observed' : 'Not inferred'} state={observed ? 'verified' : 'waiting'} />
            <TraceNode label="Lesson" href={observed && outcome?.lesson ? decisionHref : ''} detail={outcome?.lesson ? 'Human-confirmed' : 'Not retained'} state={observed && outcome?.lesson ? 'verified' : 'waiting'} />
          </ol>
          <p className="judgment-trace__note">Every consequential update remains human-confirmed and receipt-bound.</p>
        </aside>
      </div>
      )}
    </section>
  );
};

export default Judgment;
