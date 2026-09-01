/*
 * Feed is a destination, not a placement. A screened folder is home for
 * unparked members. Ranked for the rail: at most seven, newest arrival first.
 */

const { isProceduralShelf } = require('./proceduralShelf');
const { plainTextFrom, sentenceBoundaryTrim } = require('./editorialText');

const FEED_RAIL_CAP = 7;

const isScreenedFolder = (folder = {}) => (
  folder?.asFeed === true
  && !isProceduralShelf(folder?.name)
  && Boolean(String(folder?.name || '').trim())
);

const feedFolderIdsFrom = (folders = []) => (Array.isArray(folders) ? folders : [])
  .filter(isScreenedFolder)
  .map((folder) => folder._id)
  .filter(Boolean);

const firstGraphOf = (html = '') => {
  const prose = plainTextFrom(html);
  const first = prose.match(/^[^.!?]+[.!?]/);
  if (first && first[0].length <= 280) return first[0].trim();
  return sentenceBoundaryTrim(prose, { maxLength: 280, fallback: '' });
};

const rankFeedTopics = (folders = [], arrivals = []) => {
  const arrivalByFolder = new Map((Array.isArray(arrivals) ? arrivals : []).map((row) => [
    String(row?._id || ''),
    row
  ]));
  return (Array.isArray(folders) ? folders : [])
    .filter(isScreenedFolder)
    .map((folder) => {
      const arrival = arrivalByFolder.get(String(folder._id));
      if (!arrival || Number(arrival.count || 0) < 1) return null;
      return {
        id: String(folder._id),
        name: String(folder.name).trim(),
        arrivedAt: arrival.arrivedAt || null
      };
    })
    .filter(Boolean)
    .sort((left, right) => new Date(right.arrivedAt || 0) - new Date(left.arrivedAt || 0))
    .slice(0, FEED_RAIL_CAP);
};

module.exports = {
  FEED_RAIL_CAP,
  isScreenedFolder,
  feedFolderIdsFrom,
  firstGraphOf,
  rankFeedTopics
};
