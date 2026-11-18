const { chatComplete, parseStructuredText } = require('../ai/hfTextClient');
const { retrieveWithBearing } = require('./agentRetrieval');

/* Agents disagree out loud. When an agent finishes a handoff, what it wrote
   is held against what it bears on most closely: a view the reader holds,
   or another agent's pencil. One model reading says which pairs contradict,
   and each contradiction is kept as a disagreement for the reader (and the
   next agent) to see, rather than as two facts side by side. */

const NEAREST = 3;
const SAYS_CHARS = 1200;
const YOU = '';

const SYSTEM = `You compare what one agent wrote for a reader with things it may contradict: views the reader holds and what other agents wrote. A pair contradicts only when both cannot be true, or both cannot be acted on, as stated. Different emphasis, a narrower claim, or a different topic is not a contradiction.
Answer with JSON only: {"pairs":[{"pair":<number>,"contradicts":true|false,"a":"<what the agent says, one sentence>","b":"<what the other says, one sentence>"}]}`;

const notesOf = async ({ NotebookEntry, userId, wrote }) => {
  const ids = wrote.filter(item => item.kind === 'note').map(item => item.id);
  const notes = ids.length ? await NotebookEntry.find({ _id: { $in: ids }, userId }).select('_id title blocks').lean() : [];
  const text = id => (notes.find(note => String(note._id) === id)?.blocks || []).map(block => block.text).filter(Boolean).join('\n');
  return wrote
    .map(item => ({ ...item, says: (item.kind === 'note' ? text(item.id) : item.text || '').slice(0, SAYS_CHARS) }))
    .filter(item => item.says.trim());
};

// What each written thing could contradict: the reader's held views, or another agent's pencil.
const rivalsOf = (hit, writer) => (hit.held ? { agent: YOU, says: hit.held } : hit.pencil && hit.pencil !== writer ? { agent: hit.pencil, says: hit.snippet } : null);

const checkDisagreements = async ({ userId, agent, wrote, models, semanticSearch = null, chat = chatComplete }) => {
  const { Disagreement, NotebookEntry } = models;
  const pairs = [];
  for (const item of await notesOf({ NotebookEntry, userId, wrote })) {
    const hits = await retrieveWithBearing({ userId, query: item.says.slice(0, 500), limit: 8, includePages: true, forModel: true, models, semanticSearch });
    hits
      .filter(hit => hit.id !== item.id)
      .map(hit => ({ hit, rival: rivalsOf(hit, agent) }))
      .filter(({ rival }) => rival)
      .slice(0, NEAREST)
      .forEach(({ hit, rival }) => pairs.push({ item, hit, rival }));
  }
  if (!pairs.length) return [];

  const listed = pairs.map(({ item, rival }, index) => `Pair ${index + 1}\nA (${agent}): ${item.says}\nB (${rival.agent || 'the reader\'s held view'}): ${String(rival.says).slice(0, SAYS_CHARS)}`).join('\n\n');
  const completion = await chat({ route: 'critique', messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: listed }] });
  const judged = parseStructuredText(completion?.text)?.pairs || [];

  const found = judged
    .filter(row => row?.contradicts && pairs[row.pair - 1])
    .map((row) => {
      const { item, hit, rival } = pairs[row.pair - 1];
      return {
        userId,
        a: { agent, kind: item.kind, id: item.id, title: item.title || '', says: String(row.a || item.says).slice(0, 500) },
        b: { agent: rival.agent, kind: hit.held ? 'view' : hit.type, id: hit.id, title: hit.title || '', says: String(row.b || rival.says).slice(0, 500) }
      };
    });
  return found.length ? Disagreement.insertMany(found) : [];
};

module.exports = { checkDisagreements, YOU };
