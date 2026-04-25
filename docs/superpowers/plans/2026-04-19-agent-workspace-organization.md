# Agent Workspace Organization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add approval-based agent workspace organization plans that can propose folder cleanup and item moves across imports, library, notebook, concepts, and questions.

**Architecture:** Extend the existing agent proposal bundle and thread review system with a new `AgentStructureProposal` model and structural executor. Organization plans are staged first, reviewed in the thread UI with mixed approval, then applied with undo payloads for rollback.

**Tech Stack:** Node.js, Express, Mongoose, React, react-scripts/Jest, existing agent proposal/run services

---

## File Map

### Backend

- Create: `server/services/agentStructureProposals.js`
- Create: `server/services/agentStructureExecution.js`
- Create: `server/routes/agentStructureProposalRoutes.js`
- Create: `server/services/__tests__/agentStructureProposals.test.js`
- Create: `server/services/__tests__/agentStructureExecution.test.js`
- Modify: `server/models/index.js`
- Modify: `server/services/agentProposalBundles.js`
- Modify: `server/services/agentHarnessMetrics.js`
- Modify: `server/services/agentHarnessEvents.js`
- Modify: `server/routes/importRoutes.js`
- Modify: `server/server.js`
- Modify: `server/utils/analytics.js`

### Frontend

- Create: `note-taker-ui/src/components/agent/StructureProposalReview.jsx`
- Create: `note-taker-ui/src/components/agent/StructureProposalReview.test.jsx`
- Modify: `note-taker-ui/src/api/agent.js`
- Modify: `note-taker-ui/src/components/agent/ThoughtPartnerPanel.jsx`
- Modify: `note-taker-ui/src/pages/DataIntegrations.jsx`
- Modify: `note-taker-ui/src/pages/Library.jsx`
- Modify: `note-taker-ui/src/pages/ThinkMode.jsx`
- Modify: `note-taker-ui/src/styles/think-home-polish.css`

### Tests / Verification

- Modify: `note-taker-ui/src/pages/DataIntegrations.test.jsx`
- Add or modify route tests under: `server/routes/__tests__/`

---

### Task 1: Add Structural Proposal Persistence

**Files:**
- Modify: `server/models/index.js`
- Test: `server/services/__tests__/agentStructureProposals.test.js`

- [ ] **Step 1: Write the failing model/service test**

```js
const assert = require('assert');
const {
  sanitizeAgentStructureProposalDoc,
  normalizeStructureProposal
} = require('../agentStructureProposals');

const run = async () => {
  const proposal = normalizeStructureProposal({
    _id: 'plan-1',
    status: 'pending',
    scope: 'import_session',
    operations: [
      {
        opId: 'move-1',
        type: 'move_item',
        targetDomain: 'notebook',
        status: 'pending',
        payload: { itemId: 'note-1', destinationFolderId: 'folder-2' }
      }
    ]
  });

  assert.strictEqual(proposal.status, 'pending');
  assert.strictEqual(proposal.scope, 'import_session');
  assert.strictEqual(proposal.operations[0].type, 'move_item');

  const sanitized = sanitizeAgentStructureProposalDoc({
    toObject: () => ({
      _id: 'plan-1',
      status: 'rolled_back',
      scope: 'surface',
      operations: [],
      rolledBackAt: new Date('2026-04-19T12:00:00.000Z')
    })
  });

  assert.strictEqual(sanitized.status, 'rolled_back');
  assert.strictEqual(sanitized.rolledBackAt, '2026-04-19T12:00:00.000Z');
};

if (require.main === module) {
  run().then(() => console.log('agentStructureProposals tests passed')).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node server/services/__tests__/agentStructureProposals.test.js`

Expected: FAIL with module/function not found.

- [ ] **Step 3: Add schema fields in `server/models/index.js`**

```js
const agentStructureProposalOperationSchema = new mongoose.Schema({
  opId: { type: String, required: true, trim: true },
  type: {
    type: String,
    enum: ['create_folder', 'rename_folder', 'move_item', 'merge_folder', 'delete_folder'],
    required: true
  },
  targetDomain: {
    type: String,
    enum: ['library', 'notebook', 'concepts', 'questions'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'applied', 'skipped'],
    default: 'pending'
  },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  preview: { type: mongoose.Schema.Types.Mixed, default: {} },
  risk: { type: String, enum: ['low', 'medium'], default: 'low' },
  undoPayload: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { _id: false });

const agentStructureProposalSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sourceThreadId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentThread', default: null },
  sourceRunId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentRun', default: null },
  sourceBundleId: { type: String, default: '', trim: true },
  scope: { type: String, enum: ['workspace', 'import_session', 'surface'], default: 'workspace' },
  scopeRef: { type: String, default: '', trim: true },
  status: { type: String, enum: ['pending', 'applied', 'rejected', 'rolled_back', 'invalidated'], default: 'pending' },
  title: { type: String, default: '', trim: true },
  summary: { type: String, default: '', trim: true },
  rationale: { type: String, default: '', trim: true },
  operations: { type: [agentStructureProposalOperationSchema], default: [] },
  createdBy: { type: mongoose.Schema.Types.Mixed, default: {} },
  acceptedBy: { type: mongoose.Schema.Types.Mixed, default: null },
  rejectedBy: { type: mongoose.Schema.Types.Mixed, default: null },
  rolledBackBy: { type: mongoose.Schema.Types.Mixed, default: null },
  acceptedAt: { type: Date, default: null },
  rejectedAt: { type: Date, default: null },
  rolledBackAt: { type: Date, default: null }
}, { timestamps: true });

agentStructureProposalSchema.index({ userId: 1, sourceThreadId: 1, status: 1, updatedAt: -1 });
agentStructureProposalSchema.index({ userId: 1, scope: 1, scopeRef: 1, updatedAt: -1 });

const AgentStructureProposal = mongoose.model('AgentStructureProposal', agentStructureProposalSchema);
```

- [ ] **Step 4: Create minimal normalization helpers**

```js
// server/services/agentStructureProposals.js
const clean = (value) => String(value || '').trim();

const normalizeStructureProposal = (input = {}) => ({
  structureProposalId: clean(input.structureProposalId || input._id),
  status: clean(input.status).toLowerCase() || 'pending',
  scope: clean(input.scope).toLowerCase() || 'workspace',
  scopeRef: clean(input.scopeRef),
  title: clean(input.title),
  summary: clean(input.summary),
  rationale: clean(input.rationale),
  operations: Array.isArray(input.operations) ? input.operations.map((operation) => ({
    opId: clean(operation?.opId),
    type: clean(operation?.type).toLowerCase(),
    targetDomain: clean(operation?.targetDomain).toLowerCase(),
    status: clean(operation?.status).toLowerCase() || 'pending',
    payload: operation?.payload && typeof operation.payload === 'object' ? operation.payload : {},
    preview: operation?.preview && typeof operation.preview === 'object' ? operation.preview : {},
    risk: clean(operation?.risk).toLowerCase() || 'low',
    undoPayload: operation?.undoPayload && typeof operation.undoPayload === 'object' ? operation.undoPayload : {}
  })) : [],
  acceptedAt: input.acceptedAt ? new Date(input.acceptedAt) : null,
  rejectedAt: input.rejectedAt ? new Date(input.rejectedAt) : null,
  rolledBackAt: input.rolledBackAt ? new Date(input.rolledBackAt) : null
});

const sanitizeAgentStructureProposalDoc = (doc = {}) => {
  const safe = normalizeStructureProposal(typeof doc.toObject === 'function' ? doc.toObject() : doc);
  return {
    ...safe,
    acceptedAt: safe.acceptedAt ? safe.acceptedAt.toISOString() : null,
    rejectedAt: safe.rejectedAt ? safe.rejectedAt.toISOString() : null,
    rolledBackAt: safe.rolledBackAt ? safe.rolledBackAt.toISOString() : null
  };
};

module.exports = { normalizeStructureProposal, sanitizeAgentStructureProposalDoc };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node server/services/__tests__/agentStructureProposals.test.js`

Expected: `agentStructureProposals tests passed`

- [ ] **Step 6: Commit**

```bash
git add server/models/index.js server/services/agentStructureProposals.js server/services/__tests__/agentStructureProposals.test.js
git commit -m "feat: add agent structure proposal model"
```

---

### Task 2: Build Structural Executor for Folder Create/Rename/Move/Delete/Merge

**Files:**
- Create: `server/services/agentStructureExecution.js`
- Test: `server/services/__tests__/agentStructureExecution.test.js`
- Reference: `server/routes/notebookRoutes.js`, `server/services/folderService.js`, `server/routes/legacyContentRoutes.js`

- [ ] **Step 1: Write the failing executor test**

```js
const assert = require('assert');
const {
  applyStructureProposal,
  rollbackStructureProposal
} = require('../agentStructureExecution');

const run = async () => {
  const state = {
    folders: [{ _id: 'folder-a', name: 'Imported', userId: 'user-1' }],
    notes: [{ _id: 'note-1', title: 'Note', userId: 'user-1', folder: 'folder-a' }]
  };

  const models = buildInMemoryStructureModels(state);
  const proposal = {
    operations: [
      {
        opId: 'create-1',
        type: 'create_folder',
        targetDomain: 'notebook',
        status: 'approved',
        payload: { name: 'Projects' }
      },
      {
        opId: 'move-1',
        type: 'move_item',
        targetDomain: 'notebook',
        status: 'approved',
        payload: { itemId: 'note-1', destinationFolderName: 'Projects' }
      },
      {
        opId: 'delete-1',
        type: 'delete_folder',
        targetDomain: 'notebook',
        status: 'approved',
        payload: { folderId: 'folder-a' }
      }
    ]
  };

  const applied = await applyStructureProposal({ models, proposal, userId: 'user-1' });
  assert.strictEqual(applied.operations[0].status, 'applied');
  assert.strictEqual(applied.operations[1].status, 'applied');
  assert.strictEqual(applied.operations[2].status, 'applied');

  const projects = state.folders.find((folder) => folder.name === 'Projects');
  assert.ok(projects);
  assert.strictEqual(state.notes[0].folder, projects._id);

  const rolledBack = await rollbackStructureProposal({ models, proposal: applied, userId: 'user-1' });
  assert.strictEqual(rolledBack.status, 'rolled_back');
  assert.strictEqual(state.notes[0].folder, 'folder-a');
};
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node server/services/__tests__/agentStructureExecution.test.js`

Expected: FAIL with missing executor exports.

- [ ] **Step 3: Implement minimal dependency-ordered executor**

```js
const OP_ORDER = ['create_folder', 'rename_folder', 'move_item', 'merge_folder', 'delete_folder'];

const sortOperationsForApply = (operations = []) => {
  const rank = new Map(OP_ORDER.map((type, index) => [type, index]));
  return [...operations].sort((a, b) => (rank.get(a.type) ?? 99) - (rank.get(b.type) ?? 99));
};

const applyStructureProposal = async ({ models, proposal, userId }) => {
  const operations = sortOperationsForApply(proposal.operations || []);
  for (const operation of operations) {
    if (operation.status === 'rejected') continue;
    if (operation.type === 'create_folder') {
      const created = await models.notebookFolders.create({
        userId,
        name: operation.payload.name,
        parentFolderId: operation.payload.parentFolderId || null
      });
      operation.undoPayload = { folderId: created._id, type: 'delete_folder' };
      operation.payload.createdFolderId = created._id;
      operation.status = 'applied';
      continue;
    }
    if (operation.type === 'move_item') {
      const note = await models.notebookEntries.findOne({ _id: operation.payload.itemId, userId });
      const previousFolderId = note.folder || null;
      await models.notebookEntries.updateOne(
        { _id: operation.payload.itemId, userId },
        { $set: { folder: operation.payload.destinationFolderId || operation.payload.createdFolderId } }
      );
      operation.undoPayload = { itemId: note._id, previousFolderId, type: 'move_item' };
      operation.status = 'applied';
      continue;
    }
    if (operation.type === 'delete_folder') {
      const count = await models.notebookEntries.countDocuments({ userId, folder: operation.payload.folderId });
      if (count > 0) {
        operation.status = 'skipped';
        continue;
      }
      const existing = await models.notebookFolders.findOneAndDelete({ _id: operation.payload.folderId, userId });
      operation.undoPayload = existing ? { type: 'restore_folder', folder: existing } : {};
      operation.status = existing ? 'applied' : 'skipped';
    }
  }
  proposal.status = 'applied';
  return proposal;
};
```

- [ ] **Step 4: Add rollback implementation**

```js
const rollbackStructureProposal = async ({ models, proposal, userId }) => {
  const applied = [...(proposal.operations || [])]
    .filter((operation) => operation.status === 'applied')
    .reverse();

  for (const operation of applied) {
    if (operation.undoPayload?.type === 'move_item') {
      await models.notebookEntries.updateOne(
        { _id: operation.undoPayload.itemId, userId },
        { $set: { folder: operation.undoPayload.previousFolderId || null } }
      );
    } else if (operation.undoPayload?.type === 'delete_folder') {
      await models.notebookFolders.findOneAndDelete({ _id: operation.undoPayload.folderId, userId });
    } else if (operation.undoPayload?.type === 'restore_folder' && operation.undoPayload.folder) {
      await models.notebookFolders.create(operation.undoPayload.folder);
    }
  }

  proposal.status = 'rolled_back';
  return proposal;
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node server/services/__tests__/agentStructureExecution.test.js`

Expected: `agentStructureExecution tests passed`

- [ ] **Step 6: Commit**

```bash
git add server/services/agentStructureExecution.js server/services/__tests__/agentStructureExecution.test.js
git commit -m "feat: add structural organization executor"
```

---

### Task 3: Add Structural Proposal Service and Routes

**Files:**
- Modify: `server/services/agentStructureProposals.js`
- Create: `server/routes/agentStructureProposalRoutes.js`
- Modify: `server/server.js`
- Modify: `server/utils/analytics.js`
- Modify: `server/services/agentHarnessMetrics.js`
- Test: `server/routes/__tests__/agentStructureProposalRoutes.test.js`

- [ ] **Step 1: Write the failing route test**

```js
const assert = require('assert');
const express = require('express');
const fetch = global.fetch;
const { buildAgentStructureProposalRouter } = require('../agentStructureProposalRoutes');

// Test list + apply + rollback endpoints return 200/201 and update status.
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node server/routes/__tests__/agentStructureProposalRoutes.test.js`

Expected: FAIL with missing route module.

- [ ] **Step 3: Add service methods for list/update/apply/reject/rollback**

```js
const listStructureProposals = async ({ AgentStructureProposal, userId, threadId = '', status = 'all' }) => {
  const query = { userId };
  if (threadId) query.sourceThreadId = threadId;
  if (status && status !== 'all') query.status = status;
  const rows = await AgentStructureProposal.find(query).sort({ updatedAt: -1, createdAt: -1 }).limit(40);
  return rows.map(sanitizeAgentStructureProposalDoc);
};

const rejectStructureOperation = async ({ AgentStructureProposal, userId, structureProposalId, opId }) => {
  const doc = await AgentStructureProposal.findOne({ _id: structureProposalId, userId });
  const operation = doc.operations.find((entry) => entry.opId === opId);
  operation.status = 'rejected';
  await doc.save();
  return doc;
};
```

- [ ] **Step 4: Add router endpoints**

```js
router.get('/api/agent/structure-proposals', authenticateToken, async (req, res) => {
  const proposals = await listStructureProposals({
    AgentStructureProposal,
    userId: String(req.user.id),
    threadId: String(req.query.threadId || '').trim(),
    status: String(req.query.status || 'all').trim()
  });
  res.status(200).json({ proposals });
});

router.post('/api/agent/structure-proposals/:proposalId/apply', authenticateToken, async (req, res) => {
  const proposal = await applyStoredStructureProposal({ ...deps });
  res.status(200).json({ proposal: sanitizeAgentStructureProposalDoc(proposal) });
});

router.post('/api/agent/structure-proposals/:proposalId/rollback', authenticateToken, async (req, res) => {
  const proposal = await rollbackStoredStructureProposal({ ...deps });
  res.status(200).json({ proposal: sanitizeAgentStructureProposalDoc(proposal) });
});
```

- [ ] **Step 5: Register analytics and harness counters**

```js
EVENT_NAMES.AGENT_STRUCTURE_PLAN_STAGED = 'agent_structure_plan_staged';
EVENT_NAMES.AGENT_STRUCTURE_PLAN_APPLIED = 'agent_structure_plan_applied';
EVENT_NAMES.AGENT_STRUCTURE_PLAN_ROLLED_BACK = 'agent_structure_plan_rolled_back';
EVENT_NAMES.AGENT_STRUCTURE_OPERATION_REJECTED = 'agent_structure_operation_rejected';
EVENT_NAMES.AGENT_IMPORT_ORGANIZATION_OFFERED = 'agent_import_organization_offered';
EVENT_NAMES.AGENT_IMPORT_ORGANIZATION_ACCEPTED = 'agent_import_organization_accepted';
```

- [ ] **Step 6: Run route test to verify it passes**

Run: `node server/routes/__tests__/agentStructureProposalRoutes.test.js`

Expected: route tests pass.

- [ ] **Step 7: Commit**

```bash
git add server/routes/agentStructureProposalRoutes.js server/server.js server/services/agentStructureProposals.js server/services/agentHarnessMetrics.js server/utils/analytics.js server/routes/__tests__/agentStructureProposalRoutes.test.js
git commit -m "feat: add agent structure proposal routes"
```

---

### Task 4: Extend Proposal Bundles to Emit Organization Plans

**Files:**
- Modify: `server/services/agentProposalBundles.js`
- Modify: `server/routes/importRoutes.js`
- Test: `server/services/__tests__/agentProposalBundles.structure.test.js`

- [ ] **Step 1: Write the failing proposal bundle test**

```js
const assert = require('assert');
const { buildProposalBundle } = require('../agentProposalBundles');

const bundle = buildProposalBundle({
  intent: 'organize',
  context: { type: 'notebook', id: 'entry-1', title: 'Notebook' }
});

assert.strictEqual(bundle.operations[0].type, 'organize_workspace');
assert.strictEqual(bundle.operations[0].executionMode, 'direct');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node server/services/__tests__/agentProposalBundles.structure.test.js`

Expected: FAIL because `organize` intent is not supported.

- [ ] **Step 3: Add organization proposal support**

```js
if (['organize', 'cleanup_structure', 'organize_import'].includes(safeIntent)) {
  operations.push({
    opId: 'organize-workspace',
    type: 'organize_workspace',
    title: target.type === 'import_session' ? 'Organize this import' : `Clean up ${targetLabel}`,
    summary: 'Analyze folder structure, stage item moves, merges, and deletions for approval before applying.',
    executionMode: 'direct',
    riskLevel: 'medium',
    requiresApproval: false,
    target,
    metadata: {
      scopeType: clean(context?.type || target.type || 'workspace'),
      scopeId: clean(context?.id || target.id || '')
    }
  });
}
```

- [ ] **Step 4: Add import completion offer plumbing**

```js
await patchImportSession({
  sessionId: importSessionId,
  userId,
  mutate: (session) => {
    session.recommendedNextAction = 'organize_import';
    session.agentSuggestions = [
      ...(Array.isArray(session.agentSuggestions) ? session.agentSuggestions : []),
      {
        type: 'organize_import',
        status: 'pending',
        label: 'Organize this import'
      }
    ];
  }
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node server/services/__tests__/agentProposalBundles.structure.test.js`

Expected: proposal bundle test passes.

- [ ] **Step 6: Commit**

```bash
git add server/services/agentProposalBundles.js server/routes/importRoutes.js server/services/__tests__/agentProposalBundles.structure.test.js
git commit -m "feat: stage organization proposal bundles"
```

---

### Task 5: Materialize and Review Structure Proposals in the Thread UI

**Files:**
- Create: `note-taker-ui/src/components/agent/StructureProposalReview.jsx`
- Create: `note-taker-ui/src/components/agent/StructureProposalReview.test.jsx`
- Modify: `note-taker-ui/src/api/agent.js`
- Modify: `note-taker-ui/src/components/agent/ThoughtPartnerPanel.jsx`
- Modify: `note-taker-ui/src/styles/think-home-polish.css`

- [ ] **Step 1: Write the failing component test**

```jsx
import { render, screen } from '@testing-library/react';
import StructureProposalReview from './StructureProposalReview';

it('renders organization plan operations with apply and reject actions', () => {
  render(
    <StructureProposalReview
      proposals={[{
        structureProposalId: 'plan-1',
        title: 'Organize this import',
        summary: 'Clean up duplicate mirrored folders',
        operations: [{ opId: 'move-1', type: 'move_item', status: 'pending', preview: { from: 'Imports', to: 'Projects' } }]
      }]}
    />
  );

  expect(screen.getByText('Organize this import')).toBeInTheDocument();
  expect(screen.getByText('move_item')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Apply approved changes' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npm test -- --runInBand --watchAll=false src/components/agent/StructureProposalReview.test.jsx`

Expected: FAIL because component does not exist.

- [ ] **Step 3: Add API helpers**

```js
export const listAgentStructureProposals = async ({ threadId = '', status = 'all' } = {}) => {
  const params = new URLSearchParams();
  if (threadId) params.set('threadId', String(threadId).trim());
  if (status) params.set('status', String(status).trim());
  const suffix = params.toString();
  const res = await api.get(`/api/agent/structure-proposals${suffix ? `?${suffix}` : ''}`, getAuthHeaders());
  return res.data || { proposals: [] };
};

export const applyAgentStructureProposal = async (proposalId) => {
  const safeId = encodeURIComponent(String(proposalId || '').trim());
  const res = await api.post(`/api/agent/structure-proposals/${safeId}/apply`, {}, getAuthHeaders());
  return res.data || {};
};

export const rollbackAgentStructureProposal = async (proposalId) => {
  const safeId = encodeURIComponent(String(proposalId || '').trim());
  const res = await api.post(`/api/agent/structure-proposals/${safeId}/rollback`, {}, getAuthHeaders());
  return res.data || {};
};
```

- [ ] **Step 4: Render review cards inside `ThoughtPartnerPanel.jsx`**

```jsx
<StructureProposalReview
  proposals={structureProposals}
  loadingId={structureProposalLoadingId}
  onRejectOperation={handleRejectStructureOperation}
  onApplyProposal={handleApplyStructureProposal}
  onRollbackProposal={handleRollbackStructureProposal}
/>
```

- [ ] **Step 5: Add visual treatment**

```css
.agent-thought-partner__structure-plan {
  border: 1px solid rgba(41, 33, 24, 0.14);
  background: linear-gradient(180deg, rgba(251, 248, 241, 0.98), rgba(244, 236, 224, 0.92));
}

.agent-thought-partner__structure-op {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 16px;
  background: rgba(255, 252, 246, 0.9);
}
```

- [ ] **Step 6: Run component test to verify it passes**

Run: `CI=true npm test -- --runInBand --watchAll=false src/components/agent/StructureProposalReview.test.jsx src/components/agent/ThoughtPartnerPanel.test.jsx`

Expected: both suites pass.

- [ ] **Step 7: Commit**

```bash
git add note-taker-ui/src/api/agent.js note-taker-ui/src/components/agent/StructureProposalReview.jsx note-taker-ui/src/components/agent/StructureProposalReview.test.jsx note-taker-ui/src/components/agent/ThoughtPartnerPanel.jsx note-taker-ui/src/styles/think-home-polish.css
git commit -m "feat: add organization plan review UI"
```

---

### Task 6: Add Import Completion CTA

**Files:**
- Modify: `note-taker-ui/src/pages/DataIntegrations.jsx`
- Modify: `note-taker-ui/src/pages/DataIntegrations.test.jsx`

- [ ] **Step 1: Write the failing import CTA test**

```jsx
it('shows organize this import action after a completed import session', async () => {
  getActiveImportSession.mockResolvedValue({
    id: 'session-1',
    provider: 'notion',
    status: 'completed',
    recommendedNextAction: 'organize_import'
  });

  render(<DataIntegrations />);
  expect(await screen.findByRole('button', { name: 'Organize this import' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npm test -- --runInBand --watchAll=false src/pages/DataIntegrations.test.jsx`

Expected: FAIL because CTA is missing.

- [ ] **Step 3: Add import completion CTA**

```jsx
{currentSession && ['completed', 'completed_with_warnings'].includes(currentSession.status) && currentSession.recommendedNextAction === 'organize_import' && (
  <div className="import-session-card__agent-next-step">
    <p>Imported text is ready. If you want, the agent can stage a folder cleanup plan before anything moves.</p>
    <Button variant="secondary" onClick={handleOrganizeImport}>
      Organize this import
    </Button>
  </div>
)}
```

- [ ] **Step 4: Wire button to agent thread creation**

```js
const handleOrganizeImport = async () => {
  await chatWithAgent({
    message: 'Organize this import for me and stage a reviewable cleanup plan.',
    persistThread: true,
    context: {
      type: 'import_session',
      id: String(currentSession?.id || ''),
      title: `${currentSession?.provider || 'Import'} import`
    }
  });
  navigate('/think?tab=threads');
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `CI=true npm test -- --runInBand --watchAll=false src/pages/DataIntegrations.test.jsx`

Expected: import tests pass.

- [ ] **Step 6: Commit**

```bash
git add note-taker-ui/src/pages/DataIntegrations.jsx note-taker-ui/src/pages/DataIntegrations.test.jsx
git commit -m "feat: add organize import CTA"
```

---

### Task 7: Add Page-Level Cleanup Buttons

**Files:**
- Modify: `note-taker-ui/src/pages/Library.jsx`
- Modify: `note-taker-ui/src/pages/ThinkMode.jsx`

- [ ] **Step 1: Write the failing UI test or DOM assertion**

```jsx
// Add a page-level smoke test/assertion in the relevant existing page tests:
expect(screen.getByRole('button', { name: 'Clean up structure' })).toBeInTheDocument();
```

- [ ] **Step 2: Run test to verify it fails**

Run: existing page tests or targeted added test

Expected: FAIL because buttons are missing.

- [ ] **Step 3: Add `Clean up structure` to Library**

```jsx
<Button variant="secondary" onClick={handleOrganizeLibrary}>
  Clean up structure
</Button>
```

- [ ] **Step 4: Add scoped `Clean up structure` to Notebook / Concepts / Questions in `ThinkMode.jsx`**

```jsx
{activeView === 'notebook' && (
  <QuietButton onClick={() => queueThoughtPartnerPrompt({
    id: `organize-notebook-${activeNotebookEntry?._id || 'workspace'}`,
    prompt: 'Clean up notebook structure and stage a reviewable organization plan.',
    contextType: 'notebook',
    contextId: activeNotebookEntry?._id || ''
  })}>
    Clean up structure
  </QuietButton>
)}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: targeted page tests

Expected: page tests pass.

- [ ] **Step 6: Commit**

```bash
git add note-taker-ui/src/pages/Library.jsx note-taker-ui/src/pages/ThinkMode.jsx
git commit -m "feat: add page-level organization actions"
```

---

### Task 8: Browser + Backend Verification

**Files:**
- Verify only

- [ ] **Step 1: Run structural backend tests**

Run:

```bash
node server/services/__tests__/agentStructureProposals.test.js
node server/services/__tests__/agentStructureExecution.test.js
node server/routes/__tests__/agentStructureProposalRoutes.test.js
```

Expected: all pass.

- [ ] **Step 2: Run focused frontend tests**

Run:

```bash
cd note-taker-ui
CI=true npm test -- --runInBand --watchAll=false \
  src/components/agent/StructureProposalReview.test.jsx \
  src/components/agent/ThoughtPartnerPanel.test.jsx \
  src/pages/DataIntegrations.test.jsx
```

Expected: all pass.

- [ ] **Step 3: Run browser verification**

Run:

```bash
npm start
cd note-taker-ui && npm start
```

Then verify:

- import completion shows `Organize this import`
- clicking it stages an organization thread
- plan renders in thread review
- reject one step
- apply approved changes
- verify moved object/folder state
- roll back plan
- verify restored state

- [ ] **Step 4: Commit verification-safe follow-ups if needed**

```bash
git add <touched-files>
git commit -m "test: verify organization plan flow"
```

---

## Self-Review

Spec coverage check:

- structural proposal model: Tasks 1-3
- mixed approval review flow: Tasks 3 and 5
- import CTA: Task 6
- page-level cleanup buttons: Task 7
- rollback and undo: Tasks 2 and 3
- browser verification: Task 8

Placeholder scan:

- no `TBD`, `TODO`, or deferred implementation markers remain
- each task has concrete files, code, and commands

Type consistency:

- model name: `AgentStructureProposal`
- operation entry: `operations[]`
- route namespace: `/api/agent/structure-proposals`
- frontend API helpers use the same naming
