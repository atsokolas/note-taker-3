import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { chatWithAgent } from '../../../../api/agent';
import {
  appendConceptIdeaWorkbenchEvents,
  acceptConceptIdeaWorkbenchComment,
  applyConceptIdeaWorkbenchChangeDraft,
  dismissConceptIdeaWorkbenchComment,
  dismissConceptIdeaWorkbenchChangeDraft,
  getConceptIdeaWorkbench,
  markConceptIdeaWorkbenchReviewed,
  updateConceptIdeaWorkbench,
  getConceptAgentSuggestions,
  suggestConceptWorkspaceFromLibrary
} from '../../../../api/concepts';
import useConceptMaterial from '../../../../hooks/useConceptMaterial';
import { mergeWorkbenchStates } from './ideaWorkbenchMerge';
import useTourSignal from '../../../../tour/useTourSignal';
import { resolveAgentHypothesisSuggestion } from './ideaWorkbenchAgentSuggestion';
import { dispatchConceptAction as dispatchTypedConceptAction } from './conceptActionDispatch';
import {
  buildWorkbenchChatReply,
  buildWorkbenchDraftMessage,
  buildWorkbenchRestructureReply
} from './ideaWorkbenchPartnerCopy';
import {
  buildConceptChangeDraft,
  computeConceptFreshness,
  mergeConceptChangeDrafts
} from './conceptChangeDrafts';
import { cleanSourceTextForDisplay } from './ideaWorkbenchText';

const STORAGE_VERSION = 1;
const STORAGE_PREFIX = 'idea-workbench';
const DEFAULT_PROMPT = "What's the core insight here?";
const DEFAULT_STAGE = 'Seed';
const DEFAULT_MATURITY = 'Early';
const MATERIAL_LIBRARY_LIMIT = 24;
const TAG_ROTATION = ['theme', 'claim', 'mechanism', 'counterpoint', 'example'];

const clean = (value) => String(value || '').trim();
const createId = (prefix = 'id') => (
  `${prefix}-${typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Math.random().toString(36).slice(2, 9)}-${Date.now()}`}`
);
const stripHtml = (value = '') => clean(
  String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
);
const escapeHtml = (value = '') => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');
const textToHtml = (value = '') => {
  const safe = clean(value);
  if (!safe) return '<p></p>';
  return safe
    .split(/\n{2,}/)
    .map(block => `<p>${escapeHtml(block).replace(/\n/g, '<br />')}</p>`)
    .join('');
};
const truncate = (value, limit = 180) => {
  const safe = clean(value);
  if (safe.length <= limit) return safe;
  return `${safe.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
};
const sentenceCase = (value = '') => {
  const safe = clean(value);
  if (!safe) return '';
  return safe.charAt(0).toUpperCase() + safe.slice(1);
};
const escapeAttribute = (value = '') => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;');
const formatScore = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '';
  return `${Math.round(numeric * 100)}%`;
};
const titleFromText = (value, fallback) => {
  const safe = clean(value);
  if (!safe) return fallback;
  return truncate(safe.split(/[.?!\n]/)[0], 64);
};
const summarizeVersionChange = (previousText, nextText) => {
  const prev = stripHtml(previousText);
  const next = stripHtml(nextText);
  if (!prev && next) return 'Started a first explicit hypothesis draft.';
  if (prev === next) return 'Refined language without changing the core claim.';
  if (next.length > prev.length) return 'Added more structure, grounding, and edge conditions.';
  if (next.length < prev.length) return 'Compressed the claim into a cleaner, more direct statement.';
  return 'Adjusted the framing of the claim.';
};
const computeMaturity = ({ cards = [], hypothesisHtml = '' }) => {
  const hypothesisLength = stripHtml(hypothesisHtml).length;
  const supports = cards.filter(card => card.zone === 'supports').length;
  const contradictions = cards.filter(card => card.zone === 'contradictions').length;
  const questions = cards.filter(card => card.zone === 'questions').length;

  if (supports >= 4 && contradictions >= 2 && hypothesisLength > 260) return 'Strong';
  if (supports >= 3 && contradictions >= 1 && hypothesisLength > 180) return 'Coherent';
  if (supports >= 1 && hypothesisLength > 80) return 'Forming';
  if (questions >= 1 || hypothesisLength > 24) return 'Early';
  return DEFAULT_MATURITY;
};
const createVersion = (html, summary, index, maturity) => ({
  id: createId('hypothesis-version'),
  label: `v${index}`,
  maturity,
  html,
  summary,
  createdAt: new Date().toISOString()
});

const buildHighlightCard = (highlight, origin = 'material') => {
  const highlightText = clean(highlight?.text);
  const articleTitle = clean(highlight?.articleTitle) || 'Source highlight';
  return {
    id: createId('card'),
    sourceKey: `highlight:${clean(highlight?._id)}`,
    zone: 'workspace',
    type: 'Highlight',
    title: titleFromText(highlightText, 'Highlight'),
    content: highlightText,
    source: articleTitle,
    sourcePath: highlight?.articleId ? `/articles/${encodeURIComponent(highlight.articleId)}` : '',
    whyItMatters: `Touches the idea from ${articleTitle.toLowerCase()}.`,
    confidence: 'Observed',
    strength: 'Medium',
    agentAnnotation: '',
    relatedHypothesisLabel: '',
    origin,
    tags: Array.isArray(highlight?.tags) ? highlight.tags.slice(0, 3) : [],
    createdAt: highlight?.createdAt || ''
  };
};

const buildArticleCard = (article, origin = 'material') => ({
  id: createId('card'),
  sourceKey: `article:${clean(article?._id)}`,
  zone: 'workspace',
  type: 'Article snippet',
  title: clean(article?.title) || 'Article snippet',
  content: cleanSourceTextForDisplay(article?.summary || article?.excerpt || article?.description || article?.title)
    || clean(article?.title),
  source: clean(article?.title) || 'Article',
  sourcePath: article?._id ? `/articles/${encodeURIComponent(article._id)}` : '',
  whyItMatters: 'Useful as outside context or a longer argument source.',
  confidence: 'Contextual',
  strength: 'Medium',
  agentAnnotation: '',
  relatedHypothesisLabel: '',
  origin,
  tags: [],
  createdAt: article?.createdAt || ''
});

const buildNoteCard = (note, origin = 'material') => ({
  id: createId('card'),
  sourceKey: `note:${clean(note?._id || note?.notebookEntryId)}`,
  zone: 'workspace',
  type: 'Note',
  title: clean(note?.title || note?.notebookTitle) || 'Notebook note',
  content: cleanSourceTextForDisplay(note?.content || note?.blockPreviewText || note?.summary || note?.title || note?.notebookTitle)
    || clean(note?.title || note?.notebookTitle),
  source: clean(note?.title || note?.notebookTitle) || 'Notebook',
  sourcePath: clean(note?._id || note?.notebookEntryId)
    ? `/think?tab=notebook&entryId=${encodeURIComponent(clean(note?._id || note?.notebookEntryId))}`
    : '',
  whyItMatters: 'Captures a prior interpretation you can now stress-test.',
  confidence: 'Authored',
  strength: 'Medium',
  agentAnnotation: '',
  relatedHypothesisLabel: '',
  origin,
  tags: [],
  createdAt: note?.updatedAt || ''
});

const buildConceptCard = (concept, origin = 'material') => ({
  id: createId('card'),
  sourceKey: `concept:${clean(concept?.tag || concept?.name)}`,
  zone: 'workspace',
  type: 'Concept',
  title: clean(concept?.tag || concept?.name) || 'Related concept',
  content: clean(concept?.description) || `Related concept: ${clean(concept?.tag || concept?.name)}`,
  source: 'Concept network',
  sourcePath: clean(concept?.tag || concept?.name)
    ? `/think?tab=concepts&concept=${encodeURIComponent(clean(concept?.tag || concept?.name))}`
    : '',
  whyItMatters: 'Provides adjacent language and neighboring frames for the idea.',
  confidence: 'Related',
  strength: 'Low',
  agentAnnotation: '',
  relatedHypothesisLabel: '',
  origin,
  tags: ['related'],
  createdAt: ''
});

const buildQuestionCard = (question, origin = 'material') => ({
  id: createId('card'),
  sourceKey: `question:${clean(question?._id || question?.text)}`,
  zone: 'questions',
  type: 'Open question',
  title: titleFromText(question?.text, 'Open question'),
  content: clean(question?.text),
  source: 'Question board',
  sourcePath: clean(question?._id) ? `/think?tab=questions&questionId=${encodeURIComponent(question._id)}` : '',
  whyItMatters: 'Keeps the idea from hardening before its weak edges are examined.',
  confidence: 'Open',
  strength: 'Low',
  agentAnnotation: '',
  relatedHypothesisLabel: '',
  origin,
  tags: ['question'],
  createdAt: question?.updatedAt || question?.createdAt || ''
});

const formatCardForWorkspaceDraft = (card) => {
  if (!card) return '';
  const source = clean(card.source);
  const title = clean(card.title);
  const content = cleanSourceTextForDisplay(card.content);
  const prefix = source ? `${source}: ` : title ? `${title}: ` : '';
  return clean(`${prefix}${content}`);
};

const formatCardForHypothesisHtml = (card) => {
  if (!card) return '<p></p>';
  const source = clean(card.source) || clean(card.title) || 'Source';
  const content = clean(card.content) || clean(card.title) || 'Material';
  const whyItMatters = clean(card.whyItMatters);
  return [
    `<blockquote data-source-key="${escapeAttribute(clean(card.sourceKey || card.id))}"><p>${escapeHtml(content)}</p></blockquote>`,
    `<p><em>From ${escapeHtml(source)}.</em></p>`,
    whyItMatters ? `<p>${escapeHtml(whyItMatters)}</p>` : ''
  ].filter(Boolean).join('');
};

const buildAgentDraftSuggestionCard = (suggestion, intent = 'support') => {
  const safeType = clean(suggestion?.type).toLowerCase();
  const typeMap = {
    article: 'Article snippet',
    highlight: 'Highlight',
    note: 'Note',
    question: 'Open question',
    concept: 'Concept'
  };
  const zone = safeType === 'question'
    ? 'questions'
    : intent === 'contradiction'
      ? 'contradictions'
      : intent === 'question'
        ? 'questions'
        : 'supports';
  const sourcePath = (
    safeType === 'article' && suggestion?.refId ? `/articles/${encodeURIComponent(suggestion.refId)}` :
      safeType === 'note' && suggestion?.refId ? `/think?tab=notebook&entryId=${encodeURIComponent(suggestion.refId)}` :
        safeType === 'question' && suggestion?.refId ? `/think?tab=questions&questionId=${encodeURIComponent(suggestion.refId)}` :
          safeType === 'concept' && suggestion?.title ? `/think?tab=concepts&concept=${encodeURIComponent(suggestion.title)}` :
            ''
  );

  return {
    id: createId('card'),
    sourceKey: `agent-draft:${safeType}:${clean(suggestion?.refId || suggestion?.title || suggestion?.id)}`,
    zone,
    type: typeMap[safeType] || 'Agent suggestion',
    title: clean(suggestion?.title) || sentenceCase(safeType || 'suggestion'),
    content: clean(suggestion?.text)
      || clean(suggestion?.summary)
      || clean(suggestion?.snippet)
      || clean(suggestion?.description)
      || clean(suggestion?.title)
      || 'Suggested by the concept agent.',
    source: clean(suggestion?.source) || 'Concept scout',
    sourcePath,
    whyItMatters: zone === 'contradictions'
      ? 'Surfaced by the concept scout as useful counter-pressure.'
      : zone === 'questions'
        ? 'Surfaced by the concept scout as an unresolved thread.'
        : 'Surfaced by the concept scout as relevant support material.',
    confidence: suggestion?.score !== undefined ? `Scout ${formatScore(suggestion.score)}` : 'Scout',
    strength: 'Medium',
    agentAnnotation: 'Inserted from the concept-agent scout.',
    relatedHypothesisLabel: '',
    origin: 'agent',
    tags: ['scout'],
    createdAt: new Date().toISOString()
  };
};

const scoreMaterialCardForIntent = (card, intent, contextText = '') => {
  const haystack = `${clean(card?.title)} ${clean(card?.content)} ${clean(card?.source)} ${contextText}`.toLowerCase();
  const type = clean(card?.type);
  const typeBase = type === 'Article snippet'
    ? 3
    : type === 'Note'
      ? 3
      : type === 'Concept'
        ? 2
        : type === 'Highlight'
          ? 1
          : 0;
  if (intent === 'contradiction') {
    const contradictionSignals = /\b(not|however|but|tension|risk|counter|fail|avoid|weak|problem|messy)\b/g;
    const signalCount = (haystack.match(contradictionSignals) || []).length;
    return (type === 'Article snippet' ? 2 : 0) + (type === 'Note' ? 2 : 0) + signalCount + typeBase;
  }
  if (intent === 'question') {
    const questionSignals = /\?/g;
    return (type === 'Open question' ? 5 : 0) + ((haystack.match(questionSignals) || []).length) + typeBase;
  }
  const supportSignals = /\b(because|shows|suggests|evidence|example|pattern|supports|indicates)\b/g;
  return ((haystack.match(supportSignals) || []).length) + typeBase;
};

const buildMaterialLibrary = ({ concept, material, related, questions }) => {
  const cards = [];
  const seen = new Set();
  const push = (card) => {
    if (!card || !card.sourceKey || seen.has(card.sourceKey)) return;
    seen.add(card.sourceKey);
    cards.push(card);
  };

  (concept?.pinnedHighlights || []).slice(0, 8).forEach(item => push(buildHighlightCard(item, 'material')));
  (material?.pinnedHighlights || []).slice(0, 8).forEach(item => push(buildHighlightCard(item, 'material')));
  (material?.recentHighlights || []).slice(0, 10).forEach(item => push(buildHighlightCard(item, 'material')));
  (related?.highlights || []).slice(0, 8).forEach(item => push(buildHighlightCard(item, 'material')));
  (concept?.pinnedNotes || []).slice(0, 6).forEach(item => push(buildNoteCard(item, 'material')));
  (material?.linkedNotes || []).slice(0, 6).forEach(item => push(buildNoteCard(item, 'material')));
  (related?.notes || []).slice(0, 6).forEach(item => push(buildNoteCard(item, 'material')));
  (concept?.pinnedArticles || []).slice(0, 6).forEach(item => push(buildArticleCard(item, 'material')));
  (material?.linkedArticles || []).slice(0, 6).forEach(item => push(buildArticleCard(item, 'material')));
  (related?.articles || []).slice(0, 6).forEach(item => push(buildArticleCard(item, 'material')));
  (concept?.relatedTags || []).slice(0, 5).forEach(item => push(buildConceptCard(item, 'material')));
  (questions || []).slice(0, 5).forEach(item => push(buildQuestionCard(item, 'material')));

  return cards.slice(0, MATERIAL_LIBRARY_LIMIT);
};

const createAgentComment = ({
  title,
  body,
  tone = 'signal',
  anchorText = '',
  relatedCardId = '',
  target = 'hypothesis',
  kind = 'note',
  status = 'active',
  caption = '',
  suggestedHtml = ''
}) => ({
  id: createId('comment'),
  title,
  body,
  tone,
  anchorText,
  relatedCardId,
  target,
  kind,
  status,
  caption,
  suggestedHtml,
  createdAt: new Date().toISOString()
});

const createAgentMessage = ({ role = 'assistant', text, action = '', suggestedCards = [] }) => ({
  id: createId(role),
  role,
  text,
  action,
  suggestedCards
});

const SHORT_FOLLOW_UP_PATTERN = /^(yes|yep|yeah|ok|okay|sure|please|please do that|yes please|yes please do that|do that|go ahead|sounds good|that one|those|use that|pull them in|bring them in|continue)$/i;
const isShortFollowUpMessage = (value = '') => {
  const safe = clean(value);
  if (!safe) return false;
  return safe.length <= 24 || SHORT_FOLLOW_UP_PATTERN.test(safe);
};
const getLastAgentMessageByRole = (messages = [], role = 'assistant') => (
  [...(Array.isArray(messages) ? messages : [])]
    .reverse()
    .find((message) => clean(message?.role) === role && clean(message?.text))
);
const getLastSubstantiveUserMessage = (messages = []) => (
  [...(Array.isArray(messages) ? messages : [])]
    .reverse()
    .find((message) => clean(message?.role) === 'user' && clean(message?.text) && !isShortFollowUpMessage(message.text))
);
export const sanitizeAgentReplyText = (value = '') => {
  const original = clean(value);
  if (!original) return '';

  let safe = original
    .replace(/^You are currently in concept:[\s\S]*?Context summary:\s*/i, '')
    .replace(/^You asked:\s*".*?"\s*/i, '')
    .replace(/^Context summary:\s*/i, '')
    .trim();

  safe = safe
    .replace(/^You are currently in concept:[^.]*(?:\.\s*)?/i, '')
    .replace(/^You asked:\s*"?[^"]*"?\s*/i, '')
    .trim();

  safe = safe
    .replace(/^.*?\b(I found \d+ related items?.*)$/i, '$1')
    .replace(/^.*?\b(Found one relevant piece\..*)$/i, '$1')
    .replace(/^.*?\b(Found \d+ relevant pieces\..*)$/i, '$1')
    .replace(/^.*?\b(Pulled in \d+ promising pieces\..*)$/i, '$1')
    .replace(/^.*?\b(Found one clean hit:.*)$/i, '$1')
    .replace(/^.*?\b(Kept going from the last move\..*)$/i, '$1')
    .replace(/^.*?\b(The strongest footing.*)$/i, '$1')
    .replace(/^.*?\b(The biggest weak point.*)$/i, '$1')
    .replace(/^.*?\b(Here is the pressure point.*)$/i, '$1')
    .replace(/^.*?\b(Nothing strong lit up.*)$/i, '$1')
    .replace(/^.*?\b(A few things lit up.*)$/i, '$1')
    .trim();

  safe = safe.replace(
    /I found (\d+) related items? in your library\.\s*If you want, I can now restructure these into inbox\/working\/draft buckets\.?/i,
    (_match, count) => (
      Number(count) === 1
        ? 'Found one strong lead. Want me to sort it into support, tension, or an open question?'
        : `Found ${count} strong leads. Want me to sort them into support, tension, and open questions?`
    )
  );

  safe = safe.replace(
    /I found (\d+) related items? in your library\.?/i,
    (_match, count) => (
      Number(count) === 1
        ? 'Found one strong lead.'
        : `Found ${count} strong leads.`
    )
  );

  safe = safe.replace(
    /If you want, I can now restructure these into inbox\/working\/draft buckets\.?/i,
    'I can sort them into support, tension, and open questions next.'
  );

  safe = safe.replace(
    /^[^.?!]*\bFound one relevant piece\.\s*/i,
    'Found one strong lead. '
  );

  safe = safe.replace(
    /^[^.?!]*\bFound (\d+) relevant pieces\.\s*/i,
    (_match, count) => `Found ${count} strong leads. `
  );

  safe = safe.replace(
    /\bContext summary:\s*/i,
    ''
  ).trim();

  return safe || original;
};
const inferPartnerFollowUpAction = ({ text = '', suggestedCards = [], action = '' }) => {
  const safeAction = clean(action);
  if (safeAction && safeAction !== 'chat' && safeAction !== 'continue') return safeAction;

  const safeText = sanitizeAgentReplyText(text).toLowerCase();
  if (!safeText) return safeAction || 'chat';

  if (
    /want me to sort|sort them into support|sort it into support|open questions next|sorted the fresh leads|tucked .* into support|kept .* nearby as pressure|usable working set/i.test(safeText)
  ) {
    return 'restructure-offer';
  }

  if (
    Array.isArray(suggestedCards) && suggestedCards.length > 0
    && /found one strong lead|found \d+ strong leads|found one clean hit|pulled in \d+ promising pieces|strong footing|best next material|moved it to the top of the stream|strong hit|strong leads/i.test(safeText)
  ) {
    return 'retrieve-offer';
  }

  return safeAction || 'chat';
};
const buildAgentRequestMessage = ({ message, messages = [] }) => {
  const safe = clean(message);
  if (!isShortFollowUpMessage(safe)) {
    return [
      'Stay in the current concept conversation.',
      'Reply naturally, do not repeat the user question, and do not restate the context summary.',
      `User message: ${safe}`
    ].join('\n');
  }

  const lastUser = getLastSubstantiveUserMessage(messages);
  const lastAssistant = getLastAgentMessageByRole(messages, 'assistant');
  if (!lastUser && !lastAssistant) return safe;

  return [
    'Continue the existing concept conversation instead of starting over.',
    'Reply naturally and briefly. Do not say "You asked" or "Context summary".',
    lastUser ? `Prior user request: ${lastUser.text}` : '',
    lastAssistant ? `Latest partner reply: ${truncate(lastAssistant.text, 260)}` : '',
    `Follow-up: ${safe}`
  ].filter(Boolean).join('\n');
};
const resolveFollowUpQuickAction = ({ message, messages = [] }) => {
  if (!isShortFollowUpMessage(message)) return '';
  const lastAssistant = sanitizeAgentReplyText(
    getLastAgentMessageByRole(messages, 'assistant')?.text
  ).toLowerCase();
  const lastAssistantAction = clean(getLastAgentMessageByRole(messages, 'assistant')?.action).toLowerCase();
  if (lastAssistantAction === 'restructure-offer') return 'restructure-stream';
  if (lastAssistantAction === 'retrieve-offer') return 'find-supports';
  if (!lastAssistant) return '';
  if (
    /want me to sort it into support, tension, or an open question|want me to sort them into support, tension, and open questions|i can sort them into support, tension, and open questions next|restructure these into inbox\/working\/draft buckets|restructure them|sort the next pass/i.test(lastAssistant)
  ) {
    return 'restructure-stream';
  }
  if (
    /found \d+ relevant pieces|found one relevant piece|pulled in \d+ promising pieces|kept going from the last move|give me a sharper keyword|give me one source name or phrase/i.test(lastAssistant)
  ) {
    return 'find-supports';
  }
  return '';
};

const buildAgentChatHistory = (messages = []) => {
  const normalized = Array.isArray(messages)
    ? messages
      .map((message) => ({
        role: clean(message?.role) === 'user' ? 'user' : 'assistant',
        text: clean(message?.role) === 'user'
          ? clean(message?.text)
          : sanitizeAgentReplyText(message?.text),
        action: clean(message?.action)
      }))
      .filter((message) => message.text)
    : [];

  return normalized.slice(-14);
};

const createWorkbenchEvent = ({ type, actor = 'user', summary = '', payload = {} }) => ({
  id: createId('event'),
  type,
  actor,
  summary,
  payload,
  createdAt: new Date().toISOString()
});

const buildContextBrief = (state) => {
  const supports = state.cards.filter(card => card.zone === 'supports').slice(0, 3);
  const contradictions = state.cards.filter(card => card.zone === 'contradictions').slice(0, 2);
  const questions = state.cards.filter(card => card.zone === 'questions').slice(0, 2);
  const workspace = state.cards.filter(card => card.zone === 'workspace').slice(0, 3);

  return [
    `Idea title: ${state.header.title}`,
    `Framing prompt: ${state.header.prompt}`,
    `Stage: ${state.header.stage}`,
    `Current hypothesis: ${truncate(stripHtml(state.hypothesis.html), 560) || 'No explicit hypothesis yet.'}`,
    `Supports: ${supports.length ? supports.map(card => truncate(card.content, 120)).join(' | ') : 'None yet.'}`,
    `Contradictions: ${contradictions.length ? contradictions.map(card => truncate(card.content, 120)).join(' | ') : 'None yet.'}`,
    `Open questions: ${questions.length ? questions.map(card => truncate(card.content, 120)).join(' | ') : 'None yet.'}`,
    `Material in play: ${workspace.length ? workspace.map(card => truncate(card.content, 100)).join(' | ') : 'None.'}`
  ].join('\n');
};

const buildSeedState = ({ concept, material, related, questions }) => {
  const library = buildMaterialLibrary({ concept, material, related, questions });
  const workspaceCards = library
    .filter(card => card.zone === 'workspace')
    .slice(0, 7)
    .map((card, index) => ({
      ...card,
      agentAnnotation: index < 2 ? 'Agent surfaced this as strong early context.' : card.agentAnnotation
    }));
  const questionCards = library.filter(card => card.zone === 'questions').slice(0, 2);
  const cards = [...workspaceCards, ...questionCards];
  const hasSeededDescription = Boolean(clean(concept?.description));
  const seededHypothesis = hasSeededDescription
    ? textToHtml(concept.description)
    : '<p></p>';
  const maturity = computeMaturity({ cards, hypothesisHtml: seededHypothesis });
  const initialVersion = createVersion(
    seededHypothesis,
    hasSeededDescription
      ? 'Seeded from the previous concept summary.'
      : 'Initialized a calm concept surface.',
    1,
    maturity
  );

  return {
    version: STORAGE_VERSION,
    header: {
      label: 'Idea',
      title: clean(concept?.name) || 'Untitled idea',
      prompt: DEFAULT_PROMPT,
      stage: DEFAULT_STAGE
    },
    workspaceDraft: '',
    workspaceDraftType: 'Note',
    importedSourceKeys: cards.map(card => card.sourceKey).filter(Boolean),
    cards,
    changeDrafts: [],
    hypothesis: {
      html: seededHypothesis,
      versions: [initialVersion]
    },
    meta: {
      lastReviewedAt: initialVersion.createdAt,
      stale: false,
      staleReason: '',
      staleSignature: '',
      dismissedFreshnessSignature: ''
    },
    agent: {
      comments: hasSeededDescription
        ? [
          createAgentComment({
            title: 'A working claim is starting to appear',
            body: 'The prior concept summary is a useful starting point, but it still needs evidence sorted into support, tension, and unanswered questions.',
            tone: 'signal',
            anchorText: truncate(concept.description, 80)
          })
        ]
        : [],
      messages: hasSeededDescription
        ? [
          createAgentMessage({
            text: 'I can help sort evidence, propose a sharper hypothesis, or challenge the draft once you have a few cards in place.',
            action: 'seed'
          })
        ]
        : []
    }
  };
};

const normalizeLoadedState = (value, fallbackState) => {
  if (!value || typeof value !== 'object') return fallbackState;
  const cards = Array.isArray(value.cards) ? value.cards : fallbackState.cards;
  const versions = Array.isArray(value?.hypothesis?.versions) && value.hypothesis.versions.length > 0
    ? value.hypothesis.versions
    : fallbackState.hypothesis.versions;
  const lastReviewedAt = clean(value?.meta?.lastReviewedAt) || clean(versions.at(-1)?.createdAt) || fallbackState.meta.lastReviewedAt;
  return {
    version: STORAGE_VERSION,
    header: {
      label: 'Idea',
      title: clean(value?.header?.title) || fallbackState.header.title,
      prompt: clean(value?.header?.prompt) || fallbackState.header.prompt,
      stage: clean(value?.header?.stage) || fallbackState.header.stage
    },
    workspaceDraft: clean(value?.workspaceDraft),
    workspaceDraftType: clean(value?.workspaceDraftType) || 'Note',
    importedSourceKeys: Array.isArray(value?.importedSourceKeys) ? value.importedSourceKeys : fallbackState.importedSourceKeys,
    cards,
    changeDrafts: Array.isArray(value?.changeDrafts) ? value.changeDrafts : fallbackState.changeDrafts,
    hypothesis: {
      html: clean(value?.hypothesis?.html) ? value.hypothesis.html : fallbackState.hypothesis.html,
      versions
    },
    meta: {
      lastReviewedAt,
      stale: Boolean(value?.meta?.stale),
      staleReason: clean(value?.meta?.staleReason),
      staleSignature: clean(value?.meta?.staleSignature),
      dismissedFreshnessSignature: clean(value?.meta?.dismissedFreshnessSignature)
    },
    agent: {
      comments: Array.isArray(value?.agent?.comments) ? value.agent.comments : fallbackState.agent.comments,
      messages: Array.isArray(value?.agent?.messages)
        ? value.agent.messages.map((message) => ({
          ...message,
          text: clean(message?.role) === 'user'
            ? clean(message?.text)
            : sanitizeAgentReplyText(message?.text)
        }))
        : fallbackState.agent.messages
    }
  };
};

const pickNextTag = (tags = []) => {
  const current = Array.isArray(tags) ? tags : [];
  return TAG_ROTATION.find(tag => !current.includes(tag)) || current[0] || 'theme';
};

const moveCardToZone = (cards, cardId, nextZone, patch = {}) => cards.map((card) => (
  card.id === cardId
    ? {
      ...card,
      zone: nextZone,
      ...patch
    }
    : card
));

const addCards = (cards, additions = []) => [...cards, ...additions];

const buildHypothesisDraft = ({ header, cards, currentHtml, mode = 'propose' }) => {
  const support = cards.filter(card => card.zone === 'supports').slice(0, 2);
  const contradiction = cards.find(card => card.zone === 'contradictions');
  const openQuestion = cards.find(card => card.zone === 'questions');
  const currentText = stripHtml(currentHtml);

  if (mode === 'rewrite') {
    const base = currentText || `${header.title} is still forming.`;
    return textToHtml(`The current hypothesis is that ${base.replace(/\.$/, '')}. It appears strongest when the evidence is made visible and weakest where contradictions still feel unresolved.`);
  }

  if (mode === 'strengthen') {
    const supportText = support.map(card => truncate(card.content, 90)).join(' ');
    const contradictionText = contradiction ? `The main pressure against it is ${truncate(contradiction.content, 80)}.` : '';
    return textToHtml(
      `If ${header.title.toLowerCase()} works as expected, it should help a user turn scattered material into explicit reasoning. ${supportText || 'The current supporting material suggests that visibility and structure matter.'} ${contradictionText}`.trim()
    );
  }

  return textToHtml(
    [
      `Maybe the core idea in ${header.title} is that people think better when material stays movable and visibly classified rather than flattened into one static note.`,
      support.length
        ? `Right now the strongest support points toward ${support.map(card => truncate(card.content, 72)).join(' and ')}.`
        : 'The next step is to promote a few concrete pieces of evidence into explicit support.',
      contradiction
        ? `The main contradiction still to answer is ${truncate(contradiction.content, 88)}.`
        : 'A good next move is to surface at least one contradiction before this hardens into a conclusion.',
      openQuestion
        ? `The sharpest open question is ${truncate(openQuestion.content, 88)}.`
        : ''
    ].filter(Boolean).join(' ')
  );
};

const buildQuickActionResult = (action, state, library) => {
  const workspaceCards = state.cards.filter(card => card.zone === 'workspace');
  if (action === 'find-supports') {
    const candidates = workspaceCards
      .filter(card => !/\?$/.test(card.content) && card.type !== 'Open question')
      .slice(0, 2);
    const newCards = candidates.length === 0 ? [
      {
        id: createId('card'),
        sourceKey: `agent-support:${Date.now()}`,
        zone: 'supports',
        type: 'Agent suggestion',
        title: 'Visibility might be the mechanism',
        content: 'Several materials imply that making reasoning visible helps people judge and refine ideas.',
        source: 'Agent synthesis',
        sourcePath: '',
        whyItMatters: 'This is the strongest recurring pattern across the current material.',
        confidence: 'Suggested',
        strength: 'Medium',
        agentAnnotation: 'Promoted because the workspace currently has more raw fragments than explicit supports.',
        relatedHypothesisLabel: '',
        origin: 'agent',
        tags: ['support'],
        createdAt: new Date().toISOString()
      }
    ] : [];

    return {
      nextCards: [
        ...moveCardToZone(state.cards, candidates[0]?.id, 'supports', { strength: 'Strong' }),
        ...newCards
      ],
      comment: createAgentComment({
        title: 'Support surfaced',
        body: candidates.length > 0
          ? 'I moved the clearest support into the evidence column so the hypothesis has something concrete beneath it.'
          : 'I added a first support card because the draft needed a sharper grounding claim.',
        tone: 'support',
        relatedCardId: candidates[0]?.id || newCards[0]?.id || ''
      }),
      message: createAgentMessage({
        text: candidates.length > 0
          ? `I pulled ${candidates.length === 1 ? 'a strong signal' : 'two strong signals'} into Supports.`
          : 'I added a synthesized support card to give the draft a firmer footing.',
        action,
        suggestedCards: newCards
      })
    };
  }

  if (action === 'find-contradictions' || action === 'challenge-hypothesis') {
    const candidates = workspaceCards.filter(card => (
      /\b(not|avoid|risk|but|however|messy|hard|tension)\b/i.test(card.content)
      || card.type === 'Concept'
      || card.type === 'Note'
    )).slice(0, 1);
    const newCards = candidates.length === 0 ? [
      {
        id: createId('card'),
        sourceKey: `agent-contradiction:${Date.now()}`,
        zone: 'contradictions',
        type: 'Agent suggestion',
        title: 'Structure could narrow discovery',
        content: 'The same structure that clarifies an idea might also suppress the exploratory mess that produces unexpected insights.',
        source: 'Agent challenge',
        sourcePath: '',
        whyItMatters: 'This is the pressure point the emerging hypothesis still needs to answer.',
        confidence: 'Suggested',
        strength: 'Medium',
        agentAnnotation: 'Added as a deliberate counterweight to the current positive drift.',
        relatedHypothesisLabel: state.hypothesis.versions.at(-1)?.label || '',
        origin: 'agent',
        tags: ['contradiction'],
        createdAt: new Date().toISOString()
      }
    ] : [];

    return {
      nextCards: [
        ...moveCardToZone(state.cards, candidates[0]?.id, 'contradictions', {
          strength: action === 'challenge-hypothesis' ? 'Strong' : 'Medium',
          relatedHypothesisLabel: state.hypothesis.versions.at(-1)?.label || ''
        }),
        ...newCards
      ],
      comment: createAgentComment({
        title: action === 'challenge-hypothesis' ? 'The draft still has a soft underbelly' : 'Contradiction surfaced',
        body: action === 'challenge-hypothesis'
          ? 'The idea currently assumes that more visible structure is always helpful. It still needs a clear answer for when structure becomes constraining.'
          : 'I surfaced a contradiction so the evidence structure can exert pressure on the emerging claim.',
        tone: 'warning',
        relatedCardId: candidates[0]?.id || newCards[0]?.id || ''
      }),
      message: createAgentMessage({
        text: action === 'challenge-hypothesis'
          ? 'I challenged the draft by making the main counter-pressure explicit.'
          : 'I surfaced a contradiction worth testing against the claim.',
        action,
        suggestedCards: newCards
      })
    };
  }

  if (action === 'analyze-patterns') {
    const typeCounts = state.cards.reduce((acc, card) => ({ ...acc, [card.type]: (acc[card.type] || 0) + 1 }), {});
    const dominantType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'material';
    return {
      nextCards: state.cards,
      comment: createAgentComment({
        title: 'Pattern read',
        body: `Most of the current material is arriving as ${dominantType.toLowerCase()}s. The workbench would benefit from at least one stronger contradiction and one explicit mechanism statement.`,
        tone: 'signal'
      }),
      message: createAgentMessage({
        text: `The workbench is currently weighted toward ${dominantType.toLowerCase()}s, which means the structure is gathering material faster than it is testing claims.`,
        action
      })
    };
  }

  if (action === 'propose-hypothesis' || action === 'strengthen-hypothesis' || action === 'rewrite-clearly') {
    const mode = action === 'strengthen-hypothesis'
      ? 'strengthen'
      : action === 'rewrite-clearly'
        ? 'rewrite'
        : 'propose';
    const suggestedText = stripHtml(buildHypothesisDraft({
      header: state.header,
      cards: state.cards,
      currentHtml: state.hypothesis.html,
      mode
    }));
    const suggestion = resolveAgentHypothesisSuggestion({
      currentHtml: state.hypothesis.html,
      proposedText: suggestedText,
      action
    });
    return {
      nextCards: state.cards,
      nextHypothesisHtml: suggestion.nextHypothesisHtml,
      versionSummary: suggestion.versionSummary,
      comment: createAgentComment({
        title: suggestion.commentTitle,
        body: suggestion.commentBody,
        tone: 'support',
        anchorText: truncate(stripHtml(state.hypothesis.html), 88),
        kind: suggestion.applied ? 'note' : 'hypothesis-suggestion',
        status: suggestion.applied ? 'active' : 'pending',
        caption: suggestion.commentCaption || '',
        suggestedHtml: suggestion.applied ? '' : textToHtml(suggestedText)
      }),
      message: createAgentMessage({
        text: suggestion.messageText,
        action
      })
    };
  }

  if (action === 'find-question') {
    const availableQuestion = library.find(card => card.type === 'Open question' && !state.importedSourceKeys.includes(card.sourceKey));
    const newQuestion = availableQuestion || {
      id: createId('card'),
      sourceKey: `agent-question:${Date.now()}`,
      zone: 'questions',
      type: 'Open question',
      title: 'What would falsify this?',
      content: 'What concrete evidence would make this hypothesis weaker rather than stronger?',
      source: 'Agent prompt',
      sourcePath: '',
      whyItMatters: 'A falsification test prevents the draft from becoming self-confirming.',
      confidence: 'Suggested',
      strength: 'Low',
      agentAnnotation: 'Added to keep the loop cyclical rather than linear.',
      relatedHypothesisLabel: state.hypothesis.versions.at(-1)?.label || '',
      origin: 'agent',
      tags: ['question'],
      createdAt: new Date().toISOString()
    };
    return {
      nextCards: addCards(state.cards, [{ ...newQuestion, zone: 'questions' }]),
      comment: createAgentComment({
        title: 'A sharper question would help',
        body: 'The current reasoning would improve if one question was framed as a falsification test, not just a request for more evidence.',
        tone: 'gap',
        relatedCardId: newQuestion.id
      }),
      message: createAgentMessage({
        text: 'I added an open question that forces the hypothesis to expose what would count against it.',
        action,
        suggestedCards: [newQuestion]
      })
    };
  }

  return {
    nextCards: state.cards,
    message: createAgentMessage({
      text: 'No action was applied.',
      action
    })
  };
};

const buildChangeDraftResult = (kind, cards = [], messageText = '', caption = '', reason = '') => {
  const safeCards = Array.isArray(cards) ? cards.filter(Boolean) : [];
  if (safeCards.length === 0) return null;
  const changeDraft = buildConceptChangeDraft({
    kind,
    cards: safeCards,
    caption,
    reason
  });
  return {
    changeDrafts: [changeDraft],
    message: createAgentMessage({
      text: clean(messageText) || changeDraft.summary,
      action: 'review-change-draft',
      suggestedCards: safeCards
    }),
    comment: createAgentComment({
      title: changeDraft.title,
      body: changeDraft.summary,
      tone: kind === 'contradiction' ? 'warning' : kind === 'refresh' ? 'signal' : 'support'
    })
  };
};

const buildLocalDraftFallbackMessage = ({
  action,
  cards = [],
  unavailableReason = 'The richer scout pass was unavailable.'
} = {}) => {
  const safeCards = Array.isArray(cards) ? cards.filter(Boolean) : [];
  if (!safeCards.length) return '';
  if (action === 'find-supports') {
    return buildWorkbenchDraftMessage({
      kind: 'support',
      cards: safeCards,
      provenance: 'local concept material',
      unavailableReason
    });
  }
  if (action === 'find-contradictions' || action === 'challenge-hypothesis') {
    return buildWorkbenchDraftMessage({
      kind: 'contradiction',
      cards: safeCards,
      provenance: 'local concept material',
      unavailableReason
    });
  }
  if (action === 'find-question' || action === 'suggest-open-questions') {
    return buildWorkbenchDraftMessage({
      kind: 'question',
      cards: safeCards,
      provenance: 'local concept material',
      unavailableReason
    });
  }
  return '';
};

const buildLocalRelatedSourceCards = ({ library = [], state }) => {
  const contextText = [
    state.header.title,
    state.header.prompt,
    stripHtml(state.hypothesis.html)
  ].join(' ');
  return library
    .filter((card) => (
      ['Article snippet', 'Note', 'Concept'].includes(card.type)
      && !state.importedSourceKeys.includes(card.sourceKey)
    ))
    .sort((left, right) => (
      scoreMaterialCardForIntent(right, 'support', contextText) - scoreMaterialCardForIntent(left, 'support', contextText)
    ))
    .slice(0, 3)
    .map((card) => ({
      ...card,
      id: createId('card'),
      zone: 'workspace',
      origin: 'agent',
      agentAnnotation: card.agentAnnotation || 'Pulled in as related source memory for the current concept.',
      tags: [...new Set([...(card.tags || []), 'related'])]
    }));
};

const buildLocalQuestionCards = ({ library = [], state }) => {
  const existingQuestions = new Set(
    state.cards
      .filter((card) => card.zone === 'questions')
      .map((card) => clean(card.sourceKey || card.content || card.title))
  );
  return library
    .filter((card) => (
      card.type === 'Open question'
      && !state.importedSourceKeys.includes(card.sourceKey)
      && !existingQuestions.has(clean(card.sourceKey || card.content || card.title))
    ))
    .slice(0, 3)
    .map((card) => ({
      ...card,
      id: createId('card'),
      zone: 'questions',
      origin: 'agent',
      agentAnnotation: card.agentAnnotation || 'Surfaced as an unresolved question worth keeping beside the draft.',
      tags: [...new Set([...(card.tags || []), 'question'])]
    }));
};

const extractNewCards = (previousCards = [], nextCards = []) => {
  const seen = new Set((Array.isArray(previousCards) ? previousCards : []).map((card) => clean(card?.sourceKey || card?.id)));
  return (Array.isArray(nextCards) ? nextCards : []).filter((card) => {
    const key = clean(card?.sourceKey || card?.id);
    if (!key) return true;
    return !seen.has(key);
  });
};

const buildLocalChatReply = ({ message, state, library }) => {
  const lower = clean(message).toLowerCase();
  if (lower.includes('support')) {
    return {
      reply: buildWorkbenchChatReply({
        intent: 'support',
        card: state.cards.find(card => card.zone === 'supports') || state.cards.find(card => card.zone === 'workspace')
      }),
      suggestedCards: []
    };
  }
  if (lower.includes('contradiction') || lower.includes('challenge')) {
    return {
      reply: buildWorkbenchChatReply({
        intent: 'contradiction',
        card: state.cards.find(card => card.zone === 'contradictions') || { content: 'the draft has not yet answered when structure helps versus when it constrains discovery.' }
      }),
      suggestedCards: []
    };
  }
  if (lower.includes('hypothesis') || lower.includes('rewrite')) {
    return {
      reply: stripHtml(buildHypothesisDraft({
        header: state.header,
        cards: state.cards,
        currentHtml: state.hypothesis.html,
        mode: lower.includes('rewrite') ? 'rewrite' : 'propose'
      })),
      suggestedCards: []
    };
  }
  const suggestionCards = library
    .filter(card => !state.importedSourceKeys.includes(card.sourceKey))
    .slice(0, 2)
    .map(card => ({ ...card, zone: 'workspace' }));
  return {
    reply: 'The next useful move is to pull one more concrete piece of material into the workspace, then classify it before rewriting the hypothesis.',
    suggestedCards: suggestionCards
  };
};

const buildRestructuredCards = (cards = []) => {
  if (!Array.isArray(cards) || cards.length === 0) return { nextCards: [], reply: '' };
  const uniqueCards = cards.filter(Boolean);
  const nextCards = uniqueCards.map((card, index) => ({
    ...card,
    zone: index === 0 ? 'supports' : index === 1 ? 'contradictions' : 'questions',
    whyItMatters:
      index === 0
        ? 'Slotted into support so the draft has firmer footing.'
        : index === 1
          ? 'Held aside as pressure that should sharpen the next revision.'
          : 'Left open as the next question worth answering.',
    origin: clean(card.origin) || 'agent'
  }));

  return {
    nextCards,
    reply: buildWorkbenchRestructureReply(nextCards)
  };
};

const buildAgentPromptForAction = ({ action, state }) => {
  const context = buildContextBrief(state);
  if (action === 'propose-hypothesis') {
    return `Using only the context below, propose a sharper working hypothesis in 3-5 sentences. Make it explicit, conditional, and testable.\n\n${context}`;
  }
  if (action === 'strengthen-hypothesis') {
    return `Strengthen the current hypothesis. Make the causal claim clearer, anchor it to the strongest supports, and mention at least one remaining risk.\n\n${context}`;
  }
  if (action === 'challenge-hypothesis') {
    return `Challenge the current hypothesis. Identify the softest assumption, the strongest contradiction, and one falsification test.\n\n${context}`;
  }
  if (action === 'rewrite-clearly') {
    return `Rewrite the current hypothesis more clearly and directly. Reduce abstraction and preserve nuance.\n\n${context}`;
  }
  if (action === 'analyze-patterns') {
    return `Analyze the evidence pattern. Name the strongest recurring signal, the biggest gap, and the most useful next move.\n\n${context}`;
  }
  return `Help with this idea workbench.\n\n${context}`;
};

export const useIdeaWorkbenchModel = ({
  concept,
  related,
  questions,
  onCreateNotebookDraft,
  onCreateConceptHandoff
}) => {
  const conceptKey = clean(concept?._id || concept?.name);
  const storageKey = conceptKey ? `${STORAGE_PREFIX}:${conceptKey}` : '';
  const fireTourSignal = useTourSignal();
  const {
    material,
    loading: materialLoading,
    error: materialError
  } = useConceptMaterial(conceptKey, { enabled: Boolean(conceptKey) });

  const materialLibrary = useMemo(
    () => buildMaterialLibrary({ concept, material, related, questions }),
    [concept, material, questions, related]
  );
  const seedSignature = useMemo(() => JSON.stringify({
    conceptId: conceptKey,
    conceptName: concept?.name || '',
    description: concept?.description || '',
    materialSignature: materialLibrary
      .slice(0, MATERIAL_LIBRARY_LIMIT)
      .map((card) => [
        clean(card?.sourceKey),
        clean(card?.type),
        clean(card?.title),
        clean(card?.content),
        clean(card?.createdAt)
      ].join('::'))
      .join('|'),
    questionSignature: (Array.isArray(questions) ? questions : [])
      .slice(0, 8)
      .map((item) => [
        clean(item?._id),
        clean(item?.text),
        clean(item?.updatedAt || item?.createdAt)
      ].join('::'))
      .join('|')
  }), [concept?.description, concept?.name, conceptKey, materialLibrary, questions]);
  const latestSeedStateRef = useRef(buildSeedState({
    concept,
    material,
    related,
    questions
  }));

  const [state, setState] = useState(() => latestSeedStateRef.current);
  const [hydratedKey, setHydratedKey] = useState('');
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentError, setAgentError] = useState('');
  const [agentModeLabel, setAgentModeLabel] = useState('');
  const [syncError, setSyncError] = useState('');
  const [serverRevision, setServerRevision] = useState(0);
  const [eventLog, setEventLog] = useState([]);
  const [conflictState, setConflictState] = useState(null);
  const lastPersistedStateRef = useRef('');
  const latestStateRef = useRef(latestSeedStateRef.current);

  useEffect(() => {
    latestSeedStateRef.current = buildSeedState({
      concept,
      material,
      related,
      questions
    });
  }, [concept, material, questions, related, seedSignature]);

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  const commitServerWorkbench = useCallback((response, fallbackState) => {
    const nextFallbackState = fallbackState || latestStateRef.current;
    const nextState = response?.ideaWorkbench
      ? normalizeLoadedState(response.ideaWorkbench, nextFallbackState)
      : nextFallbackState;
    const serialized = JSON.stringify(nextState);
    lastPersistedStateRef.current = serialized;
    setState(nextState);
    setSyncError('');
    setServerRevision(Number(response?.revision || 0));
    if (Array.isArray(response?.events)) {
      setEventLog(response.events);
    }
    return nextState;
  }, []);

  useEffect(() => {
    if (!storageKey) return;
    const fallback = latestSeedStateRef.current;
    let cancelled = false;
    setConflictState(null);
    const hydrate = async () => {
      let localState = fallback;
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          localState = normalizeLoadedState(JSON.parse(raw), fallback);
        }
      } catch (_error) {
        localState = fallback;
      }

      try {
        const remote = await getConceptIdeaWorkbench(conceptKey);
        const remoteState = remote?.ideaWorkbench
          ? normalizeLoadedState(remote.ideaWorkbench, localState)
          : localState;
        if (cancelled) return;
        commitServerWorkbench(remote, remoteState);
        setHydratedKey(storageKey);
      } catch (_error) {
        if (cancelled) return;
        setState(localState);
        setServerRevision(0);
        setEventLog([]);
        setHydratedKey(storageKey);
        lastPersistedStateRef.current = JSON.stringify(localState);
      }
    };

    hydrate();
    return () => {
      cancelled = true;
    };
  }, [commitServerWorkbench, conceptKey, storageKey]);

  useEffect(() => {
    if (!storageKey || hydratedKey !== storageKey) return;
    localStorage.setItem(storageKey, JSON.stringify(state));
  }, [hydratedKey, state, storageKey]);

  useEffect(() => {
    if (!conceptKey || hydratedKey !== storageKey) return;
    if (conflictState) return;
    const serialized = JSON.stringify(state);
    if (serialized === lastPersistedStateRef.current) return;
    const timer = setTimeout(async () => {
      try {
        const response = await updateConceptIdeaWorkbench(conceptKey, state, { baseRevision: serverRevision });
        lastPersistedStateRef.current = serialized;
        setSyncError('');
        setServerRevision(Number(response?.revision || serverRevision));
        if (Array.isArray(response?.events)) {
          setEventLog(response.events);
        }
      } catch (error) {
        if (Number(error?.response?.status) === 409) {
          const remoteState = error?.response?.data?.ideaWorkbench;
          const remoteRevision = Number(error?.response?.data?.revision || 0);
          if (remoteState && typeof remoteState === 'object') {
            const normalizedRemote = normalizeLoadedState(remoteState, state);
            setConflictState({
              localState: normalizeLoadedState(state, state),
              remoteState: normalizedRemote,
              remoteRevision,
              choices: {
                header: 'local',
                cards: 'merge',
                hypothesis: 'local',
                agent: 'merge'
              },
              error: '',
              saving: false
            });
          }
          if (Array.isArray(error?.response?.data?.events)) {
            setEventLog(error.response.data.events);
          }
          setServerRevision(remoteRevision);
          setSyncError('Workbench changed elsewhere. Review and merge before saving.');
          return;
        }
        setSyncError(error?.response?.data?.error || 'Failed to sync workbench.');
      }
    }, 700);

    return () => clearTimeout(timer);
  }, [conceptKey, conflictState, hydratedKey, serverRevision, state, storageKey]);

  const currentMaturity = useMemo(
    () => computeMaturity({ cards: state.cards, hypothesisHtml: state.hypothesis.html }),
    [state.cards, state.hypothesis.html]
  );
  const counts = useMemo(() => ({
    workspace: state.cards.filter(card => card.zone === 'workspace').length,
    supports: state.cards.filter(card => card.zone === 'supports').length,
    contradictions: state.cards.filter(card => card.zone === 'contradictions').length,
    questions: state.cards.filter(card => card.zone === 'questions').length
  }), [state.cards]);
  const hypothesisVersion = state.hypothesis.versions.at(-1) || createVersion(state.hypothesis.html, '', 1, currentMaturity);
  const importableCounts = useMemo(() => {
    const remaining = materialLibrary.filter(card => !state.importedSourceKeys.includes(card.sourceKey));
    return {
      highlights: remaining.filter(card => card.type === 'Highlight').length,
      notes: remaining.filter(card => card.type === 'Note').length,
      snippets: remaining.filter(card => card.type === 'Article snippet').length,
      concepts: remaining.filter(card => card.type === 'Concept').length
    };
  }, [materialLibrary, state.importedSourceKeys]);
  const freshness = useMemo(
    () => computeConceptFreshness({
      materialLibrary,
      importedSourceKeys: state.importedSourceKeys,
      lastReviewedAt: state.meta?.lastReviewedAt
    }),
    [materialLibrary, state.importedSourceKeys, state.meta?.lastReviewedAt]
  );
  const pendingChangeDrafts = useMemo(
    () => (Array.isArray(state.changeDrafts) ? state.changeDrafts : []).filter((draft) => clean(draft?.status).toLowerCase() === 'pending'),
    [state.changeDrafts]
  );

  useEffect(() => {
    setState((previous) => {
      const nextMeta = {
        ...previous.meta,
        stale: freshness.isStale,
        staleReason: freshness.isStale ? freshness.summary : '',
        staleSignature: freshness.signature || ''
      };
      const hasPendingRefreshDraft = previous.changeDrafts.some((draft) => (
        clean(draft?.kind) === 'refresh'
        && clean(draft?.signature) === clean(freshness.signature)
        && clean(draft?.status).toLowerCase() === 'pending'
      ));
      const shouldQueueRefreshDraft = freshness.isStale
        && freshness.freshCards.length > 0
        && !hasPendingRefreshDraft
        && clean(previous.meta?.dismissedFreshnessSignature) !== clean(freshness.signature);

      const metaChanged = (
        previous.meta?.stale !== nextMeta.stale
        || clean(previous.meta?.staleReason) !== clean(nextMeta.staleReason)
        || clean(previous.meta?.staleSignature) !== clean(nextMeta.staleSignature)
      );

      if (!shouldQueueRefreshDraft) {
        return metaChanged ? { ...previous, meta: nextMeta } : previous;
      }

      const refreshDraft = buildConceptChangeDraft({
        kind: 'refresh',
        cards: freshness.freshCards,
        summary: freshness.summary,
        caption: 'Newer library material is waiting. Review it before it changes the concept.'
      });

      return {
        ...previous,
        meta: {
          ...nextMeta,
          dismissedFreshnessSignature: clean(previous.meta?.dismissedFreshnessSignature) === clean(freshness.signature)
            ? ''
            : previous.meta?.dismissedFreshnessSignature || ''
        },
        changeDrafts: mergeConceptChangeDrafts(previous.changeDrafts, [refreshDraft])
      };
    });
  }, [freshness.freshCards, freshness.isStale, freshness.signature, freshness.summary]);

  const appendWorkbenchEvents = useCallback(async (eventsInput) => {
    if (!conceptKey) return;
    const events = (Array.isArray(eventsInput) ? eventsInput : [eventsInput]).filter(Boolean);
    if (events.length === 0) return;
    setEventLog((previous) => [...previous, ...events].slice(-400));
    try {
      const response = await appendConceptIdeaWorkbenchEvents(conceptKey, events);
      if (Array.isArray(response?.events)) {
        setEventLog(response.events);
      }
    } catch (_error) {
      // Keep optimistic local event state even if event sync fails.
    }
  }, [conceptKey]);

  const setHeaderField = useCallback((field, value) => {
    setState((previous) => ({
      ...previous,
      header: {
        ...previous.header,
        [field]: value
      }
    }));
  }, []);

  const setWorkspaceDraft = useCallback((value) => {
    setState((previous) => ({ ...previous, workspaceDraft: value }));
  }, []);

  const setWorkspaceDraftType = useCallback((value) => {
    setState((previous) => ({ ...previous, workspaceDraftType: value }));
  }, []);

  const addWorkspaceCard = useCallback(() => {
    setState((previous) => {
      const content = clean(previous.workspaceDraft);
      if (!content) return previous;
      const type = clean(previous.workspaceDraftType) || 'Note';
      const nextCard = {
        id: createId('card'),
        sourceKey: '',
        zone: 'workspace',
        type,
        title: titleFromText(content, type),
        content,
        source: 'Workbench draft',
        sourcePath: '',
        whyItMatters: 'Freshly added by the user from the open workspace.',
        confidence: 'Working',
        strength: 'Low',
        agentAnnotation: '',
        relatedHypothesisLabel: '',
        origin: 'user',
        tags: [],
        createdAt: new Date().toISOString()
      };
      return {
        ...previous,
        workspaceDraft: '',
        cards: [...previous.cards, nextCard]
      };
    });
    appendWorkbenchEvents(createWorkbenchEvent({
      type: 'workspace_card_added',
      actor: 'user',
      summary: 'Added a new workspace card.',
      payload: { source: 'composer' }
    }));
  }, [appendWorkbenchEvents]);

  const importMaterialCard = useCallback((kind) => {
    setState((previous) => {
      const nextCard = materialLibrary.find((card) => {
        if (previous.importedSourceKeys.includes(card.sourceKey)) return false;
        if (kind === 'highlight') return card.type === 'Highlight';
        if (kind === 'note') return card.type === 'Note';
        if (kind === 'snippet') return card.type === 'Article snippet';
        if (kind === 'concept') return card.type === 'Concept';
        return true;
      });
      if (!nextCard) return previous;
      return {
        ...previous,
        importedSourceKeys: [...previous.importedSourceKeys, nextCard.sourceKey],
        cards: [...previous.cards, { ...nextCard, zone: 'workspace' }]
      };
    });
    appendWorkbenchEvents(createWorkbenchEvent({
      type: 'material_imported',
      actor: 'user',
      summary: `Imported ${kind} into the workspace.`,
      payload: { kind }
    }));
  }, [appendWorkbenchEvents, materialLibrary]);

  const addSuggestedCard = useCallback((card, nextZone = 'workspace') => {
    if (!card) return;
    setState((previous) => ({
      ...previous,
      importedSourceKeys: card.sourceKey && !previous.importedSourceKeys.includes(card.sourceKey)
        ? [...previous.importedSourceKeys, card.sourceKey]
        : previous.importedSourceKeys,
      cards: [...previous.cards, {
        ...card,
        id: createId('card'),
        zone: nextZone
      }]
    }));
  }, []);

  const insertCardIntoWorkspaceDraft = useCallback((cardId) => {
    setState((previous) => {
      const card = previous.cards.find((entry) => entry.id === cardId);
      if (!card) return previous;
      const insertion = formatCardForWorkspaceDraft(card);
      if (!insertion) return previous;
      return {
        ...previous,
        workspaceDraft: previous.workspaceDraft
          ? `${previous.workspaceDraft.trim()}\n\n${insertion}`
          : insertion,
        workspaceDraftType: card.type === 'Highlight' ? 'Highlight' : previous.workspaceDraftType
      };
    });
    appendWorkbenchEvents(createWorkbenchEvent({
      type: 'card_inserted_into_textbox',
      actor: 'user',
      summary: 'Dropped material into the workspace text box.',
      payload: { target: 'workspace-draft', cardId }
    }));
  }, [appendWorkbenchEvents]);

  const insertCardIntoHypothesis = useCallback((cardId, options = {}) => {
    setState((previous) => {
      const card = previous.cards.find((entry) => entry.id === cardId);
      if (!card) return previous;
      const insertion = formatCardForHypothesisHtml(card);
      if (!insertion) return previous;
      const removeCard = Boolean(options?.removeCard);
      return {
        ...previous,
        cards: removeCard
          ? previous.cards.filter((entry) => entry.id !== cardId)
          : previous.cards,
        hypothesis: {
          ...previous.hypothesis,
          html: `${previous.hypothesis.html || '<p></p>'}${insertion}`
        }
      };
    });
    appendWorkbenchEvents(createWorkbenchEvent({
      type: 'card_inserted_into_textbox',
      actor: 'user',
      summary: 'Dropped material into the hypothesis text box.',
      payload: { target: 'hypothesis', cardId, removeCard: Boolean(options?.removeCard) }
    }));
  }, [appendWorkbenchEvents]);

  const moveCard = useCallback((cardId, nextZone) => {
    setState((previous) => ({
      ...previous,
      cards: moveCardToZone(previous.cards, cardId, nextZone, {
        relatedHypothesisLabel: nextZone === 'workspace' ? '' : previous.hypothesis.versions.at(-1)?.label || ''
      })
    }));
    appendWorkbenchEvents(createWorkbenchEvent({
      type: 'card_moved',
      actor: 'user',
      summary: `Moved a card to ${nextZone}.`,
      payload: { cardId, zone: nextZone }
    }));
    // Tour signal — moving any card from workspace into a structured zone counts.
    if (nextZone !== 'workspace') {
      fireTourSignal('workspace_organized', { cardId, zone: nextZone });
    }
  }, [appendWorkbenchEvents, fireTourSignal]);

  const deleteCard = useCallback((cardId) => {
    setState((previous) => ({
      ...previous,
      cards: previous.cards.filter(card => card.id !== cardId)
    }));
  }, []);

  const tagCard = useCallback((cardId) => {
    setState((previous) => ({
      ...previous,
      cards: previous.cards.map((card) => (
        card.id === cardId
          ? { ...card, tags: [...(card.tags || []), pickNextTag(card.tags)] }
          : card
      ))
    }));
  }, []);

  const updateHypothesisHtml = useCallback((html) => {
    setState((previous) => ({
      ...previous,
      hypothesis: {
        ...previous.hypothesis,
        html
      }
    }));
  }, []);

  const acceptAgentComment = useCallback(async (commentId) => {
    const comment = state.agent.comments.find((entry) => entry.id === commentId);
    if (!comment?.suggestedHtml) return;
    if (!conceptKey) return;
    try {
      const response = await acceptConceptIdeaWorkbenchComment(conceptKey, commentId);
      commitServerWorkbench(response);
    } catch (error) {
      setSyncError(error?.response?.data?.error || 'Failed to apply revision.');
    }
  }, [commitServerWorkbench, conceptKey, state.agent.comments]);

  const dismissAgentComment = useCallback(async (commentId) => {
    const comment = state.agent.comments.find((entry) => entry.id === commentId);
    if (!comment) return;
    if (!conceptKey) return;
    try {
      const response = await dismissConceptIdeaWorkbenchComment(conceptKey, commentId);
      commitServerWorkbench(response);
    } catch (error) {
      setSyncError(error?.response?.data?.error || 'Failed to dismiss revision.');
    }
  }, [commitServerWorkbench, conceptKey, state.agent.comments]);

  const applyChangeDraft = useCallback(async (draftId) => {
    const draft = state.changeDrafts.find((entry) => entry.id === draftId);
    if (!draft) return;
    if (!conceptKey) return;
    try {
      const response = await applyConceptIdeaWorkbenchChangeDraft(conceptKey, draftId);
      commitServerWorkbench(response);
    } catch (error) {
      setSyncError(error?.response?.data?.error || 'Failed to apply change draft.');
    }
  }, [commitServerWorkbench, conceptKey, state.changeDrafts]);

  const dismissChangeDraft = useCallback(async (draftId) => {
    const draft = state.changeDrafts.find((entry) => entry.id === draftId);
    if (!draft) return;
    if (!conceptKey) return;
    try {
      const response = await dismissConceptIdeaWorkbenchChangeDraft(conceptKey, draftId);
      commitServerWorkbench(response);
    } catch (error) {
      setSyncError(error?.response?.data?.error || 'Failed to dismiss change draft.');
    }
  }, [commitServerWorkbench, conceptKey, state.changeDrafts]);

  const markReviewed = useCallback(async () => {
    if (!conceptKey) return;
    try {
      const response = await markConceptIdeaWorkbenchReviewed(conceptKey);
      commitServerWorkbench(response);
    } catch (error) {
      setSyncError(error?.response?.data?.error || 'Failed to mark concept reviewed.');
    }
  }, [commitServerWorkbench, conceptKey]);

  const snapshotHypothesis = useCallback((summary = '') => {
    setState((previous) => {
      const nextMaturity = computeMaturity({ cards: previous.cards, hypothesisHtml: previous.hypothesis.html });
      const versions = [...previous.hypothesis.versions];
      versions.push(createVersion(
        previous.hypothesis.html,
        clean(summary) || summarizeVersionChange(versions.at(-1)?.html || '', previous.hypothesis.html),
        versions.length + 1,
        nextMaturity
      ));
      return {
        ...previous,
        hypothesis: {
          ...previous.hypothesis,
          versions
        },
        meta: {
          ...previous.meta,
          lastReviewedAt: versions.at(-1)?.createdAt || new Date().toISOString(),
          stale: false,
          staleReason: '',
          staleSignature: '',
          dismissedFreshnessSignature: ''
        }
      };
    });
    appendWorkbenchEvents(createWorkbenchEvent({
      type: 'hypothesis_version_saved',
      actor: 'user',
      summary: 'Saved a new hypothesis version.',
      payload: { summary: clean(summary) }
    }));
  }, [appendWorkbenchEvents]);

  const appendAgentArtifacts = useCallback((result) => {
    setState((previous) => {
      const nextCards = Array.isArray(result?.nextCards) ? result.nextCards : previous.cards;
      const nextHypothesisHtml = result?.nextHypothesisHtml || previous.hypothesis.html;
      const nextVersions = [...previous.hypothesis.versions];

      if (result?.versionSummary) {
        const nextMaturity = computeMaturity({ cards: nextCards, hypothesisHtml: nextHypothesisHtml });
        nextVersions.push(createVersion(
          nextHypothesisHtml,
          result.versionSummary,
          nextVersions.length + 1,
          nextMaturity
        ));
      }

      return {
        ...previous,
        cards: nextCards,
        changeDrafts: Array.isArray(result?.changeDrafts)
          ? mergeConceptChangeDrafts(previous.changeDrafts, result.changeDrafts)
          : previous.changeDrafts,
        importedSourceKeys: [
          ...new Set([
            ...previous.importedSourceKeys,
            ...(Array.isArray(result?.nextCards) ? result.nextCards.map(card => card.sourceKey).filter(Boolean) : [])
          ])
        ],
        meta: {
          ...previous.meta,
          ...(result?.metaPatch && typeof result.metaPatch === 'object' ? result.metaPatch : {})
        },
        hypothesis: {
          ...previous.hypothesis,
          html: nextHypothesisHtml,
          versions: nextVersions
        },
        agent: {
          comments: result?.comment ? [result.comment, ...previous.agent.comments] : previous.agent.comments,
          messages: result?.message ? [...previous.agent.messages, result.message] : previous.agent.messages
        }
      };
    });
  }, []);

  const scoutLibrarySuggestions = useCallback(async (intent = 'support') => {
    if (!conceptKey) return [];
    setAgentModeLabel('Scouting library');
    await suggestConceptWorkspaceFromLibrary(conceptKey, {
      mode: 'library_only',
      maxLoops: 2
    });
    const payload = await getConceptAgentSuggestions(conceptKey);
    const latestDraft = Array.isArray(payload?.drafts) ? payload.drafts.at(-1) : null;
    const draftSourceKeys = new Set();
    const itemSuggestions = Array.isArray(latestDraft?.itemSuggestions) ? latestDraft.itemSuggestions : [];
    const conceptSuggestions = Array.isArray(latestDraft?.conceptSuggestions) ? latestDraft.conceptSuggestions : [];
    const ranked = intent === 'contradiction'
      ? [...conceptSuggestions, ...itemSuggestions.filter(item => ['question', 'note', 'highlight', 'article'].includes(item.type))]
      : intent === 'question'
        ? [...itemSuggestions.filter(item => item.type === 'question'), ...conceptSuggestions]
        : [...itemSuggestions, ...conceptSuggestions];
    const draftedCards = ranked
      .slice(0, 3)
      .map((suggestion) => buildAgentDraftSuggestionCard(suggestion, intent))
      .filter(Boolean);
    draftedCards.forEach((card) => {
      if (card?.sourceKey) draftSourceKeys.add(card.sourceKey);
    });

    const contextText = [
      state.header.title,
      state.header.prompt,
      stripHtml(state.hypothesis.html)
    ].join(' ');
    const localMaterialCards = materialLibrary
      .filter((card) => (
        ['Highlight', 'Article snippet', 'Note', 'Concept'].includes(card.type)
        && !state.importedSourceKeys.includes(card.sourceKey)
        && !draftSourceKeys.has(card.sourceKey)
      ))
      .sort((left, right) => (
        scoreMaterialCardForIntent(right, intent, contextText) - scoreMaterialCardForIntent(left, intent, contextText)
      ))
      .slice(0, 2)
      .map((card) => ({
        ...card,
        id: createId('card'),
        zone: intent === 'contradiction' ? 'contradictions' : intent === 'question' ? 'questions' : 'supports',
        origin: 'agent',
        agentAnnotation: card.agentAnnotation || 'Surfaced from saved material, not only highlights.',
        tags: [...new Set([...(card.tags || []), 'material'])]
      }));

    return [...draftedCards, ...localMaterialCards].slice(0, 5);
  }, [conceptKey, materialLibrary, state.header.prompt, state.header.title, state.hypothesis.html, state.importedSourceKeys]);

  const runActionWithAgent = useCallback(async (action) => {
    const response = await chatWithAgent({
      message: buildAgentPromptForAction({ action, state }),
      history: buildAgentChatHistory(state.agent.messages),
      context: concept?._id ? { type: 'concept', id: concept._id } : null,
      limit: 6
    });
    const reply = clean(response?.reply) || '';
    const relatedCards = Array.isArray(response?.relatedItems)
      ? response.relatedItems.slice(0, 3).map((item) => ({
        id: createId('card'),
        sourceKey: `agent-related:${clean(item.type)}:${clean(item.id || item.title)}`,
        zone: 'workspace',
        type: sentenceCase(item.type || 'Agent suggestion'),
        title: clean(item.title) || 'Related material',
        content: clean(item.snippet || item.title || item.id),
        source: 'Agent related item',
        sourcePath: '',
        whyItMatters: 'Returned by the collaborative agent as related material.',
        confidence: 'Agent',
        strength: 'Medium',
        agentAnnotation: '',
        relatedHypothesisLabel: '',
        origin: 'agent',
        tags: ['agent'],
        createdAt: new Date().toISOString()
      }))
      : [];
    return { reply, relatedCards };
  }, [concept?._id, state]);

  const runQuickAction = useCallback((action) => {
    setAgentError('');
    setAgentBusy(true);
    appendWorkbenchEvents(createWorkbenchEvent({
      type: 'quick_action_requested',
      actor: 'user',
      summary: `Ran quick action: ${action}.`,
      payload: { action }
    }));
    const execute = async () => {
      try {
        if (['find-supports', 'find-contradictions'].includes(action)) {
          const intent = action === 'find-contradictions' ? 'contradiction' : 'support';
          const scoutCards = await scoutLibrarySuggestions(intent);
          if (scoutCards.length > 0) {
            appendAgentArtifacts(buildChangeDraftResult(
              intent,
              scoutCards,
              buildWorkbenchDraftMessage({
                kind: intent,
                cards: scoutCards,
                provenance: 'your archive'
              }),
              'Keep the draft quiet until you decide what belongs in the concept.'
            ));
            appendWorkbenchEvents(createWorkbenchEvent({
              type: 'agent_scout_completed',
              actor: 'agent',
              summary: `Concept scout completed for ${action}.`,
              payload: { action, count: scoutCards.length }
            }));
            return;
          }
        }

        if (action === 'retrieve-related-sources') {
          const relatedCards = buildLocalRelatedSourceCards({ library: materialLibrary, state });
          if (relatedCards.length > 0) {
            appendAgentArtifacts(buildChangeDraftResult(
              'related',
              relatedCards,
              buildWorkbenchDraftMessage({
                kind: 'related',
                cards: relatedCards,
                provenance: 'your archive'
              }),
              'Bring these in only if they sharpen the current concept.'
            ));
            appendWorkbenchEvents(createWorkbenchEvent({
              type: 'agent_related_sources_prepared',
              actor: 'agent',
              summary: 'Prepared related sources for the current concept.',
              payload: { action, count: relatedCards.length }
            }));
            return;
          }
          setAgentError('No remembered sources matched this concept yet.');
          return;
        }

        if (action === 'suggest-open-questions') {
          const questionCards = await scoutLibrarySuggestions('question');
          if (questionCards.length > 0) {
            appendAgentArtifacts(buildChangeDraftResult(
              'question',
              questionCards,
              buildWorkbenchDraftMessage({
                kind: 'question',
                cards: questionCards,
                provenance: 'your archive'
              }),
              'Use these to keep the concept from hardening too early.'
            ));
            appendWorkbenchEvents(createWorkbenchEvent({
              type: 'agent_questions_prepared',
              actor: 'agent',
              summary: 'Prepared open questions for the current concept.',
              payload: { action, count: questionCards.length }
            }));
            return;
          }
        }

        if (action === 'refresh-concept') {
          if (freshness.isStale && freshness.freshCards.length > 0) {
            appendAgentArtifacts(buildChangeDraftResult(
              'refresh',
              freshness.freshCards,
              buildWorkbenchDraftMessage({
                kind: 'refresh',
                cards: freshness.freshCards,
                provenance: 'newer library material'
              }),
              'Review the fresh material before it changes the concept.',
              freshness.summary
            ));
            appendWorkbenchEvents(createWorkbenchEvent({
              type: 'concept_refresh_prepared',
              actor: 'agent',
              summary: 'Prepared a concept refresh draft from newer material.',
              payload: { action, count: freshness.freshCards.length }
            }));
            return;
          }
          appendAgentArtifacts({
            comment: createAgentComment({
              title: 'Concept is current',
              body: 'No newer library material is waiting on this concept right now.',
              tone: 'signal'
            }),
            message: createAgentMessage({
              text: 'This concept looks current with the reviewed material in the archive.',
              action
            })
          });
          return;
        }

        if (['propose-hypothesis', 'strengthen-hypothesis', 'challenge-hypothesis', 'rewrite-clearly', 'analyze-patterns'].includes(action)) {
          setAgentModeLabel('Reasoning');
          const { reply, relatedCards } = await runActionWithAgent(action);
          if (reply) {
            const suggestion = ['propose-hypothesis', 'strengthen-hypothesis', 'rewrite-clearly'].includes(action)
              ? resolveAgentHypothesisSuggestion({
                currentHtml: state.hypothesis.html,
                proposedText: reply,
                action
              })
              : null;
            appendAgentArtifacts({
              nextCards: relatedCards.length ? [...state.cards, ...relatedCards] : state.cards,
              nextHypothesisHtml: suggestion?.nextHypothesisHtml || state.hypothesis.html,
              versionSummary: suggestion?.versionSummary || '',
              comment: createAgentComment({
                title: action === 'challenge-hypothesis'
                  ? 'Agent challenge'
                  : action === 'analyze-patterns'
                    ? 'Pattern analysis'
                    : suggestion?.commentTitle || 'Agent reasoning',
                body: suggestion?.commentBody || reply,
                tone: action === 'challenge-hypothesis' ? 'warning' : 'signal',
                anchorText: truncate(stripHtml(state.hypothesis.html), 80),
                kind: suggestion?.applied === false ? 'hypothesis-suggestion' : 'note',
                status: suggestion?.applied === false ? 'pending' : 'active',
                caption: suggestion?.commentCaption || '',
                suggestedHtml: suggestion?.applied === false ? textToHtml(reply) : ''
              }),
              message: createAgentMessage({
                text: suggestion?.messageText || reply,
                action: inferPartnerFollowUpAction({
                  text: suggestion?.messageText || reply,
                  suggestedCards: relatedCards,
                  action
                }),
                suggestedCards: relatedCards
              })
            });
            appendWorkbenchEvents(createWorkbenchEvent({
              type: 'agent_reasoning_completed',
              actor: 'agent',
              summary: `Agent completed ${action}.`,
              payload: { action, relatedCount: relatedCards.length }
            }));
            return;
          }
        }

        if (action === 'suggest-open-questions') {
          const localQuestions = buildLocalQuestionCards({ library: materialLibrary, state });
          if (localQuestions.length > 0) {
            appendAgentArtifacts(buildChangeDraftResult(
              'question',
              localQuestions,
              buildWorkbenchDraftMessage({
                kind: 'question',
                cards: localQuestions,
                provenance: 'material already in the archive'
              }),
              'Review them before adding them to the concept.'
            ));
            return;
          }
        }

        const fallbackResult = buildQuickActionResult(action, state, materialLibrary);
        if (['find-supports', 'find-contradictions', 'challenge-hypothesis', 'find-question'].includes(action)) {
          const additions = extractNewCards(state.cards, fallbackResult?.nextCards);
          const fallbackDraft = buildChangeDraftResult(
            action === 'find-contradictions' || action === 'challenge-hypothesis'
              ? 'contradiction'
              : action === 'find-question'
                ? 'question'
                : 'support',
            additions,
            buildLocalDraftFallbackMessage({ action, cards: additions }),
            action === 'find-question'
              ? 'Keep it beside the concept until it earns the next pass.'
              : 'Prepared locally because the richer scout pass was unavailable.'
          );
          if (fallbackDraft) {
            appendAgentArtifacts(fallbackDraft);
            return;
          }
        }
        if (action === 'retrieve-related-sources') {
          const localRelated = buildLocalRelatedSourceCards({ library: materialLibrary, state });
          const fallbackDraft = buildChangeDraftResult(
            'related',
            localRelated,
            buildWorkbenchDraftMessage({
              kind: 'related',
              cards: localRelated,
              provenance: 'the local concept material'
            }),
            'Review them before adding them to the concept.'
          );
          if (fallbackDraft) {
            appendAgentArtifacts(fallbackDraft);
            return;
          }
        }
        appendAgentArtifacts(fallbackResult);
      } catch (error) {
        setAgentError(error?.response?.data?.error || 'Agent action failed, falling back to local reasoning.');
        if (action === 'retrieve-related-sources') {
          const relatedCards = buildLocalRelatedSourceCards({ library: materialLibrary, state });
          const fallbackDraft = buildChangeDraftResult(
            'related',
            relatedCards,
            buildWorkbenchDraftMessage({
              kind: 'related',
              cards: relatedCards,
              provenance: 'local material',
              unavailableReason: 'The richer scout pass was unavailable.'
            }),
            'Review them before adding them to the concept.'
          );
          if (fallbackDraft) {
            appendAgentArtifacts(fallbackDraft);
            return;
          }
        }
        if (action === 'suggest-open-questions') {
          const localQuestions = buildLocalQuestionCards({ library: materialLibrary, state });
          const fallbackDraft = buildChangeDraftResult(
            'question',
            localQuestions,
            buildWorkbenchDraftMessage({
              kind: 'question',
              cards: localQuestions,
              provenance: 'local material',
              unavailableReason: 'The richer scout pass was unavailable.'
            }),
            'Review them before adding them to the concept.'
          );
          if (fallbackDraft) {
            appendAgentArtifacts(fallbackDraft);
            return;
          }
        }
        const fallbackResult = buildQuickActionResult(action, state, materialLibrary);
        if (['find-supports', 'find-contradictions', 'challenge-hypothesis', 'find-question'].includes(action)) {
          const additions = extractNewCards(state.cards, fallbackResult?.nextCards);
          const fallbackDraft = buildChangeDraftResult(
            action === 'find-contradictions' || action === 'challenge-hypothesis'
              ? 'contradiction'
              : action === 'find-question'
                ? 'question'
                : 'support',
            additions,
            buildLocalDraftFallbackMessage({ action, cards: additions }),
            action === 'find-question'
              ? 'Keep it beside the concept until it earns the next pass.'
              : 'Prepared locally because the richer scout pass was unavailable.'
          );
          if (fallbackDraft) {
            appendAgentArtifacts(fallbackDraft);
            return;
          }
        }
        appendAgentArtifacts(fallbackResult);
      } finally {
        setAgentModeLabel('');
        setAgentBusy(false);
      }
    };
    return execute();
  }, [appendAgentArtifacts, appendWorkbenchEvents, freshness.freshCards, freshness.isStale, freshness.summary, materialLibrary, runActionWithAgent, scoutLibrarySuggestions, state]);

  const sendAgentMessage = useCallback(async (message) => {
    const safeMessage = clean(message);
    if (!safeMessage) return;
    setAgentBusy(true);
    setAgentError('');
    setAgentModeLabel('Thinking');
    appendWorkbenchEvents(createWorkbenchEvent({
      type: 'chat_user_message',
      actor: 'user',
      summary: 'Sent a workbench chat message.',
      payload: { text: truncate(safeMessage, 200) }
    }));

    setState((previous) => ({
      ...previous,
      agent: {
        ...previous.agent,
        messages: [...previous.agent.messages, createAgentMessage({ role: 'user', text: safeMessage })]
      }
    }));

    try {
      const continuationAction = resolveFollowUpQuickAction({
        message: safeMessage,
        messages: state.agent.messages
      });
      if (continuationAction === 'restructure-stream') {
        const lastAssistant = getLastAgentMessageByRole(state.agent.messages, 'assistant');
        const recentCards = Array.isArray(lastAssistant?.suggestedCards) && lastAssistant.suggestedCards.length > 0
          ? lastAssistant.suggestedCards
          : state.cards.filter((card) => clean(card.origin).toLowerCase() === 'agent').slice(-3);
        const { nextCards, reply } = buildRestructuredCards(recentCards.slice(0, 3));

        setState((previous) => {
          if (!nextCards.length) {
            return {
              ...previous,
              agent: {
                ...previous.agent,
                messages: [
                  ...previous.agent.messages,
                  createAgentMessage({
                    text: 'I tried to sort the last pass, but there is not enough fresh material in the stream yet. Ask me to pull in more and I will keep going.',
                    action: 'continue'
                  })
                ]
              }
            };
          }

          const replacementMap = new Map(nextCards.map((card) => [String(card.id), card]));
          const mergedCards = previous.cards.map((card) => replacementMap.get(String(card.id)) || card);

          return {
            ...previous,
            cards: mergedCards,
            importedSourceKeys: [
              ...new Set([
                ...previous.importedSourceKeys,
                ...nextCards.map((card) => card.sourceKey).filter(Boolean)
              ])
            ],
            agent: {
              ...previous.agent,
              messages: [
                ...previous.agent.messages,
                createAgentMessage({
                  text: reply,
                  action: inferPartnerFollowUpAction({
                    text: reply,
                    suggestedCards: nextCards,
                    action: 'continue'
                  }),
                  suggestedCards: nextCards
                })
              ]
            }
          };
        });
        appendWorkbenchEvents(createWorkbenchEvent({
          type: 'chat_agent_reply',
          actor: 'agent',
          summary: 'Sorted the latest agent suggestions into workbench lanes.',
          payload: { text: truncate(reply, 240), suggestedCount: nextCards.length }
        }));
        return;
      }
      if (continuationAction === 'find-supports') {
        const scoutCards = await scoutLibrarySuggestions('support');
        const reply = scoutCards.length > 0
          ? buildWorkbenchDraftMessage({
            kind: 'support',
            cards: scoutCards,
            provenance: 'your archive'
          })
          : 'I kept digging, but this pass did not surface anything sharp enough to move. Give me one source name or phrase and I will keep going.';

        if (scoutCards.length > 0) {
          appendAgentArtifacts(buildChangeDraftResult(
            'support',
            scoutCards,
            reply,
            'Review them before they land in the concept.'
          ));
        } else {
          setState((previous) => ({
            ...previous,
            agent: {
              ...previous.agent,
              messages: [
                ...previous.agent.messages,
                createAgentMessage({
                  text: reply,
                  action: inferPartnerFollowUpAction({
                    text: reply,
                    suggestedCards: scoutCards,
                    action: 'continue'
                  }),
                  suggestedCards: scoutCards
                })
              ]
            }
          }));
        }
        appendWorkbenchEvents(createWorkbenchEvent({
          type: 'chat_agent_reply',
          actor: 'agent',
          summary: 'Continued the previous retrieval thread.',
          payload: { text: truncate(reply, 240), suggestedCount: scoutCards.length }
        }));
        return;
      }

      const history = buildAgentChatHistory(state.agent.messages);
      const response = await chatWithAgent({
        message: buildAgentRequestMessage({
          message: safeMessage,
          messages: state.agent.messages
        }),
        history,
        context: concept?._id ? { type: 'concept', id: concept._id } : null,
        limit: 6
      });
      const reply = sanitizeAgentReplyText(response?.reply) || 'No reply generated.';
      const suggestedCards = Array.isArray(response?.relatedItems)
        ? response.relatedItems.slice(0, 3).map((item) => ({
          id: createId('card'),
          sourceKey: `${clean(item.type)}:${clean(item.id || item.title)}`,
          zone: 'workspace',
          type: sentenceCase(item.type || 'Agent suggestion'),
          title: clean(item.title) || 'Related material',
          content: clean(item.snippet || item.title || item.id),
          source: 'Agent related item',
          sourcePath: '',
          whyItMatters: 'Returned by the concept-aware agent chat response.',
          confidence: 'Suggested',
          strength: 'Medium',
          agentAnnotation: '',
          relatedHypothesisLabel: '',
          origin: 'agent',
          tags: ['agent'],
          createdAt: new Date().toISOString()
        }))
        : [];

      setState((previous) => ({
        ...previous,
        agent: {
          ...previous.agent,
          messages: [
            ...previous.agent.messages,
            createAgentMessage({
              text: reply,
              action: inferPartnerFollowUpAction({
                text: reply,
                suggestedCards,
                action: 'chat'
              }),
              suggestedCards
            })
          ]
        }
      }));
      appendWorkbenchEvents(createWorkbenchEvent({
        type: 'chat_agent_reply',
        actor: 'agent',
        summary: 'Received an agent reply.',
        payload: { text: truncate(reply, 240), suggestedCount: suggestedCards.length }
      }));
    } catch (error) {
      const fallback = buildLocalChatReply({
        message: safeMessage,
        state,
        library: materialLibrary
      });
      setAgentError(error?.response?.data?.error || 'Fell back to local reasoning because the agent request failed.');
      setState((previous) => ({
        ...previous,
        agent: {
          ...previous.agent,
          messages: [
            ...previous.agent.messages,
            createAgentMessage({
              text: sanitizeAgentReplyText(fallback.reply),
              action: inferPartnerFollowUpAction({
                text: fallback.reply,
                suggestedCards: fallback.suggestedCards,
                action: 'chat-fallback'
              }),
              suggestedCards: fallback.suggestedCards
            })
          ]
        }
      }));
      appendWorkbenchEvents(createWorkbenchEvent({
        type: 'chat_agent_fallback',
        actor: 'agent',
        summary: 'Used local fallback reasoning for chat.',
        payload: { text: truncate(fallback.reply, 240), suggestedCount: fallback.suggestedCards.length }
      }));
    } finally {
      setAgentModeLabel('');
      setAgentBusy(false);
    }
  }, [appendAgentArtifacts, appendWorkbenchEvents, concept?._id, materialLibrary, scoutLibrarySuggestions, state]);

  const setConflictChoice = useCallback((section, value) => {
    setConflictState((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        choices: {
          ...previous.choices,
          [section]: value
        },
        error: ''
      };
    });
  }, []);

  const applyConflictResolution = useCallback(async (mode = 'merge') => {
    if (!conceptKey) return false;

    const conflict = conflictState;
    if (!conflict) return false;

    const resolvedState = mode === 'remote'
      ? conflict.remoteState
      : mode === 'local'
        ? conflict.localState
        : normalizeLoadedState(
          mergeWorkbenchStates(conflict.localState, conflict.remoteState, conflict.choices),
          conflict.remoteState
        );

    setConflictState((previous) => previous ? { ...previous, saving: true, error: '' } : previous);
    try {
      const response = await updateConceptIdeaWorkbench(conceptKey, resolvedState, {
        baseRevision: conflict.remoteRevision
      });
      setState(resolvedState);
      lastPersistedStateRef.current = JSON.stringify(resolvedState);
      setServerRevision(Number(response?.revision || conflict.remoteRevision));
      if (Array.isArray(response?.events)) {
        setEventLog(response.events);
      }
      setConflictState(null);
      setSyncError('');
      appendWorkbenchEvents(createWorkbenchEvent({
        type: 'conflict_resolved',
        actor: 'user',
        summary: mode === 'remote'
          ? 'Accepted the newer server version.'
          : mode === 'local'
            ? 'Saved the local workbench over the newer server version.'
            : 'Merged local and server workbench changes.',
        payload: { mode }
      }));
      return true;
    } catch (error) {
      if (Number(error?.response?.status) === 409 && error?.response?.data?.ideaWorkbench) {
        const nextRemoteState = normalizeLoadedState(error.response.data.ideaWorkbench, resolvedState);
        const nextRemoteRevision = Number(error?.response?.data?.revision || conflict.remoteRevision);
        if (Array.isArray(error?.response?.data?.events)) {
          setEventLog(error.response.data.events);
        }
        setServerRevision(nextRemoteRevision);
        setConflictState((previous) => previous ? {
          ...previous,
          localState: resolvedState,
          remoteState: nextRemoteState,
          remoteRevision: nextRemoteRevision,
          saving: false,
          error: 'The workbench changed again while you were resolving it. Review the newest server version and save once more.'
        } : previous);
        setSyncError('Workbench changed elsewhere. Review and merge before saving.');
        return false;
      }

      const message = error?.response?.data?.error || 'Failed to save the resolved workbench.';
      setConflictState((previous) => previous ? { ...previous, saving: false, error: message } : previous);
      setSyncError(message);
      return false;
    }
  }, [appendWorkbenchEvents, conceptKey, conflictState]);

  const dismissConflict = useCallback(() => {
    if (!conflictState) return;
    setState(conflictState.remoteState);
    lastPersistedStateRef.current = JSON.stringify(conflictState.remoteState);
    setServerRevision(conflictState.remoteRevision);
    setSyncError('');
    setConflictState(null);
  }, [conflictState]);

  const dispatchConceptAction = useCallback((type, payload = {}) => (
    dispatchTypedConceptAction({
      type,
      payload,
      modelActions: {
        runQuickAction,
        snapshotHypothesis
      },
      createNotebookDraft: (nextPayload = {}) => {
        if (typeof onCreateNotebookDraft !== 'function') return undefined;
        return onCreateNotebookDraft({
          ...nextPayload,
          concept,
          state,
          currentMaturity,
          hypothesisVersion
        });
      },
      createConceptHandoff: (nextPayload = {}) => {
        if (typeof onCreateConceptHandoff !== 'function') return undefined;
        return onCreateConceptHandoff({
          ...nextPayload,
          concept,
          state,
          currentMaturity,
          hypothesisVersion
        });
      }
    })
  ), [
    concept,
    currentMaturity,
    hypothesisVersion,
    onCreateConceptHandoff,
    onCreateNotebookDraft,
    runQuickAction,
    snapshotHypothesis,
    state
  ]);

  return {
    conceptKey,
    materialLoading,
    materialError,
    agentBusy,
    agentError,
    agentModeLabel,
    syncError,
    serverRevision,
    eventLog,
    conflict: conflictState,
    materialLibrary,
    state,
    counts,
    currentMaturity,
    hypothesisVersion,
    importableCounts,
    freshness,
    changeDrafts: pendingChangeDrafts,
    actions: {
      setHeaderField,
      setWorkspaceDraft,
      setWorkspaceDraftType,
      addWorkspaceCard,
      importMaterialCard,
      addSuggestedCard,
      insertCardIntoWorkspaceDraft,
      insertCardIntoHypothesis,
      moveCard,
      deleteCard,
      tagCard,
      updateHypothesisHtml,
      acceptAgentComment,
      dismissAgentComment,
      applyChangeDraft,
      dismissChangeDraft,
      markReviewed,
      snapshotHypothesis,
      dispatchConceptAction,
      runQuickAction,
      sendAgentMessage,
      setConflictChoice,
      applyConflictResolution,
      dismissConflict
    }
  };
};

export default useIdeaWorkbenchModel;
