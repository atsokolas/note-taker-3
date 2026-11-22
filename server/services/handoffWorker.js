const { chatComplete } = require('../ai/hfTextClient');
const { BUILT_IN, runtimeLabel } = require('./agentRuntime');
const { createAgentTokenSecret, hashAgentTokenSecret } = require('./agentTokenService');
const { parseMarkdownNote } = require('./import/exportFiles');
const { stripHtmlToLines } = require('./import/evernoteTransform');

/* The agent built into Noeis, working what the reader handed it while they
   are away. It is a connection like any other: a short-lived token of its
   own, the same API outside agents use, so what it writes lands in pencil,
   Work opens only for a handoff made from Work, and the handoff's record of
   what it wrote is derived the same way. Its turn ends when it finishes, or
   when its rounds or its time run out, and it always finishes: the reader
   comes back to a note, never to silence. */

const NAME = runtimeLabel(BUILT_IN);
const ROUNDS = 16;
const TIME_LIMIT_MS = 10 * 60 * 1000;
const READ_LIMIT = 8000;

const tool = (name, description, properties = {}, required = Object.keys(properties)) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } }
});
const words = description => ({ type: 'string', description });

const TOOLS = [
  tool('recall', 'Search everything the reader keeps (reading, highlights with their margin notes, notes, questions, the views they hold, wiki pages). Returns the passages that bear on it, best first.', { query: words('What to look for, in plain words.') }),
  tool('read', 'Read one thing recall found, in full, by its id.', { id: words('The id of a recall hit.') }),
  tool('rewrite_page', 'Replace the text of the page the reader handed off with your complete new version, in Markdown, without its title. Keep everything of theirs you were not asked to change. It lands in pencil; their version stays in the page history.', { text: words('The complete new text.') }),
  tool('write_note', 'Write a new note for the reader, in Markdown. It lands in pencil.', { title: words('The note\'s title.'), text: words('The note, in Markdown.') }),
  tool('finish', 'Finish: what you did, what is still open, and what you would do next, each in a sentence or two. The reader reads this first when they come back.', {
    did: words('What you did.'), open: words('What is still open or unsure.'), next: words('What you would do next.')
  }, ['did'])
];

const SYSTEM = `You are ${NAME}, the agent built into the reader's Noeis. Before stepping away, they handed you the work below. Do it now, from their own library.
- Use recall to find what they have read and written that bears on it, and read what you use. Quote their sources' exact words, and never present an agent's pencil as the reader's own view.
- If the work is the page they handed off (finish it, continue it, tighten it), call rewrite_page with the complete new text. Otherwise write what they asked for with write_note.
- Handed a question, find what in their library bears on it, and what would settle it, and write that up with write_note, naming the question.
- You cannot browse the web. Say so in "open" when the work needs it.
- Everything you write lands in pencil until the reader takes it up.
- End with finish: did, open, next, in plain sentences.`;

const pageText = page => String(page?.text || '').slice(0, READ_LIMIT);

const opening = ({ handoff, page }) => [
  `Handed to you: ${handoff.ask}`,
  handoff.context?.title && `They were in: ${handoff.context.title}${handoff.context.kind ? ` (${handoff.context.kind})` : ''}`,
  handoff.context?.excerpt && `The passage they were in:\n${handoff.context.excerpt}`,
  page && `The page as it stands:\n${pageText(page)}`
].filter(Boolean).join('\n\n');

// The page the reader was on: any page recall reads, or a Work note; the
// two kinds the reader writes in can be rewritten.
const recalled = (api, id) => ({ read: async () => ({ text: (await api(`/api/recall/read/${id}`)).text }) });
const pageOf = (api, context = {}) => ({
  note: {
    ...recalled(api, context.id),
    write: text => api(`/api/notebook/${context.id}`, { method: 'PUT', body: { markdown: `# ${context.title || 'Untitled'}\n\n${text}` } })
  },
  question: recalled(api, context.id),
  article: recalled(api, context.id),
  wiki_page: recalled(api, context.id),
  work_note: {
    read: async () => ({ text: stripHtmlToLines((await api(`/api/work-notes/${context.id}`)).content).join('\n\n') }),
    write: async (text) => {
      const { revision } = await api(`/api/work-notes/${context.id}`);
      return api(`/api/work-notes/${context.id}`, { method: 'PUT', body: { expectedRevision: revision, content: parseMarkdownNote({ text }).content, blocks: [] } });
    }
  }
}[context.kind] || null);

// A connection of the built-in agent's own, for one piece of work.
const connect = async ({ AgentToken, userId, scopes = [] }) => {
  const secret = createAgentTokenSecret();
  const token = await AgentToken.create({
    userId,
    label: NAME,
    runtime: BUILT_IN,
    hashedSecret: hashAgentTokenSecret(secret),
    secretPrefix: `${secret.slice(0, 12)}...`,
    scopes: ['agent-write', ...scopes],
    expiresAt: new Date(Date.now() + 2 * TIME_LIMIT_MS),
    status: 'active'
  });
  return { token, secret };
};

const apiFor = (apiUrl, secret) => async (path, { method = 'GET', body } = {}) => {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(json.error || `Noeis answered ${response.status}.`), { status: response.status });
  return json;
};

const workHandoff = async ({ handoffId, models: { Handoff, AgentToken }, apiUrl, chat = chatComplete, now = Date.now }) => {
  const handoff = await Handoff.findOne({ _id: handoffId, to: BUILT_IN, takenAt: null, cancelledAt: null }).lean();
  if (!handoff) return null;
  const { token, secret } = await connect({ AgentToken, userId: handoff.userId, scopes: handoff.context?.kind === 'work_note' ? ['work'] : [] });
  const api = apiFor(apiUrl, secret);
  const finish = body => api(`/api/handoffs/${handoff._id}/finish`, { method: 'POST', body });
  const startedAt = now();
  // Called off by the reader: it stops before the next thing it would do, and its connection goes with it.
  const calledOff = () => Handoff.exists({ _id: handoff._id, cancelledAt: { $ne: null } });
  try {
    await api(`/api/handoffs/${handoff._id}/take`, { method: 'POST', body: {} });
    const page = pageOf(api, handoff.context);
    const conversation = [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: opening({ handoff, page: page && await page.read().catch(() => null) }) }
    ];
    const run = {
      recall: async ({ query }) => (await api(`/api/recall?q=${encodeURIComponent(String(query || ''))}&limit=8`)).results,
      read: async ({ id }) => {
        const source = await api(`/api/recall/read/${encodeURIComponent(String(id || ''))}`);
        return { ...source, text: String(source.text || '').slice(0, READ_LIMIT) };
      },
      rewrite_page: async ({ text }) => {
        if (!page?.write) return { result: 'The page they handed off cannot be rewritten here; use write_note.' };
        await page.write(String(text || ''));
        return { result: 'Rewritten, in pencil.' };
      },
      write_note: async ({ title, text }) => {
        await api('/api/notebook', { method: 'POST', body: { markdown: `# ${title || 'Untitled'}\n\n${text || ''}` } });
        return { result: 'Written, in pencil.' };
      }
    };

    for (let round = 0; round < ROUNDS && now() - startedAt < TIME_LIMIT_MS; round += 1) {
      if (await calledOff()) return null;
      const completion = await chat({ route: 'artifact_draft', messages: conversation, tools: TOOLS, toolChoice: 'auto' });
      const calls = completion?.toolCalls || [];
      const done = calls.find(call => call.function?.name === 'finish');
      if (done) return await finish(JSON.parse(done.function.arguments || '{}'));
      if (!calls.length) return await finish({ did: String(completion?.text || '').trim() || 'Stopped without a word.' });
      conversation.push({ role: 'assistant', content: completion.text || '', tool_calls: calls });
      for (const call of calls) {
        if (await calledOff()) return null;
        const args = JSON.parse(call.function?.arguments || '{}');
        const result = await (run[call.function?.name] || (async () => ({ result: `Unknown tool ${call.function?.name}.` })))(args)
          .catch(error => ({ error: error.message }));
        conversation.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }
    return await finish({ did: 'Stopped: out of time before finishing.', open: 'The work is unfinished; what was written is in pencil.' });
  } catch (error) {
    console.error('[handoff] built-in agent stopped', error.message);
    return finish({ did: `Stopped: ${error.message}`, open: 'The work is unfinished.' }).catch(() => null);
  } finally {
    await AgentToken.deleteOne({ _id: token._id });
  }
};

/* On waking, anything still handed to the built-in agent is worked, and a
   turn the last process never finished is finished for it. */
const resumeHandoffs = async ({ models, apiUrl, chat }) => {
  const { Handoff } = models;
  await Handoff.updateMany(
    { to: BUILT_IN, takenAt: { $lt: new Date(Date.now() - 2 * TIME_LIMIT_MS) }, finishedAt: null, cancelledAt: null },
    { $set: { finishedAt: new Date(), did: 'Stopped: Noeis restarted before this was finished.', open: 'The work is unfinished; what was written is in pencil.' } }
  );
  const waiting = await Handoff.find({ to: BUILT_IN, takenAt: null, cancelledAt: null }).select('_id').lean();
  for (const { _id } of waiting) await workHandoff({ handoffId: _id, models, apiUrl, chat });
};

module.exports = { workHandoff, resumeHandoffs, connect, apiFor, TOOLS, NAME };
