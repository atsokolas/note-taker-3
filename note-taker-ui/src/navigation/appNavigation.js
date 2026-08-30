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

/* G then a room letter. One mapper, eight rooms, no second listener.
   Letters are mnemonic and skip `g` so a second G re-primes instead of
   inventing a `gg` home chord. `o` is Connections — "other people" —
   because `c` is already Concepts. */
export const GO_TO_CHORD_MS = 1000;

export const NOEIS_GO_TO_SHORTCUTS = Object.freeze([
  Object.freeze({ key: 'h', label: 'Think home', to: '/think?tab=home' }),
  Object.freeze({ key: 'n', label: 'Notebook', to: '/think?tab=notebook' }),
  Object.freeze({ key: 'c', label: 'Concepts', to: '/think?tab=concepts' }),
  Object.freeze({ key: 'q', label: 'Questions', to: '/think?tab=questions' }),
  Object.freeze({ key: 'l', label: 'Library', to: '/library' }),
  Object.freeze({ key: 'w', label: 'Wiki', to: '/wiki' }),
  Object.freeze({ key: 'j', label: 'Judgment', to: '/judgment' }),
  Object.freeze({ key: 'o', label: 'Connections', to: '/connections' })
]);

const SHORTCUT_BY_KEY = new Map(NOEIS_GO_TO_SHORTCUTS.map(item => [item.key, item]));

export const resolveGoToShortcut = (key = '') => SHORTCUT_BY_KEY.get(String(key || '').toLowerCase()) || null;

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
