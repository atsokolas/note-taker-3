const express = require('express');

const buildReturnQueueRouter = ({
  mongoose,
  authenticateToken,
  ReturnQueueEntry,
  normalizeReturnQueueItemType,
  parseDueAt,
  resolveReturnQueueItem,
  buildUnavailableQueueItem,
  trackEvent,
  EVENT_NAMES
}) => {
  const router = express.Router();

  router.post(['/api/return-queue', '/return-queue'], authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const {
        itemType = '',
        itemId = '',
        reason = '',
        dueAt = null
      } = req.body || {};
      const safeItemType = normalizeReturnQueueItemType(itemType);
      const safeItemId = String(itemId || '').trim();
      const safeReason = String(reason || '').trim().slice(0, 280);
      if (!safeItemType || !safeItemId) {
        return res.status(400).json({ error: 'itemType and itemId are required.' });
      }
      const parsedDueAt = parseDueAt(dueAt);
      if (dueAt !== null && dueAt !== undefined && dueAt !== '' && !parsedDueAt) {
        return res.status(400).json({ error: 'Invalid dueAt value.' });
      }
      const item = await resolveReturnQueueItem(userId, safeItemType, safeItemId);
      if (!item) {
        return res.status(404).json({ error: 'Item not found for this user.' });
      }
      const created = await ReturnQueueEntry.create({
        itemType: safeItemType,
        itemId: safeItemId,
        reason: safeReason,
        dueAt: parsedDueAt,
        status: 'pending',
        userId
      });
      trackEvent({
        event: EVENT_NAMES.REVISIT_SCHEDULED,
        userId,
        requestId: req.requestId,
        properties: {
          itemType: safeItemType,
          itemId: safeItemId,
          dueAt: parsedDueAt ? parsedDueAt.toISOString() : '',
          reason: safeReason
        }
      });
      res.status(201).json({ ...created.toObject(), item });
    } catch (error) {
      console.error('❌ Error creating return queue entry:', error);
      res.status(500).json({ error: 'Failed to create return queue entry.' });
    }
  });

  router.get(['/api/return-queue', '/return-queue'], authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const filter = String(req.query.filter || 'due').trim().toLowerCase();
      if (!['due', 'upcoming', 'all'].includes(filter)) {
        return res.status(400).json({ error: "filter must be one of: due, upcoming, all." });
      }
      const now = new Date();
      const query = { userId };
      if (filter === 'due') {
        query.status = 'pending';
        query.$or = [{ dueAt: null }, { dueAt: { $lte: now } }];
      } else if (filter === 'upcoming') {
        query.status = 'pending';
        query.dueAt = { $gt: now };
      }
      const entries = await ReturnQueueEntry.find(query)
        .sort({ status: 1, dueAt: 1, createdAt: -1 })
        .limit(400)
        .lean();
      const hydrated = await Promise.all(entries.map(async (entry) => {
        const item = await resolveReturnQueueItem(userId, entry.itemType, entry.itemId);
        return {
          ...entry,
          item: item || buildUnavailableQueueItem()
        };
      }));
      res.status(200).json(hydrated);
    } catch (error) {
      console.error('❌ Error fetching return queue entries:', error);
      res.status(500).json({ error: 'Failed to fetch return queue entries.' });
    }
  });

  router.patch(['/api/return-queue/:id', '/return-queue/:id'], authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid return queue id.' });
      }
      const {
        action = '',
        dueAt = null,
        snoozeDays = 3,
        reason
      } = req.body || {};
      const safeAction = String(action || '').trim().toLowerCase();
      if (!['done', 'snooze', 'reschedule'].includes(safeAction)) {
        return res.status(400).json({ error: 'action must be one of: done, snooze, reschedule.' });
      }
      const entry = await ReturnQueueEntry.findOne({ _id: id, userId });
      if (!entry) {
        return res.status(404).json({ error: 'Return queue entry not found.' });
      }
      if (safeAction === 'done') {
        entry.status = 'completed';
        entry.completedAt = new Date();
      } else if (safeAction === 'snooze') {
        const days = Number.isFinite(Number(snoozeDays)) ? Number(snoozeDays) : 3;
        const safeDays = Math.max(1, Math.min(30, Math.round(days)));
        const nextDue = new Date(Date.now() + safeDays * 24 * 60 * 60 * 1000);
        entry.status = 'pending';
        entry.completedAt = null;
        entry.dueAt = nextDue;
      } else if (safeAction === 'reschedule') {
        const parsedDueAt = parseDueAt(dueAt);
        if (!parsedDueAt) {
          return res.status(400).json({ error: 'dueAt is required for reschedule.' });
        }
        entry.status = 'pending';
        entry.completedAt = null;
        entry.dueAt = parsedDueAt;
      }
      if (reason !== undefined) {
        entry.reason = String(reason || '').trim().slice(0, 280);
      }
      await entry.save();
      const item = await resolveReturnQueueItem(userId, entry.itemType, entry.itemId);
      res.status(200).json({ ...entry.toObject(), item: item || buildUnavailableQueueItem() });
    } catch (error) {
      console.error('❌ Error updating return queue entry:', error);
      res.status(500).json({ error: 'Failed to update return queue entry.' });
    }
  });

  return router;
};

module.exports = { buildReturnQueueRouter };
