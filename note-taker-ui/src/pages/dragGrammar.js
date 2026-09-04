import { PLACEMENT_LATER, PLACEMENT_SET_ASIDE, PLACEMENT_STREAM } from './placementModel';

/**
 * One drag grammar.
 *
 * Dropping a piece onto a folder files it. Dropping it onto a pile parks it.
 * There is nothing else to learn, and nothing that means two things depending
 * on where you came from — a drag that behaves differently by origin is a
 * gesture the reader has to keep a model of, which is the opposite of what a
 * gesture is for.
 *
 * A drop that lands on nothing does nothing. Not "returns it home", not "puts
 * it back where it was with a toast" — a reader who lets go over empty space
 * has not asked for anything, and the honest response to a question nobody
 * asked is silence.
 */

export const DROP_KINDS = Object.freeze({
  FOLDER: 'folder',
  PILE: 'pile'
});

/* What a dragged piece calls itself on the way over. Read by state nowhere:
   the drop surface reads the payload straight off the gesture, so a row in
   one component can land in a pile in another without either knowing the
   other exists. */
export const ARTICLE_DRAG_KEY = 'application/x-noeis-article-id';

const clean = (value = '') => String(value || '').trim();

/** The piece on the way over, or '' when this gesture carries none. */
export const readArticleDragId = (event) => {
  try {
    return clean(event?.dataTransfer?.getData?.(ARTICLE_DRAG_KEY));
  } catch (_unreadable) {
    return '';
  }
};

/* getData is unreadable during dragover — the payload only opens on drop —
   so hover intent reads the types instead. */
export const carriesArticleDrag = (event) => {
  try {
    return Boolean(event?.dataTransfer?.types?.includes?.(ARTICLE_DRAG_KEY));
  } catch (_unreadable) {
    return false;
  }
};

/** Names the dragged piece on the gesture. False when there is nothing to name. */
export const beginArticleDrag = (event, articleId) => {
  const id = clean(articleId);
  if (!id) return false;
  if (event?.dataTransfer?.setData) {
    event.dataTransfer.setData(ARTICLE_DRAG_KEY, id);
    event.dataTransfer.effectAllowed = 'move';
  }
  return true;
};

/**
 * What a drop means, or null when it means nothing.
 *
 * Returns the intention rather than performing it, so the same rule can be
 * read by a test, a keyboard, and a pointer without any of them owning it.
 */
export const readDrop = ({ kind = '', targetId = '', placement = '' } = {}) => {
  const target = clean(targetId);
  if (!target) return null;

  if (clean(kind) === DROP_KINDS.FOLDER) {
    return { action: 'file', folderId: target };
  }

  if (clean(kind) === DROP_KINDS.PILE) {
    const where = clean(placement);
    // A pile is one of exactly two, and home is not a pile — it is where a
    // piece goes when it leaves one.
    if (where !== PLACEMENT_LATER && where !== PLACEMENT_SET_ASIDE) return null;
    return { action: 'park', placement: where };
  }

  return null;
};

/**
 * What the drop target should say it will do while a piece hovers over it.
 * The target's own name inks, so the reader is told where the thing is about
 * to land rather than guessing from a highlight.
 */
export const dropIntent = (drop) => {
  const read = readDrop(drop);
  if (!read) return '';
  return read.action === 'file' ? 'file it here' : 'park it here';
};

export const HOME = PLACEMENT_STREAM;
