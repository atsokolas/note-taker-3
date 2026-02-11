#!/usr/bin/env node
const assert = require('assert');

const baseUrl = (process.env.WEB_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
const token = process.env.AUTH_TOKEN || '';

if (!token) {
  console.error('AUTH_TOKEN is required');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json'
};

const createNotebookEntry = async (title) => {
  const res = await fetch(`${baseUrl}/api/notebook`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ title, content: title, blocks: [] })
  });
  const text = await res.text();
  assert.strictEqual(res.status, 201, `create notebook failed status=${res.status} body=${text}`);
  return JSON.parse(text);
};

const deleteNotebookEntry = async (id) => {
  const res = await fetch(`${baseUrl}/api/notebook/${id}`, {
    method: 'DELETE',
    headers
  });
  const text = await res.text();
  assert.strictEqual(res.status, 200, `delete notebook failed status=${res.status} body=${text}`);
};

const run = async () => {
  const noteA = await createNotebookEntry(`Path test A ${Date.now()}`);
  const noteB = await createNotebookEntry(`Path test B ${Date.now() + 1}`);
  let createdPathId = '';

  try {
    const createPathRes = await fetch(`${baseUrl}/api/concept-paths`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title: `Path test ${Date.now()}`,
        itemRefs: [{ type: 'notebook', id: noteA._id }]
      })
    });
    const createPathText = await createPathRes.text();
    assert.strictEqual(createPathRes.status, 201, `create path failed status=${createPathRes.status} body=${createPathText}`);
    const created = JSON.parse(createPathText);
    createdPathId = created._id;
    assert.ok(createdPathId, 'path id missing');
    assert.strictEqual(created.itemRefs.length, 1, 'expected one starter step');

    const addItemRes = await fetch(`${baseUrl}/api/concept-paths/${createdPathId}/items`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ type: 'notebook', id: noteB._id })
    });
    const addItemText = await addItemRes.text();
    assert.strictEqual(addItemRes.status, 200, `add item failed status=${addItemRes.status} body=${addItemText}`);
    const withTwoItems = JSON.parse(addItemText);
    assert.strictEqual(withTwoItems.itemRefs.length, 2, 'expected two steps');

    const ids = withTwoItems.itemRefs.map(item => item._id).reverse();
    const reorderRes = await fetch(`${baseUrl}/api/concept-paths/${createdPathId}/items/reorder`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ itemRefIds: ids })
    });
    const reorderText = await reorderRes.text();
    assert.strictEqual(reorderRes.status, 200, `reorder failed status=${reorderRes.status} body=${reorderText}`);
    const reordered = JSON.parse(reorderText);
    assert.strictEqual(String(reordered.itemRefs[0].id), String(noteB._id), 'expected noteB first after reorder');

    const currentStepId = reordered.itemRefs[0]._id;
    const progressRes = await fetch(`${baseUrl}/api/concept-paths/${createdPathId}/progress`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ toggleItemRefId: currentStepId, understood: true, currentIndex: 1 })
    });
    const progressText = await progressRes.text();
    assert.strictEqual(progressRes.status, 200, `progress update failed status=${progressRes.status} body=${progressText}`);
    const progress = JSON.parse(progressText);
    assert.ok(Array.isArray(progress.understoodItemRefIds), 'understood list missing');
    assert.ok(progress.understoodItemRefIds.includes(String(currentStepId)), 'step should be marked understood');
    assert.strictEqual(progress.currentIndex, 1, 'currentIndex should be persisted');

    const listRes = await fetch(`${baseUrl}/api/concept-paths`, { method: 'GET', headers });
    const listText = await listRes.text();
    assert.strictEqual(listRes.status, 200, `list paths failed status=${listRes.status} body=${listText}`);
    const list = JSON.parse(listText);
    assert.ok(list.some(path => String(path._id) === String(createdPathId)), 'created path missing from list');
  } finally {
    if (createdPathId) {
      await fetch(`${baseUrl}/api/concept-paths/${createdPathId}`, { method: 'DELETE', headers });
    }
    await deleteNotebookEntry(noteA._id);
    await deleteNotebookEntry(noteB._id);
  }

  console.log('concept path route tests passed');
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
