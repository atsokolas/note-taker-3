// The Museum: hanging pieces, arranging the wall, and opening it to visitors.
const express = require('express');
const mongoose = require('mongoose');
const { readKept } = require('../services/home');
const { PASSAGE_MAX, PIECE_DETAIL, SOURCES, nextAccession, ownerMuseum, publicMuseum, sourceOffer } = require('../services/museumShape');

const HANDLE = /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$/;
// Things you already kept for good, offered on an empty or growing wall. A handful, never a feed.
const KEPT_OFFERED = 6;
const EMPTY = Object.freeze({ name: '', handle: '', intro: '', open: false, pieces: [] });

const detailFrom = (body = {}) => Object.fromEntries(PIECE_DETAIL
  .filter(key => body[key] !== undefined)
  .map(key => [key, key === 'own' ? Boolean(body[key]) : key === 'ledTo' ? [].concat(body[key]).map(String) : String(body[key]).trim()]));

// What stops a piece from hanging, said plainly, or '' when it may.
const refusal = piece => {
  if (!piece.why) return 'Say why it is here. That line is what visitors come for.';
  if (piece.passage.length > PASSAGE_MAX) return `A passage on the wall is ${PASSAGE_MAX} characters at most. Cut it to the lines that matter.`;
  return '';
};

// A wall is visible when its owner opened it and it has an address and something on it.
const visible = museum => Boolean(museum?.open && museum.handle && museum.pieces.length);

const safely = handler => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: 'That address is taken. Try another.' });
    if (error?.name === 'ValidationError') return res.status(400).json({ error: 'That is longer than the wall allows. Shorten it and try again.' });
    console.error('[museum]', error.message);
    return res.status(500).json({ error: 'The museum could not be reached just now.' });
  }
};

const buildMuseumRouter = ({ auth, humanOnly, Museum, Article, WikiPage, NotebookEntry }) => {
  const router = express.Router();
  const models = { Article, WikiPage, NotebookEntry };

  const sourceOf = (userId, kind, id) => (SOURCES[kind] && mongoose.isValidObjectId(id)
    ? models[SOURCES[kind].model].findOne({ _id: id, userId }).select(SOURCES[kind].fields).lean()
    : null);

  // Pages of your own on the wall, read live, so a page's link follows whether it is shared today.
  const pagesOn = async museum => {
    const ids = museum.pieces.filter(piece => piece.kind === 'wiki').map(piece => piece.targetId);
    if (!ids.length) return new Map();
    const pages = await WikiPage.find({ _id: { $in: ids } }).select('slug visibility lastReviewedAt').lean();
    return new Map(pages.map(page => [String(page._id), page]));
  };

  const shown = async museum => (museum ? ownerMuseum(museum, await pagesOn(museum)) : EMPTY);

  /* What you kept for good and have not hung, the longest held first: the
     same Kept as Home, so the wall is Kept, shown. A work hangs once, and a
     passage you kept in it is the one it offers. A thread runs through
     several works, so it is not one piece. Keeping is the one decision no
     agent may make, so this offers only your own. */
  const keptNotHung = async (userId, museum) => {
    const hung = new Set((museum?.pieces || []).map(piece => String(piece.targetId)));
    const [held, pages] = await Promise.all([
      readKept({ Article, userId }),
      WikiPage.find({ userId, evergreen: true }).select('title evergreenAt').lean()
    ]);
    const offers = new Map();
    for (const { kind, id, title, passage, at } of [
      ...held.filter(item => item.kind !== 'thread').map(item => ({ kind: 'article', id: item.articleId, title: item.title, passage: item.text || '', at: item.at })),
      ...pages.map(page => ({ kind: 'wiki', id: String(page._id), title: page.title, passage: '', at: page.evergreenAt }))
    ].sort((a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime())) {
      if (!title || hung.has(id)) continue;
      const offer = offers.get(id) || { kind, id, title, passage: '' };
      offers.set(id, { ...offer, passage: offer.passage || passage });
    }
    return [...offers.values()].slice(0, KEPT_OFFERED);
  };

  const withPiece = handler => safely(async (req, res) => {
    const museum = await Museum.findOne({ userId: req.user.id });
    const piece = museum?.pieces.find(candidate => candidate.accession === String(req.params.accession));
    if (!piece) return res.status(404).json({ error: 'No piece on your wall has that number.' });
    return handler(req, res, museum, piece);
  });

  router.get('/api/museum', auth, safely(async (req, res) => {
    const museum = await Museum.findOne({ userId: req.user.id });
    return res.json({ museum: await shown(museum), kept: await keptNotHung(req.user.id, museum) });
  }));

  // What one thing would bring to the wall, and the piece it already is if it hangs there.
  router.get('/api/museum/sources/:kind/:id', auth, safely(async (req, res) => {
    const record = await sourceOf(req.user.id, req.params.kind, req.params.id);
    if (!record) return res.status(404).json({ error: 'That is not one of yours to hang.' });
    const museum = await Museum.findOne({ userId: req.user.id });
    const { arrivedAt, ...source } = sourceOffer(req.params.kind, record);
    const piece = (await shown(museum)).pieces.find(candidate => candidate.kind === req.params.kind && candidate.id === String(record._id));
    return res.json({ source, piece: piece || null });
  }));

  router.put('/api/museum', auth, humanOnly, safely(async (req, res) => {
    const museum = await Museum.findOne({ userId: req.user.id }) || new Museum({ userId: req.user.id });
    for (const key of ['name', 'handle', 'intro']) {
      if (req.body?.[key] !== undefined) museum[key] = String(req.body[key]).trim();
    }
    if (museum.handle && !HANDLE.test(museum.handle.toLowerCase())) {
      return res.status(400).json({ error: 'An address is letters, numbers and dashes, up to 30.' });
    }
    if (req.body?.open !== undefined) museum.open = Boolean(req.body.open);
    if (museum.open && !visible(museum)) {
      return res.status(400).json({ error: 'Give the wall a name, an address and one piece before you open it.' });
    }
    await museum.save();
    return res.json({ museum: await shown(museum) });
  }));

  router.post('/api/museum/pieces', auth, humanOnly, safely(async (req, res) => {
    const { kind, id } = req.body || {};
    const record = await sourceOf(req.user.id, kind, id);
    if (!record) return res.status(404).json({ error: 'That is not one of yours to hang.' });
    const museum = await Museum.findOne({ userId: req.user.id }) || new Museum({ userId: req.user.id });
    const already = museum.pieces.find(piece => piece.kind === kind && String(piece.targetId) === String(record._id));
    if (already) return res.status(409).json({ error: `Already on your wall as ${already.accession}.`, accession: already.accession });
    const { arrivedAt, passages, ...offer } = sourceOffer(kind, record);
    const piece = { passage: '', why: '', room: '', ledTo: [], ...offer, ...detailFrom(req.body), kind, targetId: record._id, accession: nextAccession(museum, arrivedAt) };
    const refused = refusal(piece);
    if (refused) return res.status(400).json({ error: refused });
    museum.pieces.push(piece);
    await museum.save();
    return res.status(201).json({ museum: await shown(museum), accession: piece.accession });
  }));

  router.patch('/api/museum/pieces/:accession', auth, humanOnly, withPiece(async (req, res, museum, piece) => {
    piece.set(detailFrom(req.body));
    const refused = refusal(piece);
    if (refused) return res.status(400).json({ error: refused });
    await museum.save();
    return res.json({ museum: await shown(museum) });
  }));

  // Taking a piece down retires its number: a link already sent says it was taken down.
  router.delete('/api/museum/pieces/:accession', auth, humanOnly, withPiece(async (req, res, museum, piece) => {
    museum.pieces = museum.pieces.filter(candidate => candidate.accession !== piece.accession);
    museum.retired.push(piece.accession);
    await museum.save();
    return res.json({ museum: await shown(museum) });
  }));

  // The hang order, as the owner arranged it: every piece once, in the new order.
  router.put('/api/museum/order', auth, humanOnly, safely(async (req, res) => {
    const museum = await Museum.findOne({ userId: req.user.id });
    const order = [].concat(req.body?.order || []).map(String);
    const byAccession = new Map((museum?.pieces || []).map(piece => [piece.accession, piece]));
    if (!museum || order.length !== byAccession.size || !order.every(accession => byAccession.has(accession))) {
      return res.status(400).json({ error: 'The new order has to hold every piece on the wall once.' });
    }
    museum.pieces = order.map(accession => byAccession.get(accession).toObject());
    await museum.save();
    return res.json({ museum: await shown(museum) });
  }));

  router.get('/api/public/museums/:handle', safely(async (req, res) => {
    const museum = await Museum.findOne({ handle: { $eq: String(req.params.handle).toLowerCase() } });
    if (!visible(museum)) return res.status(404).json({ error: 'This museum is closed.' });
    return res.json({ museum: publicMuseum(museum, await pagesOn(museum)) });
  }));

  return router;
};

module.exports = { buildMuseumRouter };
