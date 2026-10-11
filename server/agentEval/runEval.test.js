// The model path's failures, reproduced without a model: a scripted chat
// searches the eval library and then times out, the way a slow provider does.
// The reader should get the passages the turn found, scored by the same
// checks the eval uses, and silence only when nothing was found at all.
jest.mock('../ai/hfTextClient', () => ({
  isTextGenerationConfigured: () => true,
  chatComplete: jest.fn()
}));

const { chatComplete } = require('../ai/hfTextClient');
const { runAgentEval } = require('./runEval');

const timeout = () => Object.assign(new Error('request timed out after 20000ms'), { status: 504 });
const searchThenTimeOut = query => async ({ toolChoice }) => {
  if (toolChoice === 'auto' && !chatComplete.mock.calls.some(([args]) => args.messages.some(message => message.role === 'tool'))) {
    return { toolCalls: [{ id: 's1', function: { name: 'search_library', arguments: JSON.stringify({ query }) } }] };
  }
  throw timeout();
};

jest.setTimeout(60000);

describe('agent eval when the model fails mid-turn', () => {
  beforeEach(() => chatComplete.mockReset());

  it('serves the passages its own search found instead of claiming the library is empty', async () => {
    chatComplete.mockImplementation(searchThenTimeOut('expertise'));
    const { cases: [item] } = await runAgentEval({ only: ['expertise-tension'] });
    expect(item.reply).toMatch(/^I could not finish an answer; here is what my search found\./);
    expect(item.pass).toBe(true);
    expect(item.cited.sort()).toEqual(['checklists', 'deliberatePractice']);
  });

  it('still says the library is quiet when nothing was found', async () => {
    chatComplete.mockImplementation(searchThenTimeOut('French Revolution'));
    const { cases: [item] } = await runAgentEval({ only: ['french-revolution'] });
    expect(item.pass).toBe(true);
    expect(item.cited).toEqual([]);
  });
});
