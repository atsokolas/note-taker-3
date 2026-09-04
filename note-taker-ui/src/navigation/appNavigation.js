import { getNoeisNavigationDefinitions } from '../system/noeisSurfaceDefinitions';

// Four rooms: Library is what you read, Think is what you wrote, Wiki is what
// the reading built, Judgment is what it was for.
//
// Paper was a fifth, and it named the same place twice: the wiki opened onto
// its own morning briefing while Paper held the reading loop, so two front
// pages competed for the same first look and the nav pointed at both. The
// Paper is now the top of the wiki, and Wiki is where the wordmark, / and
// /paper all land.
const toNavItem = definition => ({
  id: definition.id,
  label: definition.name,
  to: definition.route,
  match: definition.match,
  ...(definition.navigationGroup === 'utility' ? { essential: true } : {})
});

export const getPrimaryNavItems = () => getNoeisNavigationDefinitions('primary').map(toNavItem);

export const getTopBarUtilityNavItems = () => getNoeisNavigationDefinitions('utility').map(toNavItem);

/* Map, Today, Review and Return Queue are no longer rooms.
   - Today was a launcher for surfaces that are now the nav itself.
   - Map is graph work, and graph work lives in the wiki workspace.
   - Review and Return Queue are both "things asking for your attention",
     which is the morning paper's job — the paper now says what is waiting and
     links through to the full view.
   Their routes all still resolve; they are simply not advertised as places. */
export const getSecondaryNavItems = () => getNoeisNavigationDefinitions('secondary').map(toNavItem);

/* G then the room's own letter. Library, Think, Wiki, Judgment — L, T, W, J.
   That is the whole rule, and a rule you can guess is the only kind of
   shortcut anyone keeps; a list you have to memorise from an overlay is a
   list you look up once and never again.

   It was a hand-kept list of eight, and half of it was fiction. `h` and `n`
   both landed on the one Think page, and `c` and `q` set a tab that Think
   overwrites a tick later with whichever note is open — two letters pointing
   at rooms you cannot stand in. The letters now come from the rooms
   themselves, so a destination cannot be advertised unless the nav already
   says it is a place. `g` is never taken, so a second G re-primes instead of
   inventing a `gg` home chord, and a room that would collide gets no letter
   rather than stealing one. */
export const GO_TO_CHORD_MS = 1000;

/* Press G and the rooms show their letters. Toggled on the body so the
   masthead can answer without the shell re-rendering to say it. */
export const GO_TO_PRIMED_CLASS = 'go-to-primed';

const withInitials = (items) => {
  const taken = new Set(['g']);
  return items.flatMap((item) => {
    const key = String(item.label || '').trim().charAt(0).toLowerCase();
    if (!key || taken.has(key)) return [];
    taken.add(key);
    return [Object.freeze({ key, label: item.label, to: item.to })];
  });
};

export const NOEIS_GO_TO_SHORTCUTS = Object.freeze(
  withInitials([...getPrimaryNavItems(), ...getTopBarUtilityNavItems()])
);

const SHORTCUT_BY_KEY = new Map(NOEIS_GO_TO_SHORTCUTS.map(item => [item.key, item]));

export const resolveGoToShortcut = (key = '') => SHORTCUT_BY_KEY.get(String(key || '').toLowerCase()) || null;

/* What letter to print beside a room in the masthead. Same map, read the
   other way round, so the hint on screen cannot drift from the key that
   actually navigates. */
const KEY_BY_ROUTE = new Map(NOEIS_GO_TO_SHORTCUTS.map(item => [item.to, item.key]));

export const goToKeyFor = (to = '') => KEY_BY_ROUTE.get(String(to || '')) || '';

const TYPING_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]',
  '[contenteditable=""]',
  '.ProseMirror',
  '.tiptap-editor',
  '.think-slash-menu'
].join(', ');

export const isGoToTypingTarget = (target) => {
  if (!target) return false;
  const el = target.nodeType === 1 ? target : target.parentElement;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = String(el.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (typeof el.closest !== 'function') return false;
  return Boolean(el.closest(TYPING_SELECTOR));
};

/* One chord state in, one chord state out. Quiet: no toast, no palette,
   no motion — reduced-motion users get the same silent navigate.
   Incomplete sequences fail silently: the prime drops and nothing is announced. */
export const consumeGoToChord = (state = {}, event = {}, now = Date.now()) => {
  const primedAt = Number(state.primedAt) || 0;
  if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) {
    return { primedAt, to: null };
  }
  if (isGoToTypingTarget(event.target)) {
    return { primedAt: 0, to: null };
  }
  const key = String(event.key || '').toLowerCase();
  if (key === 'g') {
    return { primedAt: now, to: null };
  }
  if (!primedAt || (now - primedAt) > GO_TO_CHORD_MS) {
    return { primedAt: 0, to: null };
  }
  const shortcut = resolveGoToShortcut(key);
  return { primedAt: 0, to: shortcut?.to || null };
};

const THINK_POSTURE_PARAMS = {
  concepts: 'concept',
  notebook: 'entryId',
  questions: 'questionId'
};

export const buildThinkPosturePath = (posture, id = '') => {
  const safePosture = String(posture || '').trim().toLowerCase();
  const tab = THINK_POSTURE_PARAMS[safePosture] ? safePosture : 'concepts';
  const params = new URLSearchParams({ tab });
  const safeId = String(id || '').trim();
  const idParam = THINK_POSTURE_PARAMS[tab];
  if (safeId && idParam) {
    params.set(idParam, safeId);
  }
  return `/think?${params.toString()}`;
};
