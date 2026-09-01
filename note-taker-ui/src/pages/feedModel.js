/*
 * Feed is a destination, not a fourth pile.
 *
 * A screened folder is home for unparked members. The rail prints the folder
 * name — never the word Feed — and only while something is actually open.
 */

import { isFeedArticle } from './placementModel';
import { isProceduralShelf } from './readingDriftModel';
import { sourceLabel } from '../components/library/libraryColumnModel';
import { normalizeSpaces, plainTextFrom, sentenceBoundaryTrim } from '../utils/editorialText';

export const FEED_RAIL_CAP = 7;

const time = (value) => {
  const at = value ? new Date(value).getTime() : NaN;
  return Number.isNaN(at) ? 0 : at;
};

const arrivedAt = (article = {}) => article.updatedAt || article.createdAt || null;

const realName = (name = '') => Boolean(normalizeSpaces(name));

export const firstGraphOf = (article = {}) => {
  const ready = normalizeSpaces(article?.firstGraph);
  if (ready) return ready;
  const prose = plainTextFrom(
    article?.content
    || article?.summary
    || article?.description
    || article?.excerpt
    || article?.previewText
    || ''
  );
  const first = prose.match(/^[^.!?]+[.!?]/);
  if (first && first[0].length <= 280) return first[0].trim();
  return sentenceBoundaryTrim(prose, { maxLength: 280, fallback: '' });
};

export const orderFeedNewestFirst = (articles = []) => (Array.isArray(articles) ? articles : [])
  .filter(isFeedArticle)
  .sort((left, right) => time(arrivedAt(right)) - time(arrivedAt(left)));

export const feedFolios = (articles = []) => orderFeedNewestFirst(articles).map((article) => ({
  id: String(article._id || article.id || ''),
  title: normalizeSpaces(article.title) || 'Untitled source',
  source: sourceLabel(article),
  graph: firstGraphOf(article),
  date: arrivedAt(article)
}));

export const rankFeedTopics = (folders = [], articles = []) => {
  const members = Array.isArray(articles) ? articles : [];
  return (Array.isArray(folders) ? folders : [])
    .filter((folder) => folder?.asFeed === true && realName(folder?.name) && !isProceduralShelf(folder?.name))
    .map((folder) => {
      const open = members.filter((article) => (
        String(article?.folder?._id || article?.folder) === String(folder._id)
        && isFeedArticle({ ...article, folder: { ...folder, asFeed: true } })
      ));
      if (!open.length) return null;
      const newest = [...open].sort((left, right) => time(arrivedAt(right)) - time(arrivedAt(left)))[0];
      return {
        id: String(folder._id),
        name: normalizeSpaces(folder.name),
        arrivedAt: arrivedAt(newest)
      };
    })
    .filter(Boolean)
    .sort((left, right) => time(right.arrivedAt) - time(left.arrivedAt))
    .slice(0, FEED_RAIL_CAP);
};

export const feedEmptyLine = (folderName = '') => {
  const name = normalizeSpaces(folderName) || 'this shelf';
  return `Nothing open in ${name} yet. Parked pieces live in Later or Set aside.`;
};

export const screenWordLabel = (asFeed) => (asFeed ? 'Keep in Library' : 'Read as feed');
