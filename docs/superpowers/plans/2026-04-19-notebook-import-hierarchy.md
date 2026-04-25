# Notebook Import Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn imported external knowledge into a user-owned notebook folder tree that mirrors the source hierarchy on first import, preserves manual note moves on re-sync, and keeps imported notebook material retrievable by the agent.

**Architecture:** Extend `NotebookFolder` into a real tree with import lineage, teach provider imports to upsert folder paths before creating or updating notes, and replace the Think notebook rail’s flat list with a collapsible folder tree plus move interactions. Re-sync continues to match notes by stable source identity, but folder placement becomes user-owned after the first manual move.

**Tech Stack:** Express, Mongoose, React, React Testing Library, existing notebook routes/import routes, existing embedding queue + semantic search pipeline.

---

### Task 1: Extend Notebook Folder/Data Models For Hierarchy And User-Owned Placement

**Files:**
- Modify: `server/models/index.js`
- Modify: `server/routes/notebookRoutes.js`
- Create: `server/routes/__tests__/notebookRoutes.folderTree.test.js`

- [ ] **Step 1: Write the failing route test for hierarchical notebook folders**

```js
const assert = require('assert');
const express = require('express');
const http = require('http');

const { buildNotebookRouter } = require('../notebookRoutes');

// inside run()
const response = await fetch(`${url}/api/notebook/folders`, {
  headers: { Authorization: 'Bearer test-token' }
});
const payload = await response.json();

assert.strictEqual(response.status, 200);
assert.deepStrictEqual(
  payload.map((folder) => ({
    id: folder._id,
    parentFolderId: folder.parentFolderId || null,
    sortOrder: folder.sortOrder || 0
  })),
  [
    { id: 'root-imports', parentFolderId: null, sortOrder: 0 },
    { id: 'child-projects', parentFolderId: 'root-imports', sortOrder: 0 }
  ]
);
```

- [ ] **Step 2: Run the route test to verify it fails**

Run: `node server/routes/__tests__/notebookRoutes.folderTree.test.js`

Expected: FAIL because `NotebookFolder` documents and `/api/notebook/folders` responses do not yet include `parentFolderId`, `sortOrder`, or import lineage.

- [ ] **Step 3: Add hierarchical folder + placement ownership fields in the models**

```js
const notebookFolderSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  parentFolderId: { type: mongoose.Schema.Types.ObjectId, ref: 'NotebookFolder', default: null },
  sortOrder: { type: Number, default: 0 },
  importMeta: { type: importMetaSchema, default: () => ({}) }
}, { timestamps: true });

notebookFolderSchema.index({ userId: 1, parentFolderId: 1, sortOrder: 1, name: 1 });

const importMetaSchema = new mongoose.Schema({
  provider: { type: String, default: '', trim: true },
  sourceType: { type: String, default: '', trim: true },
  sourceLabel: { type: String, default: '', trim: true },
  sourceUrl: { type: String, default: '', trim: true },
  draftTemplate: { type: String, default: '', trim: true },
  draftTemplateLabel: { type: String, default: '', trim: true },
  externalId: { type: String, default: '', trim: true },
  parentExternalId: { type: String, default: '', trim: true },
  sourcePath: { type: [String], default: [] },
  folderOwnership: { type: String, enum: ['source', 'user'], default: 'source' },
  importSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ImportSession', default: null },
  importedAt: { type: Date, default: null },
  searchableAt: { type: Date, default: null }
}, { _id: false });
```

- [ ] **Step 4: Expand notebook folder routes to return tree-safe data and accept hierarchy writes**

```js
router.get('/api/notebook/folders', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const folders = await NotebookFolder.find({ userId })
    .sort({ parentFolderId: 1, sortOrder: 1, name: 1 });
  res.status(200).json(folders);
});

router.post('/api/notebook/folders', authenticateToken, async (req, res) => {
  const folder = new NotebookFolder({
    name: String(req.body?.name || '').trim(),
    userId: req.user.id,
    parentFolderId: req.body?.parentFolderId || null,
    sortOrder: Number(req.body?.sortOrder || 0),
    importMeta: normalizeImportMeta(req.body?.importMeta)
  });
  await folder.save();
  res.status(201).json(folder);
});
```

- [ ] **Step 5: Re-run the folder route test**

Run: `node server/routes/__tests__/notebookRoutes.folderTree.test.js`

Expected: PASS with ordered hierarchical folder rows returned from the notebook folders route.

- [ ] **Step 6: Commit**

```bash
git add server/models/index.js server/routes/notebookRoutes.js server/routes/__tests__/notebookRoutes.folderTree.test.js
git commit -m "Add hierarchical notebook folder model"
```

### Task 2: Add A Shared Notebook Import Tree Service For Initial Placement

**Files:**
- Create: `server/services/notebookImportTreeService.js`
- Create: `server/services/__tests__/notebookImportTreeService.test.js`
- Modify: `server/routes/importRoutes.js`

- [ ] **Step 1: Write the failing service test for path upserts**

```js
const assert = require('assert');
const { upsertNotebookFolderPath } = require('../notebookImportTreeService');

const result = await upsertNotebookFolderPath({
  userId: 'user-1',
  provider: 'notion',
  sourceLabel: 'Product HQ',
  sourcePath: ['Product HQ', 'Projects', 'Roadmap'],
  NotebookFolder
});

assert.strictEqual(result.createdFolderIds.length, 3);
assert.strictEqual(result.folder.name, 'Roadmap');
assert.strictEqual(String(result.folder.parentFolderId), 'projects-folder-id');
```

- [ ] **Step 2: Run the service test to verify it fails**

Run: `node server/services/__tests__/notebookFolderTreeService.test.js`

Expected: FAIL because there is no notebook import tree service or path-aware folder upsert logic yet.

- [ ] **Step 3: Implement a folder-path upsert service that creates provider-rooted folder chains**

```js
const upsertNotebookFolderPath = async ({
  userId,
  provider,
  sourceLabel,
  sourcePath = [],
  NotebookFolder
}) => {
  let parentFolderId = null;
  const createdFolderIds = [];

  for (const [index, rawName] of sourcePath.entries()) {
    const name = String(rawName || '').trim();
    if (!name) continue;

    let folder = await NotebookFolder.findOne({
      userId,
      parentFolderId,
      'importMeta.provider': provider,
      'importMeta.externalId': `${provider}:${sourcePath.slice(0, index + 1).join('/')}`
    });

    if (!folder) {
      folder = await NotebookFolder.create({
        userId,
        name,
        parentFolderId,
        sortOrder: index,
        importMeta: {
          provider,
          sourceLabel,
          externalId: `${provider}:${sourcePath.slice(0, index + 1).join('/')}`,
          sourcePath: sourcePath.slice(0, index + 1),
          folderOwnership: 'source'
        }
      });
      createdFolderIds.push(String(folder._id));
    }

    parentFolderId = folder._id;
  }

  return {
    folder: parentFolderId ? await NotebookFolder.findById(parentFolderId) : null,
    createdFolderIds
  };
};
```

- [ ] **Step 4: Call the folder-path service from provider imports before creating notebook notes**

```js
const { folder: notebookFolder } = await upsertNotebookFolderPath({
  userId,
  provider: 'notion',
  sourceLabel,
  sourcePath: notionPathSegments,
  NotebookFolder
});

const entry = new NotebookEntry({
  title,
  content,
  blocks,
  folder: notebookFolder?._id || null,
  tags: ['notion-import'],
  importMeta: {
    provider: 'notion',
    sourceType: 'oauth',
    sourceLabel,
    externalId,
    parentExternalId,
    sourcePath: notionPathSegments,
    folderOwnership: 'source',
    importSessionId: importSessionId || null,
    importedAt: new Date()
  },
  userId
});
```

- [ ] **Step 5: Provider-specific source-path mapping**

```js
const notionPathSegments = [connection.accountLabel || 'Notion', ...resolvedNotionAncestorTitles, title];
const evernotePathSegments = [connectionLabel || 'Evernote', ...(note.stack ? [note.stack] : []), note.notebookName || 'Imported notes'];
const readwisePathSegments = [connection.accountLabel || 'Readwise', title || 'Untitled'];
```

Run: `node server/services/__tests__/notebookFolderTreeService.test.js`

Expected: PASS with deterministic folder creation and parent chaining.

- [ ] **Step 6: Commit**

```bash
git add server/services/notebookImportTreeService.js server/services/__tests__/notebookFolderTreeService.test.js server/routes/importRoutes.js
git commit -m "Create imported notebook folder paths from source hierarchy"
```

### Task 3: Preserve User Moves On Re-Sync Instead Of Reparenting Notes

**Files:**
- Modify: `server/routes/importRoutes.js`
- Modify: `server/routes/notebookRoutes.js`
- Create: `server/routes/__tests__/importRoutes.notebookPlacement.test.js`

- [ ] **Step 1: Write the failing re-sync placement test**

```js
assert.strictEqual(existingEntry.importMeta.folderOwnership, 'user');

const payload = await runNotionSyncAgain({
  connectionId: 'notion-1',
  importSessionId: 'session-2'
});

assert.strictEqual(response.status, 200);
assert.strictEqual(String(updatedEntry.folder), 'user-curated-folder');
assert.strictEqual(updatedEntry.title, 'Updated source title');
```

- [ ] **Step 2: Run the sync placement test to verify it fails**

Run: `node server/routes/__tests__/importRoutes.notebookPlacement.test.js`

Expected: FAIL because re-sync currently only knows how to create imported notes and has no concept of preserving a user-owned folder move.

- [ ] **Step 3: Mark folder ownership as user-owned when a note is moved manually**

```js
if (folder !== undefined) {
  updates.folder = folder || null;
  updates['importMeta.folderOwnership'] = 'user';
}
```

- [ ] **Step 4: Update import upsert logic to preserve folder when ownership is user**

```js
if (existingEntry) {
  existingEntry.title = title;
  existingEntry.content = content;
  existingEntry.blocks = blocks;
  existingEntry.tags = nextTags;
  existingEntry.importMeta = {
    ...(existingEntry.importMeta || {}),
    provider,
    sourceLabel,
    externalId,
    parentExternalId,
    sourcePath: sourcePathSegments,
    importedAt: new Date()
  };

  if ((existingEntry.importMeta?.folderOwnership || 'source') !== 'user') {
    existingEntry.folder = notebookFolder?._id || null;
  }

  await existingEntry.save();
}
```

- [ ] **Step 5: Re-run the re-sync placement test**

Run: `node server/routes/__tests__/importRoutes.notebookPlacement.test.js`

Expected: PASS with content updated in place and the user-selected folder preserved.

- [ ] **Step 6: Commit**

```bash
git add server/routes/importRoutes.js server/routes/notebookRoutes.js server/routes/__tests__/importRoutes.notebookPlacement.test.js
git commit -m "Preserve moved notebook notes on import resync"
```

### Task 4: Replace The Think Notebook Rail With A Collapsible Folder Tree

**Files:**
- Create: `note-taker-ui/src/components/think/notebook/NotebookFolderTree.jsx`
- Create: `note-taker-ui/src/components/think/notebook/NotebookFolderTree.test.jsx`
- Modify: `note-taker-ui/src/pages/ThinkMode.jsx`
- Modify: `note-taker-ui/src/styles/stitch-editorial.css`

- [ ] **Step 1: Write the failing component test for grouped notebook rendering**

```jsx
render(
  <NotebookFolderTree
    folders={[
      { _id: 'root', name: 'Product HQ', parentFolderId: null },
      { _id: 'child', name: 'Projects', parentFolderId: 'root' }
    ]}
    entries={[
      { _id: 'note-1', title: 'Roadmap', folder: 'child', updatedAt: '2026-04-19T12:00:00.000Z' }
    ]}
    activeEntryId="note-1"
    onSelectEntry={jest.fn()}
    onSelectFolder={jest.fn()}
  />
);

expect(screen.getByRole('button', { name: /Product HQ/i })).toBeInTheDocument();
expect(screen.getByRole('button', { name: /Projects/i })).toBeInTheDocument();
expect(screen.getByRole('button', { name: /Roadmap/i })).toBeInTheDocument();
```

- [ ] **Step 2: Run the component test to verify it fails**

Run: `CI=1 npm test -- --runInBand --watch=false src/components/think/notebook/NotebookFolderTree.test.jsx`

Expected: FAIL because the Think notebook rail is still a flat partner list.

- [ ] **Step 3: Implement a notebook folder tree component using the Library folder-row interaction pattern**

```jsx
const NotebookFolderTree = ({
  folders,
  entries,
  activeEntryId,
  onToggleFolder,
  onSelectFolder,
  onSelectEntry
}) => (
  <div className="notebook-folder-tree">
    {treeRows.map((row) => (
      row.type === 'folder' ? (
        <FolderRow
          key={row.id}
          id={row.id}
          name={row.name}
          depth={row.depth}
          hasChildren={row.hasChildren}
          isExpanded={row.isExpanded}
          onToggle={onToggleFolder}
          onSelect={onSelectFolder}
        />
      ) : (
        <button
          key={row.entry._id}
          type="button"
          className={`notebook-folder-tree__entry ${activeEntryId === row.entry._id ? 'is-active' : ''}`}
          onClick={() => onSelectEntry(row.entry._id)}
        >
          {row.entry.title}
        </button>
      )
    ))}
  </div>
);
```

- [ ] **Step 4: Replace the flat notebook rail sections in `ThinkMode.jsx`**

```jsx
content: notebookLoadingList
  ? <SidebarSkeletonRows rows={8} />
  : (
      <NotebookFolderTree
        folders={notebookFolders}
        entries={filteredNotebookEntries}
        activeEntryId={notebookActiveId}
        expandedFolderIds={expandedNotebookFolders}
        onToggleFolder={handleToggleNotebookFolder}
        onSelectFolder={handleSelectNotebookFolder}
        onSelectEntry={handleSelectNotebookEntry}
      />
    )
```

- [ ] **Step 5: Add notebook-tree styling and rerun the component test**

Run: `CI=1 npm test -- --runInBand --watch=false src/components/think/notebook/NotebookFolderTree.test.jsx`

Expected: PASS with nested collapsible folders and note rows in the notebook rail.

- [ ] **Step 6: Commit**

```bash
git add note-taker-ui/src/components/think/notebook/NotebookFolderTree.jsx note-taker-ui/src/components/think/notebook/NotebookFolderTree.test.jsx note-taker-ui/src/pages/ThinkMode.jsx note-taker-ui/src/styles/stitch-editorial.css
git commit -m "Render notebook imports in a collapsible folder tree"
```

### Task 5: Add Per-Note Move Action And Drag-And-Drop Reorganization

**Files:**
- Create: `note-taker-ui/src/components/think/notebook/NotebookMoveEntryModal.jsx`
- Create: `note-taker-ui/src/components/think/notebook/NotebookMoveEntryModal.test.jsx`
- Modify: `note-taker-ui/src/pages/ThinkMode.jsx`
- Modify: `server/routes/notebookRoutes.js`

- [ ] **Step 1: Write the failing move-action test**

```jsx
fireEvent.click(screen.getByRole('button', { name: /move roadmap/i }));
fireEvent.click(screen.getByRole('button', { name: /Projects/i }));
fireEvent.click(screen.getByRole('button', { name: /Move note/i }));

await waitFor(() => expect(api.put).toHaveBeenCalledWith(
  '/api/notebook/note-1',
  expect.objectContaining({ folder: 'projects-folder' }),
  expect.any(Object)
));
```

- [ ] **Step 2: Run the move-action test to verify it fails**

Run: `CI=1 npm test -- --runInBand --watch=false src/components/think/notebook/NotebookMoveEntryModal.test.jsx`

Expected: FAIL because notebook entries have no move modal or per-note move action.

- [ ] **Step 3: Add a reusable move modal and row action**

```jsx
<QuietButton
  className="notebook-folder-tree__move"
  onClick={() => onMoveEntry(entry)}
  aria-label={`Move ${entry.title || 'note'}`}
>
  Move
</QuietButton>
```

```jsx
<NotebookMoveEntryModal
  open={moveModal.open}
  entry={moveModal.entry}
  folders={notebookFolders}
  onClose={closeMoveModal}
  onMove={handleMoveNotebookEntry}
/>
```

- [ ] **Step 4: Add drag-and-drop wiring that uses the same folder update endpoint**

```jsx
const handleMoveNotebookEntry = async ({ entryId, folderId }) => {
  const updated = await api.put(`/api/notebook/${entryId}`, { folder: folderId || null }, getAuthHeaders());
  setNotebookEntries((previous) => previous.map((entry) => (
    entry._id === entryId ? updated.data : entry
  )));
};
```

- [ ] **Step 5: Re-run the modal test and a ThinkMode-focused regression test**

Run: `CI=1 npm test -- --runInBand --watch=false src/components/think/notebook/NotebookMoveEntryModal.test.jsx src/pages/ThinkMode.templates.test.jsx`

Expected: PASS with move action and drag handler both routing through the same note update behavior.

- [ ] **Step 6: Commit**

```bash
git add note-taker-ui/src/components/think/notebook/NotebookMoveEntryModal.jsx note-taker-ui/src/components/think/notebook/NotebookMoveEntryModal.test.jsx note-taker-ui/src/pages/ThinkMode.jsx server/routes/notebookRoutes.js
git commit -m "Allow notebook notes to move between folders"
```

### Task 6: Verify Imported Notebook Material Stays Retrievable By The Agent

**Files:**
- Create: `server/routes/__tests__/importRoutes.notebookRetrieval.test.js`
- Modify: `server/routes/importRoutes.js`
- Modify: `server/routes/notebookRoutes.js`
- Modify: `server/ai/mappers/notebookEntryToEmbeddingItems.js`

- [ ] **Step 1: Write the failing retrieval coverage test**

```js
assert.strictEqual(enqueueNotebookEmbeddingCalls.length, 1);
assert.strictEqual(syncNotebookReferencesCalls.length, 1);
assert.deepStrictEqual(
  notebookEntryToEmbeddingItems(entry, 'user-1').map((item) => item.metadata.folderPath),
  [['Product HQ', 'Projects', 'Roadmap'], ['Product HQ', 'Projects', 'Roadmap']]
);
```

- [ ] **Step 2: Run the retrieval test to verify it fails**

Run: `node server/routes/__tests__/importRoutes.notebookRetrieval.test.js`

Expected: FAIL because notebook embedding metadata does not yet carry folder context and imported note coverage is not explicitly asserted.

- [ ] **Step 3: Add folder-path metadata into notebook embedding items for diagnostics and downstream retrieval tuning**

```js
metadata: {
  title: normalizeText(entry?.title || ''),
  tags: entry?.tags || [],
  folderPath: entry?.importMeta?.sourcePath || [],
  createdAt: entry?.createdAt ? new Date(entry.createdAt).toISOString() : new Date().toISOString(),
  updatedAt: entry?.updatedAt ? new Date(entry.updatedAt).toISOString() : new Date().toISOString()
}
```

- [ ] **Step 4: Make imports and notebook updates continue to call reference sync + embedding queue on create and update**

```js
await syncNotebookReferences(userId, entry._id, entry.blocks || []);
enqueueNotebookEmbedding(entry);
entry.importMeta = {
  ...(entry.importMeta || {}),
  searchableAt: new Date()
};
```

- [ ] **Step 5: Re-run retrieval coverage plus existing import and integrations tests**

Run:

```bash
node server/routes/__tests__/importRoutes.notebookRetrieval.test.js
node server/routes/__tests__/importRoutes.readwiseSync.test.js
CI=1 npm test -- --runInBand --watch=false src/pages/DataIntegrations.test.jsx src/components/think/notebook/NotebookFolderTree.test.jsx src/components/think/notebook/NotebookMoveEntryModal.test.jsx
```

Expected: PASS with imported notebook notes still indexed, embedded, and queryable through existing retrieval pathways.

- [ ] **Step 6: Commit**

```bash
git add server/routes/__tests__/importRoutes.notebookRetrieval.test.js server/routes/importRoutes.js server/routes/notebookRoutes.js server/ai/mappers/notebookEntryToEmbeddingItems.js
git commit -m "Verify imported notebook notes remain retrievable"
```

### Task 7: End-To-End QA On First Import, Manual Move, And Re-Sync

**Files:**
- Modify: `scripts/test_import_integrations_smoke.js`
- Create: `note-taker-ui/e2e/notebook-import-hierarchy.spec.js`

- [ ] **Step 1: Write the failing browser smoke for import-tree behavior**

```js
test('imported notebook notes stay in user-moved folders after resync', async ({ page }) => {
  await page.goto('/think?tab=notebook');
  await expect(page.getByText('Product HQ')).toBeVisible();
  await page.getByRole('button', { name: /move roadmap/i }).click();
  await page.getByRole('button', { name: 'Working notes' }).click();
  await page.getByRole('button', { name: /move note/i }).click();
  await page.goto('/data-integrations');
  await page.getByRole('button', { name: /sync from notion/i }).click();
  await page.goto('/think?tab=notebook');
  await expect(page.getByText('Roadmap')).toBeVisible();
});
```

- [ ] **Step 2: Run the browser smoke to verify it fails**

Run: `cd note-taker-ui && npm run test:e2e -- notebook-import-hierarchy.spec.js`

Expected: FAIL because the tree/move/resync flow is not fully wired yet.

- [ ] **Step 3: Extend the import smoke script to verify notebook folder placement metadata**

```js
assert.ok(summary.notion.preview, 'expected notion preview payload');
assert.ok(summary.notion.importResult.entryId, 'expected imported notebook entry');
assert.ok(Array.isArray(summary.notion.importResult.sourcePath), 'expected source path metadata');
```

- [ ] **Step 4: Re-run smoke coverage after implementation**

Run:

```bash
node scripts/test_import_integrations_smoke.js
cd note-taker-ui && npm run test:e2e -- notebook-import-hierarchy.spec.js
```

Expected: PASS for initial import, manual move, and re-sync without note reparenting.

- [ ] **Step 5: Commit**

```bash
git add scripts/test_import_integrations_smoke.js note-taker-ui/e2e/notebook-import-hierarchy.spec.js
git commit -m "Add notebook import hierarchy smoke coverage"
```

---

**Plan review checklist**

- Covers backend model changes, import placement, re-sync ownership, Think notebook UI, move interactions, and retrieval verification.
- Uses the current `NotebookFolder`, `NotebookEntry`, `importRoutes`, `notebookRoutes`, and `ThinkMode` architecture instead of inventing a second notebook system.
- Keeps folder placement user-owned after a manual move, which matches the approved sync rule.

**Execution note**

Implement Task 1 first and do not start UI work until the folder tree and note placement semantics exist on the backend. Tasks 4 and 5 can be split across workers after Task 1 and Task 3 land.
