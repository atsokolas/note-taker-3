const express = require('express');
const { buildConceptWorkspaceAuthorizationService } = require('../services/conceptWorkspaceAuthorizationService');

const buildConceptWorkspaceRouter = ({
  mongoose,
  authenticateToken,
  resolveConceptByParam,
  ensureWorkspace,
  toSafeObjectId,
  findHighlightById,
  Article,
  NotebookEntry,
  Question,
  TagMeta,
  WikiPage,
  validateWorkspacePayload,
  applyPatchOp,
  executeWorkspaceActionsWithPolicy,
  normalizeAgentActionFlow,
  normalizeAgentActorType,
  markTourSignal
}) => {
  const router = express.Router();
  const workspaceAuthorization = buildConceptWorkspaceAuthorizationService({
    mongoose, Article, NotebookEntry, Question, TagMeta, WikiPage, ensureWorkspace
  });

  const loadWorkspaceConcept = async (userId, conceptId) => {
    const concept = await resolveConceptByParam(userId, conceptId, { createIfMissing: false });
    if (!concept) return null;
    const workspace = ensureWorkspace(concept);
    if (concept.workspace?.updatedAt) workspace.updatedAt = concept.workspace.updatedAt;
    const previous = JSON.stringify(concept.workspace || null);
    const normalized = JSON.stringify(workspace);
    if (previous !== normalized) {
      concept.workspace = workspace;
      concept.markModified('workspace');
      await concept.save();
    }
    return { concept, workspace };
  };

  const WORKSPACE_ATTACHABLE_TYPES = new Set([
    'highlight',
    'article',
    'note',
    'question',
    'concept',
    'wiki_page',
    'wiki_claim'
  ]);

  const normalizeWorkspaceAttachType = (value) => {
    const type = String(value || '').trim().toLowerCase();
    return WORKSPACE_ATTACHABLE_TYPES.has(type) ? type : '';
  };

  const addObjectIdToSet = (existing, nextId) => {
    const list = Array.isArray(existing) ? existing : [];
    const safeId = toSafeObjectId(nextId);
    if (!safeId) return { next: list, changed: false };
    const safeIdString = String(safeId);
    if (list.some(entry => String(entry) === safeIdString)) {
      return { next: list, changed: false };
    }
    return { next: [...list, safeId], changed: true };
  };

  const resolveWorkspaceAttachSource = workspaceAuthorization.resolveSource;

  const authorizeWorkspaceItems = async (userId, items) => {
    return workspaceAuthorization.authorizeItems(userId, items, { rejectInvalid: true });
  };

  const loadAuthorizedWorkspaceConcept = async (userId, conceptId) => {
    const loaded = await loadWorkspaceConcept(userId, conceptId);
    if (!loaded) return null;
    return workspaceAuthorization.sanitizeConceptWorkspace(loaded.concept, userId);
  };

  const authorizeWorkspacePatch = async (userId, workspace, operation) => {
    const op = String(operation?.op || '').trim();
    const payload = operation?.payload && typeof operation.payload === 'object'
      ? operation.payload
      : {};
    if (op === 'addItem') {
      const source = await resolveWorkspaceAttachSource(userId, payload.type, payload.refId);
      return source
        ? { ...operation, payload: { ...payload, ...source } }
        : null;
    }
    if (op === 'updateItem') {
      const itemId = String(payload.itemId || payload.id || '').trim();
      const current = (workspace?.items || []).find(item => item.id === itemId);
      if (!current) return null;
      const requestedPatch = payload.patch && typeof payload.patch === 'object'
        ? payload.patch
        : payload;
      const source = await resolveWorkspaceAttachSource(
        userId,
        requestedPatch.type !== undefined ? requestedPatch.type : current.type,
        requestedPatch.refId !== undefined ? requestedPatch.refId : current.refId
      );
      return source
        ? {
            ...operation,
            payload: {
              itemId,
              patch: { ...requestedPatch, ...source }
            }
          }
        : null;
    }
    return operation;
  };

  const attachWorkspaceRefToConcept = (concept, type, refId) => {
    if (!concept || !type || !refId) return false;
    let changed = false;
    if (type === 'highlight') {
      const { next, changed: didChange } = addObjectIdToSet(concept.pinnedHighlightIds, refId);
      if (didChange) {
        concept.pinnedHighlightIds = next;
        concept.markModified('pinnedHighlightIds');
        changed = true;
      }
    } else if (type === 'article') {
      const { next, changed: didChange } = addObjectIdToSet(concept.pinnedArticleIds, refId);
      if (didChange) {
        concept.pinnedArticleIds = next;
        concept.markModified('pinnedArticleIds');
        changed = true;
      }
    } else if (type === 'note') {
      const { next, changed: didChange } = addObjectIdToSet(concept.pinnedNoteIds, refId);
      if (didChange) {
        concept.pinnedNoteIds = next;
        concept.markModified('pinnedNoteIds');
        changed = true;
      }
    }
    return changed;
  };

  router.get('/api/concepts/:conceptId/workspace', authenticateToken, async (req, res) => {
    try {
      const conceptId = String(req.params.conceptId || '').trim();
      console.log(`[WORKSPACE] GET concept=${conceptId} user=${req.user.id}`);
      const loaded = await loadAuthorizedWorkspaceConcept(req.user.id, conceptId);
      if (!loaded) return res.status(404).json({ error: 'Concept not found.' });
      res.status(200).json({
        conceptId: String(loaded.concept._id),
        conceptName: loaded.concept.name,
        workspace: loaded.workspace
      });
    } catch (error) {
      console.error('❌ Error loading concept workspace:', error);
      res.status(500).json({ error: 'Failed to load concept workspace.' });
    }
  });

  router.put('/api/concepts/:conceptId/workspace', authenticateToken, async (req, res) => {
    try {
      const conceptId = String(req.params.conceptId || '').trim();
      console.log(`[WORKSPACE] PUT concept=${conceptId} user=${req.user.id}`);
      const concept = await resolveConceptByParam(req.user.id, conceptId, { createIfMissing: false });
      if (!concept) return res.status(404).json({ error: 'Concept not found.' });

      const rawWorkspace = req.body?.workspace && typeof req.body.workspace === 'object'
        ? req.body.workspace
        : (req.body || {});
      if (rawWorkspace && typeof rawWorkspace !== 'object') {
        return res.status(400).json({ error: 'Workspace payload must be an object.' });
      }
      if (rawWorkspace.version !== undefined && Number(rawWorkspace.version) !== 1) {
        return res.status(400).json({ error: 'workspace.version must be 1.' });
      }
      try {
        validateWorkspacePayload(rawWorkspace);
      } catch (validationError) {
        return res.status(400).json({ error: validationError.message || 'Invalid workspace payload.' });
      }

      const rawItems = Array.isArray(rawWorkspace.attachedItems)
        ? rawWorkspace.attachedItems
        : (Array.isArray(rawWorkspace.items) ? rawWorkspace.items : []);
      const authorizedItems = await authorizeWorkspaceItems(req.user.id, rawItems);
      if (!authorizedItems) {
        return res.status(404).json({ error: 'Workspace contains a source item not found for this user.' });
      }

      const workspace = ensureWorkspace({
        workspace: {
          ...rawWorkspace,
          ...(Array.isArray(rawWorkspace.attachedItems) ? { attachedItems: authorizedItems } : {}),
          ...(Array.isArray(rawWorkspace.items) ? { items: authorizedItems } : {})
        }
      });
      concept.workspace = workspace;
      concept.markModified('workspace');
      await concept.save();

      res.status(200).json({
        conceptId: String(concept._id),
        conceptName: concept.name,
        workspace
      });
    } catch (error) {
      console.error('❌ Error replacing concept workspace:', error);
      res.status(500).json({ error: 'Failed to save concept workspace.' });
    }
  });

  router.patch('/api/concepts/:conceptId/workspace', authenticateToken, async (req, res) => {
    try {
      const conceptId = String(req.params.conceptId || '').trim();
      const opName = String(req.body?.op || '').trim();
      console.log(`[WORKSPACE] PATCH concept=${conceptId} user=${req.user.id} op=${opName || 'unknown'}`);
      const loaded = await loadAuthorizedWorkspaceConcept(req.user.id, conceptId);
      if (!loaded) return res.status(404).json({ error: 'Concept not found.' });

      if (opName === 'deleteItem' || opName === 'deleteItems') {
        const execution = await executeWorkspaceActionsWithPolicy({
          userId: String(req.user.id),
          conceptId: String(loaded.concept._id),
          conceptName: loaded.concept.name || '',
          operations: [{
            op: opName,
            payload: req.body?.payload && typeof req.body.payload === 'object' ? req.body.payload : {}
          }],
          flow: normalizeAgentActionFlow(req.body?.flow, 'direct'),
          explicitUserCommand: Boolean(req.body?.explicitUserCommand),
          actorType: normalizeAgentActorType(req.body?.actorType, 'user'),
          actorId: String(req.body?.actorId || '').trim()
        });

        if (execution.status === 'approval_required') {
          return res.status(202).json({
            conceptId: String(loaded.concept._id),
            conceptName: loaded.concept.name,
            workspace: loaded.workspace,
            agentAction: execution
          });
        }

        const refreshed = await loadAuthorizedWorkspaceConcept(req.user.id, String(loaded.concept._id));
        if (!refreshed) {
          return res.status(404).json({ error: 'Concept not found after applying workspace patch.' });
        }
        return res.status(200).json({
          conceptId: String(refreshed.concept._id),
          conceptName: refreshed.concept.name,
          workspace: refreshed.workspace,
          agentAction: execution
        });
      }

      let workspace;
      try {
        const authorizedPatch = await authorizeWorkspacePatch(req.user.id, loaded.workspace, req.body || {});
        if (!authorizedPatch) {
          return res.status(404).json({ error: 'Source item not found for this user.' });
        }
        workspace = applyPatchOp(loaded.workspace, authorizedPatch);
      } catch (validationError) {
        return res.status(400).json({ error: validationError.message || 'Invalid workspace patch operation.' });
      }
      const concept = loaded.concept;
      concept.workspace = workspace;
      concept.markModified('workspace');
      await concept.save();

      res.status(200).json({
        conceptId: String(concept._id),
        conceptName: concept.name,
        workspace
      });
    } catch (error) {
      console.error('❌ Error patching concept workspace:', error);
      res.status(500).json({ error: 'Failed to patch concept workspace.' });
    }
  });

  router.post('/api/concepts/:conceptId/workspace/sections', authenticateToken, async (req, res) => {
    try {
      const conceptId = String(req.params.conceptId || '').trim();
      console.log(`[WORKSPACE] POST section concept=${conceptId} user=${req.user.id}`);
      const loaded = await loadAuthorizedWorkspaceConcept(req.user.id, conceptId);
      if (!loaded) return res.status(404).json({ error: 'Concept not found.' });

      const title = String(req.body?.title || '').trim();
      const description = String(req.body?.description || '').trim();
      if (!title) return res.status(400).json({ error: 'title is required.' });

      const previousIds = new Set((loaded.workspace.items || []).map(item => item.id));
      const groupIds = new Set((loaded.workspace.groups || []).map(group => group.id));
      const workspace = applyPatchOp(loaded.workspace, {
        op: 'addGroup',
        payload: { title, description }
      });
      loaded.concept.workspace = workspace;
      loaded.concept.markModified('workspace');
      await loaded.concept.save();

      const section = (workspace.groups || []).find(group => !groupIds.has(group.id))
        || (workspace.groups || [])[workspace.groups.length - 1]
        || null;

      res.status(201).json({
        conceptId: String(loaded.concept._id),
        conceptName: loaded.concept.name,
        section,
        workspace,
        changedBlockCount: (workspace.items || []).filter(item => !previousIds.has(item.id)).length
      });
    } catch (error) {
      console.error('❌ Error creating concept workspace section:', error);
      res.status(500).json({ error: 'Failed to create workspace section.' });
    }
  });

  router.patch('/api/concepts/:conceptId/workspace/sections/:sectionId', authenticateToken, async (req, res) => {
    try {
      const conceptId = String(req.params.conceptId || '').trim();
      const sectionId = String(req.params.sectionId || '').trim();
      console.log(`[WORKSPACE] PATCH section concept=${conceptId} section=${sectionId} user=${req.user.id}`);
      if (!sectionId) return res.status(400).json({ error: 'sectionId is required.' });

      const loaded = await loadAuthorizedWorkspaceConcept(req.user.id, conceptId);
      if (!loaded) return res.status(404).json({ error: 'Concept not found.' });

      let workspace = loaded.workspace;
      const patch = {};
      if (req.body?.title !== undefined) patch.title = req.body.title;
      if (req.body?.description !== undefined) patch.description = req.body.description;
      if (req.body?.collapsed !== undefined) patch.collapsed = req.body.collapsed;
      const hasPatch = Object.keys(patch).length > 0;
      const hasOrder = req.body?.order !== undefined;
      if (!hasPatch && !hasOrder) {
        return res.status(400).json({ error: 'No section updates provided.' });
      }

      if (hasOrder) {
        workspace = applyPatchOp(workspace, {
          op: 'moveGroup',
          payload: { id: sectionId, order: req.body.order }
        });
      }
      if (hasPatch) {
        workspace = applyPatchOp(workspace, {
          op: 'updateGroup',
          payload: {
            id: sectionId,
            patch
          }
        });
      }

      loaded.concept.workspace = workspace;
      loaded.concept.markModified('workspace');
      await loaded.concept.save();

      const section = (workspace.groups || []).find(group => group.id === sectionId) || null;
      res.status(200).json({
        conceptId: String(loaded.concept._id),
        conceptName: loaded.concept.name,
        section,
        workspace
      });
    } catch (error) {
      console.error('❌ Error updating concept workspace section:', error);
      res.status(500).json({ error: 'Failed to update workspace section.' });
    }
  });

  router.post(['/api/concepts/:conceptId/workspace/blocks/attach', '/api/concepts/:conceptId/workspace/blocks'], authenticateToken, async (req, res) => {
    try {
      const conceptId = String(req.params.conceptId || '').trim();
      console.log(`[WORKSPACE] POST block attach concept=${conceptId} user=${req.user.id}`);
      const loaded = await loadAuthorizedWorkspaceConcept(req.user.id, conceptId);
      if (!loaded) return res.status(404).json({ error: 'Concept not found.' });

      const source = await resolveWorkspaceAttachSource(req.user.id, req.body?.type, req.body?.refId);
      if (!source) {
        return res.status(404).json({ error: 'Source item not found for this user.' });
      }

      const requestedSectionId = String(req.body?.sectionId || req.body?.groupId || '').trim();
      const groupIds = new Set((loaded.workspace.groups || []).map(group => group.id));
      const groupId = groupIds.has(requestedSectionId)
        ? requestedSectionId
        : (loaded.workspace.groups?.[0]?.id || '');
      if (!groupId) {
        return res.status(400).json({ error: 'No workspace section available.' });
      }

      const stage = String(req.body?.stage || 'inbox').trim().toLowerCase();
      const parentId = req.body?.parentId !== undefined ? String(req.body.parentId || '').trim() : undefined;
      const order = req.body?.order;
      const existingIds = new Set((loaded.workspace.items || []).map(item => item.id));
      const existingBlock = (loaded.workspace.items || []).find(item =>
        item.type === source.type
        && String(item.refId) === String(source.refId)
        && item.groupId === groupId
      );
      if (existingBlock) {
        return res.status(200).json({
          conceptId: String(loaded.concept._id),
          conceptName: loaded.concept.name,
          block: existingBlock,
          workspace: loaded.workspace,
          reused: true
        });
      }
      const workspace = applyPatchOp(loaded.workspace, {
        op: 'addItem',
        payload: {
          type: source.type,
          refId: source.refId,
          groupId,
          stage,
          inlineTitle: source.inlineTitle,
          inlineText: source.inlineText,
          ...(parentId !== undefined ? { parentId } : {}),
          ...(order !== undefined ? { order } : {})
        }
      });

      attachWorkspaceRefToConcept(loaded.concept, source.type, source.refId);
      loaded.concept.workspace = workspace;
      loaded.concept.markModified('workspace');
      await loaded.concept.save();
      await markTourSignal(req.user.id, 'workspaceOrganized', 'workspace_organized');

      const block = (workspace.items || []).find(item => !existingIds.has(item.id))
        || (workspace.items || []).find(item =>
          item.type === source.type
          && String(item.refId) === String(source.refId)
          && item.groupId === groupId
        )
        || null;

      res.status(201).json({
        conceptId: String(loaded.concept._id),
        conceptName: loaded.concept.name,
        block,
        workspace
      });
    } catch (error) {
      console.error('❌ Error attaching workspace block:', error);
      res.status(500).json({ error: 'Failed to attach block to workspace.' });
    }
  });

  router.patch('/api/concepts/:conceptId/workspace/blocks/:blockId', authenticateToken, async (req, res) => {
    try {
      const conceptId = String(req.params.conceptId || '').trim();
      const blockId = String(req.params.blockId || '').trim();
      console.log(`[WORKSPACE] PATCH block concept=${conceptId} block=${blockId} user=${req.user.id}`);
      if (!blockId) return res.status(400).json({ error: 'blockId is required.' });

      const loaded = await loadAuthorizedWorkspaceConcept(req.user.id, conceptId);
      if (!loaded) return res.status(404).json({ error: 'Concept not found.' });

      let workspace = loaded.workspace;
      const hasMove = (
        req.body?.sectionId !== undefined
        || req.body?.groupId !== undefined
        || req.body?.parentId !== undefined
        || req.body?.order !== undefined
      );
      const hasUpdate = (
        req.body?.stage !== undefined
        || req.body?.status !== undefined
        || req.body?.type !== undefined
        || req.body?.refId !== undefined
      );

      if (!hasMove && !hasUpdate) {
        return res.status(400).json({ error: 'No block updates provided.' });
      }

      if (hasMove) {
        const targetGroupId = req.body?.sectionId !== undefined
          ? req.body.sectionId
          : req.body?.groupId;
        workspace = applyPatchOp(workspace, {
          op: 'moveItem',
          payload: {
            itemId: blockId,
            ...(targetGroupId !== undefined ? { groupId: targetGroupId } : {}),
            ...(req.body?.parentId !== undefined ? { parentId: req.body.parentId } : {}),
            ...(req.body?.order !== undefined ? { order: req.body.order } : {})
          }
        });
      }

      if (hasUpdate) {
        const currentBlock = (workspace.items || []).find(item => item.id === blockId);
        if (!currentBlock) return res.status(404).json({ error: 'Block not found.' });
        if (req.body?.type !== undefined || req.body?.refId !== undefined) {
          const source = await resolveWorkspaceAttachSource(
            req.user.id,
            req.body?.type !== undefined ? req.body.type : currentBlock.type,
            req.body?.refId !== undefined ? req.body.refId : currentBlock.refId
          );
          if (!source) {
            return res.status(404).json({ error: 'Source item not found for this user.' });
          }
          req.body.type = source.type;
          req.body.refId = source.refId;
          req.body.inlineTitle = source.inlineTitle;
          req.body.inlineText = source.inlineText;
        }
        workspace = applyPatchOp(workspace, {
          op: 'updateItem',
          payload: {
            itemId: blockId,
            patch: {
              ...(req.body?.stage !== undefined ? { stage: req.body.stage } : {}),
              ...(req.body?.status !== undefined ? { status: req.body.status } : {}),
              ...(req.body?.type !== undefined ? { type: req.body.type } : {}),
              ...(req.body?.refId !== undefined ? { refId: req.body.refId } : {}),
              ...(req.body?.inlineTitle !== undefined ? { inlineTitle: req.body.inlineTitle } : {}),
              ...(req.body?.inlineText !== undefined ? { inlineText: req.body.inlineText } : {})
            }
          }
        });
      }

      loaded.concept.workspace = workspace;
      loaded.concept.markModified('workspace');
      await loaded.concept.save();

      const block = (workspace.items || []).find(item => item.id === blockId) || null;
      if (!block) return res.status(404).json({ error: 'Block not found.' });
      res.status(200).json({
        conceptId: String(loaded.concept._id),
        conceptName: loaded.concept.name,
        block,
        workspace
      });
    } catch (error) {
      console.error('❌ Error updating workspace block:', error);
      res.status(500).json({ error: 'Failed to update workspace block.' });
    }
  });

  return router;
};

module.exports = {
  buildConceptWorkspaceRouter
};
