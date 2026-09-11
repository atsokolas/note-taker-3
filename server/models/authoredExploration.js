const buildAuthoredExplorationModel = (mongoose) => {
  const sourceAnchorSchema = new mongoose.Schema({
    prefix: { type: String, default: '', maxlength: 500 },
    suffix: { type: String, default: '', maxlength: 500 },
    startOffsetApprox: { type: Number, default: null }
  }, { _id: false });

  const selectedSourceSchema = new mongoose.Schema({
    articleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Article', required: true },
    highlightId: { type: mongoose.Schema.Types.ObjectId, default: null },
    articleTitle: { type: String, default: '', maxlength: 500 },
    passage: { type: String, required: true, maxlength: 6000 },
    aroundBefore: { type: String, default: '', maxlength: 2000 },
    aroundAfter: { type: String, default: '', maxlength: 2000 },
    isLibrary: { type: Boolean, default: true },
    here: { type: Boolean, default: false },
    available: { type: Boolean, default: true },
    anchor: { type: sourceAnchorSchema, default: undefined }
  }, { _id: false });

  const keptSourceSchema = new mongoose.Schema({
    articleId: { type: mongoose.Schema.Types.ObjectId, default: null },
    highlightId: { type: mongoose.Schema.Types.ObjectId, default: null },
    articleTitle: { type: String, default: '', maxlength: 500 },
    title: { type: String, default: '', maxlength: 500 },
    passage: { type: String, default: '', maxlength: 6000 },
    aroundBefore: { type: String, default: '', maxlength: 2000 },
    aroundAfter: { type: String, default: '', maxlength: 2000 },
    available: { type: Boolean, default: true },
    stale: { type: Boolean, default: false },
    anchor: { type: sourceAnchorSchema, default: undefined }
  }, { _id: false });

  const pressureSchema = new mongoose.Schema({
    against: { type: String, default: '', maxlength: 4000 },
    premise: { type: String, default: '', maxlength: 4000 },
    stillHolds: { type: String, default: '', maxlength: 4000 },
    unknown: { type: String, default: '', maxlength: 4000 }
  }, { _id: false });

  const meetSchema = new mongoose.Schema({
    against: { type: String, default: '', maxlength: 4000 },
    relation: { type: String, default: '', maxlength: 4000 },
    limit: { type: String, default: '', maxlength: 4000 },
    between: { type: String, default: '', maxlength: 20000 }
  }, { _id: false });

  const pairSchema = new mongoose.Schema({
    against: { type: String, default: '', maxlength: 4000 },
    text: { type: String, default: '', maxlength: 20000 }
  }, { _id: false });

  const originSchema = new mongoose.Schema({
    pageTitle: { type: String, default: '', maxlength: 500 },
    claimText: { type: String, default: '', maxlength: 4000 },
    href: { type: String, default: '', maxlength: 1000 }
  }, { _id: false });

  const draftSchema = new mongoose.Schema({
    // Existing sentence tools are private experiments, bounded by the service.
    ...Object.fromEntries(['distinction', 'distinctionAt', 'distinctionAgainst', 'instrument', 'exhibit', 'rehearsal', 'unwritten', 'carry', 'contributions', 'rearranged', 'without', 'withoutSource'].map(key => [key, { type: mongoose.Schema.Types.Mixed, default: undefined }])),
    title: { type: String, default: '', maxlength: 240 },
    writing: { type: String, default: '', maxlength: 20000 },
    originalText: { type: String, default: '', maxlength: 4000 },
    provisionalText: { type: String, default: '', maxlength: 20000 },
    question: { type: String, default: '', maxlength: 2000 },
    returnNote: { type: String, default: '', maxlength: 2000 },
    mark: { type: String, enum: ['', '!'], default: '' },
    placed: { type: Boolean, default: false },
    pressure: { type: pressureSchema, default: undefined },
    meet: { type: meetSchema, default: undefined },
    essay: { type: pairSchema, default: undefined },
    proposal: { type: pairSchema, default: undefined },
    selectedSource: { type: selectedSourceSchema, default: undefined }
  }, { _id: false });

  const mutationSchema = new mongoose.Schema({
    id: { type: String, required: true, maxlength: 100 },
    fingerprint: { type: String, required: true, maxlength: 64 },
    revision: { type: Number, required: true, min: 1 },
    at: { type: Date, default: Date.now }
  }, { _id: false });

  const keepSchema = new mongoose.Schema({
    destination: { type: String, enum: ['notebook', 'question'], required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    mutationId: { type: String, required: true, maxlength: 100 },
    status: { type: String, enum: ['pending', 'complete'], default: 'pending' },
    snapshot: {
      origin: { type: originSchema, default: () => ({}) },
      draft: { type: draftSchema, default: undefined },
      primarySource: { type: keptSourceSchema, default: undefined }
    },
    at: { type: Date, default: Date.now }
  }, { _id: false });

  const schema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    pageId: { type: mongoose.Schema.Types.ObjectId, ref: 'WikiPage' },
    claimId: { type: String, trim: true, maxlength: 240 },
    articleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Article' },
    highlightId: { type: mongoose.Schema.Types.ObjectId },
    revision: { type: Number, required: true, min: 1, default: 1 },
    origin: { type: originSchema, default: () => ({}) },
    draft: { type: draftSchema, default: () => ({}) },
    savedVersions: { type: [new mongoose.Schema({
      revision: { type: Number, required: true },
      savedAt: { type: Date, required: true },
      origin: { type: originSchema, default: () => ({}) },
      draft: { type: draftSchema, required: true }
    }, { _id: false })], default: [], select: false },
    mutations: { type: [mutationSchema], default: [] },
    keeps: { type: [keepSchema], default: [] }
  }, { timestamps: true });

  schema.pre('validate', function validateOrigin(next) {
    const wiki = Boolean(this.pageId && this.claimId && !this.articleId && !this.highlightId);
    const library = Boolean(this.articleId && this.highlightId && !this.pageId && !this.claimId);
    next(wiki || library ? undefined : new Error('An exploration needs exactly one Wiki or Library origin.'));
  });
  schema.index({ userId: 1, pageId: 1, claimId: 1 }, {
    name: 'owned_wiki_exploration', unique: true, partialFilterExpression: { pageId: { $type: 'objectId' } }
  });
  schema.index({ userId: 1, articleId: 1, highlightId: 1 }, {
    name: 'owned_library_exploration', unique: true, partialFilterExpression: { articleId: { $type: 'objectId' } }
  });
  schema.index({ userId: 1, pageId: 1, updatedAt: -1 });
  schema.index({ userId: 1, updatedAt: -1, _id: -1 });

  return mongoose.models.AuthoredExploration
    || mongoose.model('AuthoredExploration', schema);
};

module.exports = { buildAuthoredExplorationModel };
