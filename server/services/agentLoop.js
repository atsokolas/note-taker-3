// The thought partner's turn when a model is available: it may search the
// reader's library and read a source in full before it answers, and its answer
// is checked before anyone sees it. A quotation that is not in a source it
// read is sent back once for repair; if it survives the repair, the turn
// fails and the caller falls back to quoting the passages directly.
const { inventedQuotes } = require('./agentGrounding');

const MAX_TOOL_ROUNDS = 3;
const READ_LIMIT = 6000;
const TOOL_RESULT_PASSAGES = 5;

const TOOLS = Object.freeze([
  {
    type: 'function',
    function: {
      name: 'search_library',
      description: 'Search the reader\'s saved sources, highlights with their margin notes, notebook pages, concepts and the views they hold. Returns the passages that bear on the query, each with the id of its source. Returns nothing when nothing bears on it.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'What to look for, in plain words.' } },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_source',
      description: 'Read one source in full, by the id a search returned.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id']
      }
    }
  }
]);

// Offered when the open source is a wiki page with a history to read.
const HISTORY_TOOL = Object.freeze({
  type: 'function',
  function: {
    name: 'read_page_history',
    description: 'Read the dated history of the open wiki page: what each revision changed, newest first. Use it when the question is about how the page or the reader\'s thinking changed over time.',
    parameters: { type: 'object', properties: {} }
  }
});

// Offered when the reader could accept a change here. The model only stages
// it; the reader's click is what changes anything.
const proposeTool = (changes) => Object.freeze({
  type: 'function',
  function: {
    name: 'propose_change',
    description: [
      'Stage a change for the reader to accept or dismiss. Nothing changes until they accept it.',
      'Use it only when the reader asks you to change, rewrite or organize something, never on your own initiative.',
      changes.includes('rewrite') ? '"rewrite": replace the text of the open page with `text`, the complete new version.' : '',
      changes.includes('organize') ? '"organize": stage a cleanup of the reader\'s folders, which they review move by move.' : ''
    ].filter(Boolean).join(' '),
    parameters: {
      type: 'object',
      properties: {
        change: { type: 'string', enum: changes },
        summary: { type: 'string', description: 'One sentence the reader sees on the button: what the change does.' },
        text: { type: 'string', description: 'For a rewrite, the complete new text.' }
      },
      required: ['change', 'summary']
    }
  }
});

// Appended to the partner's system prompt for this loop.
const SEARCH_RULE = 'You can search the reader\'s library and read a source before answering. Search when the question reaches beyond the passages already in front of you.';
const LOOP_RULES = [
  'When you rely on a source, quote its exact words in double quotes and name the source. Quote only words that appear in a passage you were shown or read.',
  'A passage that begins "You hold:" is a view the reader holds, with their reasons and what would change their mind. When what you found supports it or cuts against it, say which, and quote the view.',
  'If nothing in the library bears on the question, say so plainly in one sentence. Do not answer from general knowledge as though the library said it.'
];
const PROPOSE_RULE = 'When you stage a change, say in one sentence what it would do and that it waits for the reader. Never say a change has been made.';

const parseArguments = (raw) => {
  if (raw && typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw || '{}'));
  } catch (_error) {
    return {};
  }
};

const runAgentLoop = async ({
  messages = [],
  sources = [],
  search,
  read,
  history,
  changes = [],
  chat,
  route = 'partner_chat',
  signal
}) => {
  // Without a library to search (a published question answers only from what
  // was published), the turn answers from the passages it was given.
  const libraryTools = search && read ? TOOLS : [];
  const offered = [...libraryTools, ...(history ? [HISTORY_TOOL] : []), ...(changes.length ? [proposeTool(changes)] : [])];
  const tools = offered.length ? offered : null;
  const rules = [...(libraryTools.length ? [SEARCH_RULE] : []), ...LOOP_RULES, ...(changes.length ? [PROPOSE_RULE] : [])].join('\n');
  const proposals = [];
  // Everything the model has been shown, by id, so the answer can be checked
  // against exactly that.
  const seen = new Map(sources.filter(source => source?.id).map(source => [String(source.id), source]));
  const show = (items = []) => items.forEach((item) => { if (item?.id) seen.set(String(item.id), item); });
  const conversation = messages.map((message, index) => (
    index === 0 && message.role === 'system' ? { ...message, content: `${message.content}\n\n${rules}` } : message
  ));

  const runTool = async (call) => {
    const name = call?.function?.name;
    const args = parseArguments(call?.function?.arguments);
    if (name === 'search_library') {
      const found = (await search(String(args.query || ''))).slice(0, TOOL_RESULT_PASSAGES);
      show(found);
      return found.length
        ? found.map(item => ({ id: item.id, title: item.title, passage: item.fullText || item.snippet }))
        : { result: 'Nothing in the library bears on this query.' };
    }
    if (name === 'read_page_history' && history) {
      const record = await history();
      if (!record?.fullText) return { result: 'This page has no recorded history.' };
      show([record]);
      return { history: record.fullText };
    }
    if (name === 'propose_change') {
      if (!changes.includes(args.change)) return { result: `"${args.change}" is not a change you can stage here.` };
      const summary = String(args.summary || '').trim();
      const text = String(args.text || '').trim();
      if (!summary || (args.change === 'rewrite' && !text)) return { result: 'A change needs a summary, and a rewrite needs the complete new text.' };
      // One proposal of each kind per turn: a second call replaces the first.
      const index = proposals.findIndex(item => item.change === args.change);
      proposals.splice(index < 0 ? proposals.length : index, 1, { change: args.change, summary, ...(text ? { text } : {}) });
      return { result: 'Staged. The reader sees it with a button to accept it; nothing has changed yet.' };
    }
    if (name === 'read_source') {
      const source = await read(String(args.id || ''));
      if (!source) return { result: 'No source with that id.' };
      show([source]);
      return { id: source.id, title: source.title, text: String(source.fullText || '').slice(0, READ_LIMIT) };
    }
    return { result: `Unknown tool ${name}.` };
  };

  let completion = null;
  const toolCalls = [];
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    const lastRound = round === MAX_TOOL_ROUNDS;
    completion = await chat({
      route,
      messages: conversation,
      ...(lastRound || !tools ? {} : { tools, toolChoice: 'auto' }),
      signal
    });
    const calls = Array.isArray(completion?.toolCalls) ? completion.toolCalls : [];
    if (!calls.length || lastRound) break;
    conversation.push({ role: 'assistant', content: completion.text || '', tool_calls: calls });
    for (const call of calls) {
      toolCalls.push(call?.function?.name);
      conversation.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(await runTool(call)) });
    }
  }

  // Everything of a source the model was shown: its text, and for a wiki page
  // the attached sources and claims printed beside it.
  const texts = () => [...seen.values()].map(item => [item.fullText || item.replySnippet || item.snippet, item.sourceText, item.claimText].filter(Boolean).join('\n'));
  let reply = String(completion?.text || '').trim();
  let invented = inventedQuotes(reply, texts());
  if (reply && invented.length) {
    conversation.push({ role: 'assistant', content: reply });
    conversation.push({
      role: 'user',
      content: `These quotations are not in any source you were shown: ${invented.map(quote => `"${quote}"`).join('; ')}. Rewrite the answer quoting only exact words from the passages, or say the library does not cover it.`
    });
    completion = await chat({ route, messages: conversation, signal });
    reply = String(completion?.text || '').trim();
    invented = inventedQuotes(reply, texts());
  }
  // An answer cut off at the token limit is not an answer.
  const cutOff = completion?.raw?.choices?.[0]?.finish_reason === 'length';
  if (!reply || invented.length || cutOff) return null;

  return {
    reply,
    model: completion?.model || '',
    provider: completion?.provider || '',
    sources: [...seen.values()],
    proposals,
    toolCalls
  };
};

module.exports = { runAgentLoop, TOOLS };
