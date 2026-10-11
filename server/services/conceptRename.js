/* Renaming a concept.

   A concept is named by a tag, and the name is written down wherever the
   concept is used: on passages, on notes, in a note's links, on questions,
   in paths, connections and the return queue. Renaming the record alone
   would orphan every one of those, so the record and its references move
   together in one transaction or not at all. A rename onto a name that is
   already a concept is refused: that would be a merge, and a merge deserves
   to be asked for by name. Changing only the case of the name is a rename.

   Where the reader mentioned the concept in a note (an @-mention), the name
   is written into the note too: in its text, its blocks and the pieces set
   aside. Those mentions move with it. The words around them are the
   reader's, and are never rewritten. A wiki page names other pages, never a
   concept, so no page changes. */

class ConceptRenameError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const escape = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const exactly = (name) => new RegExp(`^${escape(name)}$`, 'i');

/* Every place a concept's name is stored, as [model, where, what it becomes]. */
const references = (models, was, name) => [
  [models.Article, { 'highlights.tags': was }, { 'highlights.$[].tags.$[tag]': name }, [{ tag: was }]],
  [models.NotebookEntry, { tags: was }, { 'tags.$[tag]': name }, [{ tag: was }]],
  [models.Question, { linkedTagName: was }, { linkedTagName: name }],
  [models.Question, { conceptName: was }, { conceptName: name }],
  [models.ConceptNote, { tagName: was }, { tagName: name }],
  [models.ReferenceEdge, { targetType: 'concept', targetTagName: was }, { targetTagName: name.toLowerCase() }],
  [models.SharedConcept, { conceptName: was }, { conceptName: name }],
  [models.ConceptPath, { itemRefs: { $elemMatch: { type: 'concept', id: was } } }, { 'itemRefs.$[ref].id': name }, [{ 'ref.type': 'concept', 'ref.id': was }]],
  [models.Connection, { fromType: 'concept', fromId: was }, { fromId: name }],
  [models.Connection, { toType: 'concept', toId: was }, { toId: name }],
  [models.Connection, { scopeType: 'concept', scopeId: was }, { scopeId: name.toLowerCase() }],
  [models.ReturnQueueEntry, { itemType: 'concept', itemId: was }, { itemId: name }]
].filter(([Model]) => Model?.updateMany);

const attribute = (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const plain = (value) => Array.isArray(value) || Object.getPrototypeOf(value || 0) === Object.prototype;

/* Rename every `conceptName` under value, in place. */
const renameNamed = (value, was, name) => {
  if (typeof value.conceptName === 'string' && was.test(value.conceptName)) value.conceptName = name;
  Object.values(value).filter(plain).forEach(child => renameNamed(child, was, name));
};

/* Move the reader's mentions of the concept in their notes; the count of notes changed. */
const renameMentions = async ({ NotebookEntry, userId, was, previous, name, session }) => {
  if (!NotebookEntry?.find) return 0;
  const typed = new RegExp(`(data-conceptname=")${escape(attribute(previous))}"`, 'gi');
  const notes = await NotebookEntry.find({
    userId,
    $or: [
      { content: new RegExp(typed.source, 'i') },
      { 'blocks.conceptName': was },
      { 'asidePieces.blocks.conceptName': was },
      { 'asidePieces.nodes.attrs.conceptName': was }
    ]
  }).select('content blocks asidePieces').session(session).lean();
  for (const note of notes) {
    const content = String(note.content || '').replace(typed, (_, start) => `${start}${attribute(name)}"`);
    renameNamed({ blocks: note.blocks, asidePieces: note.asidePieces }, was, name);
    await NotebookEntry.updateOne(
      { _id: note._id, userId },
      { $set: { content, blocks: note.blocks, asidePieces: note.asidePieces } },
      { session }
    );
  }
  return notes.length;
};

const renameConcept = async ({ TagMeta, models = {}, userId, from, to }) => {
  const previous = String(from || '').trim();
  const name = String(to || '').replace(/\s+/g, ' ').trim();
  if (!name) throw new ConceptRenameError('A concept needs a name.');
  if (name.length > 120) throw new ConceptRenameError('That name is longer than a concept name can be.');
  if (name === previous) return { name, previousName: previous };
  const was = exactly(previous);
  const session = await TagMeta.db.startSession();
  let concept = null;
  let notes = 0;
  try {
    await session.withTransaction(async () => {
      concept = await TagMeta.findOne({ userId, name: was }).session(session);
      if (!concept && !(await models.Article?.exists({ userId, 'highlights.tags': was }).session(session))) {
        throw new ConceptRenameError('That concept is not there any more.', 404);
      }
      if (name.toLowerCase() !== previous.toLowerCase()) {
        const taken = await TagMeta.exists({ userId, name: exactly(name) }).session(session)
          || await models.Article?.exists({ userId, 'highlights.tags': exactly(name) }).session(session);
        if (taken) {
          throw new ConceptRenameError(`You already have a concept called “${name}”. Choose another name, or move these passages there first.`, 409);
        }
      }
      if (concept) {
        concept.name = name;
        await concept.save({ session });
      }
      for (const [Model, where, set, arrayFilters] of references(models, was, name)) {
        await Model.updateMany({ userId, ...where }, { $set: set }, { session, ...(arrayFilters ? { arrayFilters } : {}) });
      }
      notes = await renameMentions({ NotebookEntry: models.NotebookEntry, userId, was, previous, name, session });
    });
  } finally {
    await session.endSession();
  }
  return { name, previousName: previous, conceptId: concept ? String(concept._id) : '', notes };
};

module.exports = { ConceptRenameError, renameConcept };
