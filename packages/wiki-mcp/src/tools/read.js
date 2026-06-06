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
  },
  {
    name: 'search_articles',
    description: 'Search the user library for saved articles. Use this before fetching article detail or article highlights.',
    inputSchema: {
      query: z.string().optional().describe('Optional title, URL, or site search query.'),
      scope: optionalEnum(['all', 'unfiled', 'folder']),
      folderId: z.string().optional(),
      sort: optionalEnum(['recent', 'oldest', 'most-highlighted']),
      limit: z.number().min(1).max(100).optional().default(20)
    },
    handler: (client, args) => client.searchArticles(args)
  },
  {
    name: 'get_article',
    description: 'Read one saved library article including content and embedded highlights.',
    inputSchema: {
      articleId: z.string().describe('Library article id.')
    },
    handler: (client, args) => client.getArticle(args)
  },
  {
    name: 'list_article_highlights',
    description: 'List highlights attached to one saved article.',
    inputSchema: {
      articleId: z.string().describe('Library article id.')
    },
    handler: (client, args) => client.listArticleHighlights(args)
  },
  {
    name: 'search_highlights',
    description: 'Search saved highlights by text, note, tag, or article title. Use this for requests like "fetch my highlight about X".',
    inputSchema: {
      query: z.string().optional().describe('Highlight text/note/tag/article-title query.'),
      tag: z.string().optional(),
      articleId: z.string().optional(),
      folderId: z.string().optional(),
      limit: z.number().min(1).max(100).optional().default(20)
    },
    handler: (client, args) => client.searchHighlights(args)
  },
  {
    name: 'get_highlight',
    description: 'Read one saved highlight by id. Returns null when the highlight cannot be found.',
    inputSchema: {
      highlightId: z.string().describe('Highlight id.')
    },
    handler: (client, args) => client.getHighlight(args)
  },
  {
    name: 'list_questions',
    description: 'List Think questions, optionally scoped by status, concept, highlight, or notebook entry.',
    inputSchema: {
      status: optionalEnum(['open', 'answered']),
      tag: z.string().optional(),
      conceptName: z.string().optional(),
      highlightId: z.string().optional(),
      notebookEntryId: z.string().optional()
    },
    handler: (client, args) => client.listQuestions(args)
  },
  {
    name: 'get_question',
    description: 'Read one Think question by id.',
    inputSchema: {
      questionId: z.string().describe('Question id.')
    },
    handler: (client, args) => client.getQuestion(args)
  },
  {
    name: 'list_concepts',
    description: 'List Think concepts and their current metadata.',
    inputSchema: {},
    handler: (client) => client.listConcepts()
  },
  {
    name: 'get_concept',
    description: 'Read one Think concept by name.',
    inputSchema: {
      name: z.string().describe('Concept name.')
    },
    handler: (client, args) => client.getConcept(args)
  }
];
