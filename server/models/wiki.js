// The wiki: pages, their judgments and claims, revisions and the runs that keep them.
const mongoose = require('mongoose');
const { WIKI_PAGE_TYPES } = require('../services/wikiPageStructureService');

const WIKI_PAGE_STATUSES = ['draft', 'published', 'archived'];
const WIKI_PROPOSAL_TYPES = ['repeated_theme', 'bridge_idea'];
const WIKI_PROPOSAL_STATUSES = ['pending', 'watched', 'accepted', 'dismissed', 'merged'];
const WIKI_PROPOSAL_SIGNAL_TYPES = ['phrase', 'tag', 'highlight', 'note', 'wiki_page', 'concept', 'question'];
const WIKI_VISIBILITY_VALUES = ['private', 'shared'];
const WIKI_SOURCE_SCOPES = ['entire_library', 'current_item', 'selected_sources'];

const normalizeWikiPageTypeForModel = (value = '') => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'topic';
  if (raw === 'person') return 'entity';
  if (raw === 'synthesis') return 'overview';
  return raw;
};

const wikiCreatedFromSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['wiki_index', 'idea', 'question', 'highlight', 'article', 'notebook', 'concept', 'sources', 'paste', 'search', 'thought_partner'],
    default: 'wiki_index'
  },
  objectId: { type: mongoose.Schema.Types.ObjectId, default: null },
  objectIds: [{ type: mongoose.Schema.Types.ObjectId }],
  text: { type: String, default: '', trim: true },
  label: { type: String, default: '', trim: true }
}, { _id: false });

const wikiAdoptedFromSchema = new mongoose.Schema({
  originType: { type: String, enum: ['page', 'collection', 'starter_pack'], default: 'page' },
  kind: { type: String, enum: ['adopt', 'fork'], default: 'adopt' },
  originPageId: { type: mongoose.Schema.Types.ObjectId, default: null },
  originCollectionId: { type: String, default: '', trim: true },
  originSlug: { type: String, default: '', trim: true },
  originTitle: { type: String, default: '', trim: true },
  originHash: { type: String, default: '', trim: true },
  packId: { type: String, default: '', trim: true },
  sample: { type: Boolean, default: false },
  adoptedAt: { type: Date, default: null }
}, { _id: false });

const casebookShareReceiptSchema = new mongoose.Schema({
  kind: { type: String, enum: ['published', 'corrected', 'revoked'], required: true },
  at: { type: Date, required: true },
  summary: { type: String, default: '', trim: true },
  hash: { type: String, default: '', trim: true }
}, { _id: false });

const casebookShareSchema = new mongoose.Schema({
  publishedAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null },
  receipts: { type: [casebookShareReceiptSchema], default: [] }
}, { _id: false });

const wikiSourceRefSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['article', 'highlight', 'notebook', 'concept', 'question', 'memory', 'external'],
    required: true
  },
  objectId: { type: mongoose.Schema.Types.ObjectId, default: null },
  parentObjectId: { type: mongoose.Schema.Types.ObjectId, default: null },
  title: { type: String, default: '', trim: true },
  snippet: { type: String, default: '', trim: true },
  url: { type: String, default: '', trim: true },
  citationLabel: { type: String, default: '', trim: true },
  provider: { type: String, default: '', trim: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  addedBy: { type: String, enum: ['user', 'ai'], default: 'user' },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const wikiCitationSchema = new mongoose.Schema({
  sourceRefId: { type: mongoose.Schema.Types.ObjectId, default: null },
  sourceType: { type: String, default: '', trim: true },
  sourceObjectId: { type: mongoose.Schema.Types.ObjectId, default: null },
  sourceTitle: { type: String, default: '', trim: true },
  quote: { type: String, default: '', trim: true },
  url: { type: String, default: '', trim: true },
  confidence: { type: Number, min: 0, max: 1, default: 0.5 },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

/* The two human-labelled reason lists on a judgment: "Why" and "Against".
   They are lists, not paragraphs, because the Judgment page reads one line at
   a time and because an agent line accepted by the human has to land as its
   own line with its own provenance. `strongestCounterargument` stays for the
   dossier surfaces that already write it; the Judgment page reads it as the
   first Against line when the list itself is empty. */
const judgmentReasonSchema = new mongoose.Schema({
  reasonId: { type: String, required: true, trim: true },
  text: { type: String, required: true, trim: true },
  sourceRefIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  sourceLabel: { type: String, default: '', trim: true },
  acceptedFrom: { type: String, default: '', trim: true },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

/* A passage can become part of a judgment without pretending that its arrival
   was observed. The response clock is therefore optional, but when present it
   remains bound to the exact held sentence, revision, and receipt that filed
   it. Mirror metrics only read complete records. */
const judgmentEvidenceResponseSchema = new mongoose.Schema({
  responseId: { type: String, required: true, trim: true },
  reasonId: { type: String, required: true, trim: true },
  field: { type: String, enum: ['why', 'against'], required: true },
  articleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Article', required: true },
  highlightId: { type: mongoose.Schema.Types.ObjectId, required: true },
  sourceArrivedAt: { type: Date, default: null },
  respondedAt: { type: Date, required: true },
  claimHash: { type: String, required: true, trim: true },
  revisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'WikiRevision', required: true },
  receiptId: { type: String, required: true, trim: true }
}, { _id: false });

const judgmentAssumptionSchema = new mongoose.Schema({
  assumptionId: { type: String, required: true, trim: true },
  text: { type: String, required: true, trim: true },
  status: { type: String, enum: ['unreviewed', 'holds', 'weakened', 'failed'], default: 'unreviewed' },
  confidence: { type: Number, min: 0, max: 1, default: null },
  affectedClaimIds: { type: [String], default: [] },
  sourceRefIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  lastReviewedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const judgmentUnknownSchema = new mongoose.Schema({
  unknownId: { type: String, required: true, trim: true },
  question: { type: String, required: true, trim: true },
  priority: { type: String, enum: ['critical', 'high', 'medium', 'low'], default: 'medium' },
  status: { type: String, enum: ['open', 'researching', 'answered', 'deferred'], default: 'open' },
  answer: { type: String, default: '', trim: true },
  affectedClaimIds: { type: [String], default: [] },
  sourceRefIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  ownerLabel: { type: String, default: '', trim: true },
  dueAt: { type: Date, default: null },
  resolvedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const judgmentFalsifierSchema = new mongoose.Schema({
  falsifierId: { type: String, required: true, trim: true },
  text: { type: String, required: true, trim: true },
  observableSignal: { type: String, default: '', trim: true },
  status: { type: String, enum: ['unobserved', 'warning', 'triggered', 'retired'], default: 'unobserved' },
  affectedClaimIds: { type: [String], default: [] },
  sourceRefIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  lastCheckedAt: { type: Date, default: null },
  triggeredAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const judgmentDecisionOutcomeSchema = new mongoose.Schema({
  observedAt: { type: Date, default: null },
  summary: { type: String, default: '', trim: true },
  result: { type: String, enum: ['positive', 'negative', 'mixed', 'unknown'], default: 'unknown' },
  processScore: { type: Number, min: 0, max: 1, default: null },
  calibrationNote: { type: String, default: '', trim: true },
  lesson: { type: String, default: '', trim: true },
  evidenceSourceRefIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  reviewedAt: { type: Date, default: null },
  reviewedBy: { type: String, enum: ['user'], default: null },
  revisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'WikiRevision', default: null },
  receiptId: { type: String, default: '', trim: true },
  decisionSnapshotHash: { type: String, default: '', trim: true },
  recordHash: { type: String, default: '', trim: true }
}, { _id: false });

const judgmentDecisionSchema = new mongoose.Schema({
  decisionId: { type: String, required: true, trim: true },
  decidedAt: { type: Date, default: null },
  decisionType: { type: String, enum: ['research', 'outreach', 'product', 'operating', 'investment', 'no_action', 'close'], default: 'research' },
  summary: { type: String, required: true, trim: true },
  rationale: { type: String, default: '', trim: true },
  expectedOutcome: { type: String, default: '', trim: true },
  horizon: { type: String, default: '', trim: true },
  successCriteria: { type: [String], default: [] },
  reviewAt: { type: Date, default: null },
  status: { type: String, enum: ['planned', 'taken', 'cancelled', 'reviewed'], default: 'planned' },
  relatedClaimIds: { type: [String], default: [] },
  sourceRefIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  acceptedRevisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'WikiRevision', default: null },
  acceptedRevisionDisposition: { type: String, enum: ['accepted', 'preserved'], default: null },
  recordedRevisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'WikiRevision', default: null },
  acceptedAt: { type: Date, default: null },
  acceptedBy: { type: String, enum: ['user'], default: null },
  basisPageHash: { type: String, default: '', trim: true },
  immutableSnapshotHash: { type: String, default: '', trim: true },
  receiptId: { type: String, default: '', trim: true },
  outcomeDueAt: { type: Date, default: null },
  outcome: { type: judgmentDecisionOutcomeSchema, default: () => ({}) },
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: String, enum: ['user', 'ai_proposed'], default: 'user' }
}, { _id: false });

/* What you learned, which outlives the claim.
   A judgment that closes or is parked leaves behind one thing worth keeping,
   and it is not the claim — it is what holding it taught you. Lessons are
   never rewritten and never deleted with the page: they are the compounding
   part of the loop. `closedAs` records what the judgment was doing at the
   moment the lesson was written, because "I was wrong" and "I stopped
   watching" are different lessons. */
const judgmentLessonSchema = new mongoose.Schema({
  lessonId: { type: String, required: true, trim: true },
  text: { type: String, required: true, trim: true },
  closedAs: { type: String, enum: ['parked', 'closed', 'retired', 'revised', ''], default: '' },
  at: { type: Date, default: Date.now },
  sourcePageId: { type: mongoose.Schema.Types.ObjectId, default: null },
  sourceLessonId: { type: String, default: '', trim: true },
  outcomeId: { type: String, default: '', trim: true }
}, { _id: false });

/* What this belief rests on.
   A list of claims is a list. A belief that depends on another belief is
   structure, and it is the only thing here that compounds: retire "compute is
   scarce" and something has to ask what happens to "CoreWeave is undervalued".

   `pageId` is another judgment page. `note` is the reader's own sentence about
   why one rests on the other, because the edge without the reason is a graph
   nobody can read six months later. `proposedBy` records whether an agent
   suggested it — an agent may propose an edge and may never store one
   accepted, which is the same rule as everywhere else. */
const judgmentDependencySchema = new mongoose.Schema({
  dependencyId: { type: String, required: true, trim: true },
  pageId: { type: mongoose.Schema.Types.ObjectId, required: true },
  note: { type: String, default: '', trim: true },
  proposedBy: { type: String, enum: ['user', 'ai_proposed'], default: 'user' },
  acceptedAt: { type: Date, default: Date.now }
}, { _id: false });

/* A belief earns a clock only when the human chooses the test. Criteria are
   mutable, but their history is not: each change is bound to the revision and
   receipt that made it part of the case. */
const judgmentResolutionHistorySchema = new mongoose.Schema({
  criteria: { type: String, default: '', trim: true },
  horizonAt: { type: Date, default: null },
  setAt: { type: Date, required: true },
  revisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'WikiRevision', required: true },
  receiptId: { type: String, required: true, trim: true },
  claimHash: { type: String, required: true, trim: true }
}, { _id: false });

/* Five clocks. Each fact names its clock, who wrote it, and how precise the
   time is. A later edit is another fact. The past does not move. */
const judgmentClockFactSchema = new mongoose.Schema({
  factId: { type: String, required: true, trim: true },
  clock: { type: String, enum: ['evidence', 'expectation', 'decision', 'review', 'outcome'], required: true },
  occurredAt: { type: Date, default: null },
  recordedAt: { type: Date, required: true },
  precision: { type: String, enum: ['exact', 'day', 'month', 'year', 'unknown'], default: 'unknown' },
  authoredBy: { type: String, enum: ['user', 'world', 'system'], default: 'user' },
  sourceRefIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  sourceLabel: { type: String, default: '', trim: true },
  summary: { type: String, default: '', trim: true },
  causalKind: { type: String, enum: ['evidence', 'inference'], default: 'evidence' },
  relatedId: { type: String, default: '', trim: true },
  derived: { type: Boolean, default: false },
  receiptId: { type: String, default: '', trim: true },
  revisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'WikiRevision', default: null },
  claimHash: { type: String, default: '', trim: true },
  recordHash: { type: String, default: '', trim: true }
}, { _id: false });

/* An outcome is what the world did, recorded after the decision. It may create
   a lesson. It never rewrites the verdict it is bound to. */
const judgmentCaseOutcomeSchema = new mongoose.Schema({
  outcomeId: { type: String, required: true, trim: true },
  result: { type: String, enum: ['held', 'missed', 'mixed', 'silent', 'unknown'], default: 'unknown' },
  observedAt: { type: Date, default: null },
  recordedAt: { type: Date, required: true },
  precision: { type: String, enum: ['exact', 'day', 'month', 'year', 'unknown'], default: 'unknown' },
  sourceRefIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  sourceLabel: { type: String, default: '', trim: true },
  confidence: { type: String, enum: ['certain', 'probable', 'uncertain', ''], default: '' },
  silence: { type: Boolean, default: false },
  question: { type: String, default: '', trim: true },
  answer: { type: String, default: '', trim: true },
  lesson: { type: String, default: '', trim: true },
  verdictId: { type: String, default: '', trim: true },
  verdictSnapshot: { type: String, default: '', trim: true },
  lessonId: { type: String, default: '', trim: true },
  revisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'WikiRevision', default: null },
  receiptId: { type: String, default: '', trim: true },
  recordHash: { type: String, default: '', trim: true },
  recordedBy: { type: String, enum: ['user'], default: 'user' }
}, { _id: false });

const judgmentLessonApplicationSchema = new mongoose.Schema({
  applicationId: { type: String, required: true, trim: true },
  lessonId: { type: String, required: true, trim: true },
  sourcePageId: { type: mongoose.Schema.Types.ObjectId, default: null },
  sourceText: { type: String, default: '', trim: true },
  status: { type: String, enum: ['proposed', 'accepted', 'rejected', 'narrowed', 'retired'], default: 'proposed' },
  proposedAt: { type: Date, default: Date.now },
  resolvedAt: { type: Date, default: null },
  narrowedText: { type: String, default: '', trim: true },
  note: { type: String, default: '', trim: true },
  relevance: { type: String, default: '', trim: true },
  sourceOutcomeId: { type: String, default: '', trim: true },
  sourceVerdictId: { type: String, default: '', trim: true },
  sourceHeldView: { type: String, default: '', trim: true },
  sourceCriterionSnapshot: { type: String, default: '', trim: true },
  sourceResultSnapshot: { type: String, default: '', trim: true },
  sourceEvidenceRefIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  revisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'WikiRevision', default: null },
  receiptId: { type: String, default: '', trim: true },
  claimHash: { type: String, default: '', trim: true }
}, { _id: false });

/* Verdicts are observations, not state. A later revision does not overwrite
   the fact that the earlier sentence held, broke, partly held, could not be
   resolved, or was right for the wrong reasons. */
const judgmentVerdictSchema = new mongoose.Schema({
  verdictId: { type: String, required: true, trim: true },
  result: { type: String, enum: ['held_up', 'broke', 'partly', 'unresolvable', 'right_for_wrong_reasons'], required: true },
  note: { type: String, default: '', trim: true },
  evidenceSourceRefIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  recordedAt: { type: Date, required: true },
  criteriaSnapshot: { type: String, default: '', trim: true },
  horizonAtSnapshot: { type: Date, default: null },
  claimHash: { type: String, required: true, trim: true },
  recordHash: { type: String, required: true, trim: true },
  revisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'WikiRevision', required: true },
  receiptId: { type: String, required: true, trim: true },
  recordedBy: { type: String, enum: ['user'], default: 'user' }
}, { _id: false });

const wikiJudgmentSchema = new mongoose.Schema({
  /* Not required. A judgment page is one that carries a judgment, and in the
     reading language that is a claim with reasons — no framed question above
     it. Requiring a kind made that shape unsaveable: sending one demanded a
     governingQuestion and was refused with a 400, omitting it failed schema
     validation and came back a 500. Kind and its governing question stay
     supported together, for the older thesis/decision/prediction shape. */
  kind: { type: String, enum: ['thesis', 'decision', 'prediction', null], default: null },
  /* Also not required, for the same reason. The pairing that matters — a kind
     must come with the question it frames — is enforced in the judgment
     service, which is where a rule about two fields belongs. The schema only
     needs to know the field exists. */
  governingQuestion: { type: String, default: '', trim: true },
  currentJudgment: { type: String, default: '', trim: true },
  /* What the sentence used to say. A judgment that changed is the record, not
     an edit to hide, so the superseded wording keeps the date it stopped
     being held. Append-only: nothing here is ever rewritten. */
  heldHistory: {
    type: [new mongoose.Schema({
      text: { type: String, required: true, trim: true },
      until: { type: Date, required: true },
      evidence: { type: new mongoose.Schema({
        reasonId: String, text: String, sourceLabel: String, acceptedFrom: String,
        sourceRefIds: [String]
      }, { _id: false }), default: undefined }
    }, { _id: false })],
    default: []
  },
  confidence: { type: Number, min: 0, max: 1, default: null },
  /* `parked` is not `closed`. Closed means the question is settled; parked
     means the reader has stopped tending this one, which says nothing about
     whether it is true. Without the distinction a belief you simply stopped
     watching had to be retired to get it out of the way, so it left the list
     looking like a belief you had abandoned. */
  status: { type: String, enum: ['framing', 'researching', 'challenged', 'decision_ready', 'monitoring', 'parked', 'closed', 'archived'], default: 'framing' },
  parkedAt: { type: Date, default: null },
  decisionPosture: { type: String, enum: ['investigate', 'watch', 'act', 'avoid', 'no_action', 'closed'], default: 'investigate' },
  ownerLabel: { type: String, default: '', trim: true },
  /* `bornAt` is the first moment this exact held sentence entered Judgment.
     `startedAt` remains as a legacy case clock; new code reads bornAt first. */
  bornAt: { type: Date, default: null },
  startedAt: { type: Date, default: null },
  lastReviewedAt: { type: Date, default: null },
  nextReviewAt: { type: Date, default: null },
  nextReviewTrigger: { type: String, default: '', trim: true },
  initialRevisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'WikiRevision', default: null },
  strongestCounterargument: { type: String, default: '', trim: true },
  causalModel: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({ summary: '', nodes: [], edges: [] })
  },
  why: { type: [judgmentReasonSchema], default: [] },
  against: { type: [judgmentReasonSchema], default: [] },
  evidenceResponses: { type: [judgmentEvidenceResponseSchema], default: [] },
  assumptions: { type: [judgmentAssumptionSchema], default: [] },
  unknowns: { type: [judgmentUnknownSchema], default: [] },
  falsifiers: { type: [judgmentFalsifierSchema], default: [] },
  decisions: { type: [judgmentDecisionSchema], default: [] },
  lessons: { type: [judgmentLessonSchema], default: [] },
  dependsOn: { type: [judgmentDependencySchema], default: [] },
  resolutionCriteria: { type: String, default: '', trim: true },
  resolutionHorizonAt: { type: Date, default: null },
  resolutionSetAt: { type: Date, default: null },
  resolutionHistory: { type: [judgmentResolutionHistorySchema], default: [] },
  verdicts: { type: [judgmentVerdictSchema], default: [] },
  clocks: { type: [judgmentClockFactSchema], default: [] },
  outcomes: { type: [judgmentCaseOutcomeSchema], default: [] },
  lessonApplications: { type: [judgmentLessonApplicationSchema], default: [] },
  dismissedOvernightEventIds: { type: [String], default: [] },
  notAboutIds: { type: [String], default: [] }
}, { _id: false });

const wikiClaimSchema = new mongoose.Schema({
  claimId: { type: String, required: true, trim: true },
  text: { type: String, required: true, trim: true },
  section: { type: String, default: '', trim: true },
  support: { type: String, enum: ['supported', 'partial', 'unsupported', 'conflicted'], default: 'unsupported' },
  citationIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  sourceRefIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  contradictedByCitationIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  confidence: { type: Number, min: 0, max: 1, default: 0 },
  epistemicStatus: {
    type: String,
    enum: ['established_fact', 'supported_interpretation', 'plausible_hypothesis', 'speculation', 'rejected'],
    default: 'plausible_hypothesis'
  },
  materiality: { type: String, enum: ['critical', 'major', 'supporting', 'context'], default: 'supporting' },
  implication: { type: String, default: '', trim: true },
  falsifierIds: { type: [String], default: [] },
  lastReviewedAt: { type: Date, default: null },
  lastVerifiedAt: { type: Date, default: null },
  checkInStatus: {
    type: String,
    enum: ['unreviewed', 'reaffirmed', 'revised', 'retired'],
    default: 'unreviewed'
  },
  lastCheckedAt: { type: Date, default: null },
  retiredAt: { type: Date, default: null },
  restoredAt: { type: Date, default: null },
  /* The day this belief entered the ledger. Backfilled from createdAt or the
     oldest history.at — never left blank for the UI to print Unknown. */
  bornAt: { type: Date, default: null },
  /* AT-427. Optional. What would change your mind, and by when. Never required. */
  resolutionCriteria: { type: String, default: '', trim: true },
  horizon: { type: Date, default: null },
  /* AT-428. Append-only verdicts. The paper asks; the owner taps; history grows. */
  verdicts: {
    type: [{
      at: { type: Date, default: Date.now },
      verdict: { type: String, enum: ['held_up', 'broke', 'partly', 'unresolvable', 'right_for_wrong_reasons'], required: true },
      trigger: { type: String, enum: ['horizon', 'evidence'], default: 'horizon' },
      sourceEventId: { type: String, default: '', trim: true },
      horizon: { type: Date, default: null },
      note: { type: String, default: '', trim: true },
      actorType: { type: String, enum: ['user'], default: 'user' }
    }],
    default: []
  },
  history: {
    type: [{
      at: { type: Date, default: Date.now },
      event: { type: String, default: 'reviewed', trim: true },
      support: { type: String, enum: ['supported', 'partial', 'unsupported', 'conflicted'], default: 'unsupported' },
      text: { type: String, default: '', trim: true },
      section: { type: String, default: '', trim: true },
      citationIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
      sourceRefIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
      contradictedByCitationIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
      summary: { type: String, default: '', trim: true },
      action: { type: String, enum: ['', 'reaffirmed', 'revised', 'retired', 'restored', 'held_up', 'broke', 'partly', 'unresolvable', 'right_for_wrong_reasons'], default: '' },
      note: { type: String, default: '', trim: true },
      evidenceDelta: { type: mongoose.Schema.Types.Mixed, default: null },
      confidence: { type: Number, min: 0, max: 1, default: null },
      epistemicStatus: { type: String, enum: ['established_fact', 'supported_interpretation', 'plausible_hypothesis', 'speculation', 'rejected'], default: null },
      disposition: { type: String, enum: ['accepted', 'rejected', 'deferred', 'preserved'], default: null },
      reason: { type: String, default: '', trim: true },
      actorType: { type: String, enum: ['user', 'agent', 'system'], default: 'system' }
    }],
    default: []
  },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const wikiFreshnessSchema = new mongoose.Schema({
  status: { type: String, enum: ['fresh', 'needs_review', 'stale', 'conflicted'], default: 'fresh' },
  lastSourceEventAt: { type: Date, default: null },
  lastMaintainedAt: { type: Date, default: null },
  /* Human acceptance clock for the living index. Distinct from lastMaintainedAt
     when maintenance runs without a signed review; Accept always inks both. */
  lastReviewedAt: { type: Date, default: null },
  /* Low-stakes reviews (editions, repo wikis, never-visited pages) leave the
     queue after the triage TTL. This is expiry, not human Accept. */
  reviewExpiredAt: { type: Date, default: null },
  pendingSourceEventIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  conflictCount: { type: Number, default: 0 },
  staleSectionCount: { type: Number, default: 0 },
  acceptedThrough: { type: mongoose.Schema.Types.Mixed, default: null }
}, { _id: false });

const wikiPublicProofAcceptedClockSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['sec_edgar', 'earnings_transcript', 'github', 'reading', 'manual'],
    required: true
  },
  sourceEventId: { type: String, required: true, trim: true },
  revisionId: { type: String, required: true, trim: true },
  acceptedAt: { type: Date, required: true }
}, { _id: false });

const wikiPublicProofAcceptanceSnapshotSchema = new mongoose.Schema({
  kind: { type: String, default: '', trim: true },
  repository: { type: String, default: '', trim: true },
  baselineHeadSha: { type: String, default: '', trim: true },
  observedHeadSha: { type: String, default: '', trim: true },
  publishedHeadSha: { type: String, default: '', trim: true },
  comparisonVersion: { type: Number, default: 0 },
  sourceEventId: { type: String, default: '', trim: true },
  revisionId: { type: String, default: '', trim: true },
  headContentHash: { type: String, default: '', trim: true },
  researchAsOf: { type: Date, default: null },
  maintenanceRunId: { type: String, default: '', trim: true },
  counts: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  acceptedAt: { type: Date, default: null }
}, { _id: false });

const wikiPublicProofSchema = new mongoose.Schema({
  grade: {
    type: String,
    enum: ['proven', 'candidate', 'acceptance_in_progress', 'illustrative'],
    default: 'candidate'
  },
  reason: { type: String, default: '', trim: true },
  acceptedAt: { type: Date, default: null },
  acceptedEventId: { type: String, default: '', trim: true },
  acceptedClocks: { type: [wikiPublicProofAcceptedClockSchema], default: [] },
  acceptanceSnapshot: { type: wikiPublicProofAcceptanceSnapshotSchema, default: null }
}, { _id: false });

const wikiAiStateSchema = new mongoose.Schema({
  draftStatus: { type: String, enum: ['idle', 'drafting', 'maintaining', 'ready', 'error'], default: 'idle' },
  draftRequestedAt: { type: Date, default: null },
  draftStartedAt: { type: Date, default: null },
  draftCompletedAt: { type: Date, default: null },
  lastDraftedAt: { type: Date, default: null },
  lastError: { type: String, default: '', trim: true },
  errorCode: { type: String, default: '', trim: true },
  build: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({
      runId: '',
      resumable: false,
      resumed: false,
      lastStage: '',
      startedAt: null,
      interruptedAt: null
    })
  },
  model: { type: String, default: '', trim: true },
  provider: { type: String, default: '', trim: true },
  sourceScopeAtDraft: { type: String, enum: WIKI_SOURCE_SCOPES, default: 'entire_library' },
  sourceRefIdsAtDraft: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  maintenanceSummary: { type: String, default: '', trim: true },
  sectionMaintenance: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({
      updatedAt: null,
      sections: []
    })
  },
  quality: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({
      ok: true,
      status: 'pass',
      score: 1,
      failures: [],
      checkedAt: null,
      rebuiltAutomatically: false
    })
  },
  candidateStatus: {
    type: String,
    enum: [
      'idle',
      'building',
      'promoted',
      'rejected',
      'evidence_only',
      'awaiting_first_head_acceptance',
      'awaiting_maintenance_acceptance',
      'awaiting_claim_acceptance',
      'unbounded_candidate',
      'accepted',
      'first_head_rejected',
      'maintenance_rejected'
    ],
    default: 'idle'
  },
  firstHeadCandidateRevisionId: { type: String, default: '', trim: true },
  firstHeadCandidateAt: { type: Date, default: null },
  firstHeadCandidateSummary: { type: mongoose.Schema.Types.Mixed, default: null },
  firstHeadAcceptedAt: { type: Date, default: null },
  maintenanceCandidateRevisionId: { type: String, default: '', trim: true },
  maintenanceCandidateAt: { type: Date, default: null },
  maintenanceCandidateSummary: { type: mongoose.Schema.Types.Mixed, default: null },
  lastCandidateAt: { type: Date, default: null },
  lastCandidateQuality: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  lastCandidateSummary: { type: String, default: '', trim: true },
  lastCandidateSourceRefIds: { type: [String], default: [] },
  health: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({
      newItems: [],
      unsupportedClaims: [],
      missingCitations: [],
      staleSections: [],
      contradictions: [],
      relatedPages: []
    })
  },
  changeLog: {
    type: [{
      id: { type: String, default: '', trim: true },
      type: { type: String, default: 'edit', trim: true },
      title: { type: String, default: '', trim: true },
      text: { type: String, default: '', trim: true },
      sourceRefIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
      createdAt: { type: Date, default: Date.now }
    }],
    default: []
  },
  suggestions: {
    type: [{
      id: { type: String, required: true, trim: true },
      type: { type: String, enum: ['outline', 'claim', 'gap', 'edit'], default: 'edit' },
      title: { type: String, default: '', trim: true },
      text: { type: String, default: '', trim: true },
      sourceRefIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
      appliedAt: { type: Date, default: null },
      dismissedAt: { type: Date, default: null },
      createdAt: { type: Date, default: Date.now }
    }],
    default: []
  }
}, { _id: false });

// Each entry is one Q&A turn against the page. answer is a TipTap doc that
// re-uses the existing claim mark schema so the editor's inline citation
// popover works on the answer text without extra plumbing.
const wikiDiscussionSchema = new mongoose.Schema({
  question: { type: String, required: true, trim: true },
  answer: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({ type: 'doc', content: [{ type: 'paragraph' }] })
  },
  citationIndexesUsed: { type: [Number], default: [] },
  provenance: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({})
  },
  model: { type: String, default: '', trim: true },
  status: { type: String, enum: ['answered', 'failed'], default: 'answered' },
  errorMessage: { type: String, default: '', trim: true },
  askedAt: { type: Date, default: Date.now }
});

const wikiEdgarWatchSchema = new mongoose.Schema({
  ticker: { type: String, default: '', trim: true, uppercase: true },
  cik: { type: String, default: '', trim: true },
  companyName: { type: String, default: '', trim: true },
  forms: { type: [String], default: () => ['10-K', '10-Q', '8-K', '13F-HR'] },
  status: { type: String, enum: ['idle', 'active', 'error'], default: 'idle' },
  lastCheckedAt: { type: Date, default: null },
  lastFilingAt: { type: Date, default: null },
  lastAccessionNumber: { type: String, default: '', trim: true },
  lastEventIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  errorMessage: { type: String, default: '', trim: true }
}, { _id: false });

const wikiTranscriptWatchSchema = new mongoose.Schema({
  provider: { type: String, default: 'fmp', trim: true, lowercase: true },
  ticker: { type: String, default: '', trim: true, uppercase: true },
  status: { type: String, enum: ['idle', 'active', 'error'], default: 'idle' },
  lastCheckedAt: { type: Date, default: null },
  lastTranscriptAt: { type: Date, default: null },
  lastTranscriptKey: { type: String, default: '', trim: true },
  lastEventIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  errorMessage: { type: String, default: '', trim: true }
}, { _id: false });

const wikiGitHubRepoWatchSchema = new mongoose.Schema({
  owner: { type: String, default: '', trim: true },
  repo: { type: String, default: '', trim: true },
  defaultBranch: { type: String, default: '', trim: true },
  status: { type: String, enum: ['idle', 'active', 'error'], default: 'idle' },
  lastCheckedAt: { type: Date, default: null },
  lastHeadProbeAt: { type: Date, default: null },
  lastHeadSha: { type: String, default: '', trim: true },
  publishedHeadSha: { type: String, default: '', trim: true },
  candidateHeadSha: { type: String, default: '', trim: true },
  publishedGeneratorVersion: { type: String, default: '', trim: true },
  candidateGeneratorVersion: { type: String, default: '', trim: true },
  lastPublishedAt: { type: Date, default: null },
  lastBuildAttemptAt: { type: Date, default: null },
  lastBuildError: { type: String, default: '', trim: true },
  buildStatus: {
    type: String,
    enum: ['idle', 'queued', 'building', 'ready', 'needs_review', 'error'],
    default: 'idle'
  },
  buildLease: {
    token: { type: String, default: '', trim: true },
    headSha: { type: String, default: '', trim: true },
    acquiredAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null }
  },
  lastReleaseTag: { type: String, default: '', trim: true },
  lastEventIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  errorMessage: { type: String, default: '', trim: true }
}, { _id: false });

const wikiReadingWatchSchema = new mongoose.Schema({
  feedUrl: { type: String, default: '', trim: true },
  canonicalFeedUrl: { type: String, default: '', trim: true },
  label: { type: String, default: '', trim: true },
  status: { type: String, enum: ['idle', 'active', 'error'], default: 'idle' },
  lastCheckedAt: { type: Date, default: null },
  lastItemAt: { type: Date, default: null },
  lastItemId: { type: String, default: '', trim: true },
  lastItemTitle: { type: String, default: '', trim: true },
  lastEventIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  errorMessage: { type: String, default: '', trim: true }
}, { _id: false });

const wikiExternalWatchesSchema = new mongoose.Schema({
  edgar: { type: wikiEdgarWatchSchema, default: () => ({}) },
  transcripts: { type: wikiTranscriptWatchSchema, default: () => ({}) },
  githubRepo: { type: wikiGitHubRepoWatchSchema, default: () => ({}) },
  reading: { type: wikiReadingWatchSchema, default: () => ({}) }
}, { _id: false });

const wikiPageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true, default: 'Untitled wiki page' },
  slug: { type: String, required: true, trim: true },
  pageType: { type: String, enum: WIKI_PAGE_TYPES, default: 'topic', set: normalizeWikiPageTypeForModel },
  status: { type: String, enum: WIKI_PAGE_STATUSES, default: 'draft', index: true },
  visibility: {
    type: String,
    enum: WIKI_VISIBILITY_VALUES,
    default: 'private',
    index: true,
    validate: {
      validator(value) {
        return !(value === 'shared' && String(this.createdFrom?.label || '').startsWith('research-ledger:'));
      },
      message: 'Research operating ledgers are permanently private.'
    }
  },
  sourceScope: { type: String, enum: WIKI_SOURCE_SCOPES, default: 'entire_library' },
  createdFrom: { type: wikiCreatedFromSchema, default: () => ({}) },
  adoptedFrom: { type: wikiAdoptedFromSchema, default: () => ({}) },
  body: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({ type: 'doc', content: [{ type: 'paragraph' }] })
  },
  plainText: { type: String, default: '', trim: true },
  sourceRefs: { type: [wikiSourceRefSchema], default: [] },
  claims: { type: [wikiClaimSchema], default: [] },
  citations: { type: [wikiCitationSchema], default: [] },
  judgment: { type: wikiJudgmentSchema, default: null },
  investmentDossier: { type: mongoose.Schema.Types.Mixed, default: null },
  activeCompanyDossierKey: { type: String, trim: true },
  freshness: { type: wikiFreshnessSchema, default: () => ({}) },
  publicProof: { type: wikiPublicProofSchema, default: null },
  casebookShare: { type: casebookShareSchema, default: null },
  discussions: { type: [wikiDiscussionSchema], default: [] },
  aiState: { type: wikiAiStateSchema, default: () => ({}) },
  externalWatches: { type: wikiExternalWatchesSchema, default: () => ({}) },
  /* Evergreen: the reader's own declaration that this one is permanent.
     Everything else in the product is measured against a clock — what changed
     overnight, what has gone unread, what is drifting. Some reading is not
     like that. It is held for life, and it should be reachable forever and
     never counted as neglected. This is the only flag on either object that
     the human sets and no agent may. */
  evergreen: { type: Boolean, default: false },
  evergreenAt: { type: Date, default: null },
  /* Quiet date on the living index after a human Accepts a review. Not a
     notification — the inked day the maintenance column can stop saying
     "Not reviewed". */
  lastReviewedAt: { type: Date, default: null },
  hiddenFromHome: { type: Boolean, default: false },
  debugOnly: { type: Boolean, default: false },
  archived: { type: Boolean, default: false }
}, { timestamps: true });

wikiPageSchema.index({ userId: 1, updatedAt: -1 });
wikiPageSchema.index({ userId: 1, evergreen: 1, updatedAt: -1 });
wikiPageSchema.index({ userId: 1, status: 1, updatedAt: -1 });
wikiPageSchema.index({ userId: 1, visibility: 1, updatedAt: -1 });
// Public surfaces query across owners, so every userId-prefixed index above is
// unusable for them and the shared-page scan sorted the whole collection in
// memory. The logged-out landing page waits on that query.
//
// Equality first, then the sort key, and nothing in between. The public query
// filters status with $ne, which is a range: putting it ahead of updatedAt left
// the sort unable to use the index, so an earlier attempt at this index changed
// the endpoint's measured time not at all. status stays a residual filter.
wikiPageSchema.index({ visibility: 1, updatedAt: -1 });
wikiPageSchema.index({ userId: 1, 'sourceRefs.objectId': 1 });
wikiPageSchema.index({ userId: 1, slug: 1 }, { unique: true });
wikiPageSchema.index(
  { userId: 1, activeCompanyDossierKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      activeCompanyDossierKey: { $type: 'string' },
      archived: false
    }
  }
);

wikiPageSchema.pre('validate', function normalizeLegacyWikiPageType(next) {
  this.pageType = normalizeWikiPageTypeForModel(this.pageType);
  next();
});

/**
 * Keep substantive claims in the semantic index. There are 50+ places that save
 * a wiki page, so this lives on the schema rather than at the call sites — a
 * post-save hook is the only single choke point that exists.
 *
 * Required lazily to avoid a load-order cycle (embeddingJobs requires this
 * module for EmbeddingJob), fire-and-forget because indexing must never be able
 * to fail a page save.
 */
wikiPageSchema.post('save', function enqueueClaimEmbeddings(doc) {
  try {
    // eslint-disable-next-line global-require
    const { enqueueJudgmentEmbedding, enqueueWikiClaimEmbeddings } = require('../ai/embeddingJobs');
    enqueueJudgmentEmbedding(doc);
    enqueueWikiClaimEmbeddings(doc);
  } catch (error) {
    console.error('Failed to enqueue wiki semantic embeddings:', error.message);
  }
});

const WikiPage = mongoose.model('WikiPage', wikiPageSchema);

const wikiProposalSignalSchema = new mongoose.Schema({
  type: { type: String, enum: WIKI_PROPOSAL_SIGNAL_TYPES, required: true },
  label: { type: String, default: '', trim: true },
  weight: { type: Number, default: 1 },
  sourceType: { type: String, default: '', trim: true },
  sourceObjectId: { type: mongoose.Schema.Types.ObjectId, default: null },
  snippet: { type: String, default: '', trim: true }
}, { _id: true });

const wikiProposalRefSchema = new mongoose.Schema({
  type: { type: String, enum: ['article', 'highlight', 'notebook', 'concept', 'question', 'wiki_page', 'memory', 'external'], required: true },
  objectId: { type: mongoose.Schema.Types.ObjectId, default: null },
  title: { type: String, default: '', trim: true },
  snippet: { type: String, default: '', trim: true },
  url: { type: String, default: '', trim: true },
  sourceHost: { type: String, default: '', trim: true },
  reason: { type: String, default: '', trim: true }
}, { _id: true });

const wikiProposalSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  proposalType: { type: String, enum: WIKI_PROPOSAL_TYPES, required: true, index: true },
  status: { type: String, enum: WIKI_PROPOSAL_STATUSES, default: 'pending', index: true },
  title: { type: String, required: true, trim: true },
  slugCandidate: { type: String, required: true, trim: true },
  summary: { type: String, default: '', trim: true },
  thesis: { type: String, default: '', trim: true },
  whyNow: { type: String, default: '', trim: true },
  confidence: { type: Number, min: 0, max: 1, default: 0 },
  clusterKey: { type: String, required: true, trim: true },
  sourceRefs: { type: [wikiProposalRefSchema], default: [] },
  connectedPageRefs: { type: [wikiProposalRefSchema], default: [] },
  connectedConceptRefs: { type: [wikiProposalRefSchema], default: [] },
  signals: { type: [wikiProposalSignalSchema], default: [] },
  starterClaims: { type: [String], default: [] },
  openQuestions: { type: [String], default: [] },
  proposalDecision: { type: mongoose.Schema.Types.Mixed, default: null },
  quality: { type: mongoose.Schema.Types.Mixed, default: null },
  createdPageId: { type: mongoose.Schema.Types.ObjectId, ref: 'WikiPage', default: null },
  mergedIntoPageId: { type: mongoose.Schema.Types.ObjectId, ref: 'WikiPage', default: null },
  dismissedReason: { type: String, default: '', trim: true },
  generation: {
    source: { type: String, enum: ['deterministic', 'deterministic_quality_gate', 'ai_shaped'], default: 'deterministic' },
    generatedAt: { type: Date, default: Date.now },
    materialHash: { type: String, default: '', trim: true },
    signalCount: { type: Number, default: 0 }
  }
}, { timestamps: true });

wikiProposalSchema.index({ userId: 1, status: 1, updatedAt: -1 });
wikiProposalSchema.index({ userId: 1, clusterKey: 1 }, { unique: true });
wikiProposalSchema.index({ userId: 1, proposalType: 1, confidence: -1 });

const WikiProposal = mongoose.model('WikiProposal', wikiProposalSchema);

const wikiClaimReviewEventSchema = new mongoose.Schema({
  action: { type: String, enum: ['accept', 'reject', 'defer', 'preserve'], required: true },
  at: { type: Date, default: Date.now },
  note: { type: String, default: '', trim: true },
  deferredUntil: { type: Date, default: null },
  receiptId: { type: String, required: true, trim: true }
}, { _id: false });

const wikiClaimReviewSchema = new mongoose.Schema({
  version: { type: Number, default: 1 },
  scope: { type: String, enum: ['claim'], default: 'claim' },
  targetClaimId: { type: String, required: true, trim: true },
  conceptId: { type: mongoose.Schema.Types.ObjectId, ref: 'TagMeta', default: null },
  state: {
    type: String,
    enum: ['pending', 'deferred', 'accepted', 'rejected', 'preserved'],
    default: 'pending'
  },
  basePageHash: { type: String, default: '', trim: true },
  baseClaimHash: { type: String, default: '', trim: true },
  proposedClaimHash: { type: String, default: '', trim: true },
  proposedClaim: { type: mongoose.Schema.Types.Mixed, default: null },
  bodyPatch: { type: mongoose.Schema.Types.Mixed, default: null },
  affected: { type: mongoose.Schema.Types.Mixed, default: null },
  events: { type: [wikiClaimReviewEventSchema], default: [] },
  reviewedAt: { type: Date, default: null },
  deferredUntil: { type: Date, default: null },
  receipt: { type: mongoose.Schema.Types.Mixed, default: null }
}, { _id: false });

const wikiRevisionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  pageId: { type: mongoose.Schema.Types.ObjectId, ref: 'WikiPage', required: true, index: true },
  reason: { type: String, enum: ['created', 'user_edit', 'agent_maintenance', 'agent_candidate', 'source_event', 'valuation_refreshed', 'archived'], default: 'user_edit' },
  actorType: { type: String, enum: ['user', 'agent', 'system'], default: 'user' },
  sourceEventId: { type: mongoose.Schema.Types.ObjectId, ref: 'WikiSourceEvent', default: null },
  maintenanceRunId: { type: mongoose.Schema.Types.ObjectId, ref: 'WikiMaintenanceRun', default: null },
  promotionStatus: { type: String, enum: ['candidate', 'promoted', 'rejected', 'deferred', 'preserved'], default: 'promoted' },
  claimReview: { type: wikiClaimReviewSchema, default: null },
  sourceVersion: { type: mongoose.Schema.Types.Mixed, default: null },
  quality: { type: mongoose.Schema.Types.Mixed, default: null },
  before: { type: mongoose.Schema.Types.Mixed, default: null },
  after: { type: mongoose.Schema.Types.Mixed, default: null },
  snapshotPrunedAt: { type: Date, default: null },
  snapshotExpiryPolicy: { type: String, default: '' },
  /* A maintenance pass that changed nothing used to record that fact by storing
     the whole page twice. Repo-page revisions ran 1.5MB each and the wiki's
     revisions grew to two thirds of the cluster.

     So a pass whose before and after are the same content stores neither, and
     says so here. This is not snapshotPrunedAt: that means retention removed a
     payload and the content is gone. This means the content was never worth
     writing because it equals the revision before it, and is read back from
     there. The row, its id, its links, its summary and its review all stand. */
  snapshotUnchanged: { type: Boolean, default: false },
  contentHash: { type: String, default: '' },
  summary: { type: String, default: '', trim: true }
}, { timestamps: true });

wikiRevisionSchema.index({ userId: 1, pageId: 1, createdAt: -1 });
wikiRevisionSchema.index(
  { userId: 1, sourceEventId: 1, createdAt: -1 },
  { name: 'judgment_audit_revision' }
);

wikiRevisionSchema.plugin(require('../services/wikiRevisionHistoryArchive').revisionHistoryArchivePlugin);
const WikiRevision = mongoose.model('WikiRevision', wikiRevisionSchema);

const wikiLintRunSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  scope: { type: String, enum: ['all', 'page'], default: 'all', index: true },
  pageId: { type: mongoose.Schema.Types.ObjectId, ref: 'WikiPage', default: null, index: true },
  status: { type: String, enum: ['completed', 'failed'], default: 'completed', index: true },
  findings: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  resolutions: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  actions: { type: [mongoose.Schema.Types.Mixed], default: () => [] },
  summary: { type: String, default: '', trim: true },
  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: Date.now }
}, { timestamps: true });

wikiLintRunSchema.index({ userId: 1, createdAt: -1 });
wikiLintRunSchema.index({ userId: 1, pageId: 1, createdAt: -1 });

const WikiLintRun = mongoose.model('WikiLintRun', wikiLintRunSchema);

const wikiSourceEventSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  sourceType: { type: String, enum: ['article', 'highlight', 'notebook', 'concept', 'question', 'memory', 'external'], required: true },
  sourceObjectId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  parentObjectId: { type: mongoose.Schema.Types.ObjectId, default: null },
  provider: { type: String, default: '', trim: true, index: true },
  externalId: { type: String, default: '', trim: true, index: true },
  importSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ImportSession', default: null, index: true },
  eventType: { type: String, enum: ['created', 'updated', 'deleted', 'imported', 'synced'], default: 'updated' },
  title: { type: String, default: '', trim: true },
  summary: { type: String, default: '', trim: true },
  text: { type: String, default: '', trim: true },
  url: { type: String, default: '', trim: true },
  sourceUpdatedAt: { type: Date, default: null },
  status: { type: String, enum: ['pending', 'processing', 'processed', 'failed', 'ignored', 'held'], default: 'pending', index: true },
  affectedPageIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  attemptCount: { type: Number, default: 0 },
  lockedAt: { type: Date, default: null },
  nextAttemptAt: { type: Date, default: null },
  processedAt: { type: Date, default: null },
  errorMessage: { type: String, default: '', trim: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) }
}, { timestamps: true });

wikiSourceEventSchema.index({ userId: 1, status: 1, createdAt: -1 });
wikiSourceEventSchema.index({ userId: 1, status: 1, 'metadata.ingestReviewedAt': -1 });
wikiSourceEventSchema.index({ userId: 1, sourceType: 1, sourceObjectId: 1, eventType: 1 });
wikiSourceEventSchema.index(
  { userId: 1, affectedPageIds: 1, createdAt: -1 },
  { name: 'judgment_audit_event' }
);

const WikiSourceEvent = mongoose.model('WikiSourceEvent', wikiSourceEventSchema);

const wikiMaintenanceRunSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  pageId: { type: mongoose.Schema.Types.ObjectId, ref: 'WikiPage', default: null, index: true },
  leaseKey: { type: String, default: undefined, trim: true },
  sourceEventId: { type: mongoose.Schema.Types.ObjectId, ref: 'WikiSourceEvent', default: null, index: true },
  status: { type: String, enum: ['queued', 'running', 'completed', 'failed', 'needs_review'], default: 'queued', index: true },
  trigger: { type: String, enum: ['manual', 'source_event', 'batch', 'scheduled'], default: 'manual' },
  summary: { type: String, default: '', trim: true },
  errorMessage: { type: String, default: '', trim: true },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) }
}, { timestamps: true });

wikiMaintenanceRunSchema.index({ userId: 1, status: 1, createdAt: -1 });
wikiMaintenanceRunSchema.index(
  { userId: 1, sourceEventId: 1, createdAt: -1 },
  { name: 'judgment_audit_run' }
);
wikiMaintenanceRunSchema.index({ leaseKey: 1 }, { unique: true, sparse: true });
/* The storage governor sweeps every reader's finished runs at once, so it asks
   by status and age with no userId — and every index above leads with userId.
   Nothing could serve it: Mongo scanned the collection and sorted in memory,
   which passed 32MB and aborted, so pruning had never once run. This index is
   the query, filter and sort both. */
wikiMaintenanceRunSchema.index({ status: 1, createdAt: 1 }, { name: 'storage_governor_sweep' });

const WikiMaintenanceRun = mongoose.model('WikiMaintenanceRun', wikiMaintenanceRunSchema);

const wikiRepoBaselineSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  pageId: { type: mongoose.Schema.Types.ObjectId, ref: 'WikiPage', required: true, unique: true, index: true },
  owner: { type: String, required: true, trim: true, lowercase: true },
  repo: { type: String, required: true, trim: true, lowercase: true },
  defaultBranch: { type: String, default: '', trim: true },
  headSha: { type: String, required: true, trim: true },
  releaseTag: { type: String, default: '', trim: true },
  revisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'WikiRevision', default: null },
  generatorVersion: { type: String, default: '', trim: true },
  claims: { type: [mongoose.Schema.Types.Mixed], default: [] },
  sourceRefs: { type: [mongoose.Schema.Types.Mixed], default: [] },
  publicEligible: { type: Boolean, default: false, index: true },
  capturedAt: { type: Date, default: Date.now }
}, { timestamps: true });

wikiRepoBaselineSchema.index({ owner: 1, repo: 1, capturedAt: -1 });

const WikiRepoBaseline = mongoose.model('WikiRepoBaseline', wikiRepoBaselineSchema);

const wikiBriefingCacheSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  payload: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  generatedAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null, index: true }
}, { timestamps: true });

wikiBriefingCacheSchema.index({ userId: 1, expiresAt: 1 });

const WikiBriefingCache = mongoose.model('WikiBriefingCache', wikiBriefingCacheSchema);

const wikiSharedCollectionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  slug: { type: String, required: true, trim: true },
  pageIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'WikiPage' }],
  visibility: { type: String, enum: ['private', 'shared'], default: 'shared', index: true },
  sourceType: { type: String, enum: ['user', 'starter_pack'], default: 'user' },
  packId: { type: String, default: '', trim: true }
}, { timestamps: true });

wikiSharedCollectionSchema.index({ slug: 1 }, { unique: true });
wikiSharedCollectionSchema.index({ userId: 1, updatedAt: -1 });
wikiSharedCollectionSchema.index({ visibility: 1, updatedAt: -1 });

const WikiSharedCollection = mongoose.model('WikiSharedCollection', wikiSharedCollectionSchema);

const wikiSchemaSnapshotSchema = new mongoose.Schema({
  content: { type: String, default: '', trim: true, maxlength: 8000 },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const wikiSchemaSettingsSchema = new mongoose.Schema({
  content: { type: String, default: '', trim: true, maxlength: 8000 },
  snapshots: { type: [wikiSchemaSnapshotSchema], default: [] },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

wikiSchemaSettingsSchema.index({ userId: 1 }, { unique: true });

const WikiSchemaSettings = mongoose.model('WikiSchemaSettings', wikiSchemaSettingsSchema);

const wikiPageVisitSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  pageId: { type: mongoose.Schema.Types.ObjectId, ref: 'WikiPage', required: true, index: true },
  lastVisitedAt: { type: Date, required: true, default: Date.now },
  visitCount: { type: Number, min: 1, default: 1 }
}, { timestamps: true });

wikiPageVisitSchema.index({ userId: 1, pageId: 1 }, { unique: true });
wikiPageVisitSchema.index({ userId: 1, lastVisitedAt: -1 });

const WikiPageVisit = mongoose.model('WikiPageVisit', wikiPageVisitSchema);

/**
 * CasebookLineage — follow, fork, and adopt with frozen origin provenance.
 * Revoking a share never rewrites originHash, originTitle, or originSlug.
 */
const casebookLineageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  action: { type: String, enum: ['follow', 'fork', 'adopt'], required: true },
  originPageId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  originSlug: { type: String, default: '', trim: true },
  originTitle: { type: String, default: '', trim: true },
  originHash: { type: String, default: '', trim: true },
  originClaim: { type: String, default: '', trim: true },
  childPageId: { type: mongoose.Schema.Types.ObjectId, ref: 'WikiPage', default: null, index: true },
  revokedAt: { type: Date, default: null },
  revokedReceiptId: { type: String, default: '', trim: true }
}, { timestamps: true });

casebookLineageSchema.index({ userId: 1, originPageId: 1, action: 1, revokedAt: 1 });

const CasebookLineage = mongoose.model('CasebookLineage', casebookLineageSchema);

/* A half-written answer is continuity, not evidence. It lives outside the
   Wiki page so it cannot enter revisions, public projections, search, or an
   export by accident. One owner gets one private thread per observation. */
const judgmentResponseDraftSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  pageId: { type: mongoose.Schema.Types.ObjectId, ref: 'WikiPage', required: true, index: true },
  observationId: { type: String, required: true, trim: true },
  baseClaim: { type: String, required: true, trim: true },
  criterionSnapshot: {
    text: { type: String, default: '', trim: true },
    horizonAt: { type: Date, default: null },
    setAt: { type: Date, default: null },
    receiptId: { type: String, default: '', trim: true },
    claimHash: { type: String, default: '', trim: true }
  },
  response: { type: String, enum: ['', 'keep', 'narrow', 'different', 'uncertain'], default: '' },
  proposedView: { type: String, default: '', trim: true },
  reason: { type: String, default: '', trim: true },
  action: { type: String, enum: ['', 'unchanged', 'change', 'not_reconsidered'], default: '' },
  proposedAction: { type: String, default: '', trim: true },
  returnQuestion: { type: String, default: '', trim: true },
  activeField: { type: String, default: '', trim: true },
  caretOffset: { type: Number, min: 0, default: 0 },
  version: { type: Number, min: 1, default: 1 },
  status: { type: String, enum: ['active', 'completed'], default: 'active', index: true },
  completedAt: { type: Date, default: null }
}, { timestamps: true });

judgmentResponseDraftSchema.index(
  { userId: 1, pageId: 1, observationId: 1 },
  { unique: true }
);

const JudgmentResponseDraft = mongoose.model('JudgmentResponseDraft', judgmentResponseDraftSchema);

module.exports = {
  WikiPage,
  WikiProposal,
  WikiRevision,
  WikiLintRun,
  WikiSourceEvent,
  WikiMaintenanceRun,
  WikiRepoBaseline,
  WikiBriefingCache,
  WikiSharedCollection,
  WikiSchemaSettings,
  WikiPageVisit,
  CasebookLineage,
  JudgmentResponseDraft
};
