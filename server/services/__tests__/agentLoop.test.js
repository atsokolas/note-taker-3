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

  it('stops offering tools after the last round', async () => {
    const chat = jest.fn(async ({ tools }) => (tools ? { toolCalls: [call('search_library', { query: 'x' })] } : { text: 'Nothing in your library covers this.' }));
    const result = await runAgentLoop({ messages, search: async () => [], read: jest.fn(), chat });
    expect(chat).toHaveBeenCalledTimes(4);
    expect(chat.mock.calls[3][0].tools).toBeUndefined();
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

  it('returns nothing when the quotation is still invented after repair', async () => {
    const invented = { text: 'The source says "sleep is the single best predictor of judgment".' };
    const chat = scripted(invented, invented);
    expect(await runAgentLoop({ messages, sources: [sleep], search: jest.fn(), read: jest.fn(), chat })).toBeNull();
  });
});
