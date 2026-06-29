import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { searchKeyword } from '../api/retrieval';
import { createWikiPage, listWikiPages } from '../api/wiki';
import { Card, Button } from './ui';
import { buildCanonicalArticlePath } from '../utils/firstInsight';
import { getNotebookSummaries } from '../api/notebook';
import { createQuestion } from '../api/questions';
import { buildWikiCreatePayload, openWikiDraft } from '../utils/wikiCreate';
import { buildReferenceHandoffPath } from '../navigation/referenceHandoff';
import { startLibraryFilingSuggestions } from '../api/library';
import { useSystemStatusControls } from '../system/SystemStatusContext';
import { normalizeSystemReceipt } from '../system/systemStatusModel';
import {
  buildQuestionPayloadFromHighlights,
  buildQuestionReviewPath,
  buildWikiSectionPayloadFromHighlights,
  parseHighlightToQuestionIntent,
  parseHighlightToWikiSectionIntent,
  resolveHighlightsForIntent
} from '../utils/highlightToThinkingModel';

const EMPTY_GROUPS = {
  notes: [],
  highlights: [],
  claims: [],
  evidence: []
};

const buildResultLabel = (item = {}, fallback = '') => {
  const primary = String(item.title || item.text || fallback || '').trim();
  const secondary = String(item.snippet || item.content || item.articleTitle || '').trim();
  if (!secondary) return primary || 'Untitled';
  if (!primary) return secondary;
  return `${primary} — ${secondary.slice(0, 90)}`;
};

const normalizeSearchText = (value = '') => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[\s\p{Punctuation}]+/gu, ' ')
  .trim();

const scoreLocalMatch = (label = '', query = '') => {
  const normalizedLabel = normalizeSearchText(label);
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedLabel || !normalizedQuery) return 0;
  if (normalizedLabel === normalizedQuery) return 100;
  if (normalizedLabel.startsWith(normalizedQuery)) return 90;
  const words = normalizedLabel.split(/\s+/).filter(Boolean);
  if (words.some(word => word === normalizedQuery)) return 86;
  if (words.some(word => word.startsWith(normalizedQuery))) return 82;
  if (normalizedLabel.includes(normalizedQuery)) return 50;
  return 0;
};

export const parseWikiBuildCommand = (value = '') => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const patterns = [
    /^turn\s+(?:my\s+)?highlights?\s+(?:on|about)\s+(.+?)\s+into\s+(?:a\s+)?wiki\s+page\.?$/i,
    /^turn\s+(.+?)\s+highlights?\s+into\s+(?:a\s+)?wiki\s+page\.?$/i,
    /^(?:create|make|build)\s+(?:a\s+)?wiki\s+page\s+(?:from|about|on)\s+(.+?)\.?$/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const topic = String(match?.[1] || '').trim().replace(/[.?!]+$/g, '').trim();
    if (topic) {
      return {
        topic,
        label: `Turn highlights on "${topic.slice(0, 48)}" into a wiki page`,
        sourceText: text
      };
    }
  }
  return null;
};

export const parseHighlightRetrieveIntent = (value = '') => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const patterns = [
    /^find(?:\s+the)?\s+highlight\s+I\s+saved\s+(?:about|on)\s+(.+?)\.?$/i,
    /^find(?:\s+the)?\s+highlight(?:\s+I\s+saved)?\s+(?:about|on)\s+(.+?)\.?$/i,
    /^find\s+my\s+highlight\s+(?:about|on)\s+(.+?)\.?$/i,
    /^show(?:\s+me)?(?:\s+the)?\s+highlights?\s+(?:about|on|I\s+saved\s+(?:about|on))\s+(.+?)\.?$/i,
    /^locate(?:\s+the)?\s+highlight(?:\s+I\s+saved)?\s+(?:about|on)\s+(.+?)\.?$/i,
    /^retrieve(?:\s+the)?\s+highlight(?:\s+I\s+saved)?\s+(?:about|on)\s+(.+?)\.?$/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const topic = String(match?.[1] || '').trim().replace(/[.?!]+$/g, '').trim();
    if (topic) {
      return {
        topic,
        label: `Find highlight about "${topic.slice(0, 48)}"`,
        sourceText: text
      };
    }
  }
  return null;
};

export const parseLibraryFilingReviewIntent = (value = '') => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const patterns = [
    /^review(?:\s+my)?\s+filing\s+suggestions?\.?$/i,
    /^review(?:\s+my)?\s+library\s+filing(?:\s+suggestions?)?\.?$/i,
    /^clean\s+up(?:\s+my)?\s+library\s+filing(?:\s+suggestions?)?\.?$/i,
    /^clean\s+up(?:\s+my)?\s+filing\s+suggestions?\.?$/i,
    /^organize(?:\s+my)?\s+library\s+filing(?:\s+suggestions?)?\.?$/i,
    /^stage(?:\s+my)?\s+library\s+filing\s+suggestions?\.?$/i,
    /^start(?:\s+my)?\s+library\s+filing(?:\s+review)?\.?$/i
  ];
  for (const pattern of patterns) {
    if (pattern.test(text)) {
      return {
        label: 'Review library filing suggestions',
        sourceText: text
      };
    }
  }
  return null;
};

const cleanCompareTopic = (value = '') => String(value || '')
  .trim()
  .replace(/[.?!]+$/g, '')
  .replace(/\s+(?:in|as)\s+(?:a\s+)?(?:wiki\s+)?(?:page|comparison)$/i, '')
  .trim();

export const parseWikiCompareCommand = (value = '') => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const patterns = [
    /^compare(?:\s+my)?\s+(?:notes|pages|wiki\s+pages|wikis|thinking)\s+(?:on|about)\s+(.+?)\s+(?:and|with|vs\.?|versus)\s+(.+?)\.?$/i,
    /^compare\s+(.+?)\s+(?:and|with|vs\.?|versus)\s+(.+?)\.?$/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const left = cleanCompareTopic(match?.[1] || '');
    const right = cleanCompareTopic(match?.[2] || '');
    if (left && right) {
      return {
        left,
        right,
        topic: `${left} vs ${right}`,
        label: `Compare "${left.slice(0, 32)}" and "${right.slice(0, 32)}"`,
        sourceText: text
      };
    }
  }
  return null;
};

export const parseWikiTemporalCommand = (value = '') => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const patterns = [
    /^what\s+changed\s+(?:in\s+my\s+thinking\s+)?(?:on|about)\s+(.+?)(?:\s+(?:over|in|during)\s+the\s+last\s+(.+?))?\.?$/i,
    /^what\s+changed\s+since\s+I\s+last\s+opened\s+(.+?)\.?$/i,
    /^show\s+(?:me\s+)?(?:the\s+)?change\s+(?:ledger|history)\s+(?:for|on|about)\s+(.+?)\.?$/i,
    /^draft\s+(?:a\s+)?change\s+(?:ledger|history)\s+(?:for|on|about)\s+(.+?)\.?$/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const topic = cleanCompareTopic(match?.[1] || '');
    const period = cleanCompareTopic(match?.[2] || '');
    if (topic) {
      return {
        topic,
        period,
        label: `Draft change ledger for "${topic.slice(0, 48)}"`,
        sourceText: text
      };
    }
  }
  return null;
};

export const collectHighlightCandidates = (groups = {}) => [
  ...(Array.isArray(groups.highlights) ? groups.highlights : []),
  ...(Array.isArray(groups.claims) ? groups.claims : []).filter(item => item.articleId || item.sourceType === 'highlight'),
  ...(Array.isArray(groups.evidence) ? groups.evidence : []).filter(item => item.articleId || item.sourceType === 'highlight')
];

export const scoreHighlightMatch = (item = {}, topic = '') => {
  const label = [
    item.text,
    item.note,
    item.snippet,
    item.articleTitle,
    item.title
  ].filter(Boolean).join(' ');
  const baseScore = scoreLocalMatch(label, topic);
  if (baseScore > 0) return baseScore;
  const normalizedLabel = normalizeSearchText(label);
  const topicWords = normalizeSearchText(topic).split(/\s+/).filter(Boolean);
  if (!normalizedLabel || topicWords.length === 0) return 0;
  const matchedWords = topicWords.filter(word => normalizedLabel.includes(word));
  if (matchedWords.length === 0) return 0;
  return 40 + Math.round((matchedWords.length / topicWords.length) * 40);
};

export const pickBestHighlightMatch = (items = [], topic = '') => {
  const ranked = items
    .map((item, index) => ({ item, index, score: scoreHighlightMatch(item, topic) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  if (ranked.length > 0) return ranked[0].item;
  return items[0] || null;
};

export const buildHighlightOpenPath = (item = {}) => {
  const articleId = String(item.articleId || '').trim();
  const highlightId = String(item._id || item.id || '').trim();
  if (!articleId) return '/library?scope=highlights';
  const basePath = buildCanonicalArticlePath(articleId);
  if (!highlightId) return basePath;
  return `${basePath}&highlightId=${encodeURIComponent(highlightId)}`;
};

const rankLocalItems = (items = [], query = '') => (
  items
    .map((item, index) => ({ item, index, score: scoreLocalMatch(item.label, query) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ item }) => ({ ...item, immediate: true }))
);

const currentPathname = () => (
  typeof window === 'undefined' ? '' : window.location?.pathname || ''
);

const currentLocationSearch = () => (
  typeof window === 'undefined' ? '' : window.location?.search || ''
);

const CommandPalette = ({ open, onClose }) => {
  const navigate = useNavigate();
  const systemStatus = useSystemStatusControls();
  const [query, setQuery] = useState('');
  const [articles, setArticles] = useState([]);
  const [searchGroups, setSearchGroups] = useState(EMPTY_GROUPS);
  const [notebook, setNotebook] = useState([]);
  const [collections, setCollections] = useState([]);
  const [concepts, setConcepts] = useState([]);
  const [wikiPages, setWikiPages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const isWikiSurface = currentPathname().startsWith('/wiki');
  const pullReferencePath = buildReferenceHandoffPath({
    pathname: currentPathname(),
    search: currentLocationSearch()
  });

  const pages = useMemo(() => ([
    { label: 'Today', path: '/today' },
    { label: 'Library', path: '/library' },
    { label: 'Think', path: '/think' },
    { label: 'Review', path: '/review' },
    { label: 'Map', path: '/map' },
    { label: 'Marketing Analytics', path: '/marketing-analytics' },
    { label: 'Search Console Opportunities', path: '/search-console-opportunities' },
    { label: 'Settings', path: '/settings' }
  ]), []);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setArticles([]);
    setSearchGroups(EMPTY_GROUPS);
    setWikiPages([]);
    setActiveIndex(0);
    const fetchBase = async () => {
      try {
        const token = localStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        const [notebookRows, colRes, tagRes, wikiRows] = await Promise.allSettled([
          getNotebookSummaries(),
          api.get('/api/collections', { headers }),
          api.get('/api/tags', { headers }),
          listWikiPages({ limit: 12 })
        ]);
        setNotebook(notebookRows.status === 'fulfilled' ? notebookRows.value || [] : []);
        setCollections(colRes.status === 'fulfilled' ? colRes.value?.data || [] : []);
        setConcepts(tagRes.status === 'fulfilled' ? tagRes.value?.data || [] : []);
        setWikiPages(wikiRows.status === 'fulfilled' && Array.isArray(wikiRows.value) ? wikiRows.value : []);
      } catch (err) {
        console.error('Palette preload failed', err);
      }
    };
    fetchBase();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const fetchSearch = async () => {
      const q = query.trim();
      if (!q) {
        setArticles([]);
        setSearchGroups(EMPTY_GROUPS);
        return;
      }
      setLoading(true);
      try {
        const [searchResult, wikiResult] = await Promise.allSettled([
          searchKeyword({ q, scope: 'all' }),
          listWikiPages({ q, limit: 8 })
        ]);
        const data = searchResult.status === 'fulfilled' ? searchResult.value : {};
        setArticles(Array.isArray(data?.articles) ? data.articles : []);
        setSearchGroups({
          notes: Array.isArray(data?.groups?.notes) ? data.groups.notes : [],
          highlights: Array.isArray(data?.groups?.highlights) ? data.groups.highlights : [],
          claims: Array.isArray(data?.groups?.claims) ? data.groups.claims : [],
          evidence: Array.isArray(data?.groups?.evidence) ? data.groups.evidence : []
        });
        setWikiPages(wikiResult.status === 'fulfilled' && Array.isArray(wikiResult.value) ? wikiResult.value : []);
      } catch (err) {
        console.error('Palette search failed', err);
      } finally {
        setLoading(false);
      }
    };
    const timer = setTimeout(fetchSearch, 180);
    return () => clearTimeout(timer);
  }, [query, open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const createNote = useCallback(async () => {
    systemStatus.clearRecoverableFailure();
    systemStatus.setBackgroundWork({ label: 'Creating note', stage: 'Saving notebook entry' });
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await api.post('/api/notebook', { title: 'Untitled', content: '', blocks: [] }, { headers });
      if (res.data?._id) {
        systemStatus.setLatestReceipt({
          id: `command-note-${res.data._id}`,
          title: 'Think note created',
          summary: 'A blank note is ready in Think.',
          status: 'completed',
          href: `/think?tab=notebook&entryId=${res.data._id}`
        });
        navigate(`/think?tab=notebook&entryId=${res.data._id}`);
      } else {
        systemStatus.setLatestReceipt({
          title: 'Think note created',
          summary: 'A blank note is ready in Think.',
          status: 'completed',
          href: '/think?tab=notebook'
        });
        navigate('/think?tab=notebook');
      }
    } catch (err) {
      console.error('Palette new note failed', err);
      systemStatus.setRecoverableFailure({
        stage: 'Command palette',
        message: 'Could not create a Think note.',
        retryable: true,
        retry: () => { createNote(); }
      });
      navigate('/think?tab=notebook');
    } finally {
      systemStatus.setBackgroundWork(null);
    }
  }, [navigate, systemStatus]);

  const createWiki = useCallback(async (options = {}) => {
    const commandTopic = String(options.topic || '').trim();
    const commandSourceText = String(options.sourceText || '').trim();
    const seed = commandTopic || query.trim();
    const isCommandBuild = Boolean(commandTopic);
    systemStatus.clearRecoverableFailure();
    systemStatus.setBackgroundWork({
      label: isCommandBuild ? 'Building wiki page from command' : 'Creating wiki page',
      stage: seed ? `Drafting ${seed}` : 'Saving page shell'
    });
    try {
      const page = await createWikiPage(buildWikiCreatePayload({
        type: seed ? 'search' : 'wiki_index',
        title: seed || 'Untitled Wiki Page',
        text: commandSourceText || seed,
        label: commandSourceText || seed || 'Command palette'
      }));
      systemStatus.setLatestReceipt({
        id: `command-wiki-${page._id || Date.now()}`,
        title: isCommandBuild ? 'Wiki command completed' : 'Wiki page created',
        summary: isCommandBuild
          ? `Built a wiki page for "${seed}" from your command.`
          : (seed ? `Created "${seed}" from the command palette.` : 'Created a blank wiki page.'),
        status: 'completed',
        href: page._id ? `/wiki/workspace?page=${page._id}` : '/wiki'
      });
      onClose?.();
      openWikiDraft({ navigate, pageId: page._id });
    } catch (err) {
      console.error('Palette new wiki page failed', err);
      systemStatus.setRecoverableFailure({
        stage: 'Command palette',
        message: 'Could not create a wiki page.',
        retryable: true,
        retry: () => { createWiki(); }
      });
      onClose?.();
      navigate('/wiki');
    } finally {
      systemStatus.setBackgroundWork(null);
    }
  }, [navigate, onClose, query, systemStatus]);

  const retrieveHighlight = useCallback(async (options = {}) => {
    const topic = String(options.topic || '').trim();
    const sourceText = String(options.sourceText || '').trim();
    if (!topic) return;
    systemStatus.clearRecoverableFailure();
    systemStatus.setBackgroundWork({
      label: 'Finding highlight',
      stage: `Searching for "${topic.slice(0, 48)}"`
    });
    const runRetrieve = async () => {
      const data = await searchKeyword({ q: topic, scope: 'all' });
      const candidates = collectHighlightCandidates(data?.groups || {});
      const best = pickBestHighlightMatch(candidates, topic);
      if (!best) {
        const error = new Error('no_match');
        error.code = 'no_match';
        throw error;
      }
      return best;
    };
    try {
      const best = await runRetrieve();
      const path = buildHighlightOpenPath(best);
      const highlightLabel = buildResultLabel(best, 'Highlight');
      systemStatus.setLatestReceipt({
        id: `command-highlight-${best._id || Date.now()}`,
        title: 'Highlight found',
        summary: `Opened "${highlightLabel.slice(0, 120)}" for "${topic}".`,
        status: 'completed',
        href: path
      });
      onClose?.();
      navigate(path);
    } catch (err) {
      console.error('Palette highlight retrieve failed', err);
      const isNoMatch = err?.code === 'no_match' || err?.message === 'no_match';
      systemStatus.setRecoverableFailure({
        stage: 'Command palette',
        message: isNoMatch
          ? `No highlight matched "${topic}".`
          : 'Could not search for a highlight.',
        retryable: true,
        retry: () => { retrieveHighlight({ topic, sourceText }); }
      });
      onClose?.();
    } finally {
      systemStatus.setBackgroundWork(null);
    }
  }, [navigate, onClose, systemStatus]);

  const createWikiComparison = useCallback(async (options = {}) => {
    const left = String(options.left || '').trim();
    const right = String(options.right || '').trim();
    const sourceText = String(options.sourceText || '').trim();
    if (!left || !right) return;
    const title = `${left} vs ${right}`;
    systemStatus.clearRecoverableFailure();
    systemStatus.setBackgroundWork({
      label: 'Creating comparison page',
      stage: `Comparing ${left.slice(0, 32)} and ${right.slice(0, 32)}`
    });
    try {
      const page = await createWikiPage(buildWikiCreatePayload({
        type: 'search',
        pageType: 'comparison',
        title,
        text: sourceText || `Compare ${left} and ${right}.`,
        label: sourceText || title
      }));
      const href = page._id ? `/wiki/workspace?page=${page._id}` : '/wiki';
      systemStatus.setLatestReceipt({
        id: `command-compare-${page._id || Date.now()}`,
        title: 'Comparison page created',
        summary: `Started a comparison of "${left}" and "${right}".`,
        status: 'completed',
        href
      });
      onClose?.();
      openWikiDraft({ navigate, pageId: page._id });
    } catch (err) {
      console.error('Palette comparison page failed', err);
      systemStatus.setRecoverableFailure({
        stage: 'Command palette',
        message: 'Could not create a comparison page.',
        retryable: true,
        retry: () => { createWikiComparison({ left, right, sourceText }); }
      });
      onClose?.();
    } finally {
      systemStatus.setBackgroundWork(null);
    }
  }, [navigate, onClose, systemStatus]);

  const createTemporalReview = useCallback(async (options = {}) => {
    const topic = String(options.topic || '').trim();
    const period = String(options.period || '').trim();
    const sourceText = String(options.sourceText || '').trim();
    if (!topic) return;
    const title = `${topic} change ledger`;
    const timeWindow = period || 'recent work';
    systemStatus.clearRecoverableFailure();
    systemStatus.setBackgroundWork({
      label: 'Creating change ledger',
      stage: `Reading history for ${topic.slice(0, 48)}`
    });
    try {
      const page = await createWikiPage(buildWikiCreatePayload({
        type: 'search',
        pageType: 'temporal_review',
        title,
        text: sourceText || `What changed in my thinking about ${topic} over ${timeWindow}?`,
        label: sourceText || `${topic} change ledger`,
        createdFrom: {
          type: 'temporal_query',
          topic,
          period: timeWindow
        }
      }));
      const href = page._id ? `/wiki/workspace?page=${page._id}` : '/wiki';
      systemStatus.setLatestReceipt({
        id: `command-temporal-${page._id || Date.now()}`,
        title: 'Change ledger started',
        summary: `Started a wiki draft to inspect what changed about "${topic}" across ${timeWindow}.`,
        status: 'needs_review',
        href
      });
      onClose?.();
      openWikiDraft({ navigate, pageId: page._id });
    } catch (err) {
      console.error('Palette change ledger failed', err);
      systemStatus.setRecoverableFailure({
        stage: 'Command palette',
        message: 'Could not create the change ledger.',
        retryable: true,
        retry: () => { createTemporalReview({ topic, period, sourceText }); }
      });
      onClose?.();
    } finally {
      systemStatus.setBackgroundWork(null);
    }
  }, [navigate, onClose, systemStatus]);

  const createBlockId = useCallback(() => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return `block-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`;
  }, []);

  const createQuestionFromHighlights = useCallback(async (options = {}) => {
    const topic = String(options.topic || '').trim();
    const useContextHighlights = Boolean(options.useContextHighlights);
    systemStatus.clearRecoverableFailure();
    systemStatus.setBackgroundWork({
      label: 'Drafting question from highlights',
      stage: topic ? `Gathering highlights on "${topic.slice(0, 48)}"` : 'Using selected highlights'
    });
    const runCreate = async () => {
      let groups = searchGroups;
      if (topic && (!groups.highlights?.length && !groups.claims?.length && !groups.evidence?.length)) {
        const data = await searchKeyword({ q: topic, scope: 'all' });
        groups = {
          notes: [],
          highlights: Array.isArray(data?.groups?.highlights) ? data.groups.highlights : [],
          claims: Array.isArray(data?.groups?.claims) ? data.groups.claims : [],
          evidence: Array.isArray(data?.groups?.evidence) ? data.groups.evidence : []
        };
      }
      const highlights = resolveHighlightsForIntent({
        intent: { useContextHighlights },
        searchGroups: groups,
        topic
      });
      if (highlights.length === 0) {
        const error = new Error('no_highlights');
        error.code = 'no_highlights';
        throw error;
      }
      const payload = buildQuestionPayloadFromHighlights({
        highlights,
        topic,
        createId: createBlockId
      });
      const created = await createQuestion(payload);
      for (const highlightId of payload.linkedHighlightIds) {
        if (!created?._id || !highlightId) continue;
        try {
          await api.post(
            `/api/questions/${created._id}/add-highlight`,
            { highlightId },
            { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
          );
        } catch (_err) {
          // Blocks already embed refs; graph link is best-effort.
        }
      }
      return { created, highlights, payload };
    };
    try {
      const { created, highlights, payload } = await runCreate();
      const href = buildQuestionReviewPath(created?._id);
      systemStatus.setLatestReceipt({
        id: `command-question-${created?._id || Date.now()}`,
        title: 'Question draft ready',
        summary: `Staged a question from ${highlights.length} highlight${highlights.length === 1 ? '' : 's'}: "${payload.text.slice(0, 96)}".`,
        status: 'needs_review',
        href
      });
      onClose?.();
      navigate(href);
    } catch (err) {
      console.error('Palette highlight-to-question failed', err);
      const isNoHighlights = err?.code === 'no_highlights' || err?.message === 'no_highlights';
      systemStatus.setRecoverableFailure({
        stage: 'Command palette',
        message: isNoHighlights
          ? (useContextHighlights
            ? 'Select highlights in Library first, or name a topic to search.'
            : `No highlights matched "${topic || 'that topic'}".`)
          : 'Could not draft a question from highlights.',
        retryable: true,
        retry: () => { createQuestionFromHighlights(options); }
      });
      onClose?.();
    } finally {
      systemStatus.setBackgroundWork(null);
    }
  }, [createBlockId, navigate, onClose, searchGroups, systemStatus]);

  const createWikiSectionFromHighlights = useCallback(async (options = {}) => {
    const topic = String(options.topic || '').trim();
    const sourceText = String(options.sourceText || '').trim();
    const useContextHighlights = Boolean(options.useContextHighlights);
    systemStatus.clearRecoverableFailure();
    systemStatus.setBackgroundWork({
      label: 'Drafting wiki section from highlights',
      stage: topic ? `Gathering highlights on "${topic.slice(0, 48)}"` : 'Using selected highlights'
    });
    const runCreate = async () => {
      let groups = searchGroups;
      if (topic && (!groups.highlights?.length && !groups.claims?.length && !groups.evidence?.length)) {
        const data = await searchKeyword({ q: topic, scope: 'all' });
        groups = {
          notes: [],
          highlights: Array.isArray(data?.groups?.highlights) ? data.groups.highlights : [],
          claims: Array.isArray(data?.groups?.claims) ? data.groups.claims : [],
          evidence: Array.isArray(data?.groups?.evidence) ? data.groups.evidence : []
        };
      }
      const highlights = resolveHighlightsForIntent({
        intent: { useContextHighlights },
        searchGroups: groups,
        topic
      });
      if (highlights.length === 0) {
        const error = new Error('no_highlights');
        error.code = 'no_highlights';
        throw error;
      }
      const payload = buildWikiSectionPayloadFromHighlights({
        highlights,
        topic,
        label: sourceText || options.label
      });
      const page = await createWikiPage(payload);
      return { page, highlights, payload };
    };
    try {
      const { page, highlights, payload } = await runCreate();
      const href = page._id ? `/wiki/workspace?page=${page._id}` : '/wiki';
      systemStatus.setLatestReceipt({
        id: `command-wiki-section-${page._id || Date.now()}`,
        title: 'Wiki section draft ready',
        summary: `Staged "${payload.title}" from ${highlights.length} highlight${highlights.length === 1 ? '' : 's'}.`,
        status: 'needs_review',
        href
      });
      onClose?.();
      openWikiDraft({ navigate, pageId: page._id });
    } catch (err) {
      console.error('Palette highlight-to-wiki-section failed', err);
      const isNoHighlights = err?.code === 'no_highlights' || err?.message === 'no_highlights';
      systemStatus.setRecoverableFailure({
        stage: 'Command palette',
        message: isNoHighlights
          ? (useContextHighlights
            ? 'Select highlights in Library first, or name a topic to search.'
            : `No highlights matched "${topic || 'that topic'}".`)
          : 'Could not draft a wiki section from highlights.',
        retryable: true,
        retry: () => { createWikiSectionFromHighlights(options); }
      });
      onClose?.();
    } finally {
      systemStatus.setBackgroundWork(null);
    }
  }, [navigate, onClose, searchGroups, systemStatus]);

  const reviewLibraryFiling = useCallback(async (options = {}) => {
    const sourceText = String(options.sourceText || '').trim();
    systemStatus.clearRecoverableFailure();
    systemStatus.setBackgroundWork({ label: 'Filing the library', stage: 'Staging suggestions' });
    const runFiling = async () => startLibraryFilingSuggestions();
    try {
      const result = await runFiling();
      const receipt = result?.receipt && typeof result.receipt === 'object' ? result.receipt : null;
      const nextThreadId = String(result?.thread?.threadId || result?.thread?._id || '').trim();
      const href = nextThreadId
        ? `/think?tab=threads&threadId=${encodeURIComponent(nextThreadId)}`
        : '/think?tab=threads';
      systemStatus.setLatestReceipt(normalizeSystemReceipt(receipt, { href }) || {
        id: `command-filing-${nextThreadId || Date.now()}`,
        title: 'Filing suggestions ready',
        summary: receipt?.summary || 'Review the staged plan in Think.',
        status: 'needs_review',
        href
      });
      onClose?.();
      navigate(href);
    } catch (err) {
      console.error('Palette library filing review failed', err);
      systemStatus.setRecoverableFailure({
        stage: 'Command palette',
        message: 'Could not stage filing suggestions. Try again in a moment.',
        retryable: true,
        retry: () => { reviewLibraryFiling({ sourceText }); }
      });
      onClose?.();
    } finally {
      systemStatus.setBackgroundWork(null);
    }
  }, [navigate, onClose, systemStatus]);

  const sections = useMemo(() => {
    const q = query.trim();
    const wikiBuildCommand = parseWikiBuildCommand(q);
    const highlightRetrieveIntent = parseHighlightRetrieveIntent(q);
    const highlightToQuestionIntent = parseHighlightToQuestionIntent(q);
    const highlightToWikiSectionIntent = parseHighlightToWikiSectionIntent(q);
    const libraryFilingReviewIntent = parseLibraryFilingReviewIntent(q);
    const wikiCompareCommand = parseWikiCompareCommand(q);
    const wikiTemporalCommand = parseWikiTemporalCommand(q);
    const list = [];

    const actionSection = {
      title: 'Actions',
      items: [
        libraryFilingReviewIntent ? {
          type: 'Command',
          label: libraryFilingReviewIntent.label,
          action: () => reviewLibraryFiling(libraryFilingReviewIntent)
        } : null,
        highlightToQuestionIntent ? {
          type: 'Command',
          label: highlightToQuestionIntent.label,
          action: () => createQuestionFromHighlights(highlightToQuestionIntent)
        } : null,
        highlightToWikiSectionIntent ? {
          type: 'Command',
          label: highlightToWikiSectionIntent.label,
          action: () => createWikiSectionFromHighlights(highlightToWikiSectionIntent)
        } : null,
        highlightRetrieveIntent ? {
          type: 'Command',
          label: highlightRetrieveIntent.label,
          action: () => retrieveHighlight(highlightRetrieveIntent)
        } : null,
        wikiCompareCommand ? {
          type: 'Command',
          label: wikiCompareCommand.label,
          action: () => createWikiComparison(wikiCompareCommand)
        } : null,
        wikiTemporalCommand ? {
          type: 'Command',
          label: wikiTemporalCommand.label,
          action: () => createTemporalReview(wikiTemporalCommand)
        } : null,
        wikiBuildCommand ? {
          type: 'Command',
          label: wikiBuildCommand.label,
          action: () => createWiki(wikiBuildCommand)
        } : null,
        { type: 'Action', label: 'New Think note', action: createNote },
        { type: 'Action', label: 'Pull reference into current surface', path: pullReferencePath },
        { type: 'Action', label: q ? `New Wiki page from "${q.slice(0, 48)}"` : 'New Wiki page', action: createWiki },
        { type: 'Action', label: 'New collection', path: '/library?tab=collections' }
      ]
    };

    const pagesSection = {
      title: 'Pages',
      items: pages.map(page => ({ type: 'Page', label: page.label, path: page.path }))
    };
    const wikiDestinationsSection = {
      title: 'Wiki',
      items: [
        { type: 'Wiki', label: 'Wiki home', path: '/wiki' },
        { type: 'Wiki', label: 'Wiki workspace', path: '/wiki/workspace' },
        { type: 'Wiki', label: 'Wiki pages', path: '/wiki/workspace?view=list' },
        { type: 'Wiki', label: 'Knowledge map', path: '/wiki/workspace?view=graph' }
      ]
    };
    const wikiPagesSection = {
      title: 'Wiki pages',
      items: wikiPages.slice(0, q ? 8 : 6).map(page => {
        const pageId = page._id || page.id;
        return pageId ? {
          type: 'Wiki',
          label: page.title || 'Untitled wiki page',
          path: `/wiki/workspace?page=${pageId}`
        } : null;
      })
    };

    if (!q) {
      if (isWikiSurface) {
        list.push(wikiPagesSection);
        list.push(wikiDestinationsSection);
      }
      list.push(actionSection);
      list.push(pagesSection);
      if (!isWikiSurface) list.push(wikiDestinationsSection);
    }

    if (q) {
      const rankedWikiPages = rankLocalItems(wikiPagesSection.items, q);
      const wikiPageMatches = rankedWikiPages.length ? rankedWikiPages : wikiPagesSection.items;
      if (isWikiSurface && wikiPageMatches.length) {
        list.push({
          title: 'Wiki pages',
          items: wikiPageMatches
        });
      }
      const rankedPages = rankLocalItems(pagesSection.items, q);
      if (rankedPages.length) {
        list.push({
          title: 'Pages',
          items: rankedPages
        });
      }
      list.push({
        title: 'Notes',
        items: (searchGroups.notes || []).slice(0, 6).map(item => ({
          type: 'Note',
          label: buildResultLabel(item, 'Note'),
          path: item.openPath || `/think?tab=notebook&entryId=${item._id}`
        }))
      });
      list.push({
        title: 'Highlights',
        items: (searchGroups.highlights || []).slice(0, 6).map(item => ({
          type: 'Highlight',
          label: buildResultLabel(item, 'Highlight'),
          path: item.openPath || buildCanonicalArticlePath(item.articleId || '')
        }))
      });
      list.push({
        title: 'Claims',
        items: (searchGroups.claims || []).slice(0, 6).map(item => ({
          type: 'Claim',
          label: buildResultLabel(item, 'Claim'),
          path: item.openPath || (item.articleId ? buildCanonicalArticlePath(item.articleId) : `/think?tab=notebook&entryId=${item._id}`)
        }))
      });
      list.push({
        title: 'Evidence',
        items: (searchGroups.evidence || []).slice(0, 6).map(item => ({
          type: 'Evidence',
          label: buildResultLabel(item, 'Evidence'),
          path: item.openPath || (item.articleId ? buildCanonicalArticlePath(item.articleId) : `/think?tab=notebook&entryId=${item._id}`)
        }))
      });
      list.push({
        title: 'Articles',
        items: articles.slice(0, 5).map(item => ({
          type: 'Article',
          label: buildResultLabel(item, item.title || 'Article'),
          path: buildCanonicalArticlePath(item._id)
        }))
      });
      list.push(actionSection);
      if (!isWikiSurface && wikiPageMatches.length) {
        list.push({
          title: 'Wiki pages',
          items: wikiPageMatches
        });
      }
      const rankedWikiDestinations = rankLocalItems(wikiDestinationsSection.items, q);
      if (rankedWikiDestinations.length) {
        list.push({
          title: 'Wiki',
          items: rankedWikiDestinations
        });
      }
    } else {
      list.push({
        title: 'Think concepts',
        items: concepts.slice(0, 8).map(item => ({
          type: 'Think',
          label: item.tag,
          path: `/think?tab=concepts&concept=${encodeURIComponent(item.tag)}`
        }))
      });
      list.push({
        title: 'Think notebook',
        items: notebook.slice(0, 6).map(item => ({
          type: 'Think',
          label: item.title || 'Untitled note',
          path: `/think?tab=notebook&entryId=${item._id}`
        }))
      });
      list.push({
        title: 'Collections',
        items: collections.slice(0, 6).map(item => ({
          type: 'Collection',
          label: item.name,
          path: `/collections/${item.slug}`
        }))
      });
    }

    return list
      .map(section => ({ ...section, items: section.items.filter(Boolean) }))
      .filter(section => section.items.length > 0);
  }, [articles, collections, concepts, createNote, createQuestionFromHighlights, createTemporalReview, createWiki, createWikiComparison, createWikiSectionFromHighlights, isWikiSurface, notebook, pages, pullReferencePath, query, retrieveHighlight, reviewLibraryFiling, searchGroups, wikiPages]);

  const selectableItems = useMemo(
    () => sections.flatMap(section => section.items),
    [sections]
  );

  useEffect(() => {
    if (selectableItems.length === 0) {
      setActiveIndex(0);
      return;
    }
    setActiveIndex(prev => Math.min(prev, selectableItems.length - 1));
  }, [selectableItems]);

  const handleSelect = (item) => {
    if (!item) return;
    if (item.action) {
      onClose();
      item.action();
      return;
    }
    if (item.path) {
      navigate(item.path);
      onClose();
      return;
    }
    onClose();
  };

  const handleResultClick = (item) => (event) => {
    event.preventDefault();
    handleSelect(item);
  };

  const handleResultMouseDown = (event) => {
    // Keep focus in the palette input long enough for click selection to commit.
    event.preventDefault();
  };

  const handleResultKeyDown = (item) => (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleSelect(item);
    }
  };

  const handleKeyDown = (event) => {
    if (!open) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(prev => Math.min(prev + 1, Math.max(selectableItems.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(prev => Math.max(prev - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const selectedItem = selectableItems[activeIndex];
      if (loading && !selectedItem?.immediate) return;
      handleSelect(selectedItem);
    } else if (event.key === 'Escape') {
      onClose();
    }
  };

  if (!open) return null;

  let renderedIndex = -1;

  return (
    <div className="palette-overlay" onKeyDown={handleKeyDown} tabIndex={-1}>
      <Card className="palette-card">
        <div className="palette-input-row">
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              const nextQuery = event.target.value;
              setQuery(nextQuery);
              setLoading(Boolean(nextQuery.trim()));
            }}
            placeholder={isWikiSurface ? 'Quick open wiki pages, notes, sources...' : 'Quick open notes, highlights, claims, evidence...'}
            className="palette-input"
          />
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
        <div className="palette-shortcuts">
          <span className="muted small">Cmd/Ctrl+K: Open</span>
          <span className="muted small">Arrows + Enter: Navigate</span>
        </div>
        {loading && (
          <p className="muted small" role="status" aria-live="polite">
            Searching…
          </p>
        )}
        <div className="palette-list">
          {!loading && selectableItems.length === 0 && <p className="muted small">No results.</p>}
          {sections.map(section => (
            <div key={section.title} className="palette-group">
              <div className="palette-group-title">{section.title}</div>
              {section.items.map(item => {
                renderedIndex += 1;
                const rowIndex = renderedIndex;
                const isActive = rowIndex === activeIndex;
                return (
                  <button
                    type="button"
                    key={`${section.title}-${item.type}-${item.label}`}
                    className={`palette-item ${isActive ? 'active' : ''}`}
                    onMouseEnter={() => setActiveIndex(rowIndex)}
                    onMouseDown={handleResultMouseDown}
                    onClick={handleResultClick(item)}
                    onKeyDown={handleResultKeyDown(item)}
                  >
                    <span className="muted small">{item.type}</span>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

export default CommandPalette;

export {
  parseHighlightToQuestionIntent,
  parseHighlightToWikiSectionIntent
} from '../utils/highlightToThinkingModel';
