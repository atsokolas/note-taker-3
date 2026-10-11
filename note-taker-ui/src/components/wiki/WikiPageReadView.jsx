import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ShareDestinations from '../sharing/ShareDestinations';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../ui';
import {
  approveWeekendReadingsRevision,
  archiveWikiPage,
  createWikiPage,
  getWeekendReadingsStatus,
  getWikiBacklinks,
  getWikiPage,
  getWikiRepoComparison,
  listWikiContradictions,
  listWikiRevisions,
  listWikiPages,
  maintainWikiPage,
  publishWeekendReadingsRevision,
  requestWeekendReadingsReview,
  streamMaintainWikiPage,
  trackCompanyDossierInJudgment,
  updateWikiPage,
  acceptOpenedSentenceWording,
  getWikiFirstHeadCandidate,
  reviewWikiFirstHeadCandidate
} from '../../api/wiki';
import api from '../../api';
import { getAuthHeaders } from '../../hooks/useAuthHeaders';
import { getConnectionsForItem } from '../../api/connections';
import { recordClaimCheckIn, recordWikiPageVisit } from '../../api/dailyLoop';
import { trackWikiReadModePageView } from '../../utils/wikiAnalytics';
import { wikiPagePath, wikiReadPath } from '../../utils/wikiFeatureFlags';
import { resolveSourceDoors } from '../../utils/sourceRoutes';
import { cleanSourceTextForDisplay } from '../../utils/sourceDisplayText';
import ClaimCitationPopover from './ClaimCitationPopover';
import renderTiptapDoc, { citationAnchorId, extractTocItems, firstParagraphText } from './renderTiptapDoc';
import { cleanWikiLinkSnippetText } from './wikiLinkText';
import ReferencePullIn from '../references/ReferencePullIn';
import {
  countWikiClaims,
  countWikiPageWords,
  countWikiSources,
  clampWikiPreview
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
  getPrivateWikiNotes,
  recordVisit,
  savePrivateWikiNotes
} from './wikiVisitTracker';
import WikiReaderContext from './WikiReaderContext';
import {
  candidateFootprint,
  changedClaimIdsFromPages,
  changedClaimIdsFromVisit,
  citedSourceOccurrence,
  historicalRevisionSnapshot,
  popReaderPanel,
  pushReaderPanel,
  resolveLibraryHighlight,
  sourceArticleId,
  surroundingFromLibrarySource
} from './wikiReaderContextModel';
import { wikiPassageReference } from './wikiCopyReference';
import { SUPPORT_STATES } from './extensions/Claim';
import { AGENT_DISPLAY_NAME } from '../../constants/agentIdentity';
import { useSystemStatusControls } from '../../system/SystemStatusContext';
import WikiEdgarWatchControl from './WikiEdgarWatchControl';
import WikiGitHubRepoWatchControl, {
  formatRepoWatchPublicationFacts,
  formatRepoWatchPublicationMessage,
  isRepoDossierPage,
  repoWatchPublicationState
} from './WikiGitHubRepoWatchControl';
import {
  applyRepoDossierSectionAnchors,
  buildRepoDossierComparisonHref,
  buildRepoDossierSectionNav,
  buildRepoSectionChangeBadges,
  extractRepoDossierOverviewSummary,
  githubWatchState,
  repoDossierGitHubLabel,
  displayWikiPageTitle,
  repoDossierSectionAnchorId,
  repoDossierShouldCollapseSections,
  repoSectionIdForHeading
} from './wikiRepoDossierModel';
import WikiRepoDeveloperQuickstart from './WikiRepoDeveloperQuickstart';
import WikiRepoDossierOverview from './WikiRepoDossierOverview';
import WikiRepoDossierBody from './WikiRepoDossierBody';
import {
  WikiOpenSentenceProvider,
  wrapOpenableParagraph
} from './open-sentence/WikiOpenSentence';
import { companionForOpenedClaim } from './open-sentence/openSentenceCompanion';
import WikiLivingThesis from './WikiLivingThesis';
import WikiInvestmentValuation from './WikiInvestmentValuation';
import WikiFirstHeadReview from './WikiFirstHeadReview';
import WikiInvestmentMaintenanceComparison from './WikiInvestmentMaintenanceComparison';
import WikiDossierCaseCover from './WikiDossierCaseCover';
import WikiWeekendReadingsPublication from './WikiWeekendReadingsPublication';
import '../../styles/wiki-claim-focus.css';
import '../../styles/wiki-reader-context.css';
import DecisionCreateForm from './decisions/DecisionCreateForm';
import DecisionReviewPanel from './decisions/DecisionReviewPanel';
import { selectableAcceptedRevisions } from './decisions/acceptedRevisionIdentity';
import { swallowSkippedViewTransition } from '../../utils/viewTransitionNavigation';
import { useNoeisAgentSurface } from '../../agent/AgentRailContext';
import { buildWikiSurfaceDescriptor, wikiAllowsOpenSentence } from './wikiSurfaceModel';
import { carryTensionToJudgment, isTension, tensionSeed } from './carryTension';
import { wordBoundaryTrim } from '../../utils/editorialText';
import { humanizeLabel } from '../../utils/humanizeLabel';

const WikiChangesSinceLastVisit = lazy(() => import('./WikiChangesSinceLastVisit'));

const emptyDoc = { type: 'doc', content: [{ type: 'paragraph' }] };

const labelFor = (value = '') => humanizeLabel(value);

const normalizeId = (value) => String(value || '').trim();
const idsMatch = (a, b) => normalizeId(a) && normalizeId(a) === normalizeId(b);
const sameIdentitySet = (left = [], right = []) => {
  const normalizeSet = values => Array.from(new Set(
    (Array.isArray(values) ? values : []).map(normalizeId).filter(Boolean)
  )).sort();
  const a = normalizeSet(left);
  const b = normalizeSet(right);
  return a.length > 0 && a.length === b.length && a.every((value, index) => value === b[index]);
};
const researchEditionLabel = page => String(page?.createdFrom?.label || '').startsWith('this-week-in-ai:')
  ? 'This Week in AI'
  : 'Weekend Readings';
const isResearchEditionPage = page => /^(?:weekend-readings|this-week-in-ai):/.test(String(page?.createdFrom?.label || ''));
const isGeneratedCompanyDossierPage = (page = {}) => (
  /^company-dossier:/i.test(String(page?.createdFrom?.label || ''))
  || Boolean(page?.investmentDossier?.version && page?.investmentDossier?.company?.ticker)
  || Boolean(page?.externalWatches?.edgar?.ticker && page?.externalWatches?.edgar?.status === 'active')
);

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
  const readableType = promotedType === 'question' ? 'Question' : promotedType === 'notebook' || promotedType === 'note' ? 'Notebook page' : 'Concept';
  return {
    type: readableType,
    promotedType,
    from: from === 'think' ? 'Think' : labelFor(from || 'workspace'),
    sourceId,
    sourceTitle,
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
  const text = String(title || '').trim() || 'Untitled wiki page';
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

const loadOwnedLibraryArticle = async (articleId) => {
  const id = String(articleId || '').trim();
  if (!id) return { article: null, highlights: [] };
  const [articleResponse, highlightResponse] = await Promise.all([
    api.get(`/articles/${encodeURIComponent(id)}`, getAuthHeaders()),
    api.get(`/api/articles/${encodeURIComponent(id)}/highlights`, getAuthHeaders())
  ]);
  return {
    article: articleResponse?.data || null,
    highlights: Array.isArray(highlightResponse?.data) ? highlightResponse.data : []
  };
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

const cleanSourceText = cleanSourceTextForDisplay;

const normalizeFocusedClaimId = value => {
  const rawClaimId = String(value || '');
  const claimId = rawClaimId.trim();
  const hasControlCharacter = Array.from(claimId).some(character => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
  if (!claimId || rawClaimId !== claimId || claimId.length > 240 || hasControlCharacter) return '';
  return claimId;
};

const conciseText = (value = '', limit = 180) => (
  wordBoundaryTrim(cleanSourceText(value), { maxLength: limit })
);

const editorialInfoboxText = (value = '', budget = 220) => (
  clampWikiPreview(cleanSourceText(value), budget)
);

const sourceExcerpt = (source = {}) => (
  cleanSourceText(source.excerpt || source.snippet || source.summary || source.description || source.text || '')
);

const buildPublicWikiShareUrl = (page = {}) => {
  const pageId = normalizeId(page?._id || page?.id);
  if (!pageId || typeof window === 'undefined') return '';
  return `${window.location.origin}/share/wiki/${encodeURIComponent(pageId)}`;
};

const formatShareReviewSummary = (page = {}) => {
  const review = normalizeQualityReview(page);
  const reasons = formatQualityReviewReasons(review);
  if (reasons.length === 1) return reasons[0];
  if (reasons.length > 1) return `${reasons.length} review items need attention before this can be public.`;
  return 'Reviews need attention before this can be public.';
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
  const summaryText = editorialInfoboxText(meta.summary || meta.scope || '')
    || editorialInfoboxText(firstParagraphText(value.body));
  const sectionText = sectionTitles(value.body);
  const scopeText = editorialInfoboxText(meta.scope || meta.summary || '')
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

  if (type === 'repo' || githubWatchState(value?.externalWatches?.githubRepo).fullName) {
    return [
      { label: 'GitHub', value: pickFirst(repoDossierGitHubLabel(value), 'Not linked') },
      { label: 'Summary', value: summaryText },
      { label: 'Sections', value: pickFirst(sectionTitles(value.body), 'No sections yet') },
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

const visibleInfoboxRows = (rows = []) => (
  (Array.isArray(rows) ? rows : []).filter((row) => {
    if (row.label !== 'Born') return true;
    const value = row.value;
    return value !== null && value !== undefined && String(value).trim() !== '';
  })
);

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
      <h3>{displayWikiPageTitle(preview.page)}</h3>
      <p>{firstParagraphText(preview.page.body) || 'No summary yet.'}</p>
      <span className="wiki-read-link-preview__meta">{sourceCount} source{sourceCount === 1 ? '' : 's'}</span>
    </aside>
  );
};

const InfoboxValue = ({ value, pageId, label }) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return <AnimatedNumber value={value} resetKey={`${pageId}:${label}`} />;
  }
  if (label === 'Born' && (value === null || value === undefined || value === '')) {
    return null;
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

const WikiReferenceComposer = ({ pageId, pageTitle }) => {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="wiki-read__rail-details wiki-read__rail-details--references"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Reference…</summary>
      {open ? (
        <div className="wiki-read__rail-details-panel">
          <ReferencePullIn
            targetType="wiki_page"
            targetId={pageId}
            targetTitle={pageTitle}
          />
        </div>
      ) : null}
    </details>
  );
};

const WikiReadReferences = ({ sources = [], citations = [], highlightedRef, onJumpBack, onListen }) => {
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
          const doors = resolveSourceDoors(source);
          return (
            <li
              key={source._id || source.id || `${source.title}-${index}`}
              id={refId}
              tabIndex="-1"
              className={highlightedRef === refId ? 'is-highlighted is-kin' : ''}
              onMouseEnter={() => onListen?.(refId)}
              onMouseLeave={() => onListen?.('')}
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
                {doors.ownedHref ? (
                  doors.isLibrary ? (
                    <Link className="wiki-read__reference-title" to={doors.ownedHref}>
                      {source.title || 'Untitled source'}
                    </Link>
                  ) : (
                    <a className="wiki-read__reference-title" href={doors.ownedHref}>
                      {source.title || 'Untitled source'}
                    </a>
                  )
                ) : (
                  <span className="wiki-read__reference-title">{source.title || 'Untitled source'}</span>
                )}
              </div>
              {excerpt ? <p>{conciseText(excerpt, 240)}</p> : null}
              {doors.ownedHref ? (
                doors.isLibrary ? (
                  <Link className="wiki-read__reference-source" to={doors.ownedHref}>
                    Open in Library
                  </Link>
                ) : (
                  <Link className="wiki-read__reference-source" to={doors.ownedHref}>
                    Return to source
                  </Link>
                )
              ) : null}
              {doors.originalHref ? (
                <a
                  className={`wiki-read__reference-source${doors.ownedHref ? ' is-secondary' : ''}`}
                  href={doors.originalHref}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open original
                </a>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
};

/* Under the title: what the page is grown from, and the reading that last
   changed it. A part that is not known is left out, not guessed. */
const grownFrom = ({ words = 0, sources = 0, latest = null } = {}) => {
  const parts = [`${words.toLocaleString()} word${words === 1 ? '' : 's'}${sources ? `, grown from ${sources} source${sources === 1 ? '' : 's'}` : ''}`];
  const saved = latest?.changeSource?.title;
  if (saved) {
    const when = latest.changeSource.at || latest.createdAt;
    parts.push(`last changed when you saved ${saved}${when ? `, ${new Date(when).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}`);
  }
  return `${parts.join(' · ')}.`;
};

const proposalSentence = ({ page, candidate }) => {
  if (!candidate) return `${AGENT_DISPLAY_NAME} proposes a change to this page.`;
  const { changedCount, addedSourceCount } = candidateFootprint({ current: page, candidate });
  const passages = changedCount ? `changing ${changedCount} passage${changedCount === 1 ? '' : 's'}` : 'a change';
  const sources = addedSourceCount ? `, adding ${addedSourceCount} source${addedSourceCount === 1 ? '' : 's'}` : '';
  return `${AGENT_DISPLAY_NAME} proposes ${passages}${sources}.`;
};

/* One line where your reading argues with this page: another of your pages
   when one leans on the arguing source, otherwise the source itself. */
const PageDisagreement = ({ item, pageId }) => {
  const here = idsMatch(item.pageId, pageId);
  const elsewhere = Array.isArray(item.elsewhere) ? item.elsewhere : [];
  const says = here ? item.claimText : elsewhere.find(other => idsMatch(other.pageId, pageId))?.claimText;
  const other = here ? elsewhere[0] : { pageTitle: item.pageTitle, claimText: item.claimText };
  if (!says) return null;
  const quote = text => `“${wordBoundaryTrim(text, { maxLength: 140 })}”`;
  return (
    <p className="wiki-read__disagrees">
      This page says {quote(says)}.{' '}
      {other
        ? <>Your page on {other.pageTitle} says {quote(other.claimText)}.</>
        : <>{item.contradicting?.[0]?.title || 'Another source'} argues otherwise.</>}
      {' '}
      <Link to={`/wiki/contradictions?claim=${encodeURIComponent(`${item.pageId}:${item.claimId}`)}`}>Open both</Link>
    </p>
  );
};

/* Partner rereads the sources on request. The answer is one sentence. */
const RereadSources = ({ state = 'idle', summary = '', trustedArticle = true, sourcesUnchanged = false, onReread, children }) => {
  const line = {
    working: 'Rereading the sources…',
    review: `${AGENT_DISPLAY_NAME} proposes a change. It waits at the top of the page.`,
    settled: `${AGENT_DISPLAY_NAME} reread the sources. The page still holds.`,
    research: `${trustedArticle ? 'The last proposed change was not applied' : 'There is no article yet'}${summary ? `: ${summary}` : '.'}`,
    failed: 'The last reread stopped partway.'
  }[state] || `${AGENT_DISPLAY_NAME} can reread this page’s sources and propose changes.`;
  return (
    <section className="wiki-read__reread" aria-label="Reread the sources" data-state={state}>
      <p>{line}</p>
      <div className="wiki-read__reread-actions">
        <Button type="button" variant="secondary" onClick={onReread} disabled={state === 'working' || sourcesUnchanged}>
          {state === 'working' ? 'Rereading…' : sourcesUnchanged ? 'Sources unchanged' : state === 'failed' ? 'Try again' : 'Reread the sources'}
        </Button>
        {children}
      </div>
      {sourcesUnchanged ? <p className="wiki-read__article-tool-note">Add or replace a source before trying again.</p> : null}
    </section>
  );
};

const WikiReadTitle = ({ title = '', plain = false, named = true }) => {
  const heading = String(title || '').trim() || 'Untitled wiki page';
  const className = named ? 'wiki-read__title' : 'wiki-read__title is-unnamed';
  if (plain) {
    return (
      <h1 className={className} data-view-transition-name="wiki-read-title">
        {heading}
      </h1>
    );
  }
  const parts = splitTitleAccent(title);
  return (
    <h1 className={className} data-view-transition-name="wiki-read-title">
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
  const focusedDecisionId = useMemo(
    () => String(new URLSearchParams(traceSearch || '').get('decisionId') || '').trim(),
    [traceSearch]
  );
  const focusedClaimId = useMemo(
    () => normalizeFocusedClaimId(new URLSearchParams(traceSearch || '').get('claimId')),
    [traceSearch]
  );
  const promotionWitness = useMemo(
    () => promotionWitnessFromSearch(traceSearch),
    [traceSearch]
  );
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [maintaining, setMaintaining] = useState(false);
  const [archiveConfirming, setArchiveConfirming] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const maintenanceActive = maintaining || streamBusy;
  const [rereadResult, setRereadResult] = useState(null);
  const [error, setError] = useState('');
  const [shareBusy, setShareBusy] = useState(false);
  const [shareStatus, setShareStatus] = useState('');
  const [judgmentTrackBusy, setJudgmentTrackBusy] = useState(false);
  const [judgmentTrackStatus, setJudgmentTrackStatus] = useState('');
  const [weekendPublicationState, setWeekendPublicationState] = useState({ code: 'loading', label: 'Loading publication state…' });
  const [weekendPublicationBusy, setWeekendPublicationBusy] = useState(false);
  const [weekendPublicationError, setWeekendPublicationError] = useState('');
  const [weekendPublicUrl, setWeekendPublicUrl] = useState('');
  const [activeClaim, setActiveClaim] = useState(null);
  const [carryingTension, setCarryingTension] = useState(false);
  const [carryTensionError, setCarryTensionError] = useState('');
  const [preview, setPreview] = useState(null);
  const [lastVisit, setLastVisit] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [proposalDeferred, setProposalDeferred] = useState(false);
  const [disagreements, setDisagreements] = useState([]);
  const [highlightedRef, setHighlightedRef] = useState('');
  const [kinRef, setKinRef] = useState('');
  const [recentParagraphAnchors, setRecentParagraphAnchors] = useState(() => new Set());
  const [recentTocIds, setRecentTocIds] = useState(() => new Set());
  const [liveUpdateToast, setLiveUpdateToast] = useState(null);
  const [nonCriticalReady, setNonCriticalReady] = useState(false);
  const [pageTransitionState, setPageTransitionState] = useState('idle');
  const [rawWikiLinkPages, setRawWikiLinkPages] = useState([]);
  const [rawWikiLinkPagesLoaded, setRawWikiLinkPagesLoaded] = useState(false);
  const [repoComparison, setRepoComparison] = useState(null);
  const [repoComparisonAvailable, setRepoComparisonAvailable] = useState(false);
  const [continuationBasis, setContinuationBasis] = useState(null);
  const [revisions, setRevisions] = useState([]);
  const [openedClaimId, setOpenedClaimId] = useState('');
  const [openedExploration, setOpenedExploration] = useState(null);
  const [panelTrail, setPanelTrail] = useState([]);
  const [surroundingOpen, setSurroundingOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState(null);
  const [previewPage, setPreviewPage] = useState(null);
  const [candidatePayload, setCandidatePayload] = useState(null);
  const [acceptBusy, setAcceptBusy] = useState('');
  const [acceptError, setAcceptError] = useState('');
  const [staleCandidate, setStaleCandidate] = useState(false);
  const [privateReason, setPrivateReason] = useState('');
  const [showChangedOnly, setShowChangedOnly] = useState(false);
  const [diffClaimIds, setDiffClaimIds] = useState([]);
  const [copyStatus, setCopyStatus] = useState('');
  const wikiSurfaceDescriptor = buildWikiSurfaceDescriptor({
    page,
    pageId,
    claimId: openedClaimId || activeClaim?.claimId || focusedClaimId,
    revisionId: new URLSearchParams(traceSearch || '').get('revisionId') || '',
    acceptedRevisionId: continuationBasis?.revisionId || '',
    mode: 'read'
  });
  const openedCompanion = companionForOpenedClaim(page, { claimId: openedClaimId, exploration: openedExploration });
  useNoeisAgentSurface('agent-surface.wiki', wikiSurfaceDescriptor, {
    exploration: openedExploration,
    subject: openedCompanion?.subject || displayWikiPageTitle(page, 'Wiki page'),
    boundSources: openedCompanion
      ? openedCompanion.boundSources
      : (page ? countWikiSources(page) : null),
    empty: openedCompanion?.empty || (page
      ? 'Nothing to retrieve until you ask against this accepted page.'
      : 'Loading the page.'),
    ...(openedCompanion ? {
      askPlaceholder: openedCompanion.askPlaceholder,
      roleDescription: openedCompanion.roleDescription,
      lines: openedCompanion.lines
    } : {})
  });
  const reducedMotion = useReducedMotion();
  const [showMarginalia, setShowMarginalia] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(min-width: 1280px)').matches;
  });
  const [mobileStandardReader, setMobileStandardReader] = useState(() => (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(max-width: 720px)').matches
  ));

  // Wikipedia / Tolkien Gateway reading shape — body owns the canvas.
  // Context is optional. A previous explicit open is respected; a citation
  // or proposal can temporarily open the rail without rewriting that choice
  // until the reader hides it again.
  const [railCollapsed, setRailCollapsed] = useState(() => {
    if (shouldOpenTrace) return false;
    try {
      const raw = window.localStorage?.getItem('noeis.wiki.read.rail_collapsed');
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
  const lastRefreshNonceRef = useRef(0);
  const articleRef = useRef(null);
  const focusedClaimNodeRef = useRef(null);
  const recentParagraphTimersRef = useRef(new Map());
  const pageTransitionTimerRef = useRef(null);
  const reducedMotionRef = useRef(reducedMotion);
  const urlIntentRef = useRef('');

  const focusRequestedClaimNode = useCallback(node => {
    if (!node) return;
    const currentTarget = focusedClaimNodeRef.current;
    if (currentTarget?.claimId === focusedClaimId && currentTarget.node?.isConnected) return;
    focusedClaimNodeRef.current = { claimId: focusedClaimId, node };
    let collapsedSection = node.closest?.('details:not([open])');
    while (collapsedSection) {
      collapsedSection.open = true;
      collapsedSection = collapsedSection.parentElement?.closest?.('details:not([open])');
    }
    node.focus({ preventScroll: true });
    node.scrollIntoView?.({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [focusedClaimId, reducedMotion]);

  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
  }, [reducedMotion]);

  useEffect(() => {
    let cancelled = false;
    const recentParagraphTimers = recentParagraphTimersRef.current;
    const hasMountedPage = Boolean(latestPageRef.current);
    const prefersReducedMotion = reducedMotionRef.current;
    setNonCriticalReady(false);
    setRereadResult(null);
    setShareStatus('');
    setShareOpen(false);
    setProposalDeferred(false);
    if (pageTransitionTimerRef.current) {
      clearTimeout(pageTransitionTimerRef.current);
      pageTransitionTimerRef.current = null;
    }
    setPageTransitionState(hasMountedPage && !prefersReducedMotion ? 'exiting' : 'idle');
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const loaded = await getWikiPage(pageId, { reader: 1 });
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
        recordWikiPageVisit(pageId).catch(() => null);
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
  }, [pageId]);

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
    let cancelled = false;
    if (!isResearchEditionPage(page)) {
      setWeekendPublicationState({ code: 'loading', label: 'Loading publication state…' });
      setWeekendPublicationError('');
      setWeekendPublicUrl('');
      return undefined;
    }
    setWeekendPublicationError('');
    getWeekendReadingsStatus(pageId)
      .then((payload) => {
        if (cancelled) return;
        setWeekendPublicationState(payload.approvalState || { code: 'private_draft', label: 'Private draft — not public' });
        if (String(page?.visibility || '') === 'shared') setWeekendPublicUrl(buildPublicWikiShareUrl(page));
      })
      .catch((requestError) => {
        if (cancelled) return;
        setWeekendPublicationError(requestError?.message || 'Could not load publication state.');
      });
    return () => { cancelled = true; };
  }, [page, pageId]);

  const runWeekendPublicationAction = useCallback(async (action) => {
    setWeekendPublicationBusy(true);
    setWeekendPublicationError('');
    try {
      const payload = await action(pageId);
      if (payload.approvalState) setWeekendPublicationState(payload.approvalState);
      if (payload.publicUrl) {
        const absoluteUrl = new URL(payload.publicUrl, window.location.origin).toString();
        setWeekendPublicUrl(absoluteUrl);
        setPage(current => current ? { ...current, visibility: 'shared', status: 'published' } : current);
        latestPageRef.current = latestPageRef.current
          ? { ...latestPageRef.current, visibility: 'shared', status: 'published' }
          : latestPageRef.current;
      }
      if (payload.receipt) systemStatus.setLatestReceipt(payload.receipt);
    } catch (requestError) {
      const editionLabel = researchEditionLabel(page);
      const message = requestError?.message || `${editionLabel} publication action failed.`;
      setWeekendPublicationError(message);
      systemStatus.setRecoverableFailure({
        stage: `${editionLabel} publication`,
        message,
        retryable: false
      });
    } finally {
      setWeekendPublicationBusy(false);
    }
  }, [page, pageId, systemStatus]);

  useEffect(() => {
    if (!refreshNonce || lastRefreshNonceRef.current === refreshNonce) return undefined;
    if (streamBusy) return undefined;
    lastRefreshNonceRef.current = refreshNonce;
    let cancelled = false;
    getWikiPage(pageId, { reader: 1 })
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
  }, [pageId, refreshNonce, streamBusy]);

  useEffect(() => {
    if (!page || !isRepoDossierPage(page)) {
      setRepoComparison(null);
      setRepoComparisonAvailable(false);
      return undefined;
    }
    let cancelled = false;
    getWikiRepoComparison(pageId)
      .then((payload) => {
        if (cancelled) return;
        setRepoComparison(payload?.comparison || null);
        setRepoComparisonAvailable(Boolean(payload?.comparison));
      })
      .catch(() => {
        if (cancelled) return;
        setRepoComparison(null);
        setRepoComparisonAvailable(false);
      });
    return () => { cancelled = true; };
  }, [page, pageId]);

  useEffect(() => {
    let cancelled = false;
    setContinuationBasis(null);
    setRevisions([]);
    if (!page) return undefined;
    listWikiRevisions(pageId)
      .then((rows) => {
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        setRevisions(list);
        const [acceptedBasis] = selectableAcceptedRevisions(list);
        setContinuationBasis(acceptedBasis || null);
      })
      .catch(() => {
        if (!cancelled) {
          setRevisions([]);
          setContinuationBasis(null);
        }
      });
    return () => { cancelled = true; };
  }, [page, pageId]);

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
      if (event.key === 'Escape') {
        event.preventDefault();
        if (surroundingOpen) {
          setSurroundingOpen(false);
          return;
        }
        if (panelTrail.length) {
          const next = popReaderPanel(panelTrail);
          setPanelTrail(next.trail);
          if (!next.trail.length) setSurroundingOpen(false);
          return;
        }
        if (previewMode) {
          setPreviewMode(null);
          setPreviewPage(null);
          setShowChangedOnly(false);
          setDiffClaimIds([]);
          return;
        }
        if (!railCollapsed) {
          setRailCollapsed(true);
        }
        return;
      }
      if (event.key.toLowerCase() === 'e' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        onEdit?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onEdit, panelTrail, previewMode, railCollapsed, surroundingOpen, workspaceMode]);

  /* Where another reading, or another of your pages, argues with this one. */
  useEffect(() => {
    if (!nonCriticalReady || !pageId) return undefined;
    let cancelled = false;
    listWikiContradictions({ pageId, limit: 3 })
      .then((items) => { if (!cancelled) setDisagreements(Array.isArray(items) ? items : []); })
      .catch(() => { if (!cancelled) setDisagreements([]); });
    return () => { cancelled = true; };
  }, [nonCriticalReady, pageId]);

  /* Partner rereads the page's sources. What comes back is either the page as
     it was, or a proposed change the reader accepts or sets aside. */
  const handleMaintain = useCallback(async () => {
    systemStatus.clearRecoverableFailure();
    systemStatus.setBackgroundWork({ label: `Rereading the sources for ${page?.title || 'this page'}` });
    setMaintaining(true);
    setError('');
    setRereadResult(null);
    try {
      const maintained = isGeneratedCompanyDossierPage(page)
        ? await streamMaintainWikiPage(pageId)
        : await maintainWikiPage(pageId);
      latestPageRef.current = maintained;
      setPage(maintained);
      const proposed = [
        'awaiting_first_head_acceptance',
        'awaiting_maintenance_acceptance'
      ].includes(maintained?.aiState?.candidateStatus);
      setRereadResult({ status: proposed ? 'review' : 'settled' });
      systemStatus.setLatestReceipt({
        title: proposed ? `${AGENT_DISPLAY_NAME} proposes a change.` : 'The page still holds.',
        summary: proposed
          ? `“${maintained?.title || 'This page'}” stays as it is until you accept the change.`
          : `${AGENT_DISPLAY_NAME} reread the sources for “${maintained?.title || 'this page'}”.`,
        status: proposed ? 'needs_review' : 'completed',
        href: wikiReadPath(pageId)
      });
    } catch (maintainError) {
      const rejected = maintainError?.code === 'WIKI_CANDIDATE_REJECTED';
      const evidenceIncomplete = maintainError?.code === 'WIKI_DOSSIER_EVIDENCE_INCOMPLETE';
      const firstFailure = (Array.isArray(maintainError?.qualityFailures) ? maintainError.qualityFailures : []).find(Boolean);
      const message = rejected
        ? `The page is unchanged. ${firstFailure || 'The proposed change did not hold up against the sources.'}`
        : maintainError?.message || 'The reread stopped partway. Try again.';
      // Keep the article stable while adopting only what explains the refusal.
      if (maintainError?.page) {
        latestPageRef.current = maintainError.page;
        setPage(current => rejected
          ? {
              ...current,
              aiState: maintainError.page.aiState || current?.aiState,
              freshness: maintainError.page.freshness || current?.freshness
            }
          : maintainError.page);
      }
      setError(message);
      setRereadResult({ status: rejected || evidenceIncomplete ? 'research' : 'failed', summary: message });
      if (rejected || evidenceIncomplete) {
        systemStatus.setLatestReceipt({
          title: rejected ? 'The page was not changed.' : 'More reading is needed.',
          summary: message,
          status: 'needs_review',
          href: wikiReadPath(pageId)
        });
      } else {
        systemStatus.setRecoverableFailure({
          stage: 'Rereading the sources',
          message,
          retryable: true,
          retry: () => { handleMaintain(); }
        });
      }
    } finally {
      systemStatus.setBackgroundWork(null);
      setMaintaining(false);
    }
  }, [page, pageId, systemStatus]);

  const handleDiscardFailedDossier = useCallback(async () => {
    if (!pageId) return;
    try {
      await archiveWikiPage(pageId);
      navigate('/wiki/workspace?view=list', { replace: true });
    } catch (_error) {
      setError('The failed draft could not be discarded. Try again.');
    }
  }, [navigate, pageId]);

  // Until now only a failed company dossier could be removed, so duplicates and
  // empty scaffolds accumulated on every other page type with no way out. This
  // archives rather than deletes: the backend keeps the document, flips it to
  // archived, and records a revision, so a mistake is recoverable.
  //
  // Two steps on purpose. Removing a page the owner has been building is not an
  // action to take on a single stray click, and the confirmation names the page
  // so the wrong one of two same-titled duplicates cannot go quietly.
  const handleArchivePage = useCallback(async () => {
    if (!pageId) return;
    if (!archiveConfirming) {
      setArchiveConfirming(true);
      return;
    }
    setArchiving(true);
    setError('');
    try {
      await archiveWikiPage(pageId);
      systemStatus.setLatestReceipt({
        title: 'Wiki page archived',
        summary: `“${page?.title || 'Untitled page'}” was archived. It is out of your Wiki but not destroyed.`,
        status: 'settled',
        href: '/wiki'
      });
      navigate('/wiki', { replace: true });
    } catch (_error) {
      setError('That page could not be archived. Try again.');
      setArchiving(false);
      setArchiveConfirming(false);
    }
  }, [archiveConfirming, navigate, page, pageId, systemStatus]);

  const handleShareSafely = useCallback(async () => {
    const currentPage = latestPageRef.current || page;
    const publicUrl = buildPublicWikiShareUrl(currentPage);
    if (!currentPage || !publicUrl) return;
    if (isPageQualityBlocked(currentPage)) {
      setShareStatus('Fix or archive the open reviews before sharing this page publicly.');
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
        setShareStatus('Link copied.');
      } else {
        setShareStatus('The link is ready.');
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

  const handleTrackInJudgment = useCallback(async () => {
    if (!pageId || judgmentTrackBusy) return;
    setJudgmentTrackBusy(true);
    setJudgmentTrackStatus('');
    try {
      const result = await trackCompanyDossierInJudgment(pageId);
      const nextPage = result?.page;
      if (nextPage) {
        latestPageRef.current = nextPage;
        setPage(nextPage);
      }
      systemStatus.setLatestReceipt?.({
        title: result?.receipt?.title || 'Tracking this dossier in Judgment.',
        summary: result?.receipt?.summary || 'The research stays in Wiki. The company case is ready in Judgment.',
        status: 'completed',
        href: `/judgment/${pageId}`
      });
      navigate(`/judgment/${pageId}`);
    } catch (trackError) {
      setJudgmentTrackStatus(
        trackError?.response?.data?.error
        || trackError?.message
        || 'This dossier could not be tracked in Judgment.'
      );
    } finally {
      setJudgmentTrackBusy(false);
    }
  }, [judgmentTrackBusy, navigate, pageId, systemStatus]);

  const acceptOpenedWording = useCallback(async ({ claimId, against, text }) => {
    const saved = await acceptOpenedSentenceWording(pageId, { claimId, against, text });
    if (!saved) return;
    latestPageRef.current = saved;
    setPage(saved);
  }, [pageId]);

  const makeOpenedTitle = useCallback(async (text) => {
    const line = String(text || '').trim();
    if (!line || line === String(latestPageRef.current?.title || page?.title || '').trim()) return;
    const saved = await updateWikiPage(pageId, { title: line });
    if (!saved) return;
    latestPageRef.current = saved;
    setPage(saved);
  }, [page?.title, pageId]);

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
    setKinRef(target.getAttribute('data-footnote-target') || '');
  }, []);

  const highlightReference = useCallback((refId = '') => {
    setHighlightedRef(refId);
    window.setTimeout(() => {
      setHighlightedRef(current => (current === refId ? '' : current));
    }, 1600);
  }, []);

  const listeningRef = kinRef || highlightedRef;

  const openCitedSource = useCallback(async ({
    source = {},
    checking = '',
    claimId = '',
    citationIndex = 0,
    returnTo = ''
  } = {}) => {
    const reading = previewPage || page;
    const occurrence = citedSourceOccurrence({
      page: reading,
      source,
      claimId,
      citationIndex
    });
    const surround = surroundingFromLibrarySource({ source });
    setSurroundingOpen(false);
    setPanelTrail(current => pushReaderPanel(current, {
      type: 'source',
      returnTo,
      source: source || {},
      checking,
      surround,
      occurrence,
      revisionId: reading?.rev || occurrence.revisionId || '',
      claimId,
      citationIndex,
      historical: previewMode === 'history',
      proposed: previewMode === 'candidate'
    }));
    setRailCollapsed(false);
    const articleId = sourceArticleId(source);
    if (!articleId || surround.canExpand) return;
    try {
      const { article, highlights } = await loadOwnedLibraryArticle(articleId);
      const highlight = resolveLibraryHighlight({ source, highlights });
      const next = surroundingFromLibrarySource({ source, article, highlight });
      setPanelTrail((current) => {
        const last = current[current.length - 1];
        if (
          last?.type !== 'source'
          || last?.claimId !== claimId
          || Number(last?.citationIndex || 0) !== Number(citationIndex || 0)
        ) {
          return current;
        }
        return [...current.slice(0, -1), { ...last, surround: next }];
      });
    } catch (_error) {
      // Keep the cited excerpt. Do not invent surrounding text.
    }
  }, [page, previewMode, previewPage]);

  const handleCitationClick = useCallback((event) => {
    const target = event.target.closest?.('.wiki-claim-citation');
    if (!target) return;
    event.preventDefault();
    const claimNode = target.closest?.('[data-claim-id]') || target;
    const claimId = claimNode.getAttribute('data-claim-id') || '';
    const indexes = parseIndexAttribute(target.getAttribute('data-citation-indexes'));
    const citationIndex = indexes[0] || Number(String(target.getAttribute('aria-label') || '').replace(/\D+/g, '')) || 1;
    const reading = previewPage || page;
    const source = (reading?.sourceRefs || [])[citationIndex - 1];
    const claim = (reading?.claims || []).find(entry => idsMatch(entry?.claimId, claimId));
    const checking = claim?.text || claimNode.textContent || '';
    setActiveClaim(null);
    openCitedSource({
      source,
      checking,
      claimId,
      citationIndex
    });
    const refId = target.getAttribute('data-footnote-target') || '';
    if (refId && scrollToElementId(refId)) highlightReference(refId);
  }, [highlightReference, openCitedSource, page, previewPage]);

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
    const go = () => navigate(wikiReadPath(targetPageId), {
      state: { fromWikiPageId: pageId, fromWikiTitle: page?.title || '' }
    });
    if (typeof document !== 'undefined' && typeof document.startViewTransition === 'function') {
      swallowSkippedViewTransition(document.startViewTransition(go));
    } else {
      go();
    }
  }, [navigate, page?.title, pageId]);

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

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(max-width: 720px)');
    const update = () => setMobileStandardReader(Boolean(query.matches));
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
    setKinRef('');
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
        const loaded = await getWikiPage(targetPageId, { reader: 1 });
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
    ((previewPage || page)?.claims || []).forEach((claim) => {
      if (claim?.claimId) map.set(claim.claimId, claim);
    });
    return map;
  }, [page, previewPage]);

  const retiredClaims = useMemo(() => (
    (page?.claims || []).filter(claim => claim?.checkInStatus === 'retired' || claim?.retiredAt)
  ), [page?.claims]);
  const [restoringClaimId, setRestoringClaimId] = useState('');
  const [restoreClaimStatus, setRestoreClaimStatus] = useState('');
  const handleRestoreClaim = useCallback(async (claimId) => {
    setRestoringClaimId(claimId);
    setRestoreClaimStatus('');
    try {
      const result = await recordClaimCheckIn({ pageId, claimId, action: 'restored' });
      setPage(current => current ? {
        ...current,
        claims: (current.claims || []).map(claim => claim.claimId === claimId ? result.claim : claim)
      } : current);
      setRestoreClaimStatus('Claim restored to active review.');
    } catch (error) {
      setRestoreClaimStatus(error?.response?.data?.error || 'Claim restoration failed.');
    } finally {
      setRestoringClaimId('');
    }
  }, [pageId]);

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

  const carryActiveTension = useCallback(async () => {
    if (carryingTension) return;
    const seed = tensionSeed({
      claim: activeClaim ? claimLedgerById.get(activeClaim.claimId) : null,
      sources: resolvedActiveSources,
      fallbackSentence: displayWikiPageTitle(page, 'Wiki tension')
    });
    if (!seed) return;
    setCarryingTension(true);
    setCarryTensionError('');
    try {
      const judgmentId = await carryTensionToJudgment(seed, {
        createPage: createWikiPage,
        updatePage: updateWikiPage
      });
      setActiveClaim(null);
      navigate(`/judgment/${judgmentId}`);
    } catch (error) {
      setCarryTensionError(error?.message || 'This could not be carried into a judgment.');
    } finally {
      setCarryingTension(false);
    }
  }, [activeClaim, carryingTension, claimLedgerById, navigate, page, resolvedActiveSources]);

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

  const contextPanel = panelTrail[panelTrail.length - 1] || null;
  const railHidden = railCollapsed && !contextPanel;
  const fromWikiPageId = normalizeId(location.state?.fromWikiPageId);
  const awaitingCandidate = [
    'awaiting_first_head_acceptance',
    'awaiting_maintenance_acceptance'
  ].includes(page?.aiState?.candidateStatus);

  useEffect(() => {
    if (!pageId) return undefined;
    setPrivateReason(getPrivateWikiNotes(pageId).reason);
    return undefined;
  }, [pageId]);

  useEffect(() => {
    let cancelled = false;
    if (!awaitingCandidate || !pageId) {
      setCandidatePayload(null);
      setStaleCandidate(false);
      return undefined;
    }
    getWikiFirstHeadCandidate(pageId)
      .then((result) => {
        if (!cancelled) {
          setCandidatePayload(result);
          setStaleCandidate(false);
        }
      })
      .catch((requestError) => {
        if (!cancelled) {
          setCandidatePayload(null);
          if (requestError?.response?.status === 409) setStaleCandidate(true);
        }
      });
    return () => { cancelled = true; };
  }, [awaitingCandidate, pageId, page?.aiState?.candidateStatus]);

  const openContextPanel = useCallback((panel) => {
    setPanelTrail(current => pushReaderPanel(current, panel));
    setRailCollapsed(false);
  }, []);

  const closeContextPanels = useCallback(() => {
    setPanelTrail([]);
    setSurroundingOpen(false);
  }, []);

  const handleContextBack = useCallback(() => {
    setPanelTrail((current) => {
      const next = popReaderPanel(current);
      setSurroundingOpen(false);
      return next.trail;
    });
  }, []);

  const exitIsolatedPreview = useCallback(() => {
    setPreviewMode(null);
    setPreviewPage(null);
    setShowChangedOnly(false);
    setDiffClaimIds([]);
  }, []);

  const openCandidatePreview = useCallback((candidatePage = candidatePayload?.candidate) => {
    if (!candidatePage) return;
    if (previewMode === 'candidate') {
      exitIsolatedPreview();
      return;
    }
    setPreviewMode('candidate');
    setPreviewPage(candidatePage);
    setShowChangedOnly(false);
    openContextPanel({
      type: 'review',
      title: 'A proposed revision, not yet the page.',
      reason: candidatePayload?.summary?.reason || '',
      currentText: firstParagraphText(page?.body) || page?.plainText || '',
      proposedText: firstParagraphText(candidatePage?.body) || candidatePage?.plainText || '',
      revisionId: candidatePayload?.revisionId || ''
    });
  }, [candidatePayload, exitIsolatedPreview, openContextPanel, page, previewMode]);

  const handleAcceptCandidate = useCallback(async () => {
    if (acceptBusy || !pageId) return;
    setAcceptBusy('accept');
    setAcceptError('');
    try {
      const result = await reviewWikiFirstHeadCandidate(pageId, 'accept');
      if (result?.page) {
        latestPageRef.current = result.page;
        setPage(result.page);
      }
      exitIsolatedPreview();
      setCandidatePayload(null);
      setStaleCandidate(false);
      setPanelTrail([{ type: 'reason', revisionId: result?.page?.rev || '' }]);
      setRailCollapsed(false);
    } catch (requestError) {
      const stale = requestError?.response?.data?.code === 'WIKI_RESEARCH_CANDIDATE_STALE'
        || requestError?.response?.status === 409;
      setStaleCandidate(stale);
      if (stale) {
        exitIsolatedPreview();
        setAcceptError('');
      } else {
        setAcceptError(requestError?.response?.data?.error || requestError?.message || 'Could not accept this revision.');
      }
    } finally {
      setAcceptBusy('');
    }
  }, [acceptBusy, exitIsolatedPreview, pageId]);

  const handleKeepCurrent = useCallback(async () => {
    if (acceptBusy || !pageId) return;
    setAcceptBusy('keep');
    setAcceptError('');
    try {
      const result = await reviewWikiFirstHeadCandidate(pageId, 'reject');
      if (result?.page) {
        latestPageRef.current = result.page;
        setPage(result.page);
      }
      exitIsolatedPreview();
      setCandidatePayload(null);
      closeContextPanels();
    } catch (requestError) {
      setAcceptError(requestError?.response?.data?.error || requestError?.message || 'Could not keep the current version.');
    } finally {
      setAcceptBusy('');
    }
  }, [acceptBusy, closeContextPanels, exitIsolatedPreview, pageId]);

  const handleNotNow = useCallback(() => {
    exitIsolatedPreview();
    closeContextPanels();
  }, [closeContextPanels, exitIsolatedPreview]);

  const handleOpenHistoryRevision = useCallback((revision) => {
    const snapshot = historicalRevisionSnapshot(revision);
    if (!snapshot) return;
    setPreviewMode('history');
    setPreviewPage(snapshot);
    setShowChangedOnly(false);
    setDiffClaimIds([]);
    openContextPanel({
      type: 'reference',
      text: firstParagraphText(snapshot.body) || snapshot.plainText || '',
      pageId,
      revisionId: snapshot.rev || '',
      historical: true
    });
  }, [openContextPanel, pageId]);

  const handleCopyReference = useCallback(async () => {
    const reading = previewPage || page;
    const text = contextPanel?.checking || contextPanel?.text || firstParagraphText(reading?.body) || '';
    const clip = wikiPassageReference({
      page: reading,
      text,
      claimId: contextPanel?.claimId || '',
      revisionId: contextPanel?.revisionId || reading?.rev || '',
      sources: contextPanel?.source ? [contextPanel.source] : (reading?.sourceRefs || []),
      proposed: previewMode === 'candidate' || contextPanel?.proposed,
      historical: previewMode === 'history' || contextPanel?.historical
    });
    if (!clip) return;
    try {
      await navigator.clipboard.writeText(clip);
      setCopyStatus('Copied with reference.');
    } catch (_error) {
      setCopyStatus('Clipboard permission blocked copy.');
    }
  }, [contextPanel, page, previewMode, previewPage]);

  const handlePrivateReasonChange = useCallback((value) => {
    setPrivateReason(value);
    savePrivateWikiNotes(pageId, { reason: value });
  }, [pageId]);

  const handleFollowLinkedPage = useCallback((relatedId) => {
    navigate(wikiReadPath(relatedId), {
      state: { fromWikiPageId: pageId, fromWikiTitle: page?.title || '' }
    });
  }, [navigate, page?.title, pageId]);

  const handleOpenHistoryPanel = useCallback(() => {
    openContextPanel({ type: 'history' });
  }, [openContextPanel]);

  const handleShowChangedInPage = useCallback(() => {
    const ids = changedClaimIdsFromVisit({
      page,
      added: visitDiff.added,
      changed: visitDiff.changed
    });
    setDiffClaimIds(ids);
    setShowChangedOnly(Boolean(ids.length));
    if (ids.length) setRailCollapsed(true);
  }, [page, visitDiff.added, visitDiff.changed]);

  useEffect(() => {
    const params = new URLSearchParams(traceSearch || '');
    const review = params.get('review') === '1';
    const revisionId = params.get('rev') || '';
    const intent = `${review ? 'review' : ''}|${revisionId}`;
    if (!review && !revisionId) return;
    if (urlIntentRef.current === intent) return;
    if (review) {
      if (!candidatePayload?.candidate) return;
      urlIntentRef.current = intent;
      setPreviewMode('candidate');
      setPreviewPage(candidatePayload.candidate);
      setShowChangedOnly(false);
      setDiffClaimIds([]);
      setPanelTrail([{
        type: 'review',
        title: 'A proposed revision, not yet the page.',
        reason: candidatePayload?.summary?.reason || '',
        currentText: firstParagraphText(page?.body) || page?.plainText || '',
        proposedText: firstParagraphText(candidatePayload.candidate?.body) || candidatePayload.candidate?.plainText || '',
        revisionId: candidatePayload?.revisionId || ''
      }]);
      setRailCollapsed(false);
      return;
    }
    if (revisionId && revisions.length) {
      const match = revisions.find(entry => idsMatch(entry?._id || entry?.id, revisionId));
      if (!match) return;
      urlIntentRef.current = intent;
      handleOpenHistoryRevision(match);
    }
  }, [candidatePayload, handleOpenHistoryRevision, page?.body, page?.plainText, revisions, traceSearch]);

  const readingPage = previewPage || page;
  const strippedBody = useMemo(
    () => stripLeadingDuplicateTitleHeading(readingPage?.body || emptyDoc, readingPage?.title || page?.title || ''),
    [page?.title, readingPage?.body, readingPage?.title]
  );
  const bodyTocItems = useMemo(() => extractTocItems(strippedBody), [strippedBody]);
  const displayBody = useMemo(() => {
    if (!isRepoDossierPage(page)) return strippedBody;
    return applyRepoDossierSectionAnchors(strippedBody, bodyTocItems);
  }, [page, strippedBody, bodyTocItems]);
  const previewDiffIds = useMemo(() => (
    previewMode === 'candidate' ? changedClaimIdsFromPages(page, previewPage) : []
  ), [page, previewMode, previewPage]);
  const markedClaimIds = useMemo(() => {
    if (showChangedOnly && diffClaimIds.length) return new Set(diffClaimIds);
    if (previewMode === 'candidate' && previewDiffIds.length) return new Set(previewDiffIds);
    return undefined;
  }, [diffClaimIds, previewDiffIds, previewMode, showChangedOnly]);
  const repoDossierMode = isRepoDossierPage(page);
  const repoSectionNav = useMemo(
    () => (repoDossierMode ? buildRepoDossierSectionNav({ tocItems: bodyTocItems }) : []),
    [repoDossierMode, bodyTocItems]
  );
  const repoOverviewSummary = useMemo(
    () => (repoDossierMode ? extractRepoDossierOverviewSummary(displayBody, page) : ''),
    [repoDossierMode, displayBody, page]
  );
  const repoSectionBadges = useMemo(
    () => (repoDossierMode ? buildRepoSectionChangeBadges(repoComparison) : {}),
    [repoDossierMode, repoComparison]
  );
  const repoCollapseSections = useMemo(
    () => (repoDossierMode ? repoDossierShouldCollapseSections(page, bodyTocItems) : false),
    [repoDossierMode, page, bodyTocItems]
  );
  const repoWatch = page?.externalWatches?.githubRepo;
  const repoPublicationState = useMemo(
    () => (repoDossierMode ? repoWatchPublicationState(repoWatch) : 'current'),
    [repoDossierMode, repoWatch]
  );
  const repoPublicationMessage = useMemo(
    () => (repoDossierMode ? formatRepoWatchPublicationMessage(repoWatch, page, repoPublicationState) : ''),
    [repoDossierMode, repoWatch, page, repoPublicationState]
  );
  const repoPublicationFacts = useMemo(
    () => (repoDossierMode ? formatRepoWatchPublicationFacts(repoWatch) : null),
    [repoDossierMode, repoWatch]
  );
  useEffect(() => {
    let cancelled = false;
    if (!hasRawWikiSyntax(displayBody) && !hasInlineWikiLinks(displayBody)) {
      setRawWikiLinkPages([]);
      setRawWikiLinkPagesLoaded(false);
      return undefined;
    }
    listWikiPages({ limit: 500, summary: 1 })
      .then((nextPages) => {
        if (!cancelled) {
          setRawWikiLinkPages(Array.isArray(nextPages) ? nextPages : []);
          setRawWikiLinkPagesLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRawWikiLinkPages([]);
          setRawWikiLinkPagesLoaded(false);
        }
      });
    return () => { cancelled = true; };
  }, [displayBody]);
  const wikiLinkPages = useMemo(() => (
    [
      page ? { _id: page._id || page.id || page.pageId, title: page.title } : null,
      ...collectRelatedWikiPages(page),
      ...rawWikiLinkPages.filter(candidate => {
        const readableWords = typeof candidate?.bodyWordCount === 'number'
          ? candidate.bodyWordCount
          : candidate?.wordCount;
        return typeof readableWords !== 'number' || readableWords > 0;
      })
    ].filter(Boolean)
  ), [page, rawWikiLinkPages]);
  const validWikiLinkTargetIds = useMemo(() => rawWikiLinkPages
    .filter(candidate => {
      const readableWords = typeof candidate?.bodyWordCount === 'number'
        ? candidate.bodyWordCount
        : candidate?.wordCount;
      return typeof readableWords !== 'number' || readableWords > 0;
    })
    .map(candidate => candidate?._id || candidate?.id || candidate?.pageId)
    .filter(Boolean), [rawWikiLinkPages]);
  const tocItems = useMemo(() => {
    const mappedBodyToc = repoDossierMode
      ? bodyTocItems.map(item => {
        const sectionId = repoSectionIdForHeading(item.title);
        if (!sectionId) return item;
        return {
          ...item,
          id: repoDossierSectionAnchorId(sectionId)
        };
      })
      : bodyTocItems;
    const hasReferences = Array.isArray(page?.sourceRefs) && page.sourceRefs.length > 0;
    if (!hasReferences || mappedBodyToc.some(item => item.id === 'wiki-read-references-title')) {
      return mappedBodyToc;
    }
    return [
      ...mappedBodyToc,
      {
        id: 'wiki-read-references-title',
        title: 'References',
        level: 2,
        blockIndex: Number.MAX_SAFE_INTEGER
      }
    ];
  }, [bodyTocItems, page?.sourceRefs, repoDossierMode]);
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
  const infoboxRows = visibleInfoboxRows(buildInfoboxRows({
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
  }));
  const activeLedgerClaim = activeClaim ? claimLedgerById.get(activeClaim.claimId) : null;
  const displayedActiveTocId = activeTocId || tocItems[0]?.id || '';

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
            <Link to="/think?tab=home">Begin in Think</Link>
            <Link to="/wiki">Build a page</Link>
          </div>
        </section>
      </main>
    );
  }
  const readPageType = String(page.pageType || 'topic').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  const bodyTransitionClass = pageTransitionState !== 'idle' ? ' wiki-read__body--transitioning' : '';
  const publicShareUrl = buildPublicWikiShareUrl(page);
  const weekendReadingsPage = isResearchEditionPage(page);
  const investmentDossierPage = Boolean(page?.investmentDossier?.version);
  const livingThesisPage = Boolean(page?.judgment?.kind) && !investmentDossierPage;
  const isSharedPublicly = String(page.visibility || 'private') === 'shared';
  const shareBlocked = isPageQualityBlocked(page);
  const publicShareReady = isSharedPublicly && !shareBlocked;
  const shareReviewSummary = shareBlocked ? formatShareReviewSummary(page) : '';
  const companyDossier = isGeneratedCompanyDossierPage(page);
  const standardWikiPage = !weekendReadingsPage
    && !repoDossierMode
    && !investmentDossierPage
    && !livingThesisPage
    && !companyDossier;
  const openSentenceEnabled = wikiAllowsOpenSentence(page, { workspaceMode });
  const specializedWorkflowPage = !standardWikiPage && !weekendReadingsPage;
  const edgarWatch = page?.externalWatches?.edgar || {};
  const edgarWatchStatus = String(edgarWatch.status || '').toLowerCase();
  const edgarWatchConfigured = Boolean(normalizeId(edgarWatch.ticker || edgarWatch.cik));
  const evidenceIncomplete = companyDossier
    && page?.aiState?.errorCode === 'WIKI_DOSSIER_EVIDENCE_INCOMPLETE';
  const dossierReviewPending = investmentDossierPage && [
    'awaiting_first_head_acceptance',
    'awaiting_maintenance_acceptance'
  ].includes(page?.aiState?.candidateStatus);
  const persistedMaintenanceFailure = !evidenceIncomplete && (
    page?.aiState?.draftStatus === 'error'
    || page?.aiState?.errorCode === 'WIKI_CANDIDATE_REJECTED'
  );
  const persistedCandidateRejection = !evidenceIncomplete && (
    page?.aiState?.candidateStatus === 'rejected'
    || page?.aiState?.errorCode === 'WIKI_CANDIDATE_REJECTED'
  );
  const trustedArticleAvailable = countWikiPageWords(page) > 0;
  const currentMaintenanceSourceRefIds = (Array.isArray(page?.sourceRefs) ? page.sourceRefs : [])
    .map(source => source?.objectId || source?._id || source?.id)
    .filter(Boolean);
  const rejectedSourcesUnchanged = persistedCandidateRejection
    && page?.aiState?.sourceScopeAtDraft !== 'entire_library'
    && sameIdentitySet(
      currentMaintenanceSourceRefIds,
      page?.aiState?.lastCandidateSourceRefIds
    );
  const rereadState = maintenanceActive
    ? 'working'
    : rereadResult?.status
      || (evidenceIncomplete || persistedCandidateRejection ? 'research' : persistedMaintenanceFailure ? 'failed' : 'idle');
  const rereadSummary = rereadResult?.summary
    || (rereadState === 'research' ? (page?.aiState?.lastCandidateSummary || page?.aiState?.lastError || '') : '');
  const rereadSources = (
    <RereadSources
      state={rereadState}
      summary={rereadSummary}
      trustedArticle={trustedArticleAvailable}
      sourcesUnchanged={rejectedSourcesUnchanged}
      onReread={handleMaintain}
    >
      {persistedMaintenanceFailure && companyDossier && !page?.aiState?.lastDraftedAt ? (
        <Button type="button" variant="ghost" onClick={handleDiscardFailedDossier} disabled={maintenanceActive}>
          Discard draft
        </Button>
      ) : null}
    </RereadSources>
  );
  const shareCard = weekendReadingsPage ? null : (
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
            ? 'This page is hidden from public sharing until the open reviews are fixed or archived. Your private workspace copy is unchanged.'
            : publicShareReady
              ? 'Readers of the link see this article and its references. Your highlights, notes, and links stay private.'
              : 'Share this article and its references by link. Your highlights, notes, and links stay private.'}
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
          <>
            <ShareDestinations url={publicShareUrl} title="A Wiki page from Noeis" />
            <a className="wiki-read__share-open" href={publicShareUrl} target="_blank" rel="noopener noreferrer">
              Open public page
            </a>
          </>
        ) : null}
        {isSharedPublicly ? (
          <Button type="button" variant="secondary" onClick={handleStopSharing} disabled={shareBusy}>
            Stop sharing
          </Button>
        ) : null}
      </div>
      {shareStatus ? <span className="wiki-read__share-status" role="status">{shareStatus}</span> : null}
    </section>
  );
  const repoComparisonHref = buildRepoDossierComparisonHref({
    pageId,
    page,
    shared: publicShareReady,
    comparisonAvailable: repoComparisonAvailable
  });
  const repoComparisonPendingShare = repoComparisonAvailable && !publicShareReady;
  return (
    <main
      className={`wiki-page wiki-read wiki-read--type-${readPageType}${standardWikiPage ? ' wiki-read--standard' : ''}${weekendReadingsPage ? ' wiki-read--research-edition' : ''}${previewMode === 'candidate' ? ' wiki-read--preview' : ''}${previewMode === 'history' ? ' wiki-read--historical' : ''}${showChangedOnly && diffClaimIds.length ? ' wiki-read--diff-only' : ''}`}
      data-state={pageTransitionState}
      data-page-transition-state={pageTransitionState}
    >
      {error ? (
        <div className="wiki-read__topline">
          <span className="wiki-editor__error" role="alert">{error}</span>
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
                onShowInPage={handleShowChangedInPage}
              />
            </>
          ) : null}
        </Suspense>
      ) : null}
      {promotionWitness ? (
        <section className="wiki-read__promotion-witness" aria-label="Thought promoted to Wiki" data-promoted-type={promotionWitness.promotedType}>
          <span className="wiki-read__promotion-mark" aria-hidden="true" />
          <p>
            Your {promotionWitness.type.toLowerCase()} is a wiki page now
            {promotionWitness.sourceTitle ? <>, grown from <strong>{promotionWitness.sourceTitle}</strong></> : null}.
          </p>
          {promotionWitness.sourcePath ? <Link to={promotionWitness.sourcePath}>Back to where it began</Link> : null}
        </section>
      ) : null}
      {(!loading && page && specializedWorkflowPage && !investmentDossierPage) ? rereadSources : null}
      <div className={`wiki-read__layout${railHidden ? ' wiki-read__layout--rail-collapsed' : ''}${contextPanel ? ' wiki-read__layout--panel-open' : ''}`}>
        {!standardWikiPage || !mobileStandardReader ? <aside className={`wiki-read__toc wiki-read__left-rail${standardWikiPage ? ' wiki-read__toc--desktop' : ''}`} aria-label="Wiki navigation">
          {repoDossierMode && repoSectionNav.length ? (
            <nav className="wiki-read__repo-dossier-toc" aria-label="Repository dossier contents">
              <h2>Dossier</h2>
              <ol>
                {repoSectionNav.map(item => (
                  <li key={item.id} className={`wiki-read__toc-item${item.available ? '' : ' is-missing'}`}>
                    <a
                      className={item.available && displayedActiveTocId === item.anchorId ? 'is-active' : ''}
                      href={item.available ? `#${item.anchorId}` : undefined}
                      aria-current={item.available && displayedActiveTocId === item.anchorId ? 'true' : undefined}
                      aria-disabled={item.available ? undefined : 'true'}
                      onClick={item.available ? (event) => handleTocClick(event, item.anchorId) : undefined}
                    >
                      {item.label}
                      {Number(repoSectionBadges[item.id] || 0) > 0 ? (
                        <span className="wiki-read__repo-dossier-nav-badge">{repoSectionBadges[item.id]}</span>
                      ) : null}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          ) : null}
          {tocItems.length ? (
            <nav aria-label="Page sections">
              <h2>{repoDossierMode ? 'All sections' : 'Contents'}</h2>
              <ol>
                {tocItems.map((item, index) => (
                  <li key={`${item.id}-${item.blockIndex ?? index}`} className={`wiki-read__toc-item wiki-read__toc-item--level-${item.level}`}>
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
          {nonCriticalReady ? (
            <WikiReferenceComposer
              pageId={pageId}
              pageTitle={displayWikiPageTitle(page, 'Wiki page')}
            />
          ) : null}
        </aside> : null}
        <article
          ref={articleRef}
          className={`wiki-read__article${listeningRef ? ' is-listening' : ''}`}
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
          <header className={`wiki-read__header${livingThesisPage ? ' wiki-read__header--living-thesis' : ''}`}>
            {/* Title, then straight into the body: what the page is grown from
                lives in one line, and type, health and review live in the rail. */}
            {livingThesisPage ? <p className="wiki-read__object-label">Living thesis</p> : null}
            <WikiReadTitle
              title={displayWikiPageTitle(page)}
              plain={standardWikiPage}
              named={Boolean(String(page?.title || '').trim())}
            />
            {standardWikiPage ? (
              <p className="wiki-read__grown" aria-label="Where this page came from">
                {grownFrom({ words: countWikiPageWords(page), sources: countPageSources(page), latest: revisions[0] })}
              </p>
            ) : null}
            {weekendReadingsPage ? (
              <WikiWeekendReadingsPublication
                editionLabel={researchEditionLabel(page)}
                approvalState={weekendPublicationState}
                busy={weekendPublicationBusy}
                error={weekendPublicationError}
                publicUrl={weekendPublicUrl}
                onRequestReview={() => runWeekendPublicationAction(requestWeekendReadingsReview)}
                onApprove={() => runWeekendPublicationAction(approveWeekendReadingsRevision)}
                onPublish={() => runWeekendPublicationAction(publishWeekendReadingsRevision)}
              />
            ) : null}
            {livingThesisPage ? (
              <WikiLivingThesis
                page={page}
                pageId={pageId}
                onPageUpdate={(nextPage) => {
                  if (!nextPage) return;
                  latestPageRef.current = nextPage;
                  setPage(nextPage);
                }}
                onCanonicalPage={(canonicalPageId) => {
                  navigate(wikiPagePath(canonicalPageId), { replace: true });
                }}
              />
            ) : null}
            {investmentDossierPage ? (
              <WikiDossierCaseCover
                page={page}
                pageId={pageId}
                shareBlocked={shareBlocked}
                maintenanceActive={maintenanceActive}
                judgmentTrackBusy={judgmentTrackBusy}
                judgmentTrackStatus={judgmentTrackStatus}
                onMaintain={handleMaintain}
                onTrackInJudgment={handleTrackInJudgment}
              />
            ) : null}
            {specializedWorkflowPage && !investmentDossierPage ? <details
              className="wiki-read__page-status wiki-read__stage5-decisions"
              open={Boolean(focusedDecisionId)}
              id={focusedDecisionId ? `decision-${focusedDecisionId}` : 'wiki-stage5-decisions'}
            >
              <summary className="wiki-read__page-status-summary">
                <span className="wiki-read__page-status-label">Decisions &amp; outcomes</span>
                <span className="wiki-read__page-status-facts">
                  <span>Accepted-revision grounded</span>
                  <span>Outcomes never inferred</span>
                </span>
                <span className="wiki-read__page-status-action" aria-hidden="true">Open</span>
              </summary>
              <div className="wiki-read__page-status-panel">
                <DecisionReviewPanel
                  pageId={pageId}
                  decisionId={focusedDecisionId}
                  page={page}
                  onPageRefresh={async () => {
                    const refreshed = await getWikiPage(pageId, { reader: 1 });
                    if (refreshed) {
                      latestPageRef.current = refreshed;
                      setPage(refreshed);
                    }
                  }}
                />
                <details className="wiki-read__decision-create">
                  <summary>Record a decision from an accepted revision</summary>
                  <DecisionCreateForm
                    page={page}
                    pageId={pageId}
                    onCreated={async () => {
                      const refreshed = await getWikiPage(pageId, { reader: 1 });
                      if (refreshed) {
                        latestPageRef.current = refreshed;
                        setPage(refreshed);
                      }
                    }}
                  />
                </details>
              </div>
            </details> : null}
            {hasSharedWikiProvenance(page.adoptedFrom) ? (
              <p className="wiki-read__adopted-attribution" role="note">
                {adoptedAttributionLine(page.adoptedFrom)}
              </p>
            ) : hasStarterPackSampleProvenance(page.adoptedFrom) ? (
              <p className="wiki-read__adopted-attribution wiki-read__adopted-attribution--sample" role="note">
                {starterPackAttributionLine(page.adoptedFrom)}
              </p>
            ) : null}
            {companyDossier ? (
              <details className="wiki-read__page-status">
                <summary className="wiki-read__page-status-summary">
                  <span className="wiki-read__page-status-label">Filings</span>
                  <span className="wiki-read__page-status-facts">
                    <span className={edgarWatchStatus === 'error' ? 'is-error' : ''}>
                      {edgarWatchStatus === 'error' ? 'Not reaching the SEC' : edgarWatchConfigured ? 'Watching SEC filings' : 'Not watching SEC filings'}
                    </span>
                  </span>
                  <span className="wiki-read__page-status-action" aria-hidden="true">Manage</span>
                </summary>
                <div className="wiki-read__page-status-panel">
                  <div className="wiki-read__entity-watches">
                    <WikiEdgarWatchControl
                      pageId={pageId}
                      page={page}
                      onPageUpdate={(nextPage) => {
                        latestPageRef.current = nextPage;
                        setPage(nextPage);
                      }}
                    />
                  </div>
                </div>
              </details>
            ) : null}
            {isRepoDossierPage(page) ? (
              <div className="wiki-read__repo-watches">
                <WikiRepoDossierOverview
                  page={page}
                  overviewSummary={repoOverviewSummary}
                  sectionNav={repoSectionNav}
                  sectionBadges={repoSectionBadges}
                  publicationMessage={repoPublicationMessage}
                  publishedHead={repoPublicationFacts?.publishedHead || ''}
                  buildStateLabel={repoPublicationFacts?.buildStateLabel || ''}
                  comparisonHref={repoComparisonHref}
                  comparisonPendingShare={repoComparisonPendingShare}
                  collapseEnabled={repoCollapseSections}
                  onSectionNavigate={(event) => {
                    const href = event.currentTarget.getAttribute('href') || '';
                    const anchorId = href.startsWith('#') ? href.slice(1) : '';
                    if (anchorId) handleTocClick(event, anchorId);
                  }}
                />
                <WikiGitHubRepoWatchControl
                  pageId={pageId}
                  page={page}
                  onPageUpdate={(nextPage) => {
                    latestPageRef.current = nextPage;
                    setPage(nextPage);
                  }}
                />
                <WikiRepoDeveloperQuickstart page={page} />
              </div>
            ) : null}
            {weekendReadingsPage ? null : (
              <nav className="wiki-read__actions" aria-label="Page actions">
                {typeof onEdit === 'function' ? <button type="button" onClick={onEdit}>Edit</button> : null}
                <button type="button" onClick={handleOpenHistoryPanel}>History</button>
                <button type="button" aria-expanded={shareOpen} onClick={() => setShareOpen(open => !open)}>Share</button>
              </nav>
            )}
            {shareOpen ? shareCard : null}
            {disagreements.map(item => (
              <PageDisagreement key={`${item.pageId}:${item.claimId}`} item={item} pageId={pageId} />
            ))}
          </header>
          {standardWikiPage && mobileStandardReader && tocItems.length ? (
            <aside className="wiki-read__toc wiki-read__toc--mobile">
              <nav aria-label="Article contents">
                <h2>Contents</h2>
                <ol>
                  {tocItems.map((item, index) => (
                    <li key={`${item.id}-mobile-${item.blockIndex ?? index}`} className={`wiki-read__toc-item wiki-read__toc-item--level-${item.level}`}>
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
            </aside>
          ) : null}
          {standardWikiPage && mobileStandardReader && nonCriticalReady ? (
            <WikiReferenceComposer
              pageId={pageId}
              pageTitle={displayWikiPageTitle(page, 'Wiki page')}
            />
          ) : null}
          <section id="wiki-read-panel-article">
              <section className="wiki-read__article-panel">
              {fromWikiPageId ? (
                <div className="wiki-read__return-thread">
                  <span>You arrived from another page.</span>
                  <Link to={wikiReadPath(fromWikiPageId)}>Return to {location.state?.fromWikiTitle || 'the previous page'}</Link>
                </div>
              ) : null}
              {awaitingCandidate && !proposalDeferred && !investmentDossierPage && !staleCandidate ? (
                <div className="wiki-read__proposal" role="status">
                  <button type="button" className="wiki-read__proposal-sentence" onClick={() => openCandidatePreview()} disabled={!candidatePayload?.candidate}>
                    {proposalSentence({ page, candidate: candidatePayload?.candidate })}
                  </button>
                  <span className="wiki-read__proposal-actions">
                    <button type="button" onClick={handleAcceptCandidate} disabled={Boolean(acceptBusy) || !candidatePayload}>
                      {acceptBusy === 'accept' ? 'Accepting…' : 'Accept'}
                    </button>
                    <button type="button" onClick={() => { handleNotNow(); setProposalDeferred(true); }}>Not now</button>
                  </span>
                </div>
              ) : null}
              {previewMode === 'candidate' ? (
                <div className="wiki-read__preview-strip">
                  <span>You are reading the proposed change. The page itself is unchanged.</span>
                  <button type="button" onClick={exitIsolatedPreview}>Return to the current page</button>
                </div>
              ) : null}
              {previewMode === 'history' ? (
                <div className="wiki-read__history-banner">
                  <span>Earlier version. These are the words as they were.</span>
                  <button type="button" onClick={exitIsolatedPreview}>Return to the current page</button>
                </div>
              ) : null}
              <section
                className={`wiki-read__body${bodyTransitionClass}${previewMode ? ' is-preview' : ''}${showChangedOnly && diffClaimIds.length ? ' is-diff-only' : ''}`}
                data-state={pageTransitionState}
                data-page-transition-state={pageTransitionState}
              >
                {repoDossierMode ? (
                  <WikiRepoDossierBody
                    doc={displayBody}
                    tocItems={tocItems}
                    collapseSections={repoCollapseSections}
                    recentAnchorIds={recentParagraphAnchors}
                    wikiLinkPages={wikiLinkPages}
                    focusedClaimId={focusedClaimId}
                    focusedClaimRef={focusRequestedClaimNode}
                  />
                ) : (
                  <WikiOpenSentenceProvider
                    enabled={openSentenceEnabled && !previewMode}
                    page={page}
                    pageId={pageId}
                    revisions={revisions}
                    onOpenedClaim={setOpenedClaimId}
                    onOpenedExploration={setOpenedExploration}
                    durable={!previewMode}
                    onAcceptWording={openSentenceEnabled && !previewMode ? acceptOpenedWording : undefined}
                    onMakeTitle={openSentenceEnabled && !previewMode ? makeOpenedTitle : undefined}
                  >
                    {renderTiptapDoc(displayBody, {
                      tocItems,
                      recentAnchorIds: recentParagraphAnchors,
                      wikiLinkPages,
                      validateWikiLinkTargets: rawWikiLinkPagesLoaded,
                      validWikiLinkTargetIds,
                      claimLedgerById,
                      focusedClaimId,
                      focusedClaimRef: focusRequestedClaimNode,
                      kinFootnote: listeningRef,
                      changedClaimIds: markedClaimIds,
                      wrapParagraph: openSentenceEnabled && !previewMode ? wrapOpenableParagraph : undefined
                    })}
                  </WikiOpenSentenceProvider>
                )}
              </section>
                {showMarginalia ? (
                  <WikiReadMarginalia
                    sources={readingPage?.sourceRefs || page.sourceRefs || []}
                    citations={footnoteCitations}
                    onJumpToReference={(refId) => {
                      if (scrollToElementId(refId)) highlightReference(refId);
                    }}
                  />
                ) : null}
              </section>
              {investmentDossierPage ? (
                <details
                  id="wiki-dossier-review"
                  className="wiki-read__dossier-review wiki-read__page-status"
                  open={dossierReviewPending || undefined}
                >
                  <summary className="wiki-read__page-status-summary">
                    <span className="wiki-read__page-status-label">Research and valuation review</span>
                    <span className="wiki-read__page-status-facts">
                      <span>Candidate → accepted research → optional Judgment revision</span>
                    </span>
                    <span className="wiki-read__page-status-action" aria-hidden="true">Open</span>
                  </summary>
                  <div className="wiki-read__dossier-review-panel">
                    <WikiFirstHeadReview
                      page={page}
                      pageId={pageId}
                      previewActive={previewMode === 'candidate'}
                      onPreview={openCandidatePreview}
                      onNotNow={handleNotNow}
                      onAccepted={() => {
                        setPanelTrail([{ type: 'reason' }]);
                        setRailCollapsed(false);
                        exitIsolatedPreview();
                      }}
                      onPageUpdate={(nextPage) => {
                        if (!nextPage) return;
                        latestPageRef.current = nextPage;
                        setPage(nextPage);
                      }}
                    />
                    <WikiInvestmentValuation
                      page={page}
                      pageId={pageId}
                      onPageUpdate={(nextPage) => {
                        if (!nextPage) return;
                        latestPageRef.current = nextPage;
                        setPage(nextPage);
                      }}
                    />
                    <WikiInvestmentMaintenanceComparison
                      comparison={page?.investmentDossier?.lastMaintenanceComparison}
                    />
                    {page?.judgment?.kind ? (
                      <p className="wiki-read__dossier-judgment-link">
                        Research acceptance never rewrites your belief. <Link to={`/judgment/${pageId}`}>Review the company case in Judgment →</Link>
                      </p>
                    ) : null}
                  </div>
                </details>
              ) : null}
              <WikiReadReferences
                sources={(readingPage?.sourceRefs || page.sourceRefs) || []}
                citations={footnoteCitations}
                highlightedRef={listeningRef}
                onListen={setKinRef}
                onJumpBack={handleReferenceBacklink}
              />
              {standardWikiPage ? (
                <details className="wiki-read__article-tools" open={persistedCandidateRejection || undefined}>
                  <summary>Page tools</summary>
                  <div className="wiki-read__article-tools-panel">
                    {rereadSources}
                    <details
                      className="wiki-read__page-status wiki-read__stage5-decisions"
                      open={Boolean(focusedDecisionId)}
                      id={focusedDecisionId ? `decision-${focusedDecisionId}` : 'wiki-stage5-decisions'}
                    >
                      <summary className="wiki-read__page-status-summary">
                        <span className="wiki-read__page-status-label">Decisions &amp; outcomes</span>
                        <span className="wiki-read__page-status-facts">
                          <span>Optional workspace</span>
                        </span>
                        <span className="wiki-read__page-status-action" aria-hidden="true">Open</span>
                      </summary>
                      <div className="wiki-read__page-status-panel">
                        <DecisionReviewPanel
                          pageId={pageId}
                          decisionId={focusedDecisionId}
                          page={page}
                          onPageRefresh={async () => {
                            const refreshed = await getWikiPage(pageId, { reader: 1 });
                            if (refreshed) {
                              latestPageRef.current = refreshed;
                              setPage(refreshed);
                            }
                          }}
                        />
                        <details className="wiki-read__decision-create">
                          <summary>Record a decision from an accepted revision</summary>
                          <DecisionCreateForm
                            page={page}
                            pageId={pageId}
                            onCreated={async () => {
                              const refreshed = await getWikiPage(pageId, { reader: 1 });
                              if (refreshed) {
                                latestPageRef.current = refreshed;
                                setPage(refreshed);
                              }
                            }}
                          />
                        </details>
                      </div>
                    </details>
                    <section
                      className="wiki-read__article-tool wiki-read__archive-tool"
                      aria-label="Archive this Wiki page"
                    >
                      <div>
                        <p className="wiki-read__article-tool-label">Remove this page</p>
                        <h2>
                          {archiveConfirming
                            ? `Archive “${displayWikiPageTitle(page) || 'this page'}”?`
                            : 'Archive this page'}
                        </h2>
                        <p>
                          {archiveConfirming
                            ? 'It leaves your Wiki, its links, and its graph. The page and its history are kept, not destroyed.'
                            : 'Use this for a duplicate, an empty scaffold, or a page you no longer want maintained.'}
                        </p>
                      </div>
                      <div className="wiki-read__archive-actions">
                        <Button
                          type="button"
                          variant={archiveConfirming ? 'primary' : 'secondary'}
                          onClick={handleArchivePage}
                          disabled={archiving || maintenanceActive}
                        >
                          {archiving
                            ? 'Archiving…'
                            : archiveConfirming ? 'Yes, archive it' : 'Archive page'}
                        </Button>
                        {archiveConfirming ? (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setArchiveConfirming(false)}
                            disabled={archiving}
                          >
                            Keep it
                          </Button>
                        ) : null}
                      </div>
                    </section>
                  </div>
                </details>
              ) : null}
              <WikiMentionedInFooter pageId={pageId} pageTitle={page.title} />
            </section>
        </article>
        <aside
          className={`wiki-read__rail${railHidden ? ' wiki-read__rail--collapsed' : ''}`}
          aria-label="Page context"
        >
          {railHidden ? (
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
          ) : !nonCriticalReady && !contextPanel ? (
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
                  onClick={() => {
                    closeContextPanels();
                    setRailCollapsed(true);
                  }}
                  aria-expanded="true"
                  aria-controls="wiki-read-rail-content"
                  title="Hide context"
                >
                  <span aria-hidden="true">›</span>
                  <span className="wiki-read__rail-toggle-label">Hide</span>
                </button>
                {contextPanel ? (
                  <WikiReaderContext
                    panel={contextPanel}
                    page={readingPage || page}
                    candidate={candidatePayload?.candidate || null}
                    revisions={revisions}
                    preview={previewMode === 'candidate'}
                    surroundingOpen={surroundingOpen}
                    privateReason={privateReason}
                    onClose={closeContextPanels}
                    onBack={handleContextBack}
                    onToggleSurround={() => setSurroundingOpen(open => !open)}
                    onAccept={handleAcceptCandidate}
                    onKeepCurrent={handleKeepCurrent}
                    onNotNow={handleNotNow}
                    onOpenHistoryRevision={handleOpenHistoryRevision}
                    onSeenChanges={handleMarkReviewed}
                    onPrivateReasonChange={handlePrivateReasonChange}
                    onFollowPage={handleFollowLinkedPage}
                    onCopyReference={handleCopyReference}
                    onShowInPage={handleShowChangedInPage}
                    acceptBusy={acceptBusy}
                    acceptError={acceptError || copyStatus}
                    stale={staleCandidate}
                  />
                ) : null}
                {!contextPanel && standardWikiPage ? <section className="wiki-read__infobox wiki-read__infobox--structured wiki-read__infobox--primary">
                  <h2>About this page</h2>
                  <p className="wiki-read__infobox-type">{labelFor(page.pageType || 'topic')}</p>
                  <dl>
                    {infoboxRows.map(row => (
                      <InfoboxRow key={row.label} row={row} pageId={pageId} />
                    ))}
                  </dl>
                </section> : null}
                {!contextPanel && !standardWikiPage ? <section className="wiki-read__infobox wiki-read__infobox--structured">
                  <h2>{labelFor(page.pageType || 'topic')}</h2>
                  <dl>
                    {infoboxRows.map(row => (
                      <InfoboxRow key={row.label} row={row} pageId={pageId} />
                    ))}
                  </dl>
                </section> : null}
                {!contextPanel ? (
                <>
                <details className="wiki-read__rail-details">
                  <summary>Page details</summary>
                  <div className="wiki-read__rail-details-panel">
                    <WikiConnectionTraces pageId={pageId} />
                    {retiredClaims.length || restoreClaimStatus ? (
                      <section className="wiki-read__infobox wiki-read__retired-claims">
                        <h2>Retired claims</h2>
                        {retiredClaims.length ? <ul>
                          {retiredClaims.map(claim => (
                            <li key={claim.claimId}>
                              <span>{claim.text}</span>
                              <small>
                                Retired {claim.retiredAt ? new Date(claim.retiredAt).toLocaleDateString() : 'previously'}
                              </small>
                              <button
                                type="button"
                                disabled={restoringClaimId === claim.claimId}
                                onClick={() => handleRestoreClaim(claim.claimId)}
                              >
                                {restoringClaimId === claim.claimId ? 'Restoring…' : 'Restore claim'}
                              </button>
                            </li>
                          ))}
                        </ul> : null}
                        {restoreClaimStatus ? <p role="status">{restoreClaimStatus}</p> : null}
                      </section>
                    ) : null}
                  </div>
                </details>
                </>
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
          onCarry={isTension(resolvedActiveSources) ? carryActiveTension : null}
          carrying={carryingTension}
          carryError={carryTensionError}
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
