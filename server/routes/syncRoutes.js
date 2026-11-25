const express = require('express');
const { buildNotebookMarkdown } = require('../services/notebookMarkdown');
const { renderWikiPageMarkdown, sanitizeFilename } = require('../services/wikiMarkdownExportService');
const { sourcePassages } = require('../services/agentRetrieval');
const { NOTE_LABEL } = require('../services/agentGrounding');

/* The reader's Noeis as a folder of Markdown, for `noeis sync`: Think as
   Think/, the Library as Library/, the wiki as Wiki/. Every item is listed
   with its path and when it last changed, so the folder can drop what Noeis
   no longer has; only what changed since the last sync (or what the folder
   asks for by id) carries its Markdown. Notes are written back through the
   notebook's own routes, which read Markdown. Work stays out: the model hook
   keeps it out of every personal query. */

const pencilMatter = pencil => (pencil?.agent ? `---\npencil: ${pencil.agent}, not yet taken up\n---\n\n` : '');

const noteMarkdown = note => `${pencilMatter(note.pencil)}${buildNotebookMarkdown(note, { keepDimmed: true })}`;

// How an inked connection reads as a line, by the relation the reader inked.
const LINKED_AS = { related: 'Echoes', supports: 'Answers', contained_by: 'Belongs on', contradicts: 'Argues with' };

const articleMarkdown = (article) => {
  const links = article.links || [];
  const marks = (article.highlights || []).filter(mark => mark.text || mark.note).map(mark => [
    mark.text && `> ${String(mark.text).trim().replace(/\n+/g, '\n> ')}`,
    mark.note && `${mark.pencil?.agent ? `${mark.pencil.agent}'s note:` : NOTE_LABEL} ${String(mark.note).trim()}`
  ].filter(Boolean).join('\n\n'));
  return [
    `${pencilMatter(article.pencil)}# ${article.title || 'Untitled'}`,
    [article.url && !article.url.startsWith('book://') && `Source: ${article.url}`, article.author && `By ${article.author}`].filter(Boolean).join(' · '),
    marks.length && `## What you marked\n\n${marks.join('\n\n')}`,
    sourcePassages(article.title, article.content).join('\n\n'),
    links.length && `## Connected\n\n${links.join('\n')}`
  ].filter(Boolean).join('\n\n').trimEnd().concat('\n');
};

const ROOMS = [
  { kind: 'note', folder: 'Think', model: 'NotebookEntry', filter: {}, fields: 'title blocks content workingState.dimmed pencil', render: noteMarkdown },
  { kind: 'article', folder: 'Library', model: 'Article', filter: { archived: { $ne: true }, debugOnly: { $ne: true } }, fields: 'title url author content highlights pencil', render: articleMarkdown },
  { kind: 'wiki_page', folder: 'Wiki', model: 'WikiPage', filter: { status: { $ne: 'archived' } }, fields: '', render: renderWikiPageMarkdown }
];

// A path that stays put while its title does, and never collides.
const pathOf = (folder, row) => `${folder}/${sanitizeFilename(row.title).slice(0, 60)}-${String(row._id).slice(-6)}.md`;

/* The connections the reader inked from each source, as [[links]] to the
   files they reach: an echoed mark links the source that holds it. Links to
   what the folder doesn't hold (a question) are left out rather than
   dangle. A source whose links changed since the last sync is resent. */
const inkedLinks = async ({ userId, models, files }) => {
  const inked = await models.Connection.find({ userId, fromType: 'article', toType: { $in: ['highlight', 'wiki_page'] } })
    .select('fromId toType toId relationType createdAt').lean();
  const marks = inked.filter(row => row.toType === 'highlight').map(row => row.toId);
  const holders = marks.length ? await models.Article.find({ userId, 'highlights._id': { $in: marks } }).select('_id highlights._id').lean() : [];
  const sourceOfMark = new Map(holders.flatMap(source => source.highlights.map(mark => [String(mark._id), String(source._id)])));
  const fileOf = new Map(files.map(file => [file.id, file]));
  const linksBySource = new Map();
  for (const row of inked) {
    const file = fileOf.get(row.toType === 'highlight' ? sourceOfMark.get(row.toId) : row.toId);
    if (!file || !LINKED_AS[row.relationType]) continue;
    const line = `- ${LINKED_AS[row.relationType]} [[${file.path.split('/').pop().replace(/\.md$/, '')}|${file.title || 'Untitled'}]]`;
    linksBySource.set(row.fromId, [...new Set([...(linksBySource.get(row.fromId) || []), line])]);
  }
  return { linksBySource, relinked: inked.map(row => ({ id: row.fromId, at: row.createdAt })) };
};

const buildSyncRouter = ({ authenticateToken, models }) => {
  const router = express.Router();

  router.get('/api/sync', authenticateToken, async (req, res) => {
    const now = new Date();
    const since = new Date(String(req.query.since || 0));
    if (Number.isNaN(since.getTime())) return res.status(400).json({ error: 'since must be a date.' });
    const asked = String(req.query.ids || '').split(',');
    try {
      const listed = await Promise.all(ROOMS.map(async room => (await models[room.model].find({ userId: req.user.id, ...room.filter }).select('_id title updatedAt').lean())
        .map(row => ({ kind: room.kind, id: String(row._id), title: row.title, path: pathOf(room.folder, row), updatedAt: row.updatedAt }))));
      const files = listed.flat();
      const { linksBySource, relinked } = await inkedLinks({ userId: req.user.id, models, files });
      const resend = [...asked, ...relinked.filter(row => row.at > since).map(row => row.id)].filter(id => /^[a-f0-9]{24}$/i.test(id));
      const markdownOf = new Map((await Promise.all(ROOMS.map(async ({ model, filter, fields, render }) => {
        const changed = await models[model].find({ userId: req.user.id, ...filter, $or: [{ updatedAt: { $gt: since } }, { _id: { $in: resend } }] })
          .select(fields ? `_id updatedAt ${fields}` : '').lean();
        return changed.map(row => [String(row._id), render({ ...row, links: linksBySource.get(String(row._id)) })]);
      }))).flat());
      return res.json({ now, files: files.map(({ kind, id, path, updatedAt }) => ({ kind, id, path, updatedAt, ...(markdownOf.has(id) ? { markdown: markdownOf.get(id) } : {}) })) });
    } catch (error) {
      console.error('[sync] listing failed', error.message);
      return res.status(500).json({ error: 'Your Noeis could not be listed for the folder.' });
    }
  });

  return router;
};

module.exports = { buildSyncRouter, __testables: { articleMarkdown, pathOf } };
