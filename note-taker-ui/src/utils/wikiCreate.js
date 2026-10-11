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
