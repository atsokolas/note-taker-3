const express = require('express');
const mongoose = require('mongoose');
const { pencilOf } = require('../services/agentTokenService');
const { BUILT_IN } = require('../services/agentRuntime');
const { pencilled } = require('../services/pencilled');
const { inWork } = require('../models/knowledgeContext');

/* Handing work to an agent. The reader, stepping away, leaves one line and
   where they were; an agent takes it, works in pencil, and finishes with what
   it did, what is still open and what it would do next. An agent may hand
   work on the same way. A handoff's status is read from its dates, and what
   it wrote is the taker's pencil between taking and finishing: neither is
   stored beside it where it could drift. */

const STATUS = {
  waiting: { takenAt: null, cancelledAt: null },
  taken: { takenAt: { $ne: null }, finishedAt: null, cancelledAt: null },
  done: { finishedAt: { $ne: null } },
  cancelled: { cancelledAt: { $ne: null } }
};
const statusOf = h => (h.cancelledAt ? 'cancelled' : h.finishedAt ? 'done' : h.takenAt ? 'taken' : 'waiting');

const text = (value, max) => String(value || '').trim().slice(0, max);
const contextOf = (context = {}) => ({
  kind: text(context.kind, 40),
  id: text(context.id, 40),
  title: text(context.title, 300),
  excerpt: text(context.excerpt, 4000)
});

const shown = h => ({
  kind: 'handoff',
  id: String(h._id),
  ask: h.ask,
  context: h.context,
  to: h.to,
  from: h.from?.agent || null,
  takenBy: h.takenBy?.agent || null,
  status: statusOf(h),
  did: h.did,
  open: h.open,
  next: h.next,
  createdAt: h.createdAt,
  takenAt: h.takenAt,
  finishedAt: h.finishedAt
});

// An agent sees what was handed to it or to any agent; the reader sees all.
const WORK_CONTEXTS = ['work_note', 'work_task'];
const forWhom = ({ agentToken }) => {
  if (!agentToken) return {};
  const builtIn = agentToken.runtime === BUILT_IN;
  const outsideWork = { 'context.kind': { $nin: WORK_CONTEXTS } };
  return {
    to: { $in: ['', String(agentToken.id), ...(builtIn ? [BUILT_IN] : [])] },
    ...(agentToken.scopes?.includes('work') ? {} : builtIn ? {
      $or: [outsideWork, { to: BUILT_IN, 'context.kind': 'work_task' }]
    } : outsideWork)
  };
};

// What is waiting for whoever is asking, oldest first: the brief opens with it.
const waitingFor = async ({ Handoff, req }) => (
  await Handoff.find({ userId: req.user.id, ...STATUS.waiting, ...forWhom(req) }).sort({ createdAt: 1 }).limit(10).lean()
).map(shown);

const buildHandoffRouter = ({ authenticateToken, humanOnly, Handoff, Article, NotebookEntry, onHandedToNoeis = () => {}, onFinished = () => {} }) => {
  const router = express.Router();
  const valid = id => mongoose.isValidObjectId(id);

  // What a handoff wrote: its taker's pencil between taking and finishing.
  const wroteDuring = ({ userId, takenBy, takenAt, finishedAt }) => (takenBy
    ? pencilled({ Article, NotebookEntry, userId, tokenId: takenBy.tokenId, during: { $gte: takenAt, $lte: finishedAt || new Date() } })
    : []);

  router.post('/api/handoffs', authenticateToken, async (req, res) => {
    const ask = text(req.body?.ask, 2000);
    if (!ask) return res.status(400).json({ error: 'Say what the agent should do.' });
    const to = String(req.body?.to || '');
    if (to && to !== BUILT_IN && !valid(to)) return res.status(400).json({ error: 'Hand it to Noeis, one of your connections, or any agent.' });
    try {
      const context = contextOf(req.body?.context);
      if (WORK_CONTEXTS.includes(context.kind) && req.agentToken && !req.agentToken.scopes?.includes('work')) {
        return res.status(403).json({ error: 'This connection has no Work access.' });
      }
      if (context.kind === 'work_task') {
        const task = valid(context.id) ? await inWork(NotebookEntry.findOne({
          _id: context.id, userId: req.user.id, trashedAt: null, erasedAt: null, 'workItem.kind': { $in: ['task', 'question'] }
        })).lean() : null;
        if (!task) return res.status(404).json({ error: 'That Work task is unavailable.' });
        const origin = task.workItem.origin || {};
        if (text(task.title, 300) !== context.title || text(origin.quote, 4000) !== context.excerpt) {
          return res.status(409).json({ error: 'That task changed. Reopen it and review the current handoff.' });
        }
        const note = origin.noteId || task.workItem.noteId;
        if (note) context.href = `/work?${new URLSearchParams({ note: String(note), ...(origin.blockId ? { block: origin.blockId } : {}), ...(origin.day ? { entry: origin.day } : {}) })}`;
      }
      const handoff = await Handoff.create({ userId: req.user.id, ask, context, to, from: pencilOf(req) });
      if (to === BUILT_IN) onHandedToNoeis(handoff);
      return res.status(201).json(shown(handoff));
    } catch (error) {
      console.error('[handoffs] create failed', error.message);
      return res.status(500).json({ error: 'That could not be handed off.' });
    }
  });

  router.get('/api/handoffs', authenticateToken, async (req, res) => {
    const status = String(req.query.status || '');
    if (status && !STATUS[status]) return res.status(400).json({ error: `status is one of ${Object.keys(STATUS).join(', ')}.` });
    try {
      const rows = await Handoff.find({ userId: req.user.id, ...(STATUS[status] || {}), ...forWhom(req) }).sort({ createdAt: -1 }).limit(50).lean();
      return res.json({ handoffs: rows.map(shown) });
    } catch (error) {
      console.error('[handoffs] list failed', error.message);
      return res.status(500).json({ error: 'Your handoffs could not be listed.' });
    }
  });

  router.get('/api/handoffs/:id', authenticateToken, async (req, res) => {
    if (!valid(req.params.id)) return res.status(404).json({ error: 'No handoff of yours has that id.' });
    try {
      const handoff = await Handoff.findOne({ _id: req.params.id, userId: req.user.id, ...forWhom(req) }).lean();
      if (!handoff) return res.status(404).json({ error: 'No handoff of yours has that id.' });
      return res.json({ ...shown(handoff), wrote: await wroteDuring({ userId: req.user.id, ...handoff }) });
    } catch (error) {
      console.error('[handoffs] read failed', error.message);
      return res.status(500).json({ error: 'That handoff could not be read.' });
    }
  });

  // Taking is one atomic step, so two agents never take the same handoff.
  router.post('/api/handoffs/:id/take', authenticateToken, async (req, res) => {
    const me = pencilOf(req);
    if (!me) return res.status(403).json({ error: 'An agent connection with write access takes a handoff.' });
    if (!valid(req.params.id)) return res.status(404).json({ error: 'No handoff of yours has that id.' });
    const handoff = await Handoff.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id, ...STATUS.waiting, ...forWhom(req) },
      { $set: { takenBy: me, takenAt: me.at } },
      { new: true }
    ).lean();
    if (!handoff) return res.status(409).json({ error: 'That handoff is not waiting for you.' });
    return res.json(shown(handoff));
  });

  router.post('/api/handoffs/:id/finish', authenticateToken, async (req, res) => {
    const me = pencilOf(req);
    if (!me) return res.status(403).json({ error: 'Only the agent that took a handoff finishes it.' });
    const did = text(req.body?.did, 4000);
    if (!did) return res.status(400).json({ error: 'Say what you did.' });
    if (!valid(req.params.id)) return res.status(404).json({ error: 'No handoff of yours has that id.' });
    const handoff = await Handoff.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id, 'takenBy.tokenId': me.tokenId, ...STATUS.taken, ...forWhom(req) },
      { $set: { did, open: text(req.body?.open, 4000), next: text(req.body?.next, 4000), finishedAt: new Date() } },
      { new: true }
    ).lean();
    if (!handoff) return res.status(409).json({ error: 'You have not taken that handoff, or it is already finished.' });
    const wrote = await wroteDuring({ userId: req.user.id, ...handoff });
    if (wrote.length) onFinished({ handoff, wrote });
    return res.json({ ...shown(handoff), wrote });
  });

  router.post('/api/handoffs/:id/cancel', authenticateToken, humanOnly, async (req, res) => {
    if (!valid(req.params.id)) return res.status(404).json({ error: 'No handoff of yours has that id.' });
    const handoff = await Handoff.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id, finishedAt: null, cancelledAt: null },
      { $set: { cancelledAt: new Date() } },
      { new: true }
    ).lean();
    if (!handoff) return res.status(409).json({ error: 'That handoff is already finished or called off.' });
    return res.json(shown(handoff));
  });

  return router;
};

module.exports = { buildHandoffRouter, waitingFor, STATUS };
