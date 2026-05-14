const mongoose = require('mongoose');

const MAX_WIKI_SCHEMA_CHARS = 8000;

const DEFAULT_WIKI_SCHEMA = `# Wiki Schema

## Page types I want
- topic: durable overview pages for concepts, themes, and recurring questions.
- entity: people, organizations, products, and places with stable identifying facts.
- source: pages about a single source when it deserves its own synthesis.
- question: sharp open questions that should compound into future pages.
- comparison: pages that contrast two or more ideas.

## Ingest workflow
- Decide which existing pages should change before creating a new page.
- Prefer updating 3-15 related pages when a source has broad implications.
- Preserve inline citations and flag contradictions instead of smoothing them away.

## Voice and tone
- Write like a concise reference wiki, not a blog post or chat answer.
- Use clear section headings, source-backed claims, and explicit uncertainty.
- Avoid hype, filler, and maintenance-process narration.

## What to flag in lint
- Unsupported claims that need evidence.
- Stale sections where newer sources disagree.
- Duplicate pages that should merge.
- Terms that should become [[wiki-links]].`;

const asText = (value = '') => String(value || '').trim();

const normalizeWikiSchemaContent = (value = '') => asText(value).slice(0, MAX_WIKI_SCHEMA_CHARS);

const buildSchemaSnapshot = (content) => ({
  _id: new mongoose.Types.ObjectId(),
  content,
  createdAt: new Date()
});

const serializeWikiSchema = (doc = null) => {
  const raw = doc && typeof doc.toObject === 'function' ? doc.toObject({ virtuals: false }) : doc;
  const snapshots = Array.isArray(raw?.snapshots) ? raw.snapshots : [];
  return {
    content: normalizeWikiSchemaContent(raw?.content || DEFAULT_WIKI_SCHEMA),
    maxChars: MAX_WIKI_SCHEMA_CHARS,
    updatedAt: raw?.updatedAt || null,
    snapshots: snapshots
      .map(snapshot => ({
        id: String(snapshot._id || snapshot.id || ''),
        content: normalizeWikiSchemaContent(snapshot.content || ''),
        createdAt: snapshot.createdAt || null
      }))
      .filter(snapshot => snapshot.id && snapshot.content)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
  };
};

const getWikiSchemaSettings = async ({ WikiSchemaSettings, userId } = {}) => {
  const existing = WikiSchemaSettings?.findOne
    ? await WikiSchemaSettings.findOne({ userId })
    : null;
  return serializeWikiSchema(existing);
};

const saveWikiSchemaSettings = async ({ WikiSchemaSettings, userId, content } = {}) => {
  if (!WikiSchemaSettings) throw new Error('Wiki schema storage is not available.');
  const normalized = normalizeWikiSchemaContent(content);
  const existing = await WikiSchemaSettings.findOne({ userId });
  if (existing) {
    existing.content = normalized;
    existing.snapshots = [
      ...(Array.isArray(existing.snapshots) ? existing.snapshots : []),
      buildSchemaSnapshot(normalized)
    ].slice(-25);
    await existing.save();
    return serializeWikiSchema(existing);
  }
  const created = new WikiSchemaSettings({
    userId,
    content: normalized,
    snapshots: [buildSchemaSnapshot(normalized)]
  });
  await created.save();
  return serializeWikiSchema(created);
};

const revertWikiSchemaSettings = async ({ WikiSchemaSettings, userId, snapshotId } = {}) => {
  if (!WikiSchemaSettings) throw new Error('Wiki schema storage is not available.');
  const existing = await WikiSchemaSettings.findOne({ userId });
  if (!existing) return serializeWikiSchema(null);
  const snapshot = (existing.snapshots || []).find(item => String(item._id || item.id) === String(snapshotId || ''));
  if (!snapshot) {
    const error = new Error('Wiki schema snapshot not found.');
    error.code = 'WIKI_SCHEMA_SNAPSHOT_NOT_FOUND';
    throw error;
  }
  existing.content = normalizeWikiSchemaContent(snapshot.content);
  existing.snapshots = [
    ...(Array.isArray(existing.snapshots) ? existing.snapshots : []),
    buildSchemaSnapshot(existing.content)
  ].slice(-25);
  await existing.save();
  return serializeWikiSchema(existing);
};

const getWikiSchemaPromptContent = async ({ WikiSchemaSettings, userId } = {}) => {
  const settings = await getWikiSchemaSettings({ WikiSchemaSettings, userId });
  return settings.content;
};

const formatWikiSchemaPromptBlock = (content = '') => {
  const normalized = normalizeWikiSchemaContent(content || DEFAULT_WIKI_SCHEMA);
  return `\n\nUser wiki schema conventions (follow unless they conflict with higher-priority safety or output-format rules):\n\"\"\"\n${normalized}\n\"\"\"`;
};

module.exports = {
  DEFAULT_WIKI_SCHEMA,
  MAX_WIKI_SCHEMA_CHARS,
  formatWikiSchemaPromptBlock,
  getWikiSchemaPromptContent,
  getWikiSchemaSettings,
  normalizeWikiSchemaContent,
  revertWikiSchemaSettings,
  saveWikiSchemaSettings,
  serializeWikiSchema
};
