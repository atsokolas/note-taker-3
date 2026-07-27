const { buildClaimRevisionReview } = require('./claimRevisionReviewService');
const { buildDecisionLessonEvidence } = require('./decisionLessonEvidenceService');
const { loadConceptDecisionLessonEvidence } = require('./conceptDecisionLessonAdoptionService');

const INVESTIGATION_VERSION = 1;

class ConceptInvestigationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'ConceptInvestigationError';
    this.status = status;
  }
}

const clean = (value = '', limit = 1000) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > limit ? `${text.slice(0, Math.max(1, limit - 1)).trim()}…` : text;
};
const id = value => String(value?._id || value || '');
const plain = value => value?.toObject ? value.toObject({ virtuals: false }) : value;
const ownedBy = (value, userId) => id(value?.userId) === id(userId);
const stripHtml = value => clean(
  String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&'),
  12000
);
const visible = value => value
  && value.hiddenFromHome !== true
  && value.debugOnly !== true
  && value.archived !== true;
const normalizeType = value => {
  const type = clean(value, 50).toLowerCase();
  if (type === 'notebook') return 'note';
  if (type === 'wiki') return 'wiki_page';
  return type;
};
const safeArray = value => Array.isArray(value) ? value : [];
const sourceKeyParts = value => {
  const key = String(value || '').trim();
  const separator = key.indexOf(':');
  if (separator < 1) return null;
  const type = normalizeType(key.slice(0, separator));
  const objectId = key.slice(separator + 1).trim();
  if (!['article', 'highlight', 'note', 'question'].includes(type) || !objectId) return null;
  return { type, id: objectId };
};
const awaitQuery = async query => {
  const next = query?.lean ? query.lean() : query;
  return await next;
};
const uniqueByIdentity = values => {
  const seen = new Set();
  return safeArray(values).filter(value => {
    const ref = value?.ref || value;
    const key = `${ref?.type || ''}:${ref?.id || ''}:${ref?.parentId || ''}:${value?.role || ''}`;
    if (!ref?.type || !ref?.id || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const conceptRef = concept => ({
  type: 'concept',
  id: id(concept),
  title: stripHtml(concept?.name || 'Untitled concept').slice(0, 180),
  href: `/think?tab=concepts&conceptId=${encodeURIComponent(id(concept))}&concept=${encodeURIComponent(concept?.name || id(concept))}`
});
const pageRef = page => ({
  type: 'wiki_page',
  id: id(page),
  title: stripHtml(page?.title || 'Untitled wiki page').slice(0, 180),
  href: `/wiki/workspace?page=${encodeURIComponent(id(page))}`
});
const claimRef = (page, claim) => claim?.claimId ? ({
  type: 'wiki_claim',
  id: String(claim.claimId),
  parentId: id(page),
  title: stripHtml(claim?.text || 'Untitled claim').slice(0, 300),
  href: `/wiki/workspace?page=${encodeURIComponent(id(page))}&claimId=${encodeURIComponent(claim.claimId)}`
}) : null;
const revisionRef = (page, revision) => revision ? ({
  type: 'wiki_revision',
  id: id(revision),
  parentId: id(page),
  title: `${revision.promotionStatus === 'promoted' ? 'Current' : 'Candidate'} revision of ${stripHtml(page?.title || 'Wiki page').slice(0, 160)}`,
  href: `/wiki/workspace?page=${encodeURIComponent(id(page))}&revisionId=${encodeURIComponent(id(revision))}`
}) : null;

const buildSourceResolver = ({ articles = [], notes = [], questions = [] }) => {
  const articleById = new Map();
  const highlightById = new Map();
  safeArray(articles).map(plain).forEach(article => {
    articleById.set(id(article), article);
    safeArray(article?.highlights).forEach(highlight => {
      highlightById.set(id(highlight), { article, highlight: plain(highlight) });
    });
  });
  const noteById = new Map(safeArray(notes).map(plain).map(note => [id(note), note]));
  const questionById = new Map(safeArray(questions).map(plain).map(question => [id(question), question]));

  return ({ type, id: objectId }) => {
    const normalized = normalizeType(type);
    if (normalized === 'article') {
      const article = articleById.get(id(objectId));
      if (!article) return null;
      return {
        ref: {
          type: 'article',
          id: id(article),
          title: stripHtml(article?.title || 'Untitled source').slice(0, 220),
          href: `/library?articleId=${encodeURIComponent(id(article))}`,
          sourceUrl: safeHttpUrl(article?.url)
        },
        excerpt: stripHtml(article?.content || article?.title).slice(0, 500),
        origin: 'source'
      };
    }
    if (normalized === 'highlight') {
      const found = highlightById.get(id(objectId));
      if (!found) return null;
      return {
        ref: {
          type: 'highlight',
          id: id(found.highlight),
          parentId: id(found.article),
          title: stripHtml(found.highlight?.text || found.highlight?.note || 'Source highlight').slice(0, 220),
          href: `/library?articleId=${encodeURIComponent(id(found.article))}&highlightId=${encodeURIComponent(id(found.highlight))}`,
          sourceUrl: safeHttpUrl(found.article?.url)
        },
        excerpt: stripHtml(found.highlight?.text || found.highlight?.note).slice(0, 500),
        origin: 'source'
      };
    }
    if (normalized === 'note') {
      const note = noteById.get(id(objectId));
      if (!note) return null;
      return {
        ref: {
          type: 'note',
          id: id(note),
          title: stripHtml(note?.title || note?.content || 'Untitled note').slice(0, 220),
          href: `/think?tab=notebook&entryId=${encodeURIComponent(id(note))}`
        },
        excerpt: stripHtml(note?.content || note?.title).slice(0, 500),
        origin: 'user_note'
      };
    }
    if (normalized === 'question') {
      const question = questionById.get(id(objectId));
      if (!question) return null;
      return {
        ref: {
          type: 'question',
          id: id(question),
          title: stripHtml(question?.text || 'Untitled question').slice(0, 220),
          href: `/think?tab=questions&questionId=${encodeURIComponent(id(question))}`
        },
        excerpt: stripHtml(question?.text).slice(0, 500),
        origin: 'user_note'
      };
    }
    return null;
  };
};

const safeHttpUrl = value => {
  try {
    const url = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : undefined;
  } catch (_error) {
    return undefined;
  }
};

const collectSourceKeys = ({ workbench, revision, page }) => {
  const keys = [];
  safeArray(workbench?.cards).forEach(card => {
    const parts = sourceKeyParts(card?.sourceKey);
    if (parts) keys.push(parts);
  });
  safeArray(workbench?.changeDrafts).forEach(draft => {
    safeArray(draft?.cards).forEach(card => {
      const parts = sourceKeyParts(card?.sourceKey);
      if (parts) keys.push(parts);
    });
  });
  safeArray(revision?.after?.sourceRefs).forEach(ref => {
    const type = normalizeType(ref?.type);
    const objectId = id(ref?.objectId);
    if (['article', 'highlight', 'note', 'question'].includes(type) && objectId) {
      keys.push({ type, id: objectId });
    }
  });
  safeArray(page?.sourceRefs).forEach(ref => {
    const type = normalizeType(ref?.type);
    const objectId = id(ref?.objectId);
    if (['article', 'highlight', 'note', 'question'].includes(type) && objectId) {
      keys.push({ type, id: objectId });
    }
  });
  return uniqueByIdentity(keys.map(value => ({
    type: value.type,
    id: value.id
  })));
};

const proposal = (value, source = 'concept_workbench') => ({
  id: clean(value?.id, 180),
  kind: clean(value?.kind || value?.tone || 'proposal', 80),
  title: stripHtml(value?.title || 'Proposed change').slice(0, 220),
  summary: stripHtml(value?.summary || value?.caption || value?.body || value?.content || value?.reason).slice(0, 1000),
  status: clean(value?.status || 'pending', 80),
  source,
  sourceKeys: [
    ...safeArray(value?.sourceKeys)
  ].map(item => clean(item, 240)).filter(Boolean)
});

const buildConceptInvestigation = async ({
  userId,
  conceptId,
  wikiPageId,
  revisionId = '',
  claimId = '',
  models = {},
  buildLessons = buildDecisionLessonEvidence,
  asOf = new Date()
} = {}) => {
  if (!userId || !conceptId || !wikiPageId) {
    throw new ConceptInvestigationError('userId, conceptId, and wikiPageId are required.');
  }
  const { TagMeta, WikiPage, WikiRevision, Article, NotebookEntry, Question } = models;
  if (!TagMeta?.findOne || !WikiPage?.findOne) {
    throw new ConceptInvestigationError('Concept investigation models are unavailable.', 503);
  }

  const [conceptRaw, pageRaw] = await Promise.all([
    awaitQuery(TagMeta.findOne({ _id: conceptId, userId })),
    awaitQuery(WikiPage.findOne({ _id: wikiPageId, userId, status: { $ne: 'archived' } }))
  ]);
  const concept = plain(conceptRaw);
  const page = plain(pageRaw);
  if (!concept || !ownedBy(concept, userId) || !visible(concept)) {
    throw new ConceptInvestigationError('Concept not found.', 404);
  }
  if (
    !page
    || !ownedBy(page, userId)
    || !visible(page)
    || clean(page?.status, 80).toLowerCase() === 'archived'
  ) {
    throw new ConceptInvestigationError('Wiki page not found.', 404);
  }
  const createdFrom = plain(page.createdFrom) || {};
  const legacyConceptId = normalizeType(createdFrom.type) === 'concept'
    ? id(createdFrom.objectId)
    : '';
  const anchoredCandidate = plain(await awaitQuery(TagMeta.findOne({
    userId,
    'continuityAnchor.kind': 'wiki_investigation',
    'continuityAnchor.objectType': 'wiki_page',
    'continuityAnchor.objectId': wikiPageId
  })));
  const anchoredConcept = (
    anchoredCandidate?.continuityAnchor?.kind === 'wiki_investigation'
    && anchoredCandidate?.continuityAnchor?.objectType === 'wiki_page'
    && id(anchoredCandidate?.continuityAnchor?.objectId) === id(page)
  ) ? anchoredCandidate : null;
  if (legacyConceptId && anchoredConcept && legacyConceptId !== id(anchoredConcept)) {
    throw new ConceptInvestigationError('Wiki page points to conflicting Concepts.', 409);
  }
  const linkedByOrigin = legacyConceptId && legacyConceptId === id(concept);
  const linkedByAnchor = anchoredConcept && id(anchoredConcept) === id(concept);
  if (!linkedByOrigin && !linkedByAnchor) {
    throw new ConceptInvestigationError('Wiki page is not linked to this Concept.', 409);
  }

  let revision = null;
  if (revisionId) {
    if (!WikiRevision?.findOne) {
      throw new ConceptInvestigationError('Revision model is unavailable.', 503);
    }
    revision = plain(await awaitQuery(WikiRevision.findOne({
      _id: revisionId,
      pageId: wikiPageId,
      userId
    })));
    if (!revision || !ownedBy(revision, userId) || id(revision.pageId) !== id(page)) {
      throw new ConceptInvestigationError('Wiki revision not found.', 404);
    }
  }

  const workbench = concept.ideaWorkbench && typeof concept.ideaWorkbench === 'object'
    ? plain(concept.ideaWorkbench)
    : {};
  const sourceKeys = collectSourceKeys({ workbench, revision, page });
  const idsByType = Object.fromEntries(['article', 'highlight', 'note', 'question'].map(type => [
    type,
    sourceKeys.filter(value => value.type === type).map(value => value.id)
  ]));
  const [articleRows, noteRows, questionRows] = await Promise.all([
    Article?.find && (idsByType.article.length || idsByType.highlight.length)
      ? awaitQuery(Article.find({
        userId,
        hiddenFromHome: { $ne: true },
        debugOnly: { $ne: true },
        archived: { $ne: true },
        $or: [
          { _id: { $in: idsByType.article } },
          { 'highlights._id': { $in: idsByType.highlight } }
        ]
      }))
      : [],
    NotebookEntry?.find && idsByType.note.length
      ? awaitQuery(NotebookEntry.find({
        _id: { $in: idsByType.note },
        userId,
        hiddenFromHome: { $ne: true },
        debugOnly: { $ne: true },
        archived: { $ne: true }
      }))
      : [],
    Question?.find && idsByType.question.length
      ? awaitQuery(Question.find({
        _id: { $in: idsByType.question },
        userId,
        hiddenFromHome: { $ne: true },
        debugOnly: { $ne: true },
        archived: { $ne: true }
      }))
      : []
  ]);
  const articles = safeArray(articleRows).map(plain).filter(value => ownedBy(value, userId) && visible(value));
  const notes = safeArray(noteRows).map(plain).filter(value => ownedBy(value, userId) && visible(value));
  const questions = safeArray(questionRows).map(plain).filter(value => ownedBy(value, userId) && visible(value));
  const resolveSource = buildSourceResolver({ articles, notes, questions });
  const decisionLessons = await buildLessons({
    userId,
    targetPageId: id(page),
    models,
    asOf
  });
  const acceptedDecisionLessonResult = await loadConceptDecisionLessonEvidence({
    userId,
    targetConceptId: id(concept),
    ConceptDecisionLessonEvidence: models.ConceptDecisionLessonEvidence,
    NoeisReceipt: models.NoeisReceipt,
    WikiPage: models.WikiPage,
    models,
    buildLessons,
    asOf
  });
  const acceptedDecisionLessons = safeArray(acceptedDecisionLessonResult?.items);

  const currentClaim = claimId
    ? safeArray(page.claims).find(claim => String(claim?.claimId || '') === String(claimId))
    : null;
  if (claimId && !currentClaim) {
    throw new ConceptInvestigationError('Wiki claim not found.', 404);
  }
  const candidateClaim = revision && claimId
    ? safeArray(revision?.after?.claims).find(claim => String(claim?.claimId || '') === String(claimId))
    : null;
  if (revision && claimId && !candidateClaim) {
    throw new ConceptInvestigationError('Wiki claim not found in this revision.', 404);
  }

  const evidence = { support: [], tension: [], context: [] };
  const roleForZone = { supports: 'support', contradictions: 'tension', workspace: 'context' };
  safeArray(workbench?.cards).forEach(card => {
    const role = roleForZone[clean(card?.zone, 80)];
    const key = sourceKeyParts(card?.sourceKey);
    if (!role || !key || String(card?.origin || '').toLowerCase().includes('agent')) return;
    const resolved = resolveSource(key);
    if (!resolved) return;
    evidence[role].push({
      ...resolved,
      role,
      status: 'current_workspace'
    });
  });
  Object.keys(evidence).forEach(role => {
    evidence[role] = uniqueByIdentity(evidence[role]);
  });
  acceptedDecisionLessons.forEach(adoption => {
    const role = clean(adoption?.role, 40);
    if (!Object.hasOwn(evidence, role)) return;
    evidence[role].push({
      kind: 'decision_lesson',
      role,
      status: 'accepted',
      acceptedIntoConcept: true,
      lesson: adoption.lesson,
      result: adoption.result,
      processScore: adoption.processScore,
      calibrationNote: adoption.calibrationNote,
      observedAt: adoption.observedAt,
      observedEvidence: adoption.observedEvidence,
      provenance: adoption.provenance,
      ref: {
        type: 'decision_lesson',
        id: adoption.id,
        title: clean(adoption.lesson, 220) || 'Reviewed decision lesson',
        href: `/wiki/workspace?page=${encodeURIComponent(adoption.sourcePageId)}&decisionId=${encodeURIComponent(adoption.decisionId)}`
      }
    });
  });
  Object.keys(evidence).forEach(role => {
    evidence[role] = uniqueByIdentity(evidence[role]);
  });

  const questionUnknowns = safeArray(workbench?.cards)
    .filter(card => (
      clean(card?.zone, 80) === 'questions'
      && !String(card?.origin || '').toLowerCase().includes('agent')
    ))
    .map(card => {
      const key = sourceKeyParts(card?.sourceKey);
      const resolved = key ? resolveSource(key) : null;
      const text = resolved?.excerpt || stripHtml(card?.content || card?.title).slice(0, 500);
      if (!text) return null;
      return {
        text,
        source: resolved ? 'durable_question' : 'concept_workbench',
        ref: resolved?.ref || conceptRef(concept)
      };
    })
    .filter(Boolean);
  const judgmentUnknowns = safeArray(page?.judgment?.unknowns)
    .map(value => stripHtml(value?.question || value?.text).slice(0, 500))
    .filter(Boolean)
    .map(text => ({ text, source: 'current_wiki_judgment', ref: pageRef(page) }));
  const unknowns = Array.from(new Map(
    [...questionUnknowns, ...judgmentUnknowns].map(value => [value.text.toLowerCase(), value])
  ).values());

  const governingQuestion = stripHtml(workbench?.header?.prompt).slice(0, 500)
    ? {
      text: stripHtml(workbench.header.prompt).slice(0, 500),
      source: 'concept_workbench',
      ref: conceptRef(concept)
    }
    : stripHtml(page?.judgment?.governingQuestion).slice(0, 500)
      ? {
        text: stripHtml(page.judgment.governingQuestion).slice(0, 500),
        source: 'current_wiki_judgment',
        ref: pageRef(page)
      }
      : null;
  const synthesis = stripHtml(workbench?.hypothesis?.html)
    ? {
      text: stripHtml(workbench.hypothesis.html),
      source: 'concept_workbench',
      authorship: 'mixed_or_unknown'
    }
    : null;
  const revisionEvidence = uniqueByIdentity(
    safeArray(revision?.after?.sourceRefs)
      .map(ref => resolveSource({ type: ref?.type, id: ref?.objectId }))
      .filter(Boolean)
      .map(value => value.ref)
  );
  const deterministicFacts = revision ? [
    `Revision state: ${revision.promotionStatus === 'promoted' ? 'current' : 'candidate'}`,
    `Evidence references: ${revisionEvidence.length}`,
    ...(candidateClaim?.support ? [`Proposed claim support: ${stripHtml(candidateClaim.support)}`] : [])
  ] : [];

  const pendingDrafts = safeArray(workbench?.changeDrafts)
    .filter(value => clean(value?.status || 'pending', 80).toLowerCase() === 'pending')
    .map(value => proposal(value));
  const verifiedAgentProposal = value => {
    const projected = proposal(value, 'concept_agent');
    const sourceKeys = [
      ...safeArray(value?.sourceKeys),
      value?.sourceKey
    ].map(item => clean(item, 240)).filter(Boolean);
    const sourceRefs = uniqueByIdentity(sourceKeys
      .map(sourceKeyParts)
      .filter(Boolean)
      .map(resolveSource)
      .filter(Boolean)
      .map(item => item.ref));
    return {
      ...projected,
      sourceKeys: [],
      sourceRefs,
      sourceState: sourceRefs.length ? 'resolved' : 'unavailable'
    };
  };
  const agentCards = safeArray(workbench?.cards)
    .filter(value => String(value?.origin || '').toLowerCase().includes('agent'))
    .map(verifiedAgentProposal);
  const activeComments = safeArray(workbench?.agent?.comments)
    .filter(value => !['dismissed', 'accepted'].includes(clean(value?.status, 80).toLowerCase()))
    .map(verifiedAgentProposal);
  const candidateRevision = revision && revision.promotionStatus !== 'promoted' ? {
    id: id(revision),
    kind: 'wiki_revision',
    title: `Candidate revision of ${stripHtml(page.title).slice(0, 180)}`,
    summary: candidateClaim && currentClaim && clean(candidateClaim.text) !== clean(currentClaim.text)
      ? 'The candidate proposes a different claim text.'
      : 'The candidate preserves claim text while changing evidence or support.',
    status: 'pending',
    source: 'wiki_revision',
    ref: revisionRef(page, revision),
    proposedClaim: candidateClaim ? claimRef(page, candidateClaim) : null,
    currentClaim: currentClaim ? claimRef(page, currentClaim) : null
  } : null;
  const claimReview = revision && currentClaim && candidateClaim
    ? buildClaimRevisionReview({
      concept,
      page,
      revision,
      currentClaim,
      proposedClaim: candidateClaim,
      resolveSource
    })
    : null;

  const strongestCounterargument = stripHtml(page?.judgment?.strongestCounterargument).slice(0, 1000)
    ? {
      text: stripHtml(page.judgment.strongestCounterargument).slice(0, 1000),
      source: 'current_wiki_judgment',
      ref: pageRef(page)
    }
    : null;
  const whatWouldChangeMyMind = safeArray(page?.judgment?.falsifiers)
    .filter(value => stripHtml(value?.text || value?.observableSignal).slice(0, 1000))
    .map(value => ({
      text: stripHtml(value?.text || value?.observableSignal).slice(0, 1000),
      observableSignal: stripHtml(value?.observableSignal).slice(0, 1000) || null,
      source: 'current_wiki_judgment',
      ref: pageRef(page)
    }));
  const causalSummary = stripHtml(page?.judgment?.causalModel?.summary).slice(0, 2000);
  const presentedDecisionLessons = decisionLessons.map(lesson => {
    const adoption = acceptedDecisionLessons.find(value => (
      value.sourcePageId === lesson?.relevanceBasis?.pageId
      && value.decisionId === lesson?.decision?.id
    ));
    return adoption ? {
      ...lesson,
      acceptedIntoConcept: true,
      acceptedRole: adoption.role,
      adoptionId: adoption.id,
      status: 'accepted'
    } : lesson;
  });
  const acceptedLessonCount = presentedDecisionLessons.filter(value => value.acceptedIntoConcept === true).length;

  return {
    version: INVESTIGATION_VERSION,
    concept: conceptRef(concept),
    entryContext: {
      page: pageRef(page),
      claim: currentClaim ? claimRef(page, currentClaim) : null,
      revision: revisionRef(page, revision),
      reviewState: revision
        ? (revision.promotionStatus === 'promoted' ? 'current' : 'candidate')
        : null,
      evidence: revisionEvidence,
      deterministicFacts
    },
    framing: {
      governingQuestion,
      workingSynthesis: synthesis
    },
    evidence,
    priorLessons: {
      status: decisionLessons.length ? 'available' : 'none',
      acceptanceState: acceptedLessonCount === 0
        ? 'not_accepted_into_concept'
        : acceptedLessonCount === presentedDecisionLessons.length
          ? 'accepted_into_concept'
          : 'partially_accepted_into_concept',
      items: presentedDecisionLessons,
      adoptionIntegrity: acceptedDecisionLessonResult?.integrity || {
        scanned: 0, accepted: 0, omitted: 0, sourceUnavailable: 0
      }
    },
    strongestCounterargument,
    unknowns,
    whatWouldChangeMyMind,
    causalModel: causalSummary
      ? { summary: causalSummary, source: 'current_wiki_judgment' }
      : null,
    currentWiki: {
      page: pageRef(page),
      claim: currentClaim ? claimRef(page, currentClaim) : null,
      acceptanceState: 'unverified'
    },
    proposals: {
      workbenchChanges: pendingDrafts,
      agentSuggestions: [...agentCards, ...activeComments],
      candidateWikiRevision: candidateRevision
    },
    claimReview,
    actions: {
      findContraryEvidence: {
        label: 'Find contrary evidence',
        href: conceptRef(concept).href,
        intent: 'find_contrary_evidence',
        enabled: true
      },
      compareHistoricalCases: {
        label: 'Compare historical cases',
        href: conceptRef(concept).href,
        intent: 'compare_historical_cases',
        enabled: false,
        unavailableReason: 'Historical-case comparison is not available in this investigation yet.'
      },
      traceCitationsBackward: {
        label: 'Trace citations backward',
        href: conceptRef(concept).href,
        intent: 'trace_citations_backward',
        enabled: false,
        unavailableReason: evidence.support.length > 0 || evidence.tension.length > 0
          ? 'Citation-chain tracing is not available in this investigation yet.'
          : 'No verified evidence is available to trace.'
      },
      draftWikiRevision: {
        label: 'Draft a Wiki revision',
        href: pageRef(page).href,
        intent: 'draft_wiki_revision',
        enabled: false,
        unavailableReason: 'Claim-level candidate drafting lands in Stage 4.'
      }
    }
  };
};

module.exports = {
  INVESTIGATION_VERSION,
  ConceptInvestigationError,
  buildConceptInvestigation,
  sourceKeyParts,
  stripHtml
};
