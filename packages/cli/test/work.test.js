import assert from 'node:assert';

import { promptFor, workHandoffs } from '../src/work.js';

/* A Noeis holding three handoffs: one the reader made, one an agent handed
   on, and one another runner takes first. */
const fakeNoeis = () => {
  const handoffs = [
    { id: 'h1', ask: 'Finish the base rates section.', from: null, status: 'waiting', context: { kind: 'note', id: 'n1', title: 'Hiring' } },
    { id: 'h2', ask: 'Check the citations.', from: 'Claude Code', status: 'waiting', context: {} },
    { id: 'h3', ask: 'Gone already.', from: null, status: 'waiting', context: {} }
  ];
  const finished = [];
  const client = {
    request: async (route, { method = 'GET', body } = {}) => {
      if (route === '/api/handoffs') return { handoffs };
      const [, , , id, verb] = route.split('/');
      const handoff = handoffs.find(h => h.id === id);
      if (verb === 'take') {
        if (id === 'h3') throw Object.assign(new Error('taken'), { status: 409 });
        handoff.status = 'taken';
        return handoff;
      }
      if (verb === 'finish') {
        finished.push({ id, ...body });
        handoff.status = 'done';
        return handoff;
      }
      return handoff;
    }
  };
  return { client, finished, handoffs };
};

const run = async () => {
  const noeis = fakeNoeis();
  const launched = [];
  // The agent finishes the handoff itself; the runner leaves it be.
  const agent = (command, args) => {
    launched.push([command, args]);
    noeis.handoffs[0].status = 'done';
    return { status: 0, stdout: 'Done.' };
  };
  assert.strictEqual(await workHandoffs({ client: noeis.client, runtime: 'claude-code', run: agent }), 1);
  assert.strictEqual(launched.length, 1);
  const [command, args] = launched[0];
  assert.strictEqual(command, 'claude');
  assert.match(args[1], /Finish the base rates section\.[\s\S]*Hiring \(note n1\)[\s\S]*finish_handoff with handoffId h1/);
  assert.ok(args.includes('mcp__noeis-wiki__delete_article') && args.indexOf('--disallowedTools') > args.indexOf('mcp__noeis-wiki__*'));
  // Unwatched, it can neither reach the web nor have Noeis fetch an address for it.
  const off = args.slice(args.indexOf('--disallowedTools') + 1);
  for (const tool of ['WebFetch', 'WebSearch', 'mcp__noeis-wiki__create_article', 'mcp__noeis-wiki__set_folder_feed', 'mcp__noeis-wiki__update_schema']) assert.ok(off.includes(tool), tool);
  assert.deepStrictEqual(noeis.finished, []);

  // An agent that stops without finishing is finished for, with what it said.
  const quiet = fakeNoeis();
  quiet.handoffs.splice(1);
  await workHandoffs({ client: quiet.client, runtime: 'codex', run: () => ({ status: 1, stdout: 'Could not reach the page.' }) });
  assert.deepStrictEqual(quiet.finished, [{ id: 'h1', did: 'Stopped: codex exited 1.', open: 'Could not reach the page.' }]);

  await assert.rejects(workHandoffs({ client: quiet.client, runtime: 'agent' }), /claude-code or codex/);
  assert.doesNotMatch(promptFor({ id: 'h9', ask: 'Tidy.', context: {} }), /They were in/);
  console.log('work tests passed');
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
