/* What an agent is shown. Every tool stays callable; only `core` is listed
   unless the runtime asks for more, because each listed tool costs the
   agent context on every turn and a long list makes it pick the wrong one.

   core      brief, recall, read, handoffs, save, write, keep a paper: what most agents need
   library   articles, highlights, folders, piles
   think     notebook, concepts, questions
   wiki      pages, sources, proposals, maintenance, schema
   editions  edition profiles and issues
   work      the private work notebook (needs a connection approved for Work)
   all       everything */
export const CORE_TOOLS = Object.freeze([
  'connection_info', 'brief', 'recall', 'read',
  'take_handoff', 'finish_handoff', 'hand_off', 'cite',
  'list_pages', 'get_page_markdown', 'create_page',
  'create_article', 'create_highlight',
  'create_notebook_entry', 'update_notebook_entry',
  'list_edition_profiles', 'file_edition_items'
]);

export const TOOLSETS = Object.freeze(['core', 'library', 'think', 'wiki', 'editions', 'work', 'all']);

const core = new Set(CORE_TOOLS);

export const toolsetOf = (name) => {
  if (core.has(name)) return 'core';
  if (/work/.test(name)) return 'work';
  if (/edition/.test(name)) return 'editions';
  if (/article|highlight|folder|source_thought/.test(name)) return 'library';
  if (/notebook|concept|question/.test(name)) return 'think';
  return 'wiki';
};

/* "core,wiki", ["wiki"] or nothing. Core is always in; an unknown name is
   an error rather than a silently smaller list. */
export const parseToolsets = (value) => {
  const names = (Array.isArray(value) ? value : String(value || '').split(','))
    .map(name => String(name).trim().toLowerCase())
    .filter(Boolean);
  const unknown = names.filter(name => !TOOLSETS.includes(name));
  if (unknown.length) throw new Error(`Unknown Noeis toolset: ${unknown.join(', ')}. Choose from ${TOOLSETS.join(', ')}.`);
  return new Set(['core', ...names]);
};

export const listedTools = (tools, sets) => (
  sets.has('all') ? tools : tools.filter(tool => sets.has(toolsetOf(tool.name)))
);
