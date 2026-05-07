const { chatComplete, isTextGenerationConfigured } = require('../ai/hfTextClient');

/**
 * wikiAskService — answers a user's question about a single wiki page using
 * the page body + attached source refs as context. Returns a TipTap doc
 * whose paragraphs/bullets are wrapped in the same `claim` mark the
 * maintenance pipeline emits, so the existing citation popover works on
 * answer text without any extra plumbing.
 *
 * Falls back to a deterministic stub when the HF client is unconfigured
 * (dev) so the round-trip is testable end-to-end.
 */

const MAX_PAGE_TEXT = 6000;
const MAX_SOURCE_TEXT = 800;
const MAX_QUESTION = 500;
const MAX_ANSWER_PARAGRAPHS = 6;

const asString = (value = '') => String(value || '').trim();

const truncate = (value = '', limit = 1000) => {
  const text = asString(value).replace(/\s+/g, ' ');
  return text.length > limit ? `${text.slice(0, limit - 1).trim()}...` : text;
};

const toPlainText = (node) => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(toPlainText).filter(Boolean).join(' ');
  if (typeof node !== 'object') return '';
  const own = typeof node.text === 'string' ? node.text : '';
  const child = Array.isArray(node.content) ? toPlainText(node.content) : '';
  return [own, child].filter(Boolean).join(' ').trim();
};

let claimSeed = 0;
const claimMark = (citationIndexes = []) => {
  claimSeed += 1;
  const indexes = Array.isArray(citationIndexes)
    ? citationIndexes.map(Number).filter(Number.isFinite).filter(index => index > 0).slice(0, 6)
    : [];
  const support = indexes.length === 0 ? 'unsupported' : indexes.length === 1 ? 'partial' : 'supported';
  return {
    type: 'claim',
    attrs: {
      claimId: `ask-${Date.now()}-${claimSeed}`,
      support,
      citationIndexes: indexes
    }
  };
};

const claimParagraph = (text, citationIndexes = []) => ({
  type: 'paragraph',
  content: [{
    type: 'text',
    text: asString(text) || ' ',
    marks: [claimMark(citationIndexes)]
  }]
});

const buildSourceList = (sourceRefs = []) => {
  const list = Array.isArray(sourceRefs) ? sourceRefs.slice(0, 12) : [];
  return list.map((source, index) => ({
    index: index + 1,
    title: truncate(source?.title, 240) || 'Untitled source',
    snippet: truncate(source?.snippet || source?.text, MAX_SOURCE_TEXT),
    url: truncate(source?.url, 600),
    type: asString(source?.type) || 'source'
  }));
};

const buildSystemPrompt = ({ page, sources, question }) => {
  const sourceLines = sources
    .map(source => `[${source.index}] ${source.type.toUpperCase()} — ${source.title}\n${source.snippet || '(no snippet)'}${source.url ? `\n(${source.url})` : ''}`)
    .join('\n\n');
  const pageText = truncate(toPlainText(page.body), MAX_PAGE_TEXT);
  return `You are answering a reader's question about a single wiki page in a personal knowledge base.

The page is titled "${truncate(page.title, 200) || 'Untitled'}" and reads as follows:
"""
${pageText || '(empty page)'}
"""

The reader has attached the following sources, each prefixed with a 1-based index:
${sourceLines || '(no attached sources)'}

The reader's question:
"""
${truncate(question, MAX_QUESTION)}
"""

Respond with a JSON object only. Schema:
{
  "paragraphs": [
    { "text": "single answer paragraph (1-3 sentences)", "citationIndexes": [1, 2] }
  ],
  "citationIndexesUsed": [1, 2]
}

Rules:
- Output 1 to ${MAX_ANSWER_PARAGRAPHS} paragraphs.
- Every paragraph must be self-contained prose (no markdown, no headings).
- citationIndexes per paragraph point to the reader's attached sources only.
- Use [] for citationIndexes when the paragraph relies only on the page text or general reasoning.
- Never invent sources or indexes outside the attached set.
- Never include trailing "[1, 2]" suffixes inside the text — citations live in the JSON, not the prose.

Return only the JSON, no prose around it.`;
};

const extractJson = (raw = '') => {
  const text = asString(raw);
  if (!text) return null;
  try { return JSON.parse(text); } catch (_err) { /* try fenced */ }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try { return JSON.parse(fenced[1]); } catch (_err) { /* try slice */ }
  }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch (_err) { return null; }
  }
  return null;
};

const buildFallbackAnswer = ({ page, sources, question }) => {
  const sourceCitations = sources.slice(0, 2).map(source => source.index);
  const intro = sources.length
    ? `Drawing on this page and ${sources.length} attached source${sources.length === 1 ? '' : 's'}, here is the most direct take.`
    : `This page does not yet have attached sources, so the answer is grounded only in the page text.`;
  const reflection = `You asked: "${truncate(question, 200)}". The most relevant material in the page concerns "${truncate(page.title, 80) || 'this topic'}".`;
  const followUp = sources.length
    ? `For more depth, open the cited source${sources.length === 1 ? '' : 's'} or run maintenance to widen the source set.`
    : 'Attach a source from the AI/Sources panel and ask again to get a citable answer.';
  return {
    paragraphs: [
      { text: intro, citationIndexes: sourceCitations },
      { text: reflection, citationIndexes: [] },
      { text: followUp, citationIndexes: [] }
    ],
    citationIndexesUsed: sourceCitations
  };
};

const normalizeAnswerSchema = (raw, fallback) => {
  if (!raw || typeof raw !== 'object') return fallback;
  const paragraphs = Array.isArray(raw.paragraphs) ? raw.paragraphs : [];
  const cleaned = paragraphs
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const text = truncate(entry.text, 800).replace(/\[[0-9,\s]+\]\s*$/g, '').trim();
      if (!text) return null;
      const citationIndexes = Array.isArray(entry.citationIndexes)
        ? entry.citationIndexes.map(Number).filter(Number.isFinite).filter(idx => idx > 0).slice(0, 6)
        : [];
      return { text, citationIndexes };
    })
    .filter(Boolean)
    .slice(0, MAX_ANSWER_PARAGRAPHS);
  if (!cleaned.length) return fallback;
  const flat = new Set();
  cleaned.forEach(entry => entry.citationIndexes.forEach(idx => flat.add(idx)));
  return {
    paragraphs: cleaned,
    citationIndexesUsed: Array.from(flat).sort((a, b) => a - b)
  };
};

const docFromAnswer = (answer) => ({
  type: 'doc',
  content: answer.paragraphs.map(entry => claimParagraph(entry.text, entry.citationIndexes))
});

/**
 * Answer a question against a single wiki page.
 *
 * @param {object} params
 * @param {object} params.page         The mongoose wiki page document.
 * @param {string} params.question     User's question (raw).
 * @param {object} [params.aiClient]   Optional override for the chat client (used in tests).
 * @returns {Promise<{answer:object,citationIndexesUsed:number[],model:string,status:'answered'|'failed',errorMessage:string}>}
 */
const askWikiPage = async ({ page, question, aiClient } = {}) => {
  const trimmed = truncate(question, MAX_QUESTION);
  if (!trimmed) {
    return {
      answer: { type: 'doc', content: [claimParagraph('Ask a question about this page to get a source-backed answer.', [])] },
      citationIndexesUsed: [],
      model: 'stub',
      status: 'failed',
      errorMessage: 'Question is empty.'
    };
  }
  const sources = buildSourceList(page?.sourceRefs);
  const fallback = buildFallbackAnswer({ page, sources, question: trimmed });

  const chatClient = aiClient?.chatComplete || chatComplete;
  const isConfigured = aiClient?.isTextGenerationConfigured || isTextGenerationConfigured;

  if (!isConfigured()) {
    return {
      answer: docFromAnswer(fallback),
      citationIndexesUsed: fallback.citationIndexesUsed,
      model: 'stub',
      status: 'answered',
      errorMessage: ''
    };
  }

  const systemPrompt = buildSystemPrompt({ page, sources, question: trimmed });
  let completion = null;
  try {
    completion = await chatClient({
      route: 'artifact_draft',
      maxTokens: 1200,
      temperature: 0.3,
      reasoningEffort: 'medium',
      responseFormat: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: trimmed }
      ]
    });
  } catch (error) {
    return {
      answer: docFromAnswer(fallback),
      citationIndexesUsed: fallback.citationIndexesUsed,
      model: 'fallback',
      status: 'failed',
      errorMessage: String(error?.message || error || 'Ask request failed.').slice(0, 400)
    };
  }
  const raw = typeof completion === 'string' ? completion : completion?.text || '';
  const parsed = extractJson(raw);
  const answer = normalizeAnswerSchema(parsed, fallback);
  return {
    answer: docFromAnswer(answer),
    citationIndexesUsed: answer.citationIndexesUsed,
    model: completion?.model || 'hf',
    status: 'answered',
    errorMessage: ''
  };
};

module.exports = {
  askWikiPage,
  __testables: {
    buildSourceList,
    buildSystemPrompt,
    extractJson,
    normalizeAnswerSchema,
    buildFallbackAnswer,
    docFromAnswer,
    claimParagraph
  }
};
