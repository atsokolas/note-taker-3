import { searchKeyword } from '../api/retrieval';
import { alreadyUsedHere } from './libraryPassageUse';
import {
  librarySearchRows,
  qualifyLibraryRows,
  tokensOf
} from './libraryPassageRetrieval';
import { buildCanonicalArticlePath, buildCanonicalHighlightPath } from './sourceRoutes';

const hrefFor = (row) => (
  row.highlightId
    ? buildCanonicalHighlightPath({ articleId: row.articleId, highlightId: row.highlightId })
    : buildCanonicalArticlePath(row.articleId)
);

export const unconnectedRemainder = (question, placed = []) => {
  const asked = tokensOf(question);
  const held = new Set(tokensOf(
    (Array.isArray(placed) ? placed : []).map((item) => item.passage || item.text || '').join(' ')
  ));
  return asked.filter((token) => !held.has(token)).join(' ');
};

export const herePhrase = (question, remainder) => {
  const text = String(question || '').trim();
  const token = tokensOf(remainder)[0];
  if (!text) return '';
  if (!token) return text.slice(0, 80);
  const at = text.toLowerCase().indexOf(token);
  if (at < 0) return text.slice(0, 80);
  const start = Math.max(0, text.lastIndexOf(' ', Math.max(0, at - 32)) + (at > 32 ? 1 : 0));
  return text.slice(start, start + 88).trim();
};

export const passageConnectsRemainder = (row = {}, remainder = '') => {
  const needed = tokensOf(remainder);
  if (!needed.length) return false;
  const body = new Set(tokensOf(row.passage));
  return needed.some((token) => body.has(token));
};

export const missingMiddleSilence = ({ remainder = '', uncovered = false } = {}) => {
  if (!String(remainder || '').trim() && uncovered) {
    return 'Nothing left unconnected here.';
  }
  return 'Nothing you already have speaks to the unconnected part of this question.';
};

export const proposeMissingMiddle = async ({
  question,
  placed = [],
  excluded = [],
  rejectedKeys = [],
  search = searchKeyword
} = {}) => {
  const remainder = unconnectedRemainder(question, placed);
  const here = herePhrase(question, remainder);
  if (!remainder) {
    return {
      status: 'miss',
      remainder: '',
      here,
      proposal: null,
      silence: missingMiddleSilence({ remainder: '', uncovered: true })
    };
  }
  const payload = await search({
    q: String(question || '').trim() || remainder,
    type: ['article', 'highlight']
  });
  const rejected = new Set(rejectedKeys);
  const rows = qualifyLibraryRows(librarySearchRows(payload, { query: remainder }), {
    query: remainder,
    mode: 'search'
  }).filter((row) => (
    passageConnectsRemainder(row, remainder)
    && !alreadyUsedHere(row, excluded)
    && !rejected.has(row.key)
  ));
  if (!rows.length) {
    return {
      status: 'miss',
      remainder,
      here,
      proposal: null,
      silence: missingMiddleSilence({ remainder })
    };
  }
  const row = rows[0];
  return {
    status: 'found',
    remainder,
    here,
    proposal: {
      ...row,
      href: hrefFor(row)
    },
    silence: ''
  };
};
