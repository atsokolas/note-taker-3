import { NOEIS_SURFACE_DEFINITIONS } from './noeisSurfaceDefinitions';
import { KEPT_HREF, LATER_HREF, SET_ASIDE_HREF, feedPlaces } from '../pages/libraryPlacesModel';
import { rankFeedTopics } from '../pages/feedModel';

/**
 * Everywhere the palette can send you, generated rather than listed.
 *
 * The hand-written list this replaces had drifted the way hand-written lists
 * do: it still offered Review and Map, two rooms that were dissolved, and it
 * had never heard of Judgment, Later, Set aside, Kept, or a single screened
 * folder. The only search affordance in the top bar reached none of the five
 * places a reader actually keeps things in.
 *
 * So nothing here is typed twice. Rooms come from the surface definitions,
 * which is what the nav reads; the desk's places come from the places model,
 * which is what the strip reads; screened folders come from rankFeedTopics,
 * which is what the rail reads. A room added to the definitions arrives in
 * the palette on its own, and a room deleted from them leaves.
 *
 * Note that a room's `authenticatedPrefixes` are deliberately not read here.
 * `/review` and `/map` still appear among Think's prefixes because old links
 * must keep resolving; a prefix is a door that still opens, not a place worth
 * offering. Only a surface's own `route` is a destination.
 */

const clean = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

/* The desk's three named places. Always offered, because a place you cannot
   find is a place you do not have — and unlike a count, a name is true when
   the place is empty. */
const PLACES = Object.freeze([
  { id: 'place.later', label: 'Later', path: LATER_HREF },
  { id: 'place.set-aside', label: 'Set aside', path: SET_ASIDE_HREF },
  { id: 'place.kept', label: 'Kept', path: KEPT_HREF }
]);

/**
 * Positions as commands, on the object the reader is looking at.
 *
 * Rows read as sentences — "Later: the Costco 10-K — parks it, oldest-owed
 * first" — because a command list that reads as verbs makes the reader
 * translate. Offered only when there is an object to act on: a position with
 * nothing to place is not a command, it is a menu item.
 */
export const placementCommands = ({ subject = null } = {}) => {
  const title = clean(subject?.title);
  const id = clean(subject?._id || subject?.id);
  if (!title || !id) return [];
  return [
    {
      id: `place.later.${id}`,
      label: `Later: ${title}`,
      hint: 'parks it, oldest-owed first',
      placement: 'later',
      targetId: id,
      kind: 'command'
    },
    {
      id: `place.set-aside.${id}`,
      label: `Set aside: ${title}`,
      hint: 'keeps it at hand this week',
      placement: 'setAside',
      targetId: id,
      kind: 'command'
    },
    {
      id: `place.home.${id}`,
      label: `Home: ${title}`,
      hint: 'sends it back where it lives',
      placement: 'stream',
      targetId: id,
      kind: 'command'
    }
  ];
};

export const buildPaletteDestinations = ({ folders = [], articles = [] } = {}) => {
  const surfaces = NOEIS_SURFACE_DEFINITIONS
    .map(definition => ({
      id: definition.id,
      label: clean(definition.name),
      path: clean(definition.route),
      kind: 'surface'
    }))
    .filter(row => row.label && row.path);

  /* A screened folder is offered under its own name and only while something
     is open in it. rankFeedTopics already drops the empty and the procedural,
     so silence here is inherited rather than re-implemented. */
  const topics = feedPlaces(rankFeedTopics(folders, articles)).map(topic => ({
    id: `topic.${topic.id}`,
    label: topic.name,
    path: topic.href,
    kind: 'topic'
  }));

  const rows = [...surfaces, ...PLACES.map(place => ({ ...place, kind: 'place' })), ...topics];

  // A destination offered twice is a destination the reader has to choose
  // between for no reason.
  const seen = new Set();
  return rows.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
};
