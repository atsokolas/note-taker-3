const express = require('express');

const buildUiTourRouter = ({
  mongoose,
  authenticateToken,
  UiSettings,
  TourState,
  normalizeUiSettingsScope,
  normalizeUiSettingsPayload,
  buildUiSettingsResponse,
  buildTourStateResponse,
  isTourStateEmpty,
  getOrCreateTourState,
  normalizeTourSignals,
  deriveCompletedStepIdsFromSignals,
  normalizeTourCompletedStepIds,
  normalizeTourStatus,
  normalizeTourCurrentStepId,
  getNextTourStepId,
  TOUR_STEP_IDS,
  TOUR_SIGNAL_DEFAULTS,
  TOUR_EVENT_TIMESTAMP_DEFAULTS,
  TOUR_EVENT_TO_SIGNAL,
  markTourSignal
}) => {
  const router = express.Router();

  router.get('/api/ui-settings', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const scope = normalizeUiSettingsScope(req.query.workspaceType, req.query.workspaceId);
      const settings = await UiSettings.findOne({
        userId,
        workspaceType: scope.workspaceType,
        workspaceId: scope.workspaceId
      }).lean();
      res.status(200).json(buildUiSettingsResponse(settings, scope));
    } catch (error) {
      console.error('❌ Error fetching UI settings:', error);
      res.status(500).json({ error: 'Failed to fetch UI settings.' });
    }
  });

  router.put('/api/ui-settings', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const body = req.body || {};
      const scope = normalizeUiSettingsScope(body.workspaceType, body.workspaceId);
      const payload = normalizeUiSettingsPayload(body);
      const updated = await UiSettings.findOneAndUpdate(
        {
          userId,
          workspaceType: scope.workspaceType,
          workspaceId: scope.workspaceId
        },
        {
          $set: {
            ...payload,
            workspaceType: scope.workspaceType,
            workspaceId: scope.workspaceId
          }
        },
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true
        }
      ).lean();
      res.status(200).json(buildUiSettingsResponse(updated, scope));
    } catch (error) {
      console.error('❌ Error updating UI settings:', error);
      res.status(500).json({ error: 'Failed to update UI settings.' });
    }
  });

  router.get('/api/tour/state', authenticateToken, async (req, res) => {
    try {
      const userObjectId = new mongoose.Types.ObjectId(req.user.id);
      const state = await TourState.findOne({ userId: userObjectId }).lean();
      res.status(200).json(buildTourStateResponse(state, {
        isFirstTimeVisitor: isTourStateEmpty(state)
      }));
    } catch (error) {
      console.error('❌ Error fetching tour state:', error);
      res.status(500).json({ error: 'Failed to fetch tour state.' });
    }
  });

  router.put('/api/tour/state', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const body = req.body || {};
      const shouldReset = Boolean(body.reset);

      if (shouldReset) {
        const userObjectId = new mongoose.Types.ObjectId(userId);
        const resetState = await TourState.findOneAndUpdate(
          { userId: userObjectId },
          {
            $set: {
              status: 'not_started',
              currentStepId: null,
              completedStepIds: [],
              signals: { ...TOUR_SIGNAL_DEFAULTS },
              eventTimestamps: { ...TOUR_EVENT_TIMESTAMP_DEFAULTS },
              startedAt: null,
              completedAt: null
            }
          },
          {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true
          }
        );
        return res.status(200).json(buildTourStateResponse(resetState, {
          isFirstTimeVisitor: isTourStateEmpty(resetState)
        }));
      }

      const state = await getOrCreateTourState(userId);
      const signals = normalizeTourSignals(state.signals || {});
      const completedFromSignals = deriveCompletedStepIdsFromSignals(signals);
      const completedFromBody = body.completedStepIds !== undefined
        ? normalizeTourCompletedStepIds(body.completedStepIds)
        : normalizeTourCompletedStepIds(state.completedStepIds || []);
      const mergedCompleted = normalizeTourCompletedStepIds([...completedFromSignals, ...completedFromBody]);
      const completedAll = mergedCompleted.length === TOUR_STEP_IDS.length;

      const requestedStatus = body.status !== undefined
        ? normalizeTourStatus(body.status, state.status)
        : normalizeTourStatus(state.status, 'not_started');
      let nextStatus = completedAll ? 'completed' : requestedStatus;
      if (!completedAll && nextStatus === 'completed') {
        nextStatus = 'in_progress';
      }

      let nextCurrentStepId = body.currentStepId !== undefined
        ? normalizeTourCurrentStepId(body.currentStepId)
        : normalizeTourCurrentStepId(state.currentStepId);
      if (nextStatus === 'completed') {
        nextCurrentStepId = null;
      } else if (nextStatus === 'not_started') {
        nextCurrentStepId = null;
      } else if (!nextCurrentStepId) {
        nextCurrentStepId = getNextTourStepId(mergedCompleted);
      }

      const now = new Date();
      state.signals = signals;
      state.completedStepIds = mergedCompleted;
      state.status = nextStatus;
      state.currentStepId = nextCurrentStepId;
      if (nextStatus === 'in_progress') {
        state.startedAt = state.startedAt || now;
        state.completedAt = null;
      } else if (nextStatus === 'completed') {
        state.startedAt = state.startedAt || now;
        state.completedAt = state.completedAt || now;
      } else if (nextStatus === 'not_started') {
        state.startedAt = null;
        state.completedAt = null;
      } else {
        state.completedAt = null;
      }
      await state.save();
      res.status(200).json(buildTourStateResponse(state, {
        isFirstTimeVisitor: isTourStateEmpty(state)
      }));
    } catch (error) {
      console.error('❌ Error updating tour state:', error);
      res.status(500).json({ error: 'Failed to update tour state.' });
    }
  });

  router.post('/api/tour/events', authenticateToken, async (req, res) => {
    try {
      const eventType = String(req.body?.eventType || '').trim().toLowerCase();
      const metadata = req.body?.metadata && typeof req.body.metadata === 'object'
        ? req.body.metadata
        : {};
      const signalKey = TOUR_EVENT_TO_SIGNAL[eventType] || '';
      if (!signalKey) {
        return res.status(400).json({
          error: 'Unsupported eventType.',
          allowed: Object.keys(TOUR_EVENT_TO_SIGNAL)
        });
      }
      const updated = await markTourSignal(req.user.id, signalKey, eventType);
      if (!updated) {
        return res.status(400).json({ error: 'Unsupported eventType.' });
      }
      res.status(200).json({
        accepted: true,
        eventType,
        signalKey,
        metadata,
        state: buildTourStateResponse(updated, {
          isFirstTimeVisitor: isTourStateEmpty(updated)
        })
      });
    } catch (error) {
      console.error('❌ Error recording tour event:', error);
      res.status(500).json({ error: 'Failed to record tour event.' });
    }
  });

  return router;
};

module.exports = { buildUiTourRouter };
