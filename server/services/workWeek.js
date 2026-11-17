const mongoose = require('mongoose');
const { inWork } = require('../models/knowledgeContext');
const { fail, validDay, captureFields } = require('./workPlanner');

const monday = day => validDay(day) && new Date(`${day}T12:00:00Z`).getUTCDay() === 1;
const priorityFields = new Set(['id', 'title', 'taskIds', 'carriedFrom', 'status', 'reviewed']);
function weekPriorities(week, input) {
  if (!Array.isArray(input) || input.length > 20) throw fail(400, 'Keep at most 20 weekly priorities.');
  const ids = new Set(), tasks = new Set();
  return input.map(priority => {
    if (!priority || typeof priority !== 'object' || Array.isArray(priority) || Object.keys(priority).some(key => !priorityFields.has(key)) || typeof priority.id !== 'string' || !/^[\w-]{1,80}$/.test(priority.id) || ids.has(priority.id)) throw fail(400, 'Each priority needs its own identity.');
    ids.add(priority.id);
    if (typeof priority.title !== 'string' || !priority.title.trim() || priority.title.length > 300) throw fail(400, 'Name each priority in 300 characters or fewer.');
    if (!Array.isArray(priority.taskIds) || priority.taskIds.length > 200) throw fail(400, 'Keep at most 200 tasks beneath one priority.');
    for (const id of priority.taskIds) {
      if (typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id) || tasks.has(id)) throw fail(400, 'Link each saved task to one priority in this week.');
      tasks.add(id);
    }
    if (priority.carriedFrom != null && (!monday(priority.carriedFrom) || priority.carriedFrom >= week)) throw fail(400, 'Choose an earlier week for carried work.');
    if (!['active', 'complete', 'deferred', 'dropped'].includes(priority.status) || typeof priority.reviewed !== 'boolean') throw fail(400, 'Review this priority’s status.');
    return { id: priority.id, title: priority.title.trim(), taskIds: priority.taskIds, carriedFrom: priority.carriedFrom || null, status: priority.status, reviewed: priority.reviewed };
  });
}

// A week is one private notebook record. Its task ids point at the existing tasks;
// changing this plan never edits their source, planned day or completion history.
async function saveWorkWeek({ NotebookEntry, userId, week, input }) {
  if (!monday(week)) throw fail(400, 'Choose the Monday that starts this week.');
  const expected = input?.expectedRevision;
  if (expected !== null && (!Number.isInteger(expected) || expected < 0)) throw fail(400, 'Confirm the week revision.');
  const priorities = weekPriorities(week, input?.priorities), taskIds = priorities.flatMap(priority => priority.taskIds);
  if (taskIds.length && await inWork(NotebookEntry.countDocuments({ userId, _id: { $in: taskIds.map(id => new mongoose.Types.ObjectId(id)) }, 'workItem.kind': { $in: ['task', 'question'] } })) !== taskIds.length) throw fail(400, 'Link only your own Work tasks and questions.');
  const query = { userId, operationId: `work-week:${week}` }, find = () => inWork(NotebookEntry.findOne(query));
  let current = await find();
  if (!current && expected === null) {
    try {
      const entry = await NotebookEntry.create({ ...captureFields({ timeZone: input.timeZone }), ...query, knowledgeContext: 'work', operationSource: 'week', title: `Week of ${week}`, occurredOn: week, workItem: { kind: 'week', plannedOn: week, priorities } });
      return { entry, created: true };
    } catch (error) { if (error.code !== 11000) throw error; current = await find(); }
  }
  if (!current) throw fail(409, 'This week is not saved yet. Reload before trying again.');
  if (current.workItem?.kind !== 'week' || current.operationSource !== 'week') throw fail(409, 'This week could not be opened. Your existing writing is unchanged.');
  // A lost reply can be retried without creating another week or revision.
  if (JSON.stringify(current.workItem.priorities) === JSON.stringify(priorities)) return { entry: current, created: false };
  if (expected === null || current.revision !== expected) throw fail(409, 'This week changed elsewhere. Review its latest plan before saving.', current);
  const entry = await inWork(NotebookEntry.findOneAndUpdate({ ...query, revision: expected }, { $set: { 'workItem.priorities': priorities }, $inc: { revision: 1 } }, { new: true, runValidators: true }));
  if (!entry) throw fail(409, 'This week changed elsewhere. Review its latest plan before saving.', await find());
  return { entry, created: false };
}
module.exports = { saveWorkWeek };
