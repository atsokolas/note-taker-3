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

const SYSTEM = `You compare pairs of passages from one reader's workspace: what an agent wrote or a source says (A), against something the reader holds (B): a view, a passage they marked, a question they asked, a line on one of their wiki pages, or what another agent wrote. Say how A bears on B:
- "argues" when both cannot be true, or both cannot be acted on, as stated.
- "bears" when A makes the same point as B, gives evidence for it, carries it to a new case, or answers B when B is a question.
- "none" when they only share words or a topic. A different emphasis, or a claim about something else, is none.
Answer with JSON only: {"pairs":[{"pair":<number>,"relation":"argues"|"bears"|"none","a":"<what A says, one sentence>","b":"<what B says, one sentence>"}]}`;

/* One model reading over numbered pairs of { a, b }, each side { who, says }:
   how each pair bears, by index (argues, bears or none), each side in one
   sentence. */
const RELATIONS = new Set(['argues', 'bears', 'none']);
const relations = async ({ pairs, chat = chatComplete }) => {
  if (!pairs.length) return [];
  const listed = pairs.map(({ a, b }, index) => `Pair ${index + 1}\nA (${a.who}): ${a.says}\nB (${b.who}): ${String(b.says).slice(0, SAYS_CHARS)}`).join('\n\n');
  const completion = await chat({ route: 'critique', messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: listed }] });
  return (parseStructuredText(completion?.text)?.pairs || [])
    .filter(row => pairs[row?.pair - 1])
    .filter(row => RELATIONS.has(row.relation))
    .map(row => ({ index: row.pair - 1, relation: row.relation, a: String(row.a || ''), b: String(row.b || '') }));
};

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
  const judged = await relations({
    pairs: pairs.map(({ item, rival }) => ({ a: { who: agent, says: item.says }, b: { who: rival.agent || 'the reader\'s held view', says: rival.says } })),
    chat
  });

  const found = judged
    .filter(row => row.relation === 'argues')
    .map((row) => {
      const { item, hit, rival } = pairs[row.index];
      return {
        userId,
        a: { agent, kind: item.kind, id: item.id, title: item.title || '', says: String(row.a || item.says).slice(0, 500) },
        b: { agent: rival.agent, kind: hit.held ? 'view' : hit.type, id: hit.id, title: hit.title || '', says: String(row.b || rival.says).slice(0, 500) }
      };
    });
  return found.length ? Disagreement.insertMany(found) : [];
};

module.exports = { checkDisagreements, relations, YOU };
