import { wikiPagePath } from './wikiFeatureFlags';
import { normalizeSpaces } from './editorialText';

const CREATED_FROM_TYPES = new Set([
  'wiki_index',
  'idea',
  'question',
  'highlight',
  'article',
  'notebook',
  'concept',
  'sources',
  'paste',
  'search',
  'thought_partner'
]);

const SOURCE_TYPES = new Set(['article', 'highlight', 'notebook', 'concept', 'question', 'memory', 'external']);

const titleFromText = (value = '', fallback = 'Untitled wiki page') => {
  const clean = normalizeSpaces(value);
  return clean ? clean.slice(0, 120) : fallback;
};

const normalizeType = (value, fallback, allowed) => {
  const candidate = String(value || '').trim();
  return allowed.has(candidate) ? candidate : fallback;
};

export const buildWikiSourceRef = (source = {}) => ({
  type: normalizeType(source.type || source.sourceType, 'external', SOURCE_TYPES),
  objectId: source.objectId || source._id || source.id || null,
  parentObjectId: source.parentObjectId || source.parentId || source.articleId || null,
  title: titleFromText(source.title || source.label, ''),
  snippet: String(source.snippet || source.text || source.content || '').trim().slice(0, 1000),
  url: String(source.url || source.href || '').trim(),
  citationLabel: String(source.citationLabel || source.locator || '').trim(),
  addedBy: source.addedBy || 'user'
});

export const buildWikiCreatePayload = ({
  type = 'idea',
  title = '',
  text = '',
  label = '',
  objectId = null,
  objectIds = [],
  pageType = 'topic',
  sourceScope = 'entire_library',
  source = null,
  evidencePreflight = false
} = {}) => {
  const resolvedText = String(text || '').trim();
  const resolvedTitle = titleFromText(title || label || resolvedText);
  const resolvedType = normalizeType(type, resolvedText ? 'idea' : 'wiki_index', CREATED_FROM_TYPES);
  const payload = {
    title: resolvedTitle,
    pageType,
    sourceScope,
    createdFrom: {
      type: resolvedType,
      objectId,
      objectIds: Array.isArray(objectIds) ? objectIds : [],
      text: resolvedText,
      label: label || resolvedTitle
    }
  };

  if (source) {
    payload.initialSourceRef = buildWikiSourceRef(source);
    payload.sourceScope = 'selected_sources';
  }

  if (evidencePreflight) payload.evidencePreflight = true;

  return payload;
};

export const openWikiDraft = ({ navigate, pageId }) => {
  navigate(wikiPagePath(pageId, '&draft=1'));
};

/* What you kept becomes a page: a kept thread, or kept passages that share
   a subject. Its passages are quoted in order, each cited, and left as a
   draft for you to write around. The page remembers where it came from by
   its label, so the Wiki can tell what already has one. */
const THREAD_LABEL = 'thread:';
const SUBJECT_LABEL = 'kept-subject:';
const labelled = prefix => page => {
  const label = String(page?.createdFrom?.label || '');
  return label.startsWith(prefix) ? label.slice(prefix.length) : '';
};
export const threadOfPage = labelled(THREAD_LABEL);
export const subjectOfPage = labelled(SUBJECT_LABEL);

const keptPagePayload = ({ label, title, marks = [] }) => ({
  title,
  pageType: 'topic',
  sourceScope: 'selected_sources',
  body: marks.map(mark => `“${mark.text}” (${mark.title})`).join('\n\n'),
  initialSourceRefs: marks.map(mark => buildWikiSourceRef({ type: 'highlight', objectId: mark.highlightId, articleId: mark.articleId, title: mark.title, text: mark.text })),
  createdFrom: { type: 'highlight', objectIds: marks.map(mark => mark.highlightId), text: '', label }
});
export const buildThreadPagePayload = ({ threadId, ...thread }) => keptPagePayload({ ...thread, label: `${THREAD_LABEL}${threadId}` });
export const buildSubjectPagePayload = ({ subject, ...offer }) => keptPagePayload({ ...offer, label: `${SUBJECT_LABEL}${subject}` });
