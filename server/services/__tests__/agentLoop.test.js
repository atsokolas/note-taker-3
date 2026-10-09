const { runAgentLoop } = require('../agentLoop');

const sleep = {
  id: 'sleep',
  title: 'Sleep debt and decisions',
  fullText: 'Tired people make worse decisions because fatigue narrows attention to the default option.'
};

const call = (name, args, id = `${name}-1`) => ({ id, function: { name, arguments: JSON.stringify(args) } });
const scripted = (...turns) => jest.fn(async () => turns.shift() || { text: '' });
const messages = [{ role: 'system', content: 'You are a thinking partner.' }, { role: 'user', content: 'Why do I decide badly at night?' }];

describe('runAgentLoop', () => {
  it('searches the library, then answers from what it found', async () => {
    const search = jest.fn(async () => [sleep]);
    const chat = scripted(
      { toolCalls: [call('search_library', { query: 'fatigue decisions' })] },
      { text: 'Sleep debt and decisions says "Tired people make worse decisions because fatigue narrows attention".', model: 'm' }
    );
    const result = await runAgentLoop({ messages, search, read: jest.fn(), chat });

    expect(search).toHaveBeenCalledWith('fatigue decisions');
    expect(result.toolCalls).toEqual(['search_library']);
    expect(result.sources.map(source => source.id)).toEqual(['sleep']);
    expect(chat.mock.calls[0][0].messages[0].content).toMatch(/quote its exact words/);
    expect(chat.mock.calls[1][0].messages.at(-1)).toMatchObject({ role: 'tool', tool_call_id: 'search_library-1' });
  });

  it('reads a source in full by id', async () => {
    const read = jest.fn(async () => sleep);
    const chat = scripted(
      { toolCalls: [call('read_source', { id: 'sleep' })] },
      { text: 'It argues "fatigue narrows attention to the default option".' }
    );
    const result = await runAgentLoop({ messages, search: jest.fn(), read, chat });
    expect(read).toHaveBeenCalledWith('sleep');
    expect(result.reply).toMatch(/default option/);
  });

  it('stops allowing tools after the last round, but still lists them', async () => {
    const chat = jest.fn(async ({ toolChoice }) => (toolChoice === 'auto' ? { toolCalls: [call('search_library', { query: 'x' })] } : { text: 'Nothing in your library covers this.' }));
    const result = await runAgentLoop({ messages, search: async () => [], read: jest.fn(), chat });
    expect(chat).toHaveBeenCalledTimes(4);
    expect(chat.mock.calls[3][0].toolChoice).toBe('none');
    expect(chat.mock.calls[3][0].tools.map(tool => tool.function.name)).toContain('search_library');
    expect(result.reply).toBe('Nothing in your library covers this.');
  });

  it('sends an invented quotation back once and keeps the repaired answer', async () => {
    const chat = scripted(
      { text: 'The source says "sleep is the single best predictor of judgment".' },
      { text: 'The source says "fatigue narrows attention to the default option".' }
    );
    const result = await runAgentLoop({ messages, sources: [sleep], search: jest.fn(), read: jest.fn(), chat });
    expect(chat).toHaveBeenCalledTimes(2);
    expect(chat.mock.calls[1][0].messages.at(-1).content).toMatch(/not in any source you were shown/);
    expect(result.reply).toMatch(/default option/);
  });

  it('checks each side of an ellipsis in a quotation on its own', async () => {
    const chat = scripted({ text: 'It says "Tired people make worse decisions … fatigue narrows attention to the default option".' });
    const result = await runAgentLoop({ messages, sources: [sleep], chat });
    expect(chat).toHaveBeenCalledTimes(1);
    expect(result.reply).toMatch(/default option/);
  });

  it('returns nothing when the quotation is still invented after repair', async () => {
    const invented = { text: 'The source says "sleep is the single best predictor of judgment".' };
    const chat = scripted(invented, invented);
    expect(await runAgentLoop({ messages, sources: [sleep], search: jest.fn(), read: jest.fn(), chat })).toBeNull();
  });

  it('offers no library tools when there is no library to search', async () => {
    const chat = scripted({ text: 'It says "fatigue narrows attention to the default option".' });
    const result = await runAgentLoop({ messages, sources: [sleep], chat });
    expect(chat.mock.calls[0][0].tools).toBeUndefined();
    expect(chat.mock.calls[0][0].messages[0].content).not.toMatch(/search the reader/);
    expect(result.reply).toMatch(/default option/);
  });

  it('accepts a quotation from the sources printed beside a wiki page', async () => {
    const page = { id: 'wiki:sleep', title: 'Sleep', fullText: 'Sleep shapes judgment.', sourceText: '[1] Walker — the brain clears waste during deep sleep' };
    const chat = scripted({ text: 'Its first source says "the brain clears waste during deep sleep".' });
    const result = await runAgentLoop({ messages, sources: [page], chat });
    expect(chat).toHaveBeenCalledTimes(1);
    expect(result.reply).toMatch(/deep sleep/);
  });

  it('reads the open page\'s history when asked how thinking changed', async () => {
    const history = jest.fn(async () => ({ id: 'history:p1', title: 'Sleep history', fullText: '2026-09-01: new claim: naps restore afternoon judgment' }));
    const chat = scripted(
      { toolCalls: [call('read_page_history', {})] },
      { text: 'On 1 September you added "naps restore afternoon judgment".' }
    );
    const result = await runAgentLoop({ messages, sources: [sleep], history, chat });
    expect(chat.mock.calls[0][0].tools.map(tool => tool.function.name)).toEqual(['read_page_history']);
    expect(history).toHaveBeenCalled();
    expect(result.reply).toMatch(/naps restore/);
  });
  it('stages a change the reader can accept, and only the changes this context allows', async () => {
    const chat = scripted(
      { toolCalls: [
        call('propose_change', { change: 'rewrite', summary: 'Tighten the opening.', text: 'Fatigue narrows attention.' }, 'p1'),
        call('propose_change', { change: 'organize', summary: 'Sort folders.' }, 'p2'),
        call('propose_change', { change: 'rewrite', summary: 'Shorter still.' }, 'p3')
      ] },
      { text: 'I staged a tighter opening; it waits for you to accept it.' }
    );
    const result = await runAgentLoop({ messages, sources: [sleep], chat, changes: ['rewrite'] });
    const tools = chat.mock.calls[0][0].tools;
    expect(tools.find(tool => tool.function.name === 'propose_change').function.parameters.properties.change.enum).toEqual(['rewrite']);
    expect(chat.mock.calls[0][0].messages[0].content).toMatch(/Never say a change has been made/);
    const replies = chat.mock.calls[1][0].messages.filter(message => message.role === 'tool').map(message => message.content);
    expect(replies[1]).toMatch(/not a change you can stage/);
    expect(replies[2]).toMatch(/complete new text/);
    expect(result.proposals).toEqual([{ change: 'rewrite', summary: 'Tighten the opening.', text: 'Fatigue narrows attention.' }]);
  });

  it('offers no way to stage changes unless the context allows one', async () => {
    const chat = scripted({ text: 'Fatigue narrows attention.' });
    const result = await runAgentLoop({ messages, sources: [sleep], chat });
    expect(chat.mock.calls[0][0].tools).toBeUndefined();
    expect(result.proposals).toEqual([]);
  });
  it('returns nothing rather than an answer cut off at the token limit', async () => {
    const chat = scripted({ text: 'The strongest obj', raw: { choices: [{ finish_reason: 'length' }] } });
    expect(await runAgentLoop({ messages, sources: [sleep], chat })).toBeNull();
  });
});
