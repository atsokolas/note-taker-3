const express = require('express');

const buildAgentActionRouter = ({
  authenticateToken,
  authenticatePersonalAgentKey,
  resolveConceptByParam,
  executeWorkspaceActionsWithPolicy,
  normalizeAgentActionFlow,
  normalizeAgentActorType,
  listActionApprovals,
  approveActionApproval,
  rejectActionApproval,
  undoLastWorkspaceAction,
  listSoftDeleteRecords,
  AGENT_DELETE_RETENTION_DAYS,
  restoreSoftDeletedWorkspaceItem
}) => {
  const router = express.Router();

  router.post('/api/agent/actions/execute', authenticateToken, async (req, res) => {
    try {
      const rawConcept = String(req.body?.conceptId || '').trim();
      if (!rawConcept) return res.status(400).json({ error: 'conceptId is required.' });
      const concept = await resolveConceptByParam(req.user.id, rawConcept, { createIfMissing: false });
      if (!concept) return res.status(404).json({ error: 'Concept not found.' });

      const result = await executeWorkspaceActionsWithPolicy({
        userId: String(req.user.id),
        conceptId: String(concept._id),
        conceptName: concept.name || '',
        operations: req.body?.operations,
        flow: normalizeAgentActionFlow(req.body?.flow, 'direct'),
        explicitUserCommand: Boolean(req.body?.explicitUserCommand),
        actorType: normalizeAgentActorType(req.body?.actorType, 'native_agent'),
        actorId: String(req.body?.actorId || '').trim()
      });

      if (result.status === 'approval_required') return res.status(202).json(result);
      return res.status(200).json(result);
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Invalid agent action request.' });
      }
      console.error('❌ Error executing agent actions:', error);
      return res.status(500).json({ error: 'Failed to execute agent actions.' });
    }
  });

  router.post('/api/agent/byo/actions/execute', authenticatePersonalAgentKey, async (req, res) => {
    try {
      const rawConcept = String(req.body?.conceptId || '').trim();
      if (!rawConcept) return res.status(400).json({ error: 'conceptId is required.' });
      const concept = await resolveConceptByParam(req.personalAgent.userId, rawConcept, { createIfMissing: false });
      if (!concept) return res.status(404).json({ error: 'Concept not found.' });

      const capabilities = req.personalAgent.capabilities || {};
      const operations = Array.isArray(req.body?.operations) ? req.body.operations : [];
      const hasDelete = operations.some(op => String(op?.op || '').trim() === 'deleteItem' || String(op?.op || '').trim() === 'deleteItems');
      if (hasDelete && !capabilities.executeDeletes) {
        return res.status(403).json({ error: 'This personal agent cannot execute deletes.' });
      }
      if (!hasDelete && !capabilities.executeWrites) {
        return res.status(403).json({ error: 'This personal agent cannot execute writes.' });
      }

      const result = await executeWorkspaceActionsWithPolicy({
        userId: String(req.personalAgent.userId),
        conceptId: String(concept._id),
        conceptName: concept.name || '',
        operations,
        flow: normalizeAgentActionFlow(req.body?.flow, 'direct'),
        explicitUserCommand: Boolean(req.body?.explicitUserCommand),
        actorType: 'byo_agent',
        actorId: req.personalAgent.id
      });

      if (result.status === 'approval_required') return res.status(202).json(result);
      return res.status(200).json(result);
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Invalid BYO agent action request.' });
      }
      console.error('❌ Error executing BYO agent actions:', error);
      return res.status(500).json({ error: 'Failed to execute BYO agent actions.' });
    }
  });

  router.get('/api/agent/actions/approvals', authenticateToken, async (req, res) => {
    try {
      const conceptParam = String(req.query.conceptId || '').trim();
      let conceptId = '';
      if (conceptParam) {
        const concept = await resolveConceptByParam(req.user.id, conceptParam, { createIfMissing: false });
        if (!concept) return res.status(404).json({ error: 'Concept not found.' });
        conceptId = String(concept._id);
      }
      const approvals = await listActionApprovals({
        userId: String(req.user.id),
        conceptId,
        status: String(req.query.status || 'pending').trim(),
        limit: Number(req.query.limit || 30)
      });
      return res.status(200).json({ approvals });
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Invalid approvals request.' });
      }
      console.error('❌ Error listing action approvals:', error);
      return res.status(500).json({ error: 'Failed to list action approvals.' });
    }
  });

  router.post('/api/agent/actions/approvals/:approvalId/approve', authenticateToken, async (req, res) => {
    try {
      const result = await approveActionApproval({
        userId: String(req.user.id),
        approvalId: String(req.params.approvalId || '').trim(),
        actorType: normalizeAgentActorType(req.body?.actorType, 'user'),
        actorId: String(req.body?.actorId || '').trim()
      });
      return res.status(200).json(result);
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Failed to approve action.' });
      }
      console.error('❌ Error approving action:', error);
      return res.status(500).json({ error: 'Failed to approve action.' });
    }
  });

  router.post('/api/agent/actions/approvals/:approvalId/reject', authenticateToken, async (req, res) => {
    try {
      const result = await rejectActionApproval({
        userId: String(req.user.id),
        approvalId: String(req.params.approvalId || '').trim(),
        actorType: normalizeAgentActorType(req.body?.actorType, 'user'),
        actorId: String(req.body?.actorId || '').trim()
      });
      return res.status(200).json({ approval: result });
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Failed to reject action.' });
      }
      console.error('❌ Error rejecting action:', error);
      return res.status(500).json({ error: 'Failed to reject action.' });
    }
  });

  router.post('/api/agent/actions/undo', authenticateToken, async (req, res) => {
    try {
      const conceptParam = String(req.body?.conceptId || '').trim();
      let conceptId = '';
      if (conceptParam) {
        const concept = await resolveConceptByParam(req.user.id, conceptParam, { createIfMissing: false });
        if (!concept) return res.status(404).json({ error: 'Concept not found.' });
        conceptId = String(concept._id);
      }

      const result = await undoLastWorkspaceAction({
        userId: String(req.user.id),
        conceptId,
        actorType: normalizeAgentActorType(req.body?.actorType, 'user'),
        actorId: String(req.body?.actorId || '').trim()
      });
      return res.status(200).json(result);
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Failed to undo action.' });
      }
      console.error('❌ Error undoing action:', error);
      return res.status(500).json({ error: 'Failed to undo action.' });
    }
  });

  router.get('/api/agent/actions/deletions', authenticateToken, async (req, res) => {
    try {
      const conceptParam = String(req.query.conceptId || '').trim();
      let conceptId = '';
      if (conceptParam) {
        const concept = await resolveConceptByParam(req.user.id, conceptParam, { createIfMissing: false });
        if (!concept) return res.status(404).json({ error: 'Concept not found.' });
        conceptId = String(concept._id);
      }
      const records = await listSoftDeleteRecords({
        userId: String(req.user.id),
        conceptId,
        status: String(req.query.status || 'deleted').trim(),
        limit: Number(req.query.limit || 60)
      });
      return res.status(200).json({
        retentionDays: AGENT_DELETE_RETENTION_DAYS,
        records
      });
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Failed to list deletions.' });
      }
      console.error('❌ Error listing soft deletes:', error);
      return res.status(500).json({ error: 'Failed to list soft deletes.' });
    }
  });

  router.post('/api/agent/actions/deletions/:recordId/restore', authenticateToken, async (req, res) => {
    try {
      const result = await restoreSoftDeletedWorkspaceItem({
        userId: String(req.user.id),
        recordId: String(req.params.recordId || '').trim(),
        actorType: normalizeAgentActorType(req.body?.actorType, 'user'),
        actorId: String(req.body?.actorId || '').trim()
      });
      return res.status(200).json(result);
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Failed to restore deleted item.' });
      }
      console.error('❌ Error restoring soft deleted item:', error);
      return res.status(500).json({ error: 'Failed to restore deleted item.' });
    }
  });

  return router;
};

module.exports = {
  buildAgentActionRouter
};
