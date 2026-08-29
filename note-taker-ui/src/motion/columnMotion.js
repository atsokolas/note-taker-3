// Column motion, shared across surfaces.
//
// Two rules the product cares about, both of which need memory the DOM does not
// keep for us:
//
//   1. The arrival stagger is a first-paint cue, not a transition. It plays the
//      first time a surface is seen this session and never again, because a
//      board you have already been looking at should not reassemble itself.
//   2. When a sentence leads somewhere, it is the same sentence when it gets
//      there — it moves, it is not replaced by a copy of itself.

const ENTER_MS = 220;
const ENTER_CURVE = 'cubic-bezier(0.16, 1, 0.3, 1)';
const REDUCED_MS = 80;

const staggered = new Set();

export const prefersReducedMotion = () => Boolean(
  typeof window !== 'undefined'
  && window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

/**
 * True the first time a surface is shown this session, false afterwards.
 * Returning to a surface is a return, not an arrival.
 */
export const takeFirstPaint = (surfaceId) => {
  const id = String(surfaceId || '').trim();
  if (!id) return true;
  if (staggered.has(id)) return false;
  staggered.add(id);
  return true;
};

export const resetFirstPaint = () => staggered.clear();

// One slot. A sentence is handed off on click and claimed on the next paint;
// anything older than a navigation is stale and dropped.
let handoff = null;

export const handOffSentence = (text, element) => {
  const sentence = String(text || '').replace(/\s+/g, ' ').trim();
  if (!sentence || !element?.getBoundingClientRect) return;
  const rect = element.getBoundingClientRect();
  handoff = {
    sentence,
    rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    at: Date.now()
  };
};

export const peekSentenceHandoff = () => handoff;

export const clearSentenceHandoff = () => { handoff = null; };

/**
 * Claim a handed-off sentence and fly the destination node from where the
 * sentence used to be. Returns true when it animated, so the caller can skip
 * its ordinary entrance and avoid animating the same node twice.
 *
 * The node keeps its final position throughout — only a transform moves — so
 * layout never depends on the animation completing.
 */
export const flySentenceInto = (node, text) => {
  const claimed = handoff;
  if (!node || !claimed) return false;
  const sentence = String(text || '').replace(/\s+/g, ' ').trim();
  if (!sentence || sentence !== claimed.sentence) return false;
  // A handoff older than a moment belongs to a navigation that already
  // happened; flying from a stale rect would look like a glitch.
  if (Date.now() - claimed.at > 1200) {
    handoff = null;
    return false;
  }
  // Claimed: this is the destination. A later paint must not fly it again.
  handoff = null;
  if (prefersReducedMotion()) {
    node.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: REDUCED_MS, easing: 'linear' });
    return true;
  }

  const target = node.getBoundingClientRect();
  if (!target.width || !claimed.rect.width) return false;
  const scale = claimed.rect.width / target.width;
  const dx = claimed.rect.left - target.left;
  const dy = claimed.rect.top - target.top;
  if (!Number.isFinite(scale) || !Number.isFinite(dx) || !Number.isFinite(dy)) return false;

  node.animate?.(
    [
      { transform: `translate3d(${dx}px, ${dy}px, 0) scale(${scale})`, transformOrigin: 'left top' },
      { transform: 'translate3d(0, 0, 0) scale(1)', transformOrigin: 'left top' }
    ],
    { duration: ENTER_MS, easing: ENTER_CURVE, fill: 'both' }
  );
  return true;
};

export const ENTER_DURATION_MS = ENTER_MS;
