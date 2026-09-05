/**
 * New For You vs Previously Seen.
 *
 * New and seen never mix: things you have not met yet sit on top, things you
 * have below one quiet fold. Seen means exactly one thing — the reader was
 * opened, which the server stamps as `lastOpenedAt` on open and nothing else
 * ever writes. Not scrolled past, not hovered: those punish skimmers, and a
 * "new" badge that lies is worse than a row in the wrong group.
 *
 * A stamp the server never sent (older clients, relevance rows without the
 * projection) reads as new. Unknown is not seen: calling something read that
 * was never opened would bury it below the fold on no evidence.
 */

const stampOf = (row, articlesById = null) => {
  const direct = row?.lastOpenedAt || row?.source?.lastOpenedAt || null;
  if (direct) return direct;
  const id = String(row?.source?.id || row?._id || row?.id || '').trim();
  if (id && articlesById?.get) return articlesById.get(id)?.lastOpenedAt || null;
  return null;
};

export const isSeen = (row, articlesById = null) => Boolean(stampOf(row, articlesById));

/** Order-preserving split. Non-article rows (notes, highlights) have no read
   stamp and stay in the flow above the fold — they are activity, and pinning
   activity below a fold would hide the newest thing on the desk. */
export const partitionSeen = (rows = [], articlesById = null) => {
  const fresh = [];
  const seen = [];
  for (const row of (Array.isArray(rows) ? rows : [])) {
    const type = String(row?.source?.type || row?.type || 'article').toLowerCase();
    if (type !== 'article' || !isSeen(row, articlesById)) fresh.push(row);
    else seen.push(row);
  }
  return { fresh, seen };
};

export const SEEN_FOLD_LABEL = 'Seen earlier';

/* The fold itself, riding inside virtualized and plain lists alike as one
   sentinel row. Lists branch on it rather than maintaining two render
   paths; a list that reaches it with nothing on one side never prints it. */
export const SEEN_FOLD_ROW = Object.freeze({ __seenFold: true });

export const isSeenFoldRow = (row) => Boolean(row && row.__seenFold === true);
