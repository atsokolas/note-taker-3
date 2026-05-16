import { z } from 'zod';

const pageTypes = ['topic', 'concept', 'entity', 'source', 'question', 'comparison', 'overview', 'project', 'log'];
const statuses = ['draft', 'published', 'archived'];
const visibilities = ['private', 'shared'];

const optionalEnum = (values) => z.enum(values).optional();
const pageIdShape = {
  pageId: z.string().describe('Noeis wiki page id.')
};

export const readTools = [
  {
    name: 'list_pages',
    description: 'Find candidate wiki pages to inspect. Returns lightweight page rows with id, title, pageType, slug, and updatedAt.',
    inputSchema: {
      q: z.string().optional().describe('Optional title/body search query.'),
      status: optionalEnum(statuses),
      visibility: optionalEnum(visibilities),
      pageType: optionalEnum(pageTypes),
      limit: z.number().min(1).max(500).optional().default(100)
    },
    handler: (client, args) => client.listPages(args)
  },
  {
    name: 'get_page',
    description: 'Read one full wiki page, including body text, source references, claims, and infobox metadata.',
    inputSchema: pageIdShape,
    handler: (client, args) => client.getPage(args)
  },
  {
    name: 'get_page_markdown',
    description: 'Get a wiki page rendered as Markdown.',
    inputSchema: pageIdShape,
    handler: (client, args) => client.getPageMarkdown(args)
  },
  {
    name: 'search_pages',
    description: 'Search wiki pages by title and body text. Returns page hits with short snippets for choosing what to read next.',
    inputSchema: {
      query: z.string().describe('Search query.'),
      limit: z.number().min(1).max(100).optional().default(20),
      pageType: optionalEnum(pageTypes),
      status: optionalEnum(statuses),
      visibility: optionalEnum(visibilities)
    },
    handler: (client, args) => client.searchPages(args)
  },
  {
    name: 'get_schema',
    description: 'Read the current wiki schema so you can follow the user-defined page taxonomy and structure.',
    inputSchema: {},
    handler: (client) => client.getSchema()
  },
  {
    name: 'get_briefing',
    description: 'Read the current wiki briefing: recent updates, drift, and page counts.',
    inputSchema: {},
    handler: (client) => client.getBriefing()
  },
  {
    name: 'list_sources',
    description: 'List source references attached to a wiki page.',
    inputSchema: pageIdShape,
    handler: (client, args) => client.listSources(args)
  },
  {
    name: 'list_backlinks',
    description: 'List pages that mention or link to the selected wiki page.',
    inputSchema: pageIdShape,
    handler: (client, args) => client.listBacklinks(args)
  },
  {
    name: 'list_activity',
    description: 'List recent wiki-wide activity events, optionally bounded to events since an ISO timestamp.',
    inputSchema: {
      limit: z.number().min(1).max(100).optional().default(50),
      since: z.string().optional().describe('Optional ISO timestamp or date; only events at or after this time are returned.')
    },
    handler: (client, args) => client.listActivity(args)
  },
  {
    name: 'list_revisions',
    description: 'List revision history for a wiki page.',
    inputSchema: {
      ...pageIdShape,
      limit: z.number().min(1).max(100).optional().default(50)
    },
    handler: (client, args) => client.listRevisions(args)
  },
  {
    name: 'list_source_events',
    description: 'List source events that feed wiki maintenance.',
    inputSchema: {
      status: optionalEnum(['pending', 'processing', 'processed', 'failed', 'ignored']),
      limit: z.number().min(1).max(100).optional().default(50)
    },
    handler: (client, args) => client.listSourceEvents(args)
  },
  {
    name: 'get_ingest_run',
    description: 'Get an ingest run and its timeline.',
    inputSchema: {
      runId: z.string().describe('Wiki ingest run id.')
    },
    handler: (client, args) => client.getIngestRun(args)
  },
  {
    name: 'list_proposals',
    description: 'List proposed emerging wiki pages.',
    inputSchema: {},
    handler: (client) => client.listProposals()
  },
  {
    name: 'list_autolinks',
    description: 'List pages the selected wiki page mentions through inline wiki links or autolink suggestions.',
    inputSchema: pageIdShape,
    handler: (client, args) => client.listAutolinks(args)
  },
  {
    name: 'get_lint_run',
    description: 'Get a wiki lint run by id.',
    inputSchema: {
      runId: z.string().describe('Wiki lint run id.')
    },
    handler: (client, args) => client.getLintRun(args)
  }
];
