const { chatComplete, isTextGenerationConfigured } = require('../ai/hfTextClient');
const { parseNotebookWordingOptions } = require('../utils/notebookWordingOptions');

const buildPrompt = (passage) => `You help an author compare wording for one passage they are actively editing.

Return JSON only:
{"options":[{"wording":"full rewritten passage","explanation":"one short sentence on what changed"}]}

Rules:
- Offer 2 or 3 options that preserve meaning and voice but differ in real ways (for example more direct, more tentative, or more concrete when appropriate).
- Each explanation must describe the actual edit, not a generic label.
- Do not add citations, sources, links, or new factual claims.
- Do not wrap the JSON in markdown.

Passage:
${String(passage || '').trim()}`;

const generateNotebookWordingOptions = async ({ passage, signal, generate = null } = {}) => {
  const original = String(passage || '').trim();
  if (!original) {
    return { status: 'empty', options: [] };
  }
  if (typeof generate === 'function') {
    const options = parseNotebookWordingOptions(await generate({ passage: original }), { original });
    return { status: options.length ? 'ready' : 'empty', options };
  }
  if (!isTextGenerationConfigured()) {
    const error = new Error('Wording options are unavailable right now.');
    error.status = 503;
    throw error;
  }
  const completion = await chatComplete({
    route: 'structure_planner',
    maxTokens: 900,
    messages: [
      { role: 'system', content: 'You return concise JSON for notebook wording comparisons.' },
      { role: 'user', content: buildPrompt(original) }
    ],
    signal
  });
  const options = parseNotebookWordingOptions(completion?.text || completion, { original });
  return { status: options.length ? 'ready' : 'empty', options };
};

module.exports = { buildPrompt, generateNotebookWordingOptions };
