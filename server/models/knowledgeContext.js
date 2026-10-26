// Capability stays in server memory; a JSON option or filter cannot grant Work access.
const workQueries = new WeakSet();
const personalContext = () => ({ $or: [{ knowledgeContext: 'personal' }, { knowledgeContext: { $exists: false } }] });
const inWork = query => { workQueries.add(query); return query; };
function scopePipeline(pipeline, scope, filterRoot = true) {
  for (const stage of pipeline) {
    if (stage.$lookup) {
      const lookup = stage.$lookup;
      if (['notebookentries', 'notebookfolders'].includes(lookup.from)) {
        lookup.pipeline ||= [];
        scopePipeline(lookup.pipeline, scope);
      } else if (lookup.pipeline) scopePipeline(lookup.pipeline, scope, false);
    }
    if (stage.$unionWith) {
      if (typeof stage.$unionWith === 'string') stage.$unionWith = { coll: stage.$unionWith };
      if (['notebookentries', 'notebookfolders'].includes(stage.$unionWith.coll)) {
        stage.$unionWith.pipeline ||= [];
        scopePipeline(stage.$unionWith.pipeline, scope);
      } else if (stage.$unionWith.pipeline) scopePipeline(stage.$unionWith.pipeline, scope, false);
    }
    if (stage.$graphLookup && ['notebookentries', 'notebookfolders'].includes(stage.$graphLookup.from)) {
      stage.$graphLookup.restrictSearchWithMatch = { $and: [stage.$graphLookup.restrictSearchWithMatch || {}, scope] };
    }
    if (stage.$facet) Object.values(stage.$facet).forEach(branch => scopePipeline(branch, scope, false));
  }
  if (!filterRoot) return;
  const match = { $match: scope };
  if (pipeline[0]?.$geoNear || pipeline[0]?.$search) pipeline.splice(1, 0, match);
  else if (pipeline[0]?.$match?.$text) pipeline[0].$match = { $and: [pipeline[0].$match, scope] };
  else pipeline.unshift(match);
}
function knowledgeContext(schema) {
  schema.add({ knowledgeContext: { type: String, enum: ['personal', 'work'], default: 'personal', immutable: true } });
  schema.pre(['find', 'findOne', 'countDocuments', 'distinct', 'findOneAndUpdate', 'findOneAndDelete', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany', 'replaceOne', 'findOneAndReplace'], function () {
    this.setQuery({ $and: [this.getFilter(), workQueries.has(this) ? { knowledgeContext: 'work' } : personalContext()] });
  });
  schema.pre('estimatedDocumentCount', function () { throw new Error('Use scoped countDocuments for notebooks.'); });
  schema.pre('aggregate', function () {
    scopePipeline(this.pipeline(), workQueries.has(this) ? { knowledgeContext: 'work' } : personalContext());
  });
}
module.exports = { knowledgeContext, inWork, personalContext };
