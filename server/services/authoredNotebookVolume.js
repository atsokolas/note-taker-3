const crypto = require('crypto');
const {
  canPublishNotebook,
  freezeNotebookSnapshot,
  hashPublicNotebook,
  isDuplicateKey,
  shareSlug
} = require('./authoredNotebookShare');

/**
 * C6 collected volume: selected published notebook essays, frozen together.
 *
 * Same URL contract as a shared notebook. The catalog is finished public
 * snapshots, not workshop drafts. Private edits never rewrite the volume.
 * An explicit owner update replaces it under the same slug.
 */

const PREVIEW_STALE = 'The collection changed since you previewed it. Refresh before sharing.';
const VOLUME_MIN_PIECES = 2;
const VOLUME_TITLE_CHARS = 300;
const VOLUME_INTRO_CHARS = 800;

const publicText = (value = '', limit = 8000) => String(value == null ? '' : value)
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, limit);

const stripTags = (value = '') => publicText(
  String(value || '').replace(/<[^>]*>/g, ' '),
  8000
);

const idOf = (value) => String(value?._id || value?.id || value || '').trim();

const asIso = (value) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
};

const uniqueIds = (values) => {
  const seen = new Set();
  const ids = [];
  (Array.isArray(values) ? values : []).forEach((value) => {
    const id = idOf(value);
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  });
  return ids;
};

const volumeTitle = (value) => publicText(stripTags(value), VOLUME_TITLE_CHARS);
const volumeIntroduction = (value) => publicText(stripTags(value), VOLUME_INTRO_CHARS);

const pieceFromShare = (share) => {
  const snapshot = share?.snapshot;
  if (!snapshot || !canPublishNotebook(snapshot)) return null;
  const frozen = freezeNotebookSnapshot(snapshot, snapshot.publishedAt, {
    revisedAt: snapshot.revisedAt,
    correction: snapshot.correction
  });
  return {
    notebookId: idOf(share.notebookId),
    title: frozen.title,
    contentHash: hashPublicNotebook(frozen),
    snapshot: frozen
  };
};

const publicPiece = (piece) => {
  const snapshot = piece?.snapshot || {};
  return {
    title: snapshot.title || piece?.title || 'Untitled',
    publishedAt: snapshot.publishedAt || '',
    ...(snapshot.revisedAt ? { revisedAt: snapshot.revisedAt } : {}),
    ...(snapshot.correction ? { correction: snapshot.correction } : {}),
    blocks: Array.isArray(snapshot.blocks) ? snapshot.blocks : []
  };
};

const indexOfIdeas = (pieces) => (Array.isArray(pieces) ? pieces : []).map((piece) => ({
  title: publicPiece(piece).title,
  ideas: (piece?.snapshot?.blocks || piece?.blocks || [])
    .filter((block) => block?.type === 'heading' && publicText(block.text, 400))
    .map((block) => publicText(block.text, 400))
}));

const collectSources = (pieces) => {
  const seen = new Set();
  const sources = [];
  (Array.isArray(pieces) ? pieces : []).forEach((piece) => {
    const blocks = piece?.snapshot?.blocks || piece?.blocks || [];
    blocks.forEach((block) => {
      const source = block?.source;
      if (!source?.href || source.access === 'withheld') return;
      const href = publicText(source.href, 2000);
      if (!href || seen.has(href)) return;
      seen.add(href);
      sources.push({
        title: publicText(source.title, 400),
        href
      });
    });
  });
  return sources;
};

const composeVolumeSnapshot = ({
  title,
  introduction,
  ownerDisplayName,
  pieces,
  publishedAt,
  extra = {}
} = {}) => {
  const publicPieces = (Array.isArray(pieces) ? pieces : []).map(publicPiece);
  const iso = asIso(publishedAt);
  const revised = asIso(extra.revisedAt);
  const correction = publicText(stripTags(extra.correction), 400);
  return {
    title: volumeTitle(title) || 'Untitled',
    introduction: volumeIntroduction(introduction),
    ownerDisplayName: publicText(ownerDisplayName, 200),
    contents: indexOfIdeas(pieces),
    sources: collectSources(pieces),
    pieces: publicPieces,
    ...(iso ? { publishedAt: iso } : {}),
    ...(revised && revised !== iso ? { revisedAt: revised } : {}),
    ...(correction ? { correction } : {})
  };
};

const hashPublicVolume = (snapshot) => crypto
  .createHash('sha256')
  .update(JSON.stringify({
    title: snapshot?.title || '',
    introduction: snapshot?.introduction || '',
    ownerDisplayName: snapshot?.ownerDisplayName || '',
    contents: snapshot?.contents || [],
    sources: snapshot?.sources || [],
    pieces: snapshot?.pieces || []
  }))
  .digest('hex');

const canPublishVolume = (snapshot) => (
  Boolean(volumeTitle(snapshot?.title))
  && Boolean(volumeIntroduction(snapshot?.introduction))
  && Array.isArray(snapshot?.pieces)
  && snapshot.pieces.length >= VOLUME_MIN_PIECES
  && snapshot.pieces.every((piece) => canPublishNotebook(piece))
);

const catalogEntry = (piece) => ({
  notebookId: piece.notebookId,
  title: piece.title,
  contentHash: piece.contentHash
});

const selectPieces = (catalog, notebookIds) => {
  const byId = new Map((Array.isArray(catalog) ? catalog : []).map((piece) => [piece.notebookId, piece]));
  const selected = [];
  uniqueIds(notebookIds).forEach((id) => {
    const piece = byId.get(id);
    if (piece) selected.push(piece);
  });
  return selected;
};

const loadPublishedCatalog = async (SharedNotebook, userId) => {
  if (!SharedNotebook?.find || !userId) return [];
  const found = SharedNotebook.find({ userId, snapshot: { $ne: null } });
  const rows = found && typeof found.lean === 'function' ? await found.lean() : await found;
  return (Array.isArray(rows) ? rows : [])
    .map(pieceFromShare)
    .filter(Boolean);
};

const volumeShareState = (volume, {
  catalog = [],
  selection = [],
  title = '',
  introduction = '',
  ownerDisplayName = '',
  extra = {}
} = {}) => {
  const selected = selectPieces(catalog, selection);
  const preview = composeVolumeSnapshot({
    title,
    introduction,
    ownerDisplayName,
    pieces: selected,
    publishedAt: volume?.publishedAt || extra.publishedAt
  });
  const currentHash = hashPublicVolume(preview);
  const snapshot = volume?.snapshot || null;
  return {
    shared: Boolean(volume?.slug && snapshot),
    publishable: canPublishVolume(preview),
    slug: volume?.slug || '',
    ownerDisplayName: volume?.ownerDisplayName || ownerDisplayName || '',
    publishedAt: volume?.publishedAt || snapshot?.publishedAt || null,
    contentHash: volume?.contentHash || '',
    currentHash,
    stale: Boolean(volume?.contentHash && currentHash && volume.contentHash !== currentHash),
    catalog: (Array.isArray(catalog) ? catalog : []).map(catalogEntry),
    selection: selected.map((piece) => piece.notebookId),
    title: volumeTitle(title),
    introduction: volumeIntroduction(introduction),
    preview,
    snapshot
  };
};

module.exports = {
  PREVIEW_STALE,
  VOLUME_INTRO_CHARS,
  VOLUME_MIN_PIECES,
  VOLUME_TITLE_CHARS,
  canPublishVolume,
  catalogEntry,
  collectSources,
  composeVolumeSnapshot,
  hashPublicVolume,
  indexOfIdeas,
  isDuplicateKey,
  loadPublishedCatalog,
  pieceFromShare,
  publicPiece,
  selectPieces,
  shareSlug,
  uniqueIds,
  volumeIntroduction,
  volumeShareState,
  volumeTitle
};
