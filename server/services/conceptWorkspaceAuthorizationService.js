const clean = (value, max = 8000) => String(value || '').trim().slice(0, max);
const id = (value) => clean(value?._id || value?.id || value, 200);

const buildConceptWorkspaceAuthorizationService = ({
  mongoose,
  Article,
  NotebookEntry,
  Question,
  TagMeta,
  WikiPage,
  ensureWorkspace
}) => {
  const TYPES = new Set(['highlight', 'article', 'note', 'question', 'concept', 'wiki_page', 'wiki_claim']);
  const validObjectId = (value) => mongoose.Types.ObjectId.isValid(clean(value, 200));
  const canonical = ({ type, refId, title = '', text = '' }) => ({
    type,
    refId: clean(refId, 300),
    inlineTitle: clean(title, 500),
    inlineText: clean(text, 8000)
  });

  const resolveSource = async (userId, typeInput, refIdInput) => {
    const type = clean(typeInput, 40).toLowerCase();
    const refId = clean(refIdInput, 300);
    if (!TYPES.has(type) || !refId) return null;

    if (type === 'wiki_claim') {
      const [pageId, ...claimParts] = refId.split(':');
      const claimId = clean(claimParts.join(':'), 200);
      if (!validObjectId(pageId) || !claimId) return null;
      const page = await WikiPage.findOne({ _id: pageId, userId, 'claims.claimId': claimId })
        .select('_id title claims').lean();
      const claim = (page?.claims || []).find(candidate => clean(candidate?.claimId, 200) === claimId);
      return page && claim
        ? canonical({ type, refId: `${id(page)}:${claimId}`, title: page.title, text: claim.text || claim.title })
        : null;
    }

    if (!validObjectId(refId)) return null;
    if (type === 'highlight') {
      const article = await Article.findOne({ userId, 'highlights._id': refId })
        .select('_id title highlights').lean();
      const highlight = (article?.highlights || []).find(candidate => id(candidate) === refId);
      return article && highlight
        ? canonical({ type, refId: id(highlight), title: article.title, text: highlight.text })
        : null;
    }
    if (type === 'article') {
      const row = await Article.findOne({ _id: refId, userId }).select('_id title').lean();
      return row ? canonical({ type, refId: id(row), title: row.title }) : null;
    }
    if (type === 'note') {
      const row = await NotebookEntry.findOne({ _id: refId, userId }).select('_id title content').lean();
      return row ? canonical({ type, refId: id(row), title: row.title, text: row.content }) : null;
    }
    if (type === 'question') {
      const row = await Question.findOne({ _id: refId, userId }).select('_id text').lean();
      return row ? canonical({ type, refId: id(row), title: row.text, text: row.text }) : null;
    }
    if (type === 'concept') {
      const row = await TagMeta.findOne({ _id: refId, userId }).select('_id name description').lean();
      return row ? canonical({ type, refId: id(row), title: row.name, text: row.description }) : null;
    }
    if (type === 'wiki_page') {
      const row = await WikiPage.findOne({ _id: refId, userId }).select('_id title summary').lean();
      return row ? canonical({ type, refId: id(row), title: row.title, text: row.summary?.text || row.summary }) : null;
    }
    return null;
  };

  const canonicalizeItem = (item, source) => {
    const next = { ...item, ...source };
    if (!source.inlineTitle) delete next.inlineTitle;
    if (!source.inlineText) delete next.inlineText;
    return next;
  };

  const authorizeItems = async (userId, items, { rejectInvalid = false } = {}) => {
    const authorized = [];
    for (const item of (Array.isArray(items) ? items : [])) {
      const source = await resolveSource(userId, item?.type, item?.refId);
      if (!source) {
        if (rejectInvalid) return null;
        continue;
      }
      authorized.push(canonicalizeItem(item, source));
    }
    return authorized;
  };

  const sanitizeConceptWorkspace = async (concept, userId, { persist = true } = {}) => {
    if (!concept) return null;
    const original = ensureWorkspace(concept);
    const items = Array.isArray(original.items) ? original.items : [];
    const authorizedItems = await authorizeItems(userId, items);
    const workspace = ensureWorkspace({
      workspace: { ...original, attachedItems: authorizedItems, items: authorizedItems }
    });
    const changed = JSON.stringify(concept.workspace || null) !== JSON.stringify(workspace);
    if (changed && persist) {
      concept.workspace = workspace;
      concept.markModified?.('workspace');
      await concept.save();
    }
    return { concept, workspace, changed };
  };

  return { resolveSource, authorizeItems, sanitizeConceptWorkspace };
};

module.exports = { buildConceptWorkspaceAuthorizationService };
