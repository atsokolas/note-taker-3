/*
 * Shelves that are a stage of work rather than a subject.
 *
 * Keep in lockstep with note-taker-ui/src/pages/readingDriftModel.js.
 * Filing trays cannot be screened as a feed.
 */

const PROCEDURAL_SHELVES = [
  'needs review', 'review', 'inbox', 'unsorted', 'uncategorized', 'unfiled',
  'to read', 'read later', 'reading list', 'saved', 'misc', 'miscellaneous',
  'archive', 'archived', 'later', 'triage', 'untitled'
];

const normalizeSpaces = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const isProceduralShelf = (name = '') => {
  const value = normalizeSpaces(name).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  return PROCEDURAL_SHELVES.includes(value);
};

module.exports = {
  isProceduralShelf
};
