/* This policy is shared by REST bearer authentication and MCP discovery.
 * OAuth provenance is established by the persisted token family, never by a
 * caller-supplied runtime or tool argument. Legacy connected agents keep their
 * existing capabilities. New routes/tools fail closed for ChatGPT. */
const CHATGPT_ACCESS_PROFILE = 'chatgpt';
const CHATGPT_READ_TOOLS = Object.freeze([
  'get_profile', 'connection_info', 'list_edition_profiles', 'list_editions', 'get_edition',
  'list_pages', 'list_judgment_pages', 'get_page', 'get_page_markdown', 'search_pages',
  'get_schema', 'get_briefing', 'list_sources', 'list_backlinks', 'list_activity',
  'list_revisions', 'list_source_events', 'get_ingest_run', 'list_proposals',
  'list_autolinks', 'get_lint_run', 'list_folders', 'search_articles', 'get_article',
  'list_article_highlights', 'search_highlights', 'get_highlight', 'get_source_thought_context',
  'get_research_candidate', 'list_questions', 'get_question', 'list_concepts', 'get_concept',
  'list_concept_notes', 'list_notebook_entries', 'get_notebook_entry', 'list_notebook_folders'
]);
const CHATGPT_WRITE_TOOLS = Object.freeze([
  'save_source_thought', 'file_edition_items', 'ingest_source', 'draft_page', 'add_source'
]);
const tools = new Set([...CHATGPT_READ_TOOLS, ...CHATGPT_WRITE_TOOLS]);
const readPaths = [
  /^\/api\/agent-connection$/,
  /^\/api\/(?:articles|folders|highlights|questions|concepts|notebook|edition-profiles|editions)$/,
  /^\/articles\/[^/]+$/,
  /^\/api\/articles\/[^/]+\/highlights$/,
  /^\/api\/(?:highlights|questions|notebook|editions)\/[^/]+$/,
  /^\/api\/notebook\/folders$/,
  /^\/api\/concepts\/[^/]+(?:\/notes)?$/,
  /^\/api\/wiki\/(?:pages|schema|briefing|activity|source-events|proposals)$/,
  /^\/api\/wiki\/(?:ingest|lint)\/[^/]+$/,
  /^\/api\/wiki\/pages\/[^/]+(?:\/(?:markdown|backlinks|revisions|autolinks|research-candidate))?$/
];
const writePaths = [
  /^\/articles\/[^/]+\/highlights\/[^/]+\/thoughts$/,
  /^\/api\/editions\/file$/,
  /^\/api\/wiki\/ingest$/,
  /^\/api\/wiki\/pages\/[^/]+\/(?:sources|ai\/draft)$/
];
const isChatgptToolAllowed = name => tools.has(name);
const isChatgptRequestAllowed = req => {
  const method = String(req.method || 'GET').toUpperCase();
  const path = String(req.originalUrl || req.path || req.url || '').split('?')[0];
  // MCP is only an envelope. Every tool's inner REST request is checked again.
  if (method === 'POST' && path === '/mcp') return true;
  if (method === 'GET' || method === 'HEAD') return readPaths.some(pattern => pattern.test(path));
  return method === 'POST' && writePaths.some(pattern => pattern.test(path));
};
module.exports = { CHATGPT_ACCESS_PROFILE, CHATGPT_READ_TOOLS, CHATGPT_WRITE_TOOLS, isChatgptToolAllowed, isChatgptRequestAllowed };
