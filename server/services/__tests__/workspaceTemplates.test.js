const assert = require('assert');
const {
  WORKSPACE_TEMPLATE_STAGE_IDS,
  listWorkspaceTemplates,
  getWorkspaceTemplateById,
  getWorkspaceTemplateRegistry
} = require('../workspaceTemplates');

const REQUIRED_TEMPLATE_IDS = [
  'research-paper-analysis',
  'book-notes',
  'project-planning',
  'meeting-notes',
  'learning-path',
  'decision-log',
  'writing-sprint'
];

const run = () => {
  const summaries = listWorkspaceTemplates();
  assert.ok(Array.isArray(summaries), 'summaries should be an array');
  assert.ok(summaries.length >= 7, 'expected at least 7 templates');

  const summaryIds = new Set(summaries.map(template => template.id));
  REQUIRED_TEMPLATE_IDS.forEach((id) => {
    assert.ok(summaryIds.has(id), `missing required template id: ${id}`);
  });

  const templates = getWorkspaceTemplateRegistry();
  assert.ok(Array.isArray(templates), 'templates should be an array');
  const stageSet = new Set(WORKSPACE_TEMPLATE_STAGE_IDS);

  templates.forEach((template) => {
    assert.ok(template.id, 'template.id is required');
    assert.ok(template.name, `template.name is required (${template.id})`);
    assert.ok(template.description, `template.description is required (${template.id})`);
    assert.ok(template.icon, `template.icon is required (${template.id})`);

    assert.ok(Array.isArray(template.groups), `template.groups must be array (${template.id})`);
    assert.strictEqual(template.groups.length, 4, `template.groups must have 4 stages (${template.id})`);
    const groupIds = template.groups.map(group => group.id);
    assert.strictEqual(new Set(groupIds).size, 4, `template.groups must have unique ids (${template.id})`);
    groupIds.forEach((groupId) => {
      assert.ok(stageSet.has(groupId), `template.group id must be stage id (${template.id}:${groupId})`);
    });

    assert.ok(Array.isArray(template.sampleEntries), `template.sampleEntries must be array (${template.id})`);
    assert.ok(
      template.sampleEntries.length >= 2 && template.sampleEntries.length <= 3,
      `template.sampleEntries must have 2-3 rows (${template.id})`
    );

    template.sampleEntries.forEach((entry, index) => {
      assert.ok(entry.title, `sample entry title missing (${template.id}#${index})`);
      assert.ok(entry.content, `sample entry content missing (${template.id}#${index})`);
      assert.ok(stageSet.has(entry.stage), `sample entry stage invalid (${template.id}#${index})`);
      assert.ok(Number.isFinite(Number(entry.order)), `sample entry order invalid (${template.id}#${index})`);
    });

    assert.ok(Array.isArray(template.workflowTips), `workflowTips must be array (${template.id})`);
    assert.strictEqual(template.workflowTips.length, 3, `workflowTips must have 3 items (${template.id})`);

    const byId = getWorkspaceTemplateById(template.id);
    assert.ok(byId, `getWorkspaceTemplateById should return template (${template.id})`);
    assert.strictEqual(byId.id, template.id);
  });
};

if (require.main === module) {
  run();
  console.log('workspaceTemplates service tests passed');
}

module.exports = { run };
