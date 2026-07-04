import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../ui';
import {
  askWikiPage,
  getWikiBacklinks,
  getWikiPage,
  getWikiPageMarkdown,
  listWikiPages,
  maintainWikiPage,
  promoteWikiDiscussion,
  streamAskWikiPage,
  updateWikiPage
} from '../../api/wiki';
import { getConnectionsForItem } from '../../api/connections';
import { trackWikiQaPromoted, trackWikiReadModePageView } from '../../utils/wikiAnalytics';
import { wikiPagePath } from '../../utils/wikiFeatureFlags';
import ClaimCitationPopover from './ClaimCitationPopover';
import renderTiptapDoc, { citationAnchorId, extractTocItems, firstParagraphText } from './renderTiptapDoc';
import { cleanWikiLinkSnippetText } from './wikiLinkText';
import { buildQualityState } from './wikiQuality';
import AgentTicker from '../agent/AgentTicker';
import {
  countWikiClaims,
  countWikiPageWords,
  countWikiSources
} from './wikiPageMetrics';
import {
  formatQualityReviewReasons,
  isPageQualityBlocked,
  normalizeQualityReview
} from './wikiPageQualityReview';
import {
  diffClaimLedgerSnapshots,
  diffClaimSnapshots,
  extractClaimTexts,
  getLastVisitState,
  recordVisit
} from './wikiVisitTracker';
import { SUPPORT_STATES } from './extensions/Claim';
import { AGENT_DISPLAY_NAME } from '../../constants/agentIdentity';
import { useSystemStatusControls } from '../../system/SystemStatusContext';
import WikiEdgarWatchControl, { isCompanyDossierPage } from './WikiEdgarWatchControl';
import WikiTranscriptWatchControl from './WikiTranscriptWatchControl';
import WikiGitHubRepoWatchControl, { isRepoDossierPage } from './WikiGitHubRepoWatchControl';

const WikiAskComposer = lazy(() => import('./WikiAskComposer'));
const WikiAutolinkSuggestions = lazy(() => import('./WikiAutolinkSuggestions'));
const WikiBuildPageComposer = lazy(() => import('./WikiBuildPageComposer'));
const WikiChangesSinceLastVisit = lazy(() => import('./WikiChangesSinceLastVisit'));
const WikiDiscussions = lazy(() => import('./WikiDiscussions'));

const emptyDoc = { type: 'doc', content: [{ type: 'paragraph' }] };

const labelFor = (value = '') => String(value || '')
  .replace(/_/g, ' ')
  .replace(/\b\w/g, char => char.toUpperCase());

const normalizeId = (value) => String(value || '').trim();
const idsMatch = (a, b) => normalizeId(a) && normalizeId(a) === normalizeId(b);

const wikiMaintenanceSystemReceipt = (pageId, { issueCount = 0, pageTitle = '' } = {}) => {
  const target = pageTitle || `@wiki:${pageId}`;
  return {
    title: 'Wiki maintenance',
    summary: issueCount
      ? `${issueCount} issue${issueCount === 1 ? '' : 's'} surfaced on ${target}.`
      : `Maintenance settled for ${target}.`,
    status: issueCount ? 'needs_review' : 'completed',
    href: `/wiki/workspace?page=${encodeURIComponent(pageId)}`
  };
};

const promotionPosturePath = (type = '', sourceId = '') => {
  const safeType = normalizeId(type).toLowerCase();
  const safeId = normalizeId(sourceId);
  if (!safeId) return '';
  const params = new URLSearchParams();
  if (safeType === 'question') {
    params.set('tab', 'questions');
    params.set('questionId', safeId);
  } else if (safeType === 'notebook' || safeType === 'note') {
    params.set('tab', 'notebook');
    params.set('entryId', safeId);
  } else {
    params.set('tab', 'concepts');
    params.set('concept', safeId);
  }
  return `/think?${params.toString()}`;
};

const promotionWitnessFromSearch = (search = '') => {
  const params = new URLSearchParams(search || '');
  const promotedType = normalizeId(params.get('promoted')).toLowerCase();
  if (!promotedType) return null;
  const from = normalizeId(params.get('from')).toLowerCase();
  const sourceId = normalizeId(params.get('sourceId'));
  const sourceTitle = normalizeId(params.get('sourceTitle'));
  const receipt = normalizeId(params.get('receipt')).toLowerCase();
  const transition = normalizeId(params.get('transition')).toLowerCase();
  const readableType = promotedType === 'question' ? 'Question' : promotedType === 'notebook' || promotedType === 'note' ? 'Notebook page' : 'Concept';
  return {
    type: readableType,
    promotedType,
    from: from === 'think' ? 'Think' : labelFor(from || 'workspace'),
    sourceId,
    sourceTitle,
    receipt: receipt || 'settled',
    transition: transition || 'register',
    sourcePath: promotionPosturePath(
      promotedType,
      promotedType === 'concept' ? sourceTitle || sourceId : sourceId
    )
  };
};

const sourceIdsForCitationIds = ({ citationIds = [], citations = [] } = {}) => (
  (citations || [])
    .filter(citation => (citationIds || []).some(id => idsMatch(id, citation._id || citation.id)))
    .map(citation => citation.sourceRefId || citation.sourceId)
    .filter(Boolean)
);

const claimContradictsSource = ({ claim, source, citations = [] }) => {
  if (!claim || !source) return false;
  const sourceId = source._id || source.id;
  const contradictionCitationIds = Array.isArray(claim.contradictedByCitationIds)
    ? claim.contradictedByCitationIds
    : [];
  return sourceIdsForCitationIds({ citationIds: contradictionCitationIds, citations })
    .some(id => idsMatch(id, sourceId));
};

const claimMatchesSource = ({ claim, source, citations = [] }) => {
  if (!claim || !source) return false;
  const sourceId = source._id || source.id;
  if ((claim.sourceRefIds || []).some(id => idsMatch(id, sourceId))) return true;
  const supportingSourceIds = sourceIdsForCitationIds({ citationIds: claim.citationIds || [], citations });
  if (supportingSourceIds.some(id => idsMatch(id, sourceId))) return true;
  return claimContradictsSource({ claim, source, citations });
};

const parseIndexAttribute = (value = '') => (
  String(value || '')
    .split(',')
    .map(token => Number(token.trim()))
    .filter(Number.isFinite)
    .filter(index => index >= 1)
);

const scrollOptions = () => (
  window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    ? { block: 'start' }
    : { behavior: 'smooth', block: 'start' }
);

const scrollToElementId = (id = '') => {
  const element = id ? document.getElementById(id) : null;
  if (!element) return false;
  element.scrollIntoView?.(scrollOptions());
  element.focus?.({ preventScroll: true });
  return true;
};

const cssEscape = (value = '') => {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return String(value || '').replace(/["\\]/g, '\\$&');
};

const scheduleAfterFirstPaint = (callback) => {
  let frame = 0;
  let idle = 0;
  let timeout = 0;
  let fallback = 0;
  let didRun = false;
  const runCallback = () => {
    if (didRun) return;
    didRun = true;
    if (fallback) window.clearTimeout(fallback);
    callback();
  };
  const run = () => {
    if (typeof window.requestIdleCallback === 'function') {
      idle = window.requestIdleCallback(runCallback, { timeout: 250 });
      return;
    }
    timeout = window.setTimeout(runCallback, 0);
  };
  if (typeof window.requestAnimationFrame === 'function') frame = window.requestAnimationFrame(run);
  else timeout = window.setTimeout(runCallback, 0);
  fallback = window.setTimeout(runCallback, 3000);
  return () => {
    if (frame && typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(frame);
    if (idle && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle);
    if (timeout) window.clearTimeout(timeout);
    if (fallback) window.clearTimeout(fallback);
  };
};

const collectFootnoteCitations = (node, fallbackPrefix = 'body') => {
  const matches = [];
  const walk = (value, path = fallbackPrefix) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach((child, index) => walk(child, `${path}-${index}`));
      return;
    }
    if (typeof value !== 'object') return;
    if (value.type === 'text' && Array.isArray(value.marks)) {
      const claimMark = value.marks.find(mark => mark?.type === 'claim');
      const attrs = claimMark?.attrs || {};
      const indexes = Array.isArray(attrs.citationIndexes) && attrs.citationIndexes.length
        ? attrs.citationIndexes
        : attrs.contradictionIndexes;
      (Array.isArray(indexes) ? indexes : [])
        .map(index => Number(index))
        .filter(index => Number.isFinite(index) && index >= 1)
        .forEach(index => {
          matches.push({
            index,
            claimId: attrs.claimId || '',
            anchorId: citationAnchorId({ claimId: attrs.claimId, citationIndex: index, fallback: path })
          });
        });
    }
    walk(value.content, path);
  };
  walk(node);
  return matches;
};

const collectText = (node) => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(collectText).join(' ');
  if (typeof node !== 'object') return '';
  return [node.text || '', collectText(node.content)].filter(Boolean).join(' ');
};

const normalizeHeadingText = (value = '') => String(value || '')
  .toLowerCase()
  .replace(/[\s\p{Punctuation}]+/gu, ' ')
  .trim();

const stripLeadingDuplicateTitleHeading = (body = emptyDoc, title = '') => {
  const normalizedTitle = normalizeHeadingText(title);
  if (!body || !Array.isArray(body.content) || !normalizedTitle) return body || emptyDoc;
  const first = body.content[0];
  if (first?.type !== 'heading') return body;
  const headingText = normalizeHeadingText(collectText(first));
  if (headingText !== normalizedTitle) return body;
  return { ...body, content: body.content.slice(1) };
};

const splitTitleAccent = (title = '') => {
  const text = String(title || '').trim() || 'Untitled Wiki Page';
  const explicitMatch = text.match(/^(.*?)\*([^*]+)\*(.*)$/);
  if (explicitMatch?.[2]?.trim()) {
    return {
      before: explicitMatch[1].trim(),
      accent: explicitMatch[2].trim(),
      after: explicitMatch[3].trim()
    };
  }
  const words = text.match(/\S+/g) || [];
  if (words.length < 2) return { before: '', accent: text, after: '' };
  const stopWords = new Set([
    'a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'into', 'of', 'on', 'or', 'the', 'to', 'with'
  ]);
  const accentIndex = words.reduce((selected, word, index) => {
    const cleaned = word.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleaned.length < 4 || stopWords.has(cleaned)) return selected;
    return index;
  }, words.length - 1);
  return {
    before: words.slice(0, accentIndex).join(' '),
    accent: words[accentIndex],
    after: words.slice(accentIndex + 1).join(' ')
  };
};

const hasInlineWikiLinks = (node) => {
  if (!node) return false;
  if (Array.isArray(node)) return node.some(hasInlineWikiLinks);
  if (typeof node !== 'object') return false;
  if (Array.isArray(node.marks) && node.marks.some(mark => mark?.type === 'wikiLink' && mark?.attrs?.pageId)) return true;
  return hasInlineWikiLinks(node.content);
};

const hasRawWikiSyntax = (node) => {
  if (!node) return false;
  if (typeof node === 'string') return node.includes('[[');
  if (Array.isArray(node)) return node.some(hasRawWikiSyntax);
  if (typeof node !== 'object') return false;
  if (typeof node.text === 'string' && node.text.includes('[[')) return true;
  return hasRawWikiSyntax(node.content);
};

const normalizeRelatedWikiPage = (entry = {}) => {
  if (!entry || typeof entry !== 'object') return null;
  const id = entry.pageId || entry._id || entry.id || entry.targetPageId || entry.targetId || '';
  const title = entry.title || entry.pageTitle || entry.name || entry.targetTitle || entry.label || '';
  if (!id || !title) return null;
  return { _id: id, title };
};

const collectRelatedWikiPages = (page = {}) => {
  const buckets = [
    page?.aiState?.relatedPages,
    page?.relatedPages,
    page?.freshness?.relatedPages,
    page?.graph?.relatedPages
  ];
  return buckets
    .flatMap(value => (Array.isArray(value) ? value : []))
    .map(normalizeRelatedWikiPage)
    .filter(Boolean);
};

const pickFirst = (...values) => values
  .map(value => (value == null ? '' : String(value).trim()))
  .find(Boolean) || '';

const pageMeta = (page = {}) => {
  const value = page || {};
  return (
    value.infobox && typeof value.infobox === 'object' ? value.infobox :
      value.metadata && typeof value.metadata === 'object' ? value.metadata :
        value.meta && typeof value.meta === 'object' ? value.meta :
        {}
  );
};

const listValue = (value, limit = 3) => {
  if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean).slice(0, limit).join(', ');
  return String(value || '').trim();
};

const formatDate = (value) => {
  if (!value) return 'Not reviewed';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not reviewed';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatOptionalDate = (value, fallback = '') => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const hasSharedWikiProvenance = (adoptedFrom = {}) => {
  if (!adoptedFrom || typeof adoptedFrom !== 'object') return false;
  if (adoptedFrom.sample || adoptedFrom.originType === 'starter_pack') return false;
  return Boolean(
    adoptedFrom.originPageId
    || adoptedFrom.originCollectionId
  );
};

const hasStarterPackSampleProvenance = (adoptedFrom = {}) => {
  if (!adoptedFrom || typeof adoptedFrom !== 'object') return false;
  return Boolean(adoptedFrom.sample || adoptedFrom.originType === 'starter_pack' || adoptedFrom.packId);
};

const starterPackAttributionLine = (adoptedFrom = {}) => {
  const title = String(adoptedFrom.originTitle || '').trim();
  return title ? `Starter pack sample · ${title}` : 'Starter pack sample';
};

const adoptedAttributionLine = (adoptedFrom = {}) => {
  const dateLabel = formatOptionalDate(adoptedFrom.adoptedAt);
  return dateLabel
    ? `Adapted from a shared Noeis wiki · ${dateLabel}`
    : 'Adapted from a shared Noeis wiki';
};

const claimHealthCounts = (claims = []) => (
  (Array.isArray(claims) ? claims : []).reduce((counts, claim) => {
    const support = String(claim?.support || 'unsupported').trim() || 'unsupported';
    if (support === 'supported') counts.supported += 1;
    else if (support === 'partial') counts.partial += 1;
    else if (support === 'conflicted' || support === 'contradicted') counts.conflicted += 1;
    else counts.unsupported += 1;
    return counts;
  }, { supported: 0, partial: 0, unsupported: 0, conflicted: 0 })
);

const keyClaimText = (claims = []) => (
  (Array.isArray(claims) ? claims : [])
    .map(claim => claim?.text || claim?.claim || '')
    .find(Boolean) || ''
);

const contradictionCount = (claims = []) => (
  (Array.isArray(claims) ? claims : [])
    .filter(claim => ['conflicted', 'contradicted'].includes(String(claim?.support || '').toLowerCase()))
    .length
);

const cleanSourceText = (value = '') => String(value || '')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/<\/(p|div|li|br)>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, "'")
  .replace(/\s+/g, ' ')
  .trim();

const conciseText = (value = '', limit = 180) => {
  const text = cleanSourceText(value);
  if (text.length <= limit) return text;
  const truncated = text.slice(0, limit).replace(/\s+\S*$/, '').trim();
  return `${truncated || text.slice(0, limit).trim()}...`;
};

const conciseInfoboxText = (value = '', { maxChars = 140, maxWords = 12 } = {}) => {
  const text = cleanSourceText(value);
  if (!text) return '';
  const words = text.split(/\s+/).filter(Boolean);
  const wordLimited = words.length > maxWords
    ? `${words.slice(0, maxWords).join(' ')}...`
    : text;
  if (wordLimited.length <= maxChars) return wordLimited;
  const truncated = wordLimited.slice(0, maxChars).replace(/\s+\S*$/, '').trim();
  return `${truncated || wordLimited.slice(0, maxChars).trim()}...`;
};

const conciseScopeText = (value = '') => conciseInfoboxText(value, { maxChars: 140, maxWords: 12 });

const autoInfoboxSummary = (body) => conciseInfoboxText(firstParagraphText(body), { maxChars: 140, maxWords: 12 });

const sourceExcerpt = (source = {}) => (
  cleanSourceText(source.excerpt || source.snippet || source.summary || source.description || source.text || '')
);

const sourceLibraryPath = (source = {}) => {
  const type = normalizeId(source.type || source.sourceType).toLowerCase();
  const objectId = normalizeId(source.objectId || source.sourceObjectId || source.articleId || source.highlightId);
  const parentObjectId = normalizeId(source.parentObjectId || source.parentArticleId || source.articleId);

  if (type === 'article' && objectId) {
    return `/library?articleId=${encodeURIComponent(objectId)}`;
  }

  if (type === 'highlight' && objectId) {
    const params = new URLSearchParams();
    if (parentObjectId) params.set('articleId', parentObjectId);
    params.set('highlightId', objectId);
    return `/library?${params.toString()}`;
  }

  return '';
};

const citationMatchesSource = (citation = {}, source = {}) => {
  const sourceId = source?._id || source?.id;
  return [
    citation.sourceRefId,
    citation.sourceId,
    citation.sourceRef?._id,
    citation.sourceRef?.id
  ].some(id => idsMatch(id, sourceId));
};

const sourceEvidenceCounts = ({ source = {}, claims = [], citations = [] }) => {
  const explicitCitationCount = Number(source.citationCount ?? source.citationsCount);
  const explicitClaimCount = Number(source.claimCount ?? source.claimsCount);
  const citationCount = (Array.isArray(citations) ? citations : [])
    .filter(citation => citationMatchesSource(citation, source))
    .length;
  const claimCount = (Array.isArray(claims) ? claims : [])
    .filter(claim => claimMatchesSource({ claim, source, citations }))
    .length;
  return {
    citationCount: Number.isFinite(explicitCitationCount) ? Math.max(citationCount, explicitCitationCount) : citationCount,
    claimCount: Number.isFinite(explicitClaimCount) ? Math.max(claimCount, explicitClaimCount) : claimCount
  };
};

const formatSourceCounts = ({ citationCount = 0, claimCount = 0 }) => {
  const parts = [];
  if (citationCount > 0) parts.push(`${citationCount} citation${citationCount === 1 ? '' : 's'}`);
  if (claimCount > 0) parts.push(`${claimCount} claim${claimCount === 1 ? '' : 's'}`);
  return parts.join(' / ');
};

const buildPublicWikiShareUrl = (page = {}) => {
  const pageId = normalizeId(page?._id || page?.id);
  if (!pageId || typeof window === 'undefined') return '';
  return `${window.location.origin}/share/wiki/${encodeURIComponent(pageId)}`;
};

const formatShareReceipt = ({ page = {}, blocked = false } = {}) => {
  const wordCount = countWikiPageWords(page);
  const sourceCount = countWikiSources(page);
  const claimCount = countWikiClaims(page);
  if (blocked) {
    return 'Public copy locked until review clears · private graph sealed';
  }
  return [
    wordCount ? `${wordCount} word${wordCount === 1 ? '' : 's'}` : '',
    sourceCount ? `${sourceCount} reference${sourceCount === 1 ? '' : 's'}` : '',
    claimCount ? `${claimCount} claim${claimCount === 1 ? '' : 's'}` : '',
    'private graph sealed'
  ].filter(Boolean).join(' · ');
};

const formatShareReviewSummary = (page = {}) => {
  const review = normalizeQualityReview(page);
  const reasons = formatQualityReviewReasons(review);
  if (reasons.length === 1) return reasons[0];
  if (reasons.length > 1) return `${reasons.length} review items need attention before this can be public.`;
  return 'Review items need attention before this can be public.';
};

const countPageSources = (page = {}) => countWikiSources(page);

const countPageClaims = (page = {}) => countWikiClaims(page);

const countPageWords = (page = {}, body = null) => countWikiPageWords(page, body);

const sectionTitles = (body) => extractTocItems(body || emptyDoc)
  .filter(item => item.level === 2)
  .map(item => item.title)
  .slice(0, 3)
  .join(', ');

const buildInfoboxRows = ({ page = {}, sourceCount = 0, claimCount = 0, wordCount = 0, lastReviewed = 'Not reviewed' }) => {
  const value = page || {};
  const resolvedSourceCount = Math.max(Number(sourceCount) || 0, countPageSources(value));
  const resolvedClaimCount = Math.max(Number(claimCount) || 0, countPageClaims(value));
  const resolvedWordCount = Math.max(Number(wordCount) || 0, countPageWords(value));
  const meta = pageMeta(value);
  const type = String(value.pageType || 'topic').toLowerCase();
  const firstSource = Array.isArray(value.sourceRefs) ? value.sourceRefs[0] || {} : {};
  const summaryText = conciseInfoboxText(meta.summary || meta.scope || '') || autoInfoboxSummary(value.body);
  const sectionText = sectionTitles(value.body);
  const scopeText = conciseScopeText(meta.scope || meta.summary || '')
    || (sectionText ? `Covers ${sectionText}.` : 'No explicit scope yet.');
  // Word count moved here from the now-stripped page-header "facts row" so
  // the number survives but stops competing with the title for attention.
  const baseRows = [
    { label: 'Status', value: labelFor(value.status || 'draft') },
    { label: 'Sources', value: resolvedSourceCount },
    { label: 'Claims', value: resolvedClaimCount },
    { label: 'Words', value: resolvedWordCount },
    { label: 'Last reviewed', value: lastReviewed }
  ];

  if (type === 'entity') {
    return [
      { label: 'Role', value: pickFirst(meta.role, meta.description, firstParagraphText(value.body)) },
      { label: 'Born', value: pickFirst(formatOptionalDate(meta.born), meta.founded, meta.created) },
      { label: 'Key claim', value: pickFirst(keyClaimText(value.claims), meta.keyClaim) },
      ...baseRows
    ];
  }

  if (type === 'concept') {
    return [
      { label: 'Definition', value: pickFirst(meta.definition, firstParagraphText(value.body)) },
      { label: 'First seen', value: pickFirst(formatOptionalDate(meta.firstSeenAt || meta.firstSeen), formatOptionalDate(value.createdAt)) },
      { label: 'Contradictions', value: pickFirst(meta.contradictions, contradictionCount(value.claims)) },
      ...baseRows
    ];
  }

  if (type === 'source') {
    return [
      { label: 'Author', value: pickFirst(meta.author, firstSource.author, firstSource.byline) },
      { label: 'Date', value: pickFirst(formatOptionalDate(meta.date || meta.publishedAt || firstSource.publishedAt), formatOptionalDate(firstSource.createdAt)) },
      { label: 'URL', value: pickFirst(meta.url, firstSource.url, firstSource.href) },
      { label: 'Takeaways', value: pickFirst(listValue(meta.takeaways), keyClaimText(value.claims), firstParagraphText(value.body)) },
      ...baseRows
    ];
  }

  if (type === 'question') {
    return [
      { label: 'Question', value: pickFirst(meta.question, value.title) },
      { label: 'Answered', value: (value.discussions || []).length ? `${value.discussions.length} discussion${value.discussions.length === 1 ? '' : 's'}` : 'No discussions yet' },
      { label: 'Best current answer', value: pickFirst(meta.answer, firstParagraphText(value.body)) },
      ...baseRows
    ];
  }

  if (type === 'overview') {
    return [
      { label: 'Scope', value: scopeText },
      { label: 'Sections', value: pickFirst(sectionTitles(value.body), 'No sections yet') },
      { label: 'Discussions', value: `${(value.discussions || []).length} discussion${(value.discussions || []).length === 1 ? '' : 's'}` },
      ...baseRows
    ];
  }

  return [
    { label: 'Kind', value: labelFor(value.pageType || 'topic') },
    { label: 'Summary', value: summaryText },
    { label: 'Sections', value: pickFirst(sectionTitles(value.body), 'No sections yet') },
    ...baseRows
  ];
};

const WIKI_LINK_PREVIEW_SHOW_DELAY_MS = 250;
const WIKI_LINK_PREVIEW_DISMISS_GRACE_MS = 100;
const PAGE_TRANSITION_DURATION_MS = 200;

const useReducedMotion = () => {
  const getReducedMotion = () => (
    typeof window !== 'undefined'
      ? Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)
      : false
  );
  const [reducedMotion, setReducedMotion] = useState(getReducedMotion);

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return undefined;
    const handleChange = () => setReducedMotion(Boolean(query.matches));
    query.addEventListener?.('change', handleChange);
    query.addListener?.(handleChange);
    return () => {
      query.removeEventListener?.('change', handleChange);
      query.removeListener?.(handleChange);
    };
  }, []);

  return reducedMotion;
};

const AnimatedNumber = ({ value, className = '' }) => {
  const displayValue = Number.isFinite(Number(value)) ? Number(value) : 0;
  const prefersReducedMotion = useReducedMotion();
  const previousValueRef = useRef(displayValue);
  const timerRef = useRef(null);
  const [renderedValue, setRenderedValue] = useState(displayValue);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    const previousValue = previousValueRef.current;
    previousValueRef.current = displayValue;
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (previousValue === displayValue || prefersReducedMotion) {
      setRenderedValue(displayValue);
      setAnimating(false);
      return undefined;
    }

    const duration = 360;
    const stepMs = 40;
    const startedAt = Date.now();
    setRenderedValue(previousValue);
    setAnimating(true);
    timerRef.current = window.setInterval(() => {
      const progress = Math.min(1, (Date.now() - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextValue = Math.round(previousValue + ((displayValue - previousValue) * eased));
      setRenderedValue(nextValue);
      if (progress >= 1) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
        setRenderedValue(displayValue);
        setAnimating(false);
      }
    }, stepMs);

    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [displayValue, prefersReducedMotion]);

  return (
    <span
      className={`wiki-numeric-value${animating ? ' is-counting' : ''}${className ? ` ${className}` : ''}`}
      data-animated-number="true"
    >
      {renderedValue.toLocaleString()}
    </span>
  );
};

const WikiLinkPreview = ({ preview, onMouseEnter, onMouseLeave }) => {
  if (!preview?.page) return null;
  const sourceCount = Array.isArray(preview.page.sourceRefs) ? preview.page.sourceRefs.length : 0;
  return (
    <aside
      className="wiki-read-link-preview"
      role="tooltip"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        top: preview.anchorRect ? `${preview.anchorRect.bottom + window.scrollY + 8}px` : undefined,
        left: preview.anchorRect ? `${Math.min(preview.anchorRect.left + window.scrollX, window.innerWidth - 340)}px` : undefined
      }}
    >
      <h3>{preview.page.title || 'Untitled wiki page'}</h3>
      <p>{firstParagraphText(preview.page.body) || 'No summary yet.'}</p>
      <span className="wiki-read-link-preview__meta">{sourceCount} source{sourceCount === 1 ? '' : 's'}</span>
    </aside>
  );
};

const InfoboxValue = ({ value, pageId, label }) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return <AnimatedNumber value={value} resetKey={`${pageId}:${label}`} />;
  }
  return value === null || value === undefined || value === '' ? 'Unknown' : value;
};

const InfoboxRow = ({ row, pageId }) => {
  const previousValueRef = useRef(row.value);
  const [updated, setUpdated] = useState(false);

  useEffect(() => {
    if (previousValueRef.current === row.value) return undefined;
    previousValueRef.current = row.value;
    setUpdated(true);
    const timeout = window.setTimeout(() => setUpdated(false), 900);
    return () => window.clearTimeout(timeout);
  }, [row.value]);

  return (
    <div
      data-infobox-row={String(row.label).toLowerCase().replace(/\s+/g, '-')}
      className={updated ? 'wiki-read__infobox-row is-updated' : 'wiki-read__infobox-row'}
    >
      <dt>{row.label}</dt>
      <dd><InfoboxValue value={row.value} pageId={pageId} label={row.label} /></dd>
    </div>
  );
};

const WikiMentionedInFooter = ({ pageId, pageTitle }) => {
  const [state, setState] = useState({ backlinks: [], loading: true, error: false });

  useEffect(() => {
    if (!pageId) return undefined;
    let cancelled = false;
    setState(current => ({ ...current, loading: true, error: false }));
    getWikiBacklinks(pageId)
      .then((data) => {
        if (cancelled) return;
        setState({
          backlinks: Array.isArray(data?.backlinks) ? data.backlinks : [],
          loading: false,
          error: false
        });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ backlinks: [], loading: false, error: true });
      });
    return () => { cancelled = true; };
  }, [pageId, pageTitle]);

  if (state.error || (!state.loading && state.backlinks.length === 0)) return null;
  return (
    <footer className="wiki-read-mentioned" aria-label="Mentioned in">
      <h2>Mentioned in</h2>
      {state.loading ? <p>Loading backlinks...</p> : (
        <ul>
          {state.backlinks.map(entry => (
            <li key={entry.pageId}>
              <Link to={wikiPagePath(entry.pageId)}>
                <span>{entry.title || 'Untitled wiki page'}</span>
                <small>{entry.mentionCount} mention{entry.mentionCount === 1 ? '' : 's'}</small>
                {entry.snippet ? <p>{cleanWikiLinkSnippetText(entry.snippet)}</p> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </footer>
  );
};

const connectionItemTitle = (item = {}) => pickFirst(item.title, item.name, item.text, item.url, 'Untitled');

const connectionTypeLabel = (type = '') => {
  if (type === 'wiki_page') return 'Wiki';
  if (type === 'wiki_claim') return 'Claim';
  return labelFor(type || 'source');
};

const connectionItemPath = ({ item = {}, type = '', id = '' } = {}) => {
  if (type === 'wiki_page') return wikiPagePath(id);
  return item.openPath || '';
};

const normalizeConnectionRows = ({ incoming = [], outgoing = [] } = {}) => {
  const rows = [];
  outgoing.forEach((connection = {}) => {
    rows.push({
      key: connection._id || `out:${connection.toType}:${connection.toId}:${connection.relationType}`,
      direction: 'outgoing',
      relationType: connection.relationType || 'related',
      itemType: connection.toType,
      itemId: connection.toId,
      item: connection.target || {}
    });
  });
  incoming.forEach((connection = {}) => {
    rows.push({
      key: connection._id || `in:${connection.fromType}:${connection.fromId}:${connection.relationType}`,
      direction: 'incoming',
      relationType: connection.relationType || 'related',
      itemType: connection.fromType,
      itemId: connection.fromId,
      item: connection.source || {}
    });
  });
  return rows.filter(row => row.item?.exists !== false);
};

const groupConnectionRows = (rows = []) => ({
  relatedTo: rows.filter(row => row.direction === 'outgoing' && row.itemType === 'wiki_page'),
  mentionedBy: rows.filter(row => row.direction === 'incoming' && row.itemType === 'wiki_page'),
  supportedBy: rows.filter(row => row.itemType !== 'wiki_page')
});

const WikiConnectionTraceList = ({ title, items = [] }) => {
  if (!items.length) return null;
  return (
    <div className="wiki-read__connection-group">
      <h3>{title}</h3>
      <ol>
        {items.slice(0, 5).map((row) => {
          const path = connectionItemPath({ item: row.item, type: row.itemType, id: row.itemId });
          const content = (
            <>
              <span>{connectionItemTitle(row.item)}</span>
              <small>{connectionTypeLabel(row.itemType)} · {labelFor(row.relationType)}</small>
              {row.item.snippet ? <p>{conciseText(row.item.snippet, 120)}</p> : null}
            </>
          );
          return (
            <li key={row.key}>
              {path ? <Link to={path}>{content}</Link> : <div>{content}</div>}
            </li>
          );
        })}
      </ol>
    </div>
  );
};

const WikiConnectionTraces = ({ pageId }) => {
  const location = useLocation();
  const [state, setState] = useState({ rows: [], loading: true, error: false });
  const shouldFocusTrace = useMemo(
    () => new URLSearchParams(location.search || '').get('trace') === '1',
    [location.search]
  );
  const traceRef = useRef(null);

  useEffect(() => {
    if (!pageId) return undefined;
    let cancelled = false;
    setState(current => ({ ...current, loading: true, error: false }));
    getConnectionsForItem({ itemType: 'wiki_page', itemId: pageId })
      .then((data) => {
        if (cancelled) return;
        setState({
          rows: normalizeConnectionRows(data),
          loading: false,
          error: false
        });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ rows: [], loading: false, error: true });
      });
    return () => { cancelled = true; };
  }, [pageId]);

  useEffect(() => {
    if (!shouldFocusTrace || state.loading || state.error || !state.rows.length) return undefined;
    const timeout = window.setTimeout(() => {
      traceRef.current?.scrollIntoView?.(scrollOptions());
      traceRef.current?.focus?.({ preventScroll: true });
    }, 80);
    return () => window.clearTimeout(timeout);
  }, [shouldFocusTrace, state.error, state.loading, state.rows.length]);

  if (state.error || (!state.loading && state.rows.length === 0)) return null;
  const grouped = groupConnectionRows(state.rows);
  return (
    <section
      ref={traceRef}
      className="wiki-read__infobox wiki-read__connections"
      aria-label="Graph traces"
      tabIndex="-1"
    >
      <h2>Graph traces</h2>
      {state.loading ? <p>Loading connections...</p> : (
        <>
          <WikiConnectionTraceList title="Related to" items={grouped.relatedTo} />
          <WikiConnectionTraceList title="Mentioned by" items={grouped.mentionedBy} />
          <WikiConnectionTraceList title="Supported by" items={grouped.supportedBy} />
        </>
      )}
    </section>
  );
};

const WikiReadReferences = ({ sources = [], citations = [], highlightedRef, onJumpBack }) => {
  if (!sources.length) return null;
  const firstCitationByIndex = citations.reduce((map, citation) => {
    if (!map.has(citation.index)) map.set(citation.index, citation);
    return map;
  }, new Map());
  return (
    <section className="wiki-read__references" aria-labelledby="wiki-read-references-title">
      <h2 id="wiki-read-references-title">References</h2>
      <ol>
        {sources.map((source, index) => {
          const citationIndex = index + 1;
          const citation = firstCitationByIndex.get(citationIndex);
          const refId = `wiki-ref-${citationIndex}`;
          const excerpt = sourceExcerpt(source);
          const internalSourcePath = sourceLibraryPath(source);
          return (
            <li
              key={source._id || source.id || `${source.title}-${index}`}
              id={refId}
              tabIndex="-1"
              className={highlightedRef === refId ? 'is-highlighted' : ''}
            >
              <div className="wiki-read__reference-head">
                <span className="wiki-read__reference-index">[{citationIndex}]</span>
                {citation?.anchorId ? (
                  <a
                    href={`#${citation.anchorId}`}
                    className="wiki-read__reference-backlink"
                    aria-label={`Jump back to citation ${citationIndex}`}
                    onClick={(event) => {
                      event.preventDefault();
                      onJumpBack?.(citation.anchorId);
                    }}
                  >
                    ^
                  </a>
                ) : null}
                <span className="wiki-read__reference-title">{source.title || 'Untitled source'}</span>
              </div>
              {excerpt ? <p>{conciseText(excerpt, 240)}</p> : null}
              {internalSourcePath ? (
                <Link className="wiki-read__reference-source" to={internalSourcePath}>
                  Open in Library
                </Link>
              ) : source.url ? (
                <a className="wiki-read__reference-source" href={source.url} target="_blank" rel="noreferrer">
                  Open source
                </a>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
};

const WikiReadTitle = ({ title = '' }) => {
  const parts = splitTitleAccent(title);
  return (
    <h1 className="wiki-read__title" data-view-transition-name="wiki-read-title">
      {parts.before ? <>{parts.before} </> : null}
      <em>{parts.accent}</em>
      {parts.after ? <> {parts.after}</> : null}
    </h1>
  );
};

const MARGINALIA_COLLAPSED_LIMIT = 4;

const WikiReadMarginalia = ({ sources = [], citations = [], onJumpToReference }) => {
  const [expanded, setExpanded] = useState(false);
  if (!sources.length || !citations.length) return null;
  const seen = new Set();
  const items = citations
    .filter((citation) => {
      if (!citation?.index || seen.has(citation.index)) return false;
      seen.add(citation.index);
      return Boolean(sources[citation.index - 1]);
    })
    .map(citation => ({
      citation,
      source: sources[citation.index - 1]
    }));
  if (!items.length) return null;
  const hiddenCount = Math.max(items.length - MARGINALIA_COLLAPSED_LIMIT, 0);
  const visibleItems = expanded ? items : items.slice(0, MARGINALIA_COLLAPSED_LIMIT);
  return (
    <aside className={`wiki-read__marginalia${expanded ? ' is-expanded' : ' is-collapsed'}`} aria-label="Citation previews">
      {visibleItems.map(({ citation, source }) => {
        const refId = `wiki-ref-${citation.index}`;
        const excerpt = sourceExcerpt(source);
        return (
          <a
            key={`${refId}-${source._id || source.id || source.title || 'source'}`}
            className="wiki-read__margin-note"
            href={`#${refId}`}
            onClick={(event) => {
              event.preventDefault();
              onJumpToReference?.(refId);
            }}
          >
            <span className="wiki-read__margin-note-index">[{citation.index}]</span>
            <strong>{source.title || 'Untitled source'}</strong>
            {excerpt ? <span>{conciseText(excerpt, 120)}</span> : null}
          </a>
        );
      })}
      {hiddenCount ? (
        <button
          type="button"
          className="wiki-read__margin-note-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded(current => !current)}
        >
          {expanded ? 'Show fewer citation previews' : `Show ${hiddenCount} more citation preview${hiddenCount === 1 ? '' : 's'}`}
        </button>
      ) : null}
    </aside>
  );
};

const WikiPageReadView = ({
  pageId,
  onEdit,
  workspaceMode = false,
  refreshNonce = 0,
  liveUpdate = null,
  streamedPage = null,
  streamBusy = false
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const systemStatus = useSystemStatusControls();
  const traceSearch = location.search || (typeof window !== 'undefined' ? window.location.search : '');
  const shouldOpenTrace = useMemo(
    () => new URLSearchParams(traceSearch || '').get('trace') === '1',
    [traceSearch]
  );
  const requestedReadTab = useMemo(() => {
    const value = new URLSearchParams(traceSearch || '').get('tab');
    return value === 'talk' ? 'talk' : 'article';
  }, [traceSearch]);
  const promotionWitness = useMemo(
    () => promotionWitnessFromSearch(traceSearch),
    [traceSearch]
  );
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [maintaining, setMaintaining] = useState(false);
  const maintenanceActive = maintaining || streamBusy;
  const [maintenanceTraceLines, setMaintenanceTraceLines] = useState([]);
  const [maintenanceReceipt, setMaintenanceReceipt] = useState(null);
  const [asking, setAsking] = useState(false);
  const [streamingAskText, setStreamingAskText] = useState('');
  const [promotingDiscussionId, setPromotingDiscussionId] = useState('');
  const [error, setError] = useState('');
  const [shareBusy, setShareBusy] = useState(false);
  const [shareStatus, setShareStatus] = useState('');
  const [activeClaim, setActiveClaim] = useState(null);
  const [preview, setPreview] = useState(null);
  const [lastVisit, setLastVisit] = useState(null);
  const [activeTab, setActiveTab] = useState(requestedReadTab);
  const [markdownStatus, setMarkdownStatus] = useState('');
  const [highlightedRef, setHighlightedRef] = useState('');
  const [recentParagraphAnchors, setRecentParagraphAnchors] = useState(() => new Set());
  const [recentTocIds, setRecentTocIds] = useState(() => new Set());
  const [liveUpdateToast, setLiveUpdateToast] = useState(null);
  const [nonCriticalReady, setNonCriticalReady] = useState(false);
  const [pageTransitionState, setPageTransitionState] = useState('idle');
  const [rawWikiLinkPages, setRawWikiLinkPages] = useState([]);
  const reducedMotion = useReducedMotion();
  const [showMarginalia, setShowMarginalia] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(min-width: 1280px)').matches;
  });

  useEffect(() => {
    setActiveTab(requestedReadTab);
  }, [requestedReadTab]);
  // AT-22 (Bucket 2): rail is collapsible-by-default. Persisted across pages
  // so once a reader opens context they keep it open until they hide it again.
  // Wikipedia / Tolkien Gateway reading shape — body owns the canvas.
  const [railCollapsed, setRailCollapsed] = useState(() => {
    if (shouldOpenTrace) return false;
    try {
      const raw = window.localStorage?.getItem('noeis.wiki.read.rail_collapsed');
      // Default: collapsed. Anything explicitly set to '0' or 'false' opens it.
      if (raw === '0' || raw === 'false') return false;
      return true;
    } catch (_e) {
      return true;
    }
  });
  useEffect(() => {
    try {
      window.localStorage?.setItem('noeis.wiki.read.rail_collapsed', railCollapsed ? '1' : '0');
    } catch (_e) { /* ignore quota / private mode */ }
  }, [railCollapsed]);
  useEffect(() => {
    if (shouldOpenTrace) setRailCollapsed(false);
  }, [shouldOpenTrace]);
  const previewTimerRef = useRef(null);
  const previewDismissTimerRef = useRef(null);
  const latestPageRef = useRef(null);
  const autoRebuildPageRef = useRef('');
  const lastRefreshNonceRef = useRef(0);
  const articleRef = useRef(null);
  const recentParagraphTimersRef = useRef(new Map());
  const pageTransitionTimerRef = useRef(null);
  const reducedMotionRef = useRef(reducedMotion);

  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
  }, [reducedMotion]);

  useEffect(() => {
    let cancelled = false;
    const recentParagraphTimers = recentParagraphTimersRef.current;
    const hasMountedPage = Boolean(latestPageRef.current);
    const prefersReducedMotion = reducedMotionRef.current;
    setActiveTab(requestedReadTab);
    setNonCriticalReady(false);
    setMaintenanceTraceLines([]);
    setMaintenanceReceipt(null);
    setShareStatus('');
    if (pageTransitionTimerRef.current) {
      clearTimeout(pageTransitionTimerRef.current);
      pageTransitionTimerRef.current = null;
    }
    setPageTransitionState(hasMountedPage && !prefersReducedMotion ? 'exiting' : 'idle');
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const loaded = await getWikiPage(pageId);
        if (cancelled) return;
        latestPageRef.current = loaded;
        setPage(loaded);
        if (hasMountedPage && !prefersReducedMotion) {
          setPageTransitionState('entering');
          pageTransitionTimerRef.current = window.setTimeout(() => {
            pageTransitionTimerRef.current = null;
            setPageTransitionState('idle');
          }, PAGE_TRANSITION_DURATION_MS);
        } else {
          setPageTransitionState('idle');
        }
        trackWikiReadModePageView({
          pageId,
          pageType: loaded.pageType || '',
          sourceCount: Array.isArray(loaded.sourceRefs) ? loaded.sourceRefs.length : 0,
          claimCount: Array.isArray(loaded.claims) ? loaded.claims.length : 0
        });
      } catch (_error) {
        if (!cancelled) {
          setError('Failed to load Wiki page.');
          setPageTransitionState('idle');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      if (previewDismissTimerRef.current) clearTimeout(previewDismissTimerRef.current);
      recentParagraphTimers.forEach(timer => clearTimeout(timer));
      recentParagraphTimers.clear();
      if (pageTransitionTimerRef.current) {
        clearTimeout(pageTransitionTimerRef.current);
        pageTransitionTimerRef.current = null;
      }
    };
  }, [pageId, requestedReadTab]);

  useEffect(() => {
    if (!streamedPage) return undefined;
    const streamedId = normalizeId(streamedPage._id || streamedPage.id);
    if (!streamedId || streamedId !== normalizeId(pageId)) return undefined;
    latestPageRef.current = streamedPage;
    setPage(streamedPage);
    setLoading(false);
    return undefined;
  }, [pageId, streamedPage]);

  useEffect(() => {
    if (!refreshNonce || lastRefreshNonceRef.current === refreshNonce) return undefined;
    if (streamBusy) return undefined;
    lastRefreshNonceRef.current = refreshNonce;
    let cancelled = false;
    getWikiPage(pageId)
      .then((loaded) => {
        if (cancelled) return;
        const streamed = latestPageRef.current;
        const streamedWords = countWikiPageWords(streamed);
        const loadedWords = countWikiPageWords(loaded);
        if (streamed && streamedWords > loadedWords) return;
        latestPageRef.current = loaded;
        setPage(loaded);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to refresh Wiki page.');
      });
    return () => { cancelled = true; };
  }, [pageId, refreshNonce, requestedReadTab, streamBusy]);

  useEffect(() => {
    if (!page) {
      setNonCriticalReady(false);
      setLastVisit(null);
      return undefined;
    }
    let cancelled = false;
    const cancelScheduled = scheduleAfterFirstPaint(() => {
      if (cancelled) return;
      setLastVisit(getLastVisitState(pageId));
      setNonCriticalReady(true);
    });
    return () => {
      cancelled = true;
      cancelScheduled?.();
    };
  }, [page, pageId]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target;
      const tag = target?.tagName || '';
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || target?.isContentEditable) return;
      if (event.key.toLowerCase() === 'e' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        onEdit?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onEdit, workspaceMode]);

  const handleMaintain = useCallback(async () => {
    systemStatus.clearRecoverableFailure();
    systemStatus.setBackgroundWork({ label: 'Wiki maintenance', stage: `Checking @wiki:${pageId}` });
    setMaintaining(true);
    setError('');
    setMaintenanceReceipt(null);
    setMaintenanceTraceLines([
      `checking @wiki:${pageId}`,
      'reading sources and claims'
    ]);
    try {
      const maintained = await maintainWikiPage(pageId);
      latestPageRef.current = maintained;
      setPage(maintained);
      const nextSourceCount = countPageSources(maintained);
      const nextClaimCount = countPageClaims(maintained);
      const issueCount = Array.isArray(maintained?.aiState?.maintenanceQualityIssues)
        ? maintained.aiState.maintenanceQualityIssues.length
        : Array.isArray(maintained?.aiState?.quality?.failures)
          ? maintained.aiState.quality.failures.length
          : 0;
      setMaintenanceTraceLines([
        `checked ${nextSourceCount} source${nextSourceCount === 1 ? '' : 's'}`,
        `reviewed ${nextClaimCount} claim${nextClaimCount === 1 ? '' : 's'}`,
        issueCount ? `${issueCount} issue${issueCount === 1 ? '' : 's'} surfaced` : 'page settled'
      ]);
      setMaintenanceReceipt({
        status: issueCount ? 'review' : 'settled',
        issueCount,
        sourceCount: nextSourceCount,
        claimCount: nextClaimCount
      });
      systemStatus.setLatestReceipt(wikiMaintenanceSystemReceipt(pageId, {
        issueCount,
        pageTitle: maintained?.title
      }));
    } catch (_error) {
      setError('Failed to maintain Wiki page.');
      setMaintenanceTraceLines([
        `maintenance failed · @wiki:${pageId}`,
        'waiting for retry'
      ]);
      setMaintenanceReceipt({
        status: 'failed',
        issueCount: 0,
        sourceCount: countPageSources(latestPageRef.current || page),
        claimCount: countPageClaims(latestPageRef.current || page)
      });
      systemStatus.setRecoverableFailure({
        stage: 'Wiki maintenance',
        message: 'Failed to maintain Wiki page.',
        retryable: true,
        retry: () => { handleMaintain(); }
      });
    } finally {
      systemStatus.setBackgroundWork(null);
      setMaintaining(false);
    }
  }, [page, pageId, systemStatus]);

  const handleShareSafely = useCallback(async () => {
    const currentPage = latestPageRef.current || page;
    const publicUrl = buildPublicWikiShareUrl(currentPage);
    if (!currentPage || !publicUrl) return;
    if (isPageQualityBlocked(currentPage)) {
      setShareStatus('Fix or archive the review items before sharing this page publicly.');
      return;
    }
    setShareBusy(true);
    setShareStatus('');
    try {
      let sharedPage = currentPage;
      if (String(currentPage.visibility || 'private') !== 'shared') {
        sharedPage = await updateWikiPage(pageId, { visibility: 'shared' });
        latestPageRef.current = sharedPage;
        setPage(sharedPage);
      }
      const nextUrl = buildPublicWikiShareUrl(sharedPage) || publicUrl;
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(nextUrl);
        setShareStatus('Copied safe public link.');
      } else {
        setShareStatus('Safe public link ready.');
      }
    } catch (_error) {
      setShareStatus('Could not create the public link.');
    } finally {
      setShareBusy(false);
    }
  }, [page, pageId]);

  const handleStopSharing = useCallback(async () => {
    const currentPage = latestPageRef.current || page;
    if (!currentPage) return;
    setShareBusy(true);
    setShareStatus('');
    try {
      const privatePage = await updateWikiPage(pageId, { visibility: 'private' });
      latestPageRef.current = privatePage;
      setPage(privatePage);
      setShareStatus('Public link turned off.');
    } catch (_error) {
      setShareStatus('Could not turn off the public link.');
    } finally {
      setShareBusy(false);
    }
  }, [page, pageId]);

  const handleAsk = async (question) => {
    setAsking(true);
    setError('');
    setStreamingAskText('');
    try {
      const updated = await streamAskWikiPage(pageId, question, {
        onDelta: (delta) => setStreamingAskText(current => `${current}${delta}`),
        onPage: (nextPage) => {
          latestPageRef.current = nextPage;
          setPage(nextPage);
        }
      });
      latestPageRef.current = updated;
      if (updated) setPage(updated);
    } catch (_error) {
      try {
        const updated = await askWikiPage(pageId, question);
        latestPageRef.current = updated;
        setPage(updated);
      } catch (_fallbackError) {
        setError('Failed to ask this Wiki page.');
      }
    } finally {
      setStreamingAskText('');
      setAsking(false);
    }
  };

  const handlePromoteDiscussion = async (discussion, title) => {
    const discussionId = discussion?._id || '';
    if (!discussionId) return;
    setPromotingDiscussionId(discussionId);
    setError('');
    try {
      const result = await promoteWikiDiscussion(pageId, discussionId, { title });
      const createdPage = result?.page || result;
      trackWikiQaPromoted({
        sourcePageId: pageId,
        promotedPageId: createdPage?._id || '',
        discussionId
      });
      if (createdPage?._id) navigate(wikiPagePath(createdPage._id));
    } catch (_error) {
      setError('Failed to create Wiki page from discussion.');
    } finally {
      setPromotingDiscussionId('');
    }
  };

  const handleClaimHover = useCallback((event) => {
    const target = event.target.closest?.('.wiki-claim-citation');
    if (!target) return;
    const claimId = target.getAttribute('data-claim-id') || '';
    const support = target.getAttribute('data-support') || 'supported';
    setActiveClaim({
      claimId,
      support: SUPPORT_STATES.has(support) ? support : 'supported',
      citationIndexes: parseIndexAttribute(target.getAttribute('data-citation-indexes')),
      contradictionIndexes: parseIndexAttribute(target.getAttribute('data-contradiction-indexes')),
      anchorRect: target.getBoundingClientRect()
    });
  }, []);

  const highlightReference = useCallback((refId = '') => {
    setHighlightedRef(refId);
    window.setTimeout(() => {
      setHighlightedRef(current => (current === refId ? '' : current));
    }, 1600);
  }, []);

  const handleCitationClick = useCallback((event) => {
    const target = event.target.closest?.('.wiki-claim-citation');
    if (!target) return;
    const refId = target.getAttribute('data-footnote-target') || '';
    if (!refId) return;
    event.preventDefault();
    if (scrollToElementId(refId)) highlightReference(refId);
  }, [highlightReference]);

  // AT-288: wikilinks render as raw <a href="/wiki/:id"> (see renderTiptapDoc).
  // Intercept plain left-clicks so concept-to-concept navigation stays in-app
  // and rides the page-switch View Transition instead of doing a full reload.
  // Modifier-clicks (open-in-new-tab) and non-primary buttons fall through to
  // the browser's native behavior.
  const handleInternalLinkClick = useCallback((event) => {
    if (event.defaultPrevented) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target.closest?.('.wiki-internal-link');
    const targetPageId = target?.getAttribute?.('data-wiki-page-id');
    if (!targetPageId) return;
    event.preventDefault();
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    setPreview(null);
    const go = () => navigate(wikiPagePath(targetPageId));
    if (typeof document !== 'undefined' && typeof document.startViewTransition === 'function') {
      document.startViewTransition(go);
    } else {
      go();
    }
  }, [navigate]);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(min-width: 1280px)');
    const update = () => setShowMarginalia(Boolean(query.matches));
    update();
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', update);
      return () => query.removeEventListener('change', update);
    }
    if (typeof query.addListener === 'function') {
      query.addListener(update);
      return () => query.removeListener(update);
    }
    return undefined;
  }, []);

  const handleReferenceBacklink = useCallback((citationId = '') => {
    scrollToElementId(citationId);
  }, []);

  const handleLiveUpdateJump = useCallback((anchorId = '') => {
    if (!anchorId) return;
    if (scrollToElementId(anchorId)) setLiveUpdateToast(null);
  }, []);

  const handleClaimLeave = useCallback((event) => {
    const next = event.relatedTarget;
    if (next && (
      next.closest?.('.wiki-claim-popover') ||
      next.closest?.('.wiki-claim-citation') ||
      next.closest?.('span.wiki-claim')
    )) return;
    setActiveClaim(null);
  }, []);

  const handleLinkEnter = useCallback((event) => {
    const target = event.target.closest?.('.wiki-internal-link');
    const targetPageId = target?.getAttribute?.('data-wiki-page-id');
    if (!targetPageId) return;
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    if (previewDismissTimerRef.current) clearTimeout(previewDismissTimerRef.current);
    const anchorRect = target.getBoundingClientRect();
    previewTimerRef.current = window.setTimeout(async () => {
      try {
        const loaded = await getWikiPage(targetPageId);
        setPreview({ page: loaded, anchorRect });
      } catch (_error) {
        setPreview(null);
      }
    }, WIKI_LINK_PREVIEW_SHOW_DELAY_MS);
  }, []);

  const dismissPreviewWithGrace = useCallback(() => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    if (previewDismissTimerRef.current) clearTimeout(previewDismissTimerRef.current);
    previewDismissTimerRef.current = window.setTimeout(() => setPreview(null), WIKI_LINK_PREVIEW_DISMISS_GRACE_MS);
  }, []);

  const handleLinkLeave = useCallback((event) => {
    const next = event.relatedTarget;
    if (next && (
      next.closest?.('.wiki-read-link-preview') ||
      next.closest?.('.wiki-internal-link')
    )) return;
    dismissPreviewWithGrace();
  }, [dismissPreviewWithGrace]);

  const handlePreviewEnter = useCallback(() => {
    if (previewDismissTimerRef.current) clearTimeout(previewDismissTimerRef.current);
  }, []);

  const handlePreviewLeave = useCallback(() => {
    dismissPreviewWithGrace();
  }, [dismissPreviewWithGrace]);

  const claimLedgerById = useMemo(() => {
    const map = new Map();
    (page?.claims || []).forEach((claim) => {
      if (claim?.claimId) map.set(claim.claimId, claim);
    });
    return map;
  }, [page?.claims]);

  const resolvedActiveSources = useMemo(() => {
    if (!activeClaim || !page?.sourceRefs?.length) return [];
    const ledgerClaim = claimLedgerById.get(activeClaim.claimId);
    if (ledgerClaim) {
      const ledgerSources = page.sourceRefs
        .map((source, index) => ({ ...source, citationIndex: index + 1 }))
        .filter(source => claimMatchesSource({ claim: ledgerClaim, source, citations: page.citations || [] }))
        .map(source => ({
          ...source,
          evidenceRole: claimContradictsSource({ claim: ledgerClaim, source, citations: page.citations || [] })
            ? 'contradicts'
            : 'supports'
        }));
      if (ledgerSources.length) return ledgerSources;
    }
    const contradictionIndexSet = new Set(activeClaim.contradictionIndexes || []);
    const supportingFallbackSources = (activeClaim.citationIndexes || [])
      .filter(index => !contradictionIndexSet.has(index))
      .map((index) => {
        const source = page.sourceRefs[index - 1];
        return source ? { ...source, citationIndex: index, evidenceRole: 'supports' } : null;
      })
      .filter(Boolean);
    const contradictionFallbackSources = (activeClaim.contradictionIndexes || [])
      .map((index) => {
        const source = page.sourceRefs[index - 1];
        return source ? { ...source, citationIndex: index, evidenceRole: 'contradicts' } : null;
      })
      .filter(Boolean);
    return [...supportingFallbackSources, ...contradictionFallbackSources];
  }, [activeClaim, claimLedgerById, page]);

  const currentClaimTexts = useMemo(() => (
    nonCriticalReady && lastVisit?.lastViewedAt ? extractClaimTexts(page?.body) : []
  ), [lastVisit?.lastViewedAt, nonCriticalReady, page?.body]);
  const claimLedgerDiff = useMemo(() => (
    nonCriticalReady && lastVisit?.lastViewedAt
      ? diffClaimLedgerSnapshots(lastVisit.ledgerSnapshot, page?.claims || [])
      : []
  ), [lastVisit?.lastViewedAt, lastVisit?.ledgerSnapshot, nonCriticalReady, page?.claims]);
  const visitDiff = useMemo(() => {
    if (!nonCriticalReady || !lastVisit?.lastViewedAt) return { added: [], removed: [], changed: [] };
    return {
      ...diffClaimSnapshots(lastVisit.claimSnapshot, currentClaimTexts),
      changed: claimLedgerDiff
    };
  }, [claimLedgerDiff, currentClaimTexts, lastVisit?.claimSnapshot, lastVisit?.lastViewedAt, nonCriticalReady]);

  const handleMarkReviewed = useCallback(() => {
    if (!page) return;
    const next = recordVisit(pageId, page.body, page.claims || []);
    setLastVisit(next);
  }, [page, pageId]);

  const loadMarkdown = useCallback(async () => {
    setMarkdownStatus('');
    try {
      return await getWikiPageMarkdown(pageId);
    } catch (_error) {
      setMarkdownStatus('Markdown export failed.');
      return '';
    }
  }, [pageId]);

  const handleCopyMarkdown = useCallback(async () => {
    const markdown = await loadMarkdown();
    if (!markdown) return;
    try {
      await navigator.clipboard.writeText(markdown);
      setMarkdownStatus('Markdown copied.');
    } catch (_error) {
      setMarkdownStatus('Clipboard permission blocked copy.');
    }
  }, [loadMarkdown]);

  const handleDownloadMarkdown = useCallback(async () => {
    const markdown = await loadMarkdown();
    if (!markdown) return;
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const slug = String(page?.slug || page?.title || 'wiki-page')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 90) || 'wiki-page';
    anchor.href = url;
    anchor.download = `${slug}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setMarkdownStatus('Markdown downloaded.');
  }, [loadMarkdown, page?.slug, page?.title]);

  const displayBody = useMemo(
    () => stripLeadingDuplicateTitleHeading(page?.body || emptyDoc, page?.title || ''),
    [page?.body, page?.title]
  );
  useEffect(() => {
    let cancelled = false;
    if (!hasRawWikiSyntax(displayBody)) {
      setRawWikiLinkPages([]);
      return undefined;
    }
    listWikiPages({ limit: 500 })
      .then((nextPages) => {
        if (!cancelled) setRawWikiLinkPages(Array.isArray(nextPages) ? nextPages : []);
      })
      .catch(() => {
        if (!cancelled) setRawWikiLinkPages([]);
      });
    return () => { cancelled = true; };
  }, [displayBody]);
  const wikiLinkPages = useMemo(() => (
    [
      page ? { _id: page._id || page.id || page.pageId, title: page.title } : null,
      ...collectRelatedWikiPages(page),
      ...rawWikiLinkPages
    ].filter(Boolean)
  ), [page, rawWikiLinkPages]);
  const bodyTocItems = useMemo(() => extractTocItems(displayBody), [displayBody]);
  const tocItems = useMemo(() => {
    const hasReferences = Array.isArray(page?.sourceRefs) && page.sourceRefs.length > 0;
    if (!hasReferences || bodyTocItems.some(item => item.id === 'wiki-read-references-title')) {
      return bodyTocItems;
    }
    return [
      ...bodyTocItems,
      {
        id: 'wiki-read-references-title',
        title: 'References',
        level: 2,
        blockIndex: Number.MAX_SAFE_INTEGER
      }
    ];
  }, [bodyTocItems, page?.sourceRefs]);
  const footnoteCitations = useMemo(() => collectFootnoteCitations(displayBody), [displayBody]);
  const [activeTocId, setActiveTocId] = useState('');

  useEffect(() => {
    if (!tocItems.length) {
      setActiveTocId('');
      return undefined;
    }
    setActiveTocId(current => current || tocItems[0].id);
    let animationFrame = 0;
    let scrollRoot = window;
    const rootMetrics = () => {
      if (!scrollRoot || scrollRoot === window) {
        return { top: 0, height: window.innerHeight || 900 };
      }
      const rect = scrollRoot.getBoundingClientRect?.();
      return {
        top: Number.isFinite(rect?.top) ? rect.top : 0,
        height: Number.isFinite(rect?.height) && rect.height > 0 ? rect.height : window.innerHeight || 900
      };
    };
    const handleScroll = () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        const root = rootMetrics();
        const activationLine = root.top + Math.max(120, Math.min(root.height * 0.3, 260));
        const headingPositions = tocItems
          .map((item) => {
            const element = document.getElementById(item.id);
            const top = element?.getBoundingClientRect?.().top;
            return Number.isFinite(top) ? { ...item, top } : null;
          })
          .filter(Boolean);
        const hasMeasuredLayout = headingPositions.some(item => item.top !== 0);
        if (!hasMeasuredLayout) return;

        const previousHeading = headingPositions
          .filter(item => item.top <= activationLine)
          .sort((a, b) => b.top - a.top)[0];
        if (previousHeading) {
          setActiveTocId(previousHeading.id);
          return;
        }

        const nextHeading = headingPositions
          .filter(item => item.top > activationLine)
          .sort((a, b) => a.top - b.top)[0];
        if (nextHeading) setActiveTocId(nextHeading.id);
      });
    };
    const scrollTargets = [window];
    const firstHeading = document.getElementById(tocItems[0]?.id);
    let scrollParent = firstHeading?.parentElement || null;
    while (scrollParent && scrollParent !== document.body && scrollParent !== document.documentElement) {
      const style = window.getComputedStyle(scrollParent);
      const canScroll = scrollParent.scrollHeight > scrollParent.clientHeight;
      if (canScroll && /(auto|scroll|overlay)/.test(`${style.overflowY} ${style.overflow}`)) {
        scrollTargets.push(scrollParent);
        scrollRoot = scrollParent;
        break;
      }
      scrollParent = scrollParent.parentElement;
    }
    const workspacePane = articleRef.current?.closest?.('.wiki-workspace__right-pane');
    if (workspacePane && !scrollTargets.includes(workspacePane)) {
      scrollTargets.push(workspacePane);
      scrollRoot = workspacePane;
    }
    handleScroll();
    scrollTargets.forEach(target => target.addEventListener('scroll', handleScroll, { passive: true }));
    window.addEventListener('resize', handleScroll);
    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      scrollTargets.forEach(target => target.removeEventListener('scroll', handleScroll));
      window.removeEventListener('resize', handleScroll);
    };
  }, [tocItems]);

  useEffect(() => {
    const article = articleRef.current;
    if (!article) return undefined;

    let animationFrame = 0;
    const updateProgress = () => {
      if (animationFrame) return;
      const run = () => {
        animationFrame = 0;
        const rect = article.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1;
        const distance = Math.max(1, rect.height - viewportHeight + 120);
        const progress = Math.min(1, Math.max(0, (0 - rect.top) / distance));
        article.style.setProperty('--wiki-reading-progress', progress.toFixed(4));
      };
      animationFrame = window.requestAnimationFrame
        ? window.requestAnimationFrame(run)
        : window.setTimeout(run, 0);
    };

    updateProgress();
    window.addEventListener('scroll', updateProgress, { passive: true, capture: true });
    window.addEventListener('resize', updateProgress);
    return () => {
      if (animationFrame) {
        if (window.cancelAnimationFrame) window.cancelAnimationFrame(animationFrame);
        else window.clearTimeout(animationFrame);
      }
      window.removeEventListener('scroll', updateProgress, true);
      window.removeEventListener('resize', updateProgress);
    };
  }, [displayBody, pageId]);

  const wordCount = countPageWords(page, displayBody);
  const bodyHasWikiLinks = useMemo(
    () => (nonCriticalReady ? hasInlineWikiLinks(page?.body) : true),
    [nonCriticalReady, page?.body]
  );
  const healthCounts = useMemo(
    () => (nonCriticalReady ? claimHealthCounts(page?.claims) : { supported: 0, partial: 0, unsupported: 0, conflicted: 0 }),
    [nonCriticalReady, page?.claims]
  );
  const qualityState = useMemo(
    () => (nonCriticalReady ? buildQualityState({ page, counts: healthCounts }) : null),
    [healthCounts, nonCriticalReady, page]
  );
  const infoboxRows = buildInfoboxRows({
    page,
    sourceCount: countPageSources(page),
    claimCount: countPageClaims(page),
    wordCount,
    lastReviewed: formatDate(
      page?.aiState?.lastReviewedAt
      || page?.aiState?.lastDraftedAt
      || page?.lastReviewedAt
      || page?.updatedAt
    )
  });
  const activeLedgerClaim = activeClaim ? claimLedgerById.get(activeClaim.claimId) : null;
  const displayedActiveTocId = activeTocId || tocItems[0]?.id || '';
  const discussionCount = (page?.discussions || []).length;
  const showPageTalk = true;
  const showMentionedInFooter = true;
  const showUtilityRail = false;

  const clearRecentTocId = useCallback((tocId = '') => {
    if (!tocId) return;
    setRecentTocIds(current => {
      if (!current.has(tocId)) return current;
      const next = new Set(current);
      next.delete(tocId);
      return next;
    });
  }, []);

  const handleTocClick = useCallback((event, tocId = '') => {
    clearRecentTocId(tocId);
    if (liveUpdateToast?.tocId === tocId) setLiveUpdateToast(null);
  }, [clearRecentTocId, liveUpdateToast?.tocId]);

  useEffect(() => {
    const anchorId = normalizeId(liveUpdate?.anchorId);
    if (!anchorId || (liveUpdate?.pageId && normalizeId(liveUpdate.pageId) !== normalizeId(pageId))) return undefined;

    setRecentParagraphAnchors(current => {
      const next = new Set(current);
      next.add(anchorId);
      return next;
    });
    const previousTimer = recentParagraphTimersRef.current.get(anchorId);
    if (previousTimer) clearTimeout(previousTimer);
    const timer = window.setTimeout(() => {
      recentParagraphTimersRef.current.delete(anchorId);
      setRecentParagraphAnchors(current => {
        if (!current.has(anchorId)) return current;
        const next = new Set(current);
        next.delete(anchorId);
        return next;
      });
    }, 2000);
    recentParagraphTimersRef.current.set(anchorId, timer);

    const run = () => {
      const element = document.getElementById(anchorId) || articleRef.current?.querySelector?.(`[data-wiki-block-anchor="${cssEscape(anchorId)}"]`);
      if (!element) return;
      const headingSelector = 'h2[id], h3[id]';
      let tocId = element.matches?.(headingSelector) ? element.id : '';
      let sibling = element.previousElementSibling;
      while (!tocId && sibling) {
        if (sibling.matches?.(headingSelector)) tocId = sibling.id;
        sibling = sibling.previousElementSibling;
      }
      tocId = tocId || tocItems[0]?.id || '';
      if (tocId) {
        setRecentTocIds(current => {
          const next = new Set(current);
          next.add(tocId);
          return next;
        });
      }

      const rect = element.getBoundingClientRect?.();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const outsideViewport = rect && (rect.bottom < 0 || rect.top > viewportHeight);
      if (outsideViewport) {
        const tocItem = tocItems.find(item => item.id === tocId);
        setLiveUpdateToast({
          anchorId,
          tocId,
          title: tocItem?.title || 'Updated section'
        });
      }
    };
    const usedAnimationFrame = Boolean(window.requestAnimationFrame);
    const frame = usedAnimationFrame ? window.requestAnimationFrame(run) : window.setTimeout(run, 0);
    return () => {
      if (usedAnimationFrame && window.cancelAnimationFrame) window.cancelAnimationFrame(frame);
      else window.clearTimeout(frame);
    };
  }, [liveUpdate, pageId, tocItems]);

  useEffect(() => {
    const qualityStatus = String(page?.aiState?.quality?.status || page?.quality?.status || '').toLowerCase();
    const pageKey = `${pageId}:${page?.updatedAt || page?.aiState?.quality?.checkedAt || ''}`;
    if (workspaceMode || !page || !qualityState || maintaining || autoRebuildPageRef.current === pageKey) return;
    if (!['needs_rebuild', 'fail', 'failed'].includes(qualityStatus)) return;
    if (page?.aiState?.quality?.rebuiltAutomatically && qualityStatus !== 'needs_rebuild') return;
    autoRebuildPageRef.current = pageKey;
    handleMaintain();
  }, [handleMaintain, maintaining, page, pageId, qualityState, workspaceMode]);

  if (loading && !page) return <main className="wiki-page"><p className="wiki-index__status">Loading Wiki page...</p></main>;
  if (!page) {
    return (
      <main className="wiki-page wiki-read wiki-read--missing">
        <section className="wiki-index__empty wiki-read__missing-page" role="alert">
          <p className="wiki-index__eyebrow">Wiki page unavailable</p>
          <h1>This wiki page could not be opened.</h1>
          <p>
            {error || 'The page may have been archived, deleted, or not migrated into the current workspace.'}
            {' '}Open the wiki list to find the current page, or ask {AGENT_DISPLAY_NAME.toLowerCase()} to rebuild it from the topic.
          </p>
          <div className="wiki-read__missing-actions">
            <Link to="/wiki/workspace?view=list">Open wiki list</Link>
            <Link to="/wiki/workspace?view=graph">Open knowledge map</Link>
            <Link to="/wiki">Build a page</Link>
          </div>
        </section>
      </main>
    );
  }
  const readPageType = String(page.pageType || 'topic').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  const bodyTransitionClass = pageTransitionState !== 'idle' ? ' wiki-read__body--transitioning' : '';
  const publicShareUrl = buildPublicWikiShareUrl(page);
  const isSharedPublicly = String(page.visibility || 'private') === 'shared';
  const shareBlocked = isPageQualityBlocked(page);
  const publicShareReady = isSharedPublicly && !shareBlocked;
  const shareReceipt = formatShareReceipt({ page, blocked: shareBlocked });
  const shareReviewSummary = shareBlocked ? formatShareReviewSummary(page) : '';
  return (
    <main
      className={`wiki-page wiki-read wiki-read--type-${readPageType}`}
      data-state={pageTransitionState}
      data-page-transition-state={pageTransitionState}
    >
      {(!workspaceMode || error) ? (
        <div className="wiki-read__topline">
          {!workspaceMode ? (
            <>
              <Button type="button" variant="secondary" onClick={() => navigate('/wiki')}>Back to Wiki</Button>
              <Button type="button" variant="secondary" onClick={onEdit}>Edit</Button>
            </>
          ) : null}
          {error ? <span className="wiki-editor__error" role="alert">{error}</span> : null}
        </div>
      ) : null}
      {nonCriticalReady ? (
        <Suspense fallback={null}>
          {!workspaceMode ? (
            <>
              <WikiChangesSinceLastVisit
                lastViewedAt={lastVisit?.lastViewedAt}
                added={visitDiff.added}
                removed={visitDiff.removed}
                changed={visitDiff.changed}
                onMarkReviewed={handleMarkReviewed}
              />
              <WikiBuildPageComposer compact className="wiki-read__build-page" />
            </>
          ) : null}
        </Suspense>
      ) : null}
      {promotionWitness ? (
        <section
          className="wiki-read__promotion-witness"
          aria-label="Thought promoted to Wiki"
          data-register-transition={promotionWitness.transition}
          data-promotion-receipt={promotionWitness.receipt}
          data-promoted-type={promotionWitness.promotedType}
        >
          <span className="wiki-read__promotion-mark" aria-hidden="true" />
          <div>
            <p className="wiki-read__promotion-kicker">{promotionWitness.from} -> Wiki</p>
            <p>
              {promotionWitness.type} registered as a sourced wiki page
              {promotionWitness.sourceTitle ? <> from <strong>{promotionWitness.sourceTitle}</strong></> : null}
              .
            </p>
            <ol className="wiki-read__promotion-steps" aria-label="Promotion receipt">
              <li>Draft captured</li>
              <li>Graph edge written</li>
              <li>Wiki register settled</li>
            </ol>
          </div>
          {promotionWitness.sourcePath ? (
            <Link to={promotionWitness.sourcePath}>Return to source</Link>
          ) : null}
        </section>
      ) : null}
      {(!loading && page) ? (
        <section
          className={`wiki-read__maintenance-receipt is-${maintenanceReceipt?.status || (maintenanceActive ? 'working' : 'idle')}`}
          aria-label="Wiki maintenance receipt"
          data-maintenance-state={maintenanceReceipt?.status || (maintenanceActive ? 'working' : 'idle')}
        >
          <div className="wiki-read__maintenance-copy">
            <p className="wiki-read__promotion-kicker">Agent-owned page</p>
            <h2>
              {maintenanceActive
                ? 'Checking this page against your corpus'
                : maintenanceReceipt?.status === 'failed'
                  ? 'Maintenance needs a retry'
                  : maintenanceReceipt?.status === 'review'
                    ? 'Maintenance surfaced review work'
                    : maintenanceReceipt?.status === 'settled'
                      ? 'Page maintenance settled'
                      : 'Ready for maintenance'}
            </h2>
            {maintenanceReceipt ? (
              <p>
                {maintenanceReceipt.sourceCount} source{maintenanceReceipt.sourceCount === 1 ? '' : 's'} ·{' '}
                {maintenanceReceipt.claimCount} claim{maintenanceReceipt.claimCount === 1 ? '' : 's'} ·{' '}
                {maintenanceReceipt.issueCount} issue{maintenanceReceipt.issueCount === 1 ? '' : 's'}
              </p>
            ) : (
              <p>Ask {AGENT_DISPLAY_NAME.toLowerCase()} to check sources, claims, and weak signals without leaving the reading surface.</p>
            )}
          </div>
          <AgentTicker
            label="Wiki maintenance trace"
            className="wiki-read__maintenance-ticker"
            state={maintenanceActive ? 'working' : 'idle'}
            lines={maintenanceTraceLines.length
              ? maintenanceTraceLines
              : maintenanceActive
                ? ['drafting page body', 'updating infobox and claims']
                : ['maintenance idle', 'ready to review sources']}
            sharedMemory
            surface={page?.title || 'Wiki page'}
          />
          <div className="wiki-read__maintenance-actions">
            <Button type="button" variant="secondary" onClick={handleMaintain} disabled={maintenanceActive}>
              {maintenanceActive ? 'Running...' : 'Run again'}
            </Button>
          </div>
        </section>
      ) : null}
      <div className={`wiki-read__layout${railCollapsed ? ' wiki-read__layout--rail-collapsed' : ''}`}>
        <aside className="wiki-read__toc">
          {tocItems.length ? (
            <nav aria-label="Page sections">
              <h2>Contents</h2>
              <ol>
                {tocItems.map(item => (
                  <li key={item.id} className={`wiki-read__toc-item wiki-read__toc-item--level-${item.level}`}>
                    <a
                      className={displayedActiveTocId === item.id ? 'is-active' : ''}
                      href={`#${item.id}`}
                      aria-current={displayedActiveTocId === item.id ? 'true' : undefined}
                      onClick={(event) => handleTocClick(event, item.id)}
                    >
                      {recentTocIds.has(item.id) ? <span className="wiki-read__toc-update-dot" aria-label="Recently updated" /> : null}
                      {item.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          ) : null}
        </aside>
        <article
          ref={articleRef}
          className="wiki-read__article"
          onMouseOver={(event) => {
            handleClaimHover(event);
            handleLinkEnter(event);
          }}
          onMouseOut={(event) => {
            handleClaimLeave(event);
            handleLinkLeave(event);
          }}
          onFocus={handleClaimHover}
          onClick={(event) => {
            handleCitationClick(event);
            handleInternalLinkClick(event);
          }}
        >
          <div className="wiki-read__progress" aria-hidden="true">
            <span />
          </div>
          <header className="wiki-read__header">
            {/* AT-21 (Bucket 2 UI rework): the page header used to render an
                uppercase eyebrow, a 4-chip facts row, and a quality state
                card stacked above the title. All three duplicated what the
                right-rail infobox already surfaces, and together they were
                the loudest part of the page. The reader's eye should land
                on the title and run straight into the body — Wikipedia /
                Tolkien Gateway shape. Quality issues, page type, source
                count, and "last reviewed" all live in the rail infobox now.
                In workspace mode the agent will surface quality problems
                via chat notification (AT-26). */}
            <WikiReadTitle title={page.title || 'Untitled Wiki Page'} />
            {hasSharedWikiProvenance(page.adoptedFrom) ? (
              <p className="wiki-read__adopted-attribution" role="note">
                {adoptedAttributionLine(page.adoptedFrom)}
              </p>
            ) : hasStarterPackSampleProvenance(page.adoptedFrom) ? (
              <p className="wiki-read__adopted-attribution wiki-read__adopted-attribution--sample" role="note">
                {starterPackAttributionLine(page.adoptedFrom)}
              </p>
            ) : null}
            <section
              className={`wiki-read__share-card ${publicShareReady ? 'is-shared' : 'is-private'}${shareBlocked ? ' is-blocked' : ''}`}
              aria-label="Share this wiki page"
            >
              <div className="wiki-read__share-card-copy">
                <span className="wiki-read__share-card-kicker">
                  {shareBlocked ? 'Needs review before sharing' : publicShareReady ? 'Public link ready' : 'Private page'}
                </span>
                <p>
                  {shareBlocked
                    ? 'This page is hidden from public sharing until the review items are fixed or archived. Your private workspace copy is unchanged.'
                    : publicShareReady
                      ? 'Shared readers see this article and references only. Backlinks, highlights, source notes, and agent work stay private.'
                      : 'Create a safe public page with the article and references only. Your backlinks, highlights, source notes, and agent work stay private.'}
                </p>
                <p className="wiki-read__share-receipt" aria-label="Public sharing receipt">
                  {shareReceipt}
                </p>
                {shareBlocked ? (
                  <p className="wiki-read__share-review-note">
                    {shareReviewSummary}
                  </p>
                ) : null}
              </div>
              <div className="wiki-read__share-card-actions">
                <Button type="button" variant="secondary" onClick={handleShareSafely} disabled={shareBusy || shareBlocked}>
                  {shareBusy ? 'Preparing...' : shareBlocked ? 'Review first' : publicShareReady ? 'Copy link' : 'Share'}
                </Button>
                {shareBlocked ? (
                  <Link className="wiki-read__share-open" to="/wiki/workspace?view=list&quality=needs_review">
                    Open review queue
                  </Link>
                ) : null}
                {publicShareReady && publicShareUrl ? (
                  <a className="wiki-read__share-open" href={publicShareUrl} target="_blank" rel="noopener noreferrer">
                    Open public page
                  </a>
                ) : null}
                {isSharedPublicly ? (
                  <Button type="button" variant="secondary" onClick={handleStopSharing} disabled={shareBusy}>
                    Stop sharing
                  </Button>
                ) : null}
              </div>
              {shareStatus ? <span className="wiki-read__share-status" role="status">{shareStatus}</span> : null}
            </section>
            {isCompanyDossierPage(page) ? (
              <div className="wiki-read__entity-watches">
                <WikiEdgarWatchControl
                  pageId={pageId}
                  page={page}
                  onPageUpdate={(nextPage) => {
                    latestPageRef.current = nextPage;
                    setPage(nextPage);
                  }}
                />
                <WikiTranscriptWatchControl
                  pageId={pageId}
                  page={page}
                  onPageUpdate={(nextPage) => {
                    latestPageRef.current = nextPage;
                    setPage(nextPage);
                  }}
                />
              </div>
            ) : null}
            {isRepoDossierPage(page) ? (
              <div className="wiki-read__repo-watches">
                <WikiGitHubRepoWatchControl
                  pageId={pageId}
                  page={page}
                  onPageUpdate={(nextPage) => {
                    latestPageRef.current = nextPage;
                    setPage(nextPage);
                  }}
                />
              </div>
            ) : null}
            {!workspaceMode ? (
              <div className="wiki-read__exports" aria-label="Markdown export">
                <button type="button" onClick={handleCopyMarkdown}>Copy markdown</button>
                <button type="button" onClick={handleDownloadMarkdown}>Download .md</button>
                {markdownStatus ? <span role="status">{markdownStatus}</span> : null}
              </div>
            ) : null}
            <div className="wiki-read__viewbar">
              {showPageTalk ? <div className="wiki-read__tabs" role="tablist" aria-label="Wiki page views">
                <button
                  type="button"
                  role="tab"
                  id="wiki-read-tab-article"
                  aria-selected={activeTab === 'article'}
                  aria-controls="wiki-read-panel-article"
                  className={activeTab === 'article' ? 'is-active' : ''}
                  onClick={() => setActiveTab('article')}
                >
                  Article
                </button>
                <button
                  type="button"
                  role="tab"
                  id="wiki-read-tab-talk"
                  aria-selected={activeTab === 'talk'}
                  aria-controls="wiki-read-panel-talk"
                  className={activeTab === 'talk' ? 'is-active' : ''}
                  onClick={() => setActiveTab('talk')}
                >
                  Talk
                  {discussionCount ? <span>{discussionCount}</span> : null}
                </button>
              </div> : null}
            </div>
          </header>
          {!showPageTalk || activeTab === 'article' ? (
            <section
              id="wiki-read-panel-article"
              role="tabpanel"
              aria-labelledby="wiki-read-tab-article"
            >
              <section className="wiki-read__article-panel">
              <section
                className={`wiki-read__body${bodyTransitionClass}`}
                data-state={pageTransitionState}
                data-page-transition-state={pageTransitionState}
              >
                {renderTiptapDoc(displayBody, { tocItems, recentAnchorIds: recentParagraphAnchors, wikiLinkPages })}
              </section>
                {showMarginalia ? (
                  <WikiReadMarginalia
                    sources={page.sourceRefs || []}
                    citations={footnoteCitations}
                    onJumpToReference={(refId) => {
                      if (scrollToElementId(refId)) highlightReference(refId);
                    }}
                  />
                ) : null}
              </section>
              <WikiReadReferences
                sources={page.sourceRefs || []}
                citations={footnoteCitations}
                highlightedRef={highlightedRef}
                onJumpBack={handleReferenceBacklink}
              />
              {showMentionedInFooter ? <WikiMentionedInFooter pageId={pageId} pageTitle={page.title} /> : null}
            </section>
          ) : (
            <section
              id="wiki-read-panel-talk"
              role="tabpanel"
              aria-labelledby="wiki-read-tab-talk"
              className="wiki-read__talk"
            >
              <Suspense fallback={null}>
                <WikiDiscussions
                  discussions={page.discussions || []}
                  onPromote={handlePromoteDiscussion}
                  promotingId={promotingDiscussionId}
                />
                {asking && streamingAskText ? (
                  <aside className="wiki-read__streaming-answer" aria-live="polite" aria-label="Streaming answer">
                    <span>{streamingAskText}</span>
                  </aside>
                ) : null}
                <WikiAskComposer onAsk={handleAsk} busy={asking} />
              </Suspense>
            </section>
          )}
        </article>
        <aside
          className={`wiki-read__rail${railCollapsed ? ' wiki-read__rail--collapsed' : ''}`}
          aria-label="Page context"
        >
          {railCollapsed ? (
            <button
              type="button"
              className="wiki-read__rail-toggle wiki-read__rail-toggle--show"
              onClick={() => setRailCollapsed(false)}
              aria-expanded="false"
              aria-controls="wiki-read-rail-content"
              title="Show context"
            >
              <span aria-hidden="true">›</span>
              <span className="wiki-read__rail-toggle-label">Show context</span>
            </button>
          ) : !nonCriticalReady ? (
            <div
              id="wiki-read-rail-content"
              className="wiki-read__rail-content wiki-read__rail-content--loading"
              role="status"
              aria-live="polite"
            >
              Loading context...
            </div>
          ) : (
            <div id="wiki-read-rail-content" className="wiki-read__rail-content">
              <Suspense fallback={null}>
                <button
                  type="button"
                  className="wiki-read__rail-toggle wiki-read__rail-toggle--hide"
                  onClick={() => setRailCollapsed(true)}
                  aria-expanded="true"
                  aria-controls="wiki-read-rail-content"
                  title="Hide context"
                >
                  <span aria-hidden="true">›</span>
                  <span className="wiki-read__rail-toggle-label">Hide</span>
                </button>
                <section className="wiki-read__infobox wiki-read__infobox--structured">
                  <h2>{labelFor(page.pageType || 'topic')}</h2>
                  <dl>
                    {infoboxRows.map(row => (
                      <InfoboxRow key={row.label} row={row} pageId={pageId} />
                    ))}
                  </dl>
                </section>
                {showUtilityRail && !bodyHasWikiLinks ? (
                  <WikiAutolinkSuggestions pageId={pageId} pageTitle={page.title} />
                ) : null}
                <WikiConnectionTraces pageId={pageId} />
                {showUtilityRail ? <section className="wiki-read__infobox wiki-read__claim-health">
                  <h2>Claim health</h2>
                  <ul>
                    <li>{healthCounts.supported} supported</li>
                    <li>{healthCounts.partial} partial</li>
                    <li>{healthCounts.unsupported} unsupported</li>
                    <li>{healthCounts.conflicted} conflicted</li>
                  </ul>
                </section> : null}
                {showUtilityRail && (page.sourceRefs || []).length ? (
                  <section className="wiki-read__infobox wiki-read__source-list">
                    <h2>Sources</h2>
                    <ol>
                      {(page.sourceRefs || []).slice(0, 8).map((source, index) => {
                        const excerpt = sourceExcerpt(source);
                        const counts = sourceEvidenceCounts({
                          source,
                          claims: page.claims || [],
                          citations: page.citations || []
                        });
                        const countLabel = formatSourceCounts(counts);
                        const isLong = excerpt.length > 180;
                        return (
                          <li key={source._id || source.id || `${source.title}-${index}`}>
                            <span>{source.title || 'Untitled source'}</span>
                            {excerpt ? <p>{conciseText(excerpt)}</p> : null}
                            {countLabel ? <small>{countLabel}</small> : null}
                            {isLong ? (
                              <details>
                                <summary>More</summary>
                                <p>{excerpt}</p>
                              </details>
                            ) : null}
                          </li>
                        );
                      })}
                    </ol>
                  </section>
                ) : null}
              </Suspense>
            </div>
          )}
        </aside>
        {liveUpdateToast ? (
          <div className="wiki-read-live-toast" role="status" aria-live="polite">
            <button type="button" className="wiki-read-live-toast__dismiss" onClick={() => setLiveUpdateToast(null)} aria-label="Dismiss update notice">×</button>
            <span>{liveUpdateToast.title} updated</span>
            <button type="button" onClick={() => handleLiveUpdateJump(liveUpdateToast.anchorId)}>Jump</button>
          </div>
        ) : null}
      </div>
      {activeClaim ? (
        <ClaimCitationPopover
          anchorRect={activeClaim.anchorRect}
          support={activeLedgerClaim?.support || activeClaim.support}
          claim={activeLedgerClaim}
          sources={resolvedActiveSources}
          onClose={() => setActiveClaim(null)}
        />
      ) : null}
      <WikiLinkPreview
        preview={preview}
        onMouseEnter={handlePreviewEnter}
        onMouseLeave={handlePreviewLeave}
      />
    </main>
  );
};

export default WikiPageReadView;
