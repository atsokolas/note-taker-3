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

const articleMarkdown = (article) => {
  const marks = (article.highlights || []).filter(mark => mark.text || mark.note).map(mark => [
    mark.text && `> ${String(mark.text).trim().replace(/\n+/g, '\n> ')}`,
    mark.note && `${mark.pencil?.agent ? `${mark.pencil.agent}'s note:` : NOTE_LABEL} ${String(mark.note).trim()}`
  ].filter(Boolean).join('\n\n'));
  return [
    `${pencilMatter(article.pencil)}# ${article.title || 'Untitled'}`,
    [article.url && !article.url.startsWith('book://') && `Source: ${article.url}`, article.author && `By ${article.author}`].filter(Boolean).join(' · '),
    marks.length && `## What you marked\n\n${marks.join('\n\n')}`,
    sourcePassages(article.title, article.content).join('\n\n')
  ].filter(Boolean).join('\n\n').trimEnd().concat('\n');
};

const ROOMS = [
  { kind: 'note', folder: 'Think', model: 'NotebookEntry', filter: {}, fields: 'title blocks content workingState.dimmed pencil', render: noteMarkdown },
  { kind: 'article', folder: 'Library', model: 'Article', filter: { archived: { $ne: true }, debugOnly: { $ne: true } }, fields: 'title url author content highlights pencil', render: articleMarkdown },
  { kind: 'wiki_page', folder: 'Wiki', model: 'WikiPage', filter: { status: { $ne: 'archived' } }, fields: '', render: renderWikiPageMarkdown }
];

// A path that stays put while its title does, and never collides.
const pathOf = (folder, row) => `${folder}/${sanitizeFilename(row.title).slice(0, 60)}-${String(row._id).slice(-6)}.md`;

const buildSyncRouter = ({ authenticateToken, models }) => {
  const router = express.Router();

  router.get('/api/sync', authenticateToken, async (req, res) => {
    const now = new Date();
    const since = new Date(String(req.query.since || 0));
    if (Number.isNaN(since.getTime())) return res.status(400).json({ error: 'since must be a date.' });
    const asked = String(req.query.ids || '').split(',').filter(id => /^[a-f0-9]{24}$/i.test(id));
    try {
      const rooms = await Promise.all(ROOMS.map(async ({ kind, folder, model, filter, fields, render }) => {
        const Model = models[model];
        const mine = { userId: req.user.id, ...filter };
        const [all, changed] = await Promise.all([
          Model.find(mine).select('_id title updatedAt').lean(),
          Model.find({ ...mine, $or: [{ updatedAt: { $gt: since } }, { _id: { $in: asked } }] }).select(fields ? `_id updatedAt ${fields}` : '').lean()
        ]);
        const markdownOf = new Map(changed.map(row => [String(row._id), render(row)]));
        return all.map(row => ({
          kind,
          id: String(row._id),
          path: pathOf(folder, row),
          updatedAt: row.updatedAt,
          ...(markdownOf.has(String(row._id)) ? { markdown: markdownOf.get(String(row._id)) } : {})
        }));
      }));
      return res.json({ now, files: rooms.flat() });
    } catch (error) {
      console.error('[sync] listing failed', error.message);
      return res.status(500).json({ error: 'Your Noeis could not be listed for the folder.' });
    }
  });

  return router;
};

module.exports = { buildSyncRouter, __testables: { articleMarkdown, pathOf } };
