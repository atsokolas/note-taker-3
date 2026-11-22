import { spawnSync } from 'node:child_process';

/* `noeis work`: what the reader hands to an agent is worked on this machine,
   by the agent they use here, headless, while they are away. The runner
   takes each handoff before starting the agent, so no other runner starts
   on it too, and finishes it for the agent if the agent did not: the reader
   comes back to a note either way. Only what the reader handed off is taken
   here; work one agent hands on waits for the next session's brief. */

const TIME_LIMIT_MS = 30 * 60 * 1000;
const MCP = 'mcp__noeis-wiki';
/* A session nobody is watching reads what was saved, and anything saved can
   carry instructions. So it gets no tool with no undo, no way to reach the
   web or make Noeis fetch an address (each could carry the library out in a
   URL), and no say over the instructions later agents read. */
const UNWATCHED_OFF = [
  'delete_article', 'delete_highlight', 'delete_notebook_entry', 'delete_concept_note',
  'create_article', 'ingest_source', 'add_source', 'set_folder_feed', 'update_schema'
];

export const LAUNCH = {
  'claude-code': prompt => ['claude', ['-p', prompt,
    '--allowedTools', `${MCP}__*`,
    '--disallowedTools', 'WebFetch', 'WebSearch', ...UNWATCHED_OFF.map(name => `${MCP}__${name}`)]],
  codex: prompt => ['codex', ['exec', '--skip-git-repo-check', prompt]]
};

export const promptFor = handoff => [
  `The reader handed you this in Noeis before stepping away (handoff ${handoff.id}; it is already taken for you):`,
  handoff.ask,
  handoff.context?.title && `They were in: ${handoff.context.title}${handoff.context.kind ? ` (${handoff.context.kind} ${handoff.context.id})` : ''}`,
  handoff.context?.excerpt && `The passage they were in:\n${handoff.context.excerpt}`,
  'Start with brief on it. Do the work with the Noeis tools; everything you write lands in pencil until they ink it.',
  `When you are done, call finish_handoff with handoffId ${handoff.id}: what you did, what is still open, and what you would do next.`
].filter(Boolean).join('\n\n');

export const workHandoffs = async ({ client, runtime, run = spawnSync, env = process.env, log = () => {} }) => {
  const launch = LAUNCH[runtime];
  if (!launch) throw new Error(`noeis work runs ${Object.keys(LAUNCH).join(' or ')}.`);
  const { handoffs } = await client.request('/api/handoffs', { query: { status: 'waiting' } });
  let worked = 0;
  for (const waiting of handoffs.filter(handoff => !handoff.from)) {
    let handoff;
    try {
      handoff = await client.request(`/api/handoffs/${waiting.id}/take`, { method: 'POST', body: {} });
    } catch (error) {
      if (error.status === 409) continue;
      throw error;
    }
    log(`Working "${handoff.ask}" with ${runtime}.`);
    const [command, args] = launch(promptFor(handoff));
    const result = run(command, args, { env, encoding: 'utf8', timeout: TIME_LIMIT_MS });
    const { status } = await client.request(`/api/handoffs/${handoff.id}`);
    if (status === 'taken') {
      const said = String(result.stdout || '').trim().slice(-2000);
      await client.request(`/api/handoffs/${handoff.id}/finish`, {
        method: 'POST',
        body: result.error || result.status !== 0
          ? { did: `Stopped: ${result.error?.code === 'ETIMEDOUT' ? 'out of time' : result.error?.message || `${command} exited ${result.status}`}.`, open: said || 'The work is unfinished; what was written is in pencil.' }
          : { did: said || `${command} finished without a word.` }
      });
    }
    worked += 1;
  }
  return worked;
};
