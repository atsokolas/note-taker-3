import { z } from 'zod';

const notImplemented = (name) => async () => ({
  status: 'not_implemented',
  message: `${name} is reserved for the AT-43 write-tool surface. Use the Noeis web app or direct API until that slice lands.`
});

export const writeTools = [
  {
    name: 'create_page',
    description: 'Reserved write tool: create a wiki page. Requires agent-write scope when implemented.',
    inputSchema: {
      title: z.string(),
      pageType: z.string().optional(),
      body: z.record(z.any()).optional()
    },
    handler: notImplemented('create_page')
  },
  {
    name: 'update_page',
    description: 'Reserved write tool: update title/body/type/status/visibility. Requires agent-write scope when implemented.',
    inputSchema: {
      pageId: z.string(),
      title: z.string().optional(),
      body: z.record(z.any()).optional(),
      pageType: z.string().optional(),
      status: z.string().optional(),
      visibility: z.string().optional()
    },
    handler: notImplemented('update_page')
  },
  {
    name: 'archive_page',
    description: 'Reserved write tool: archive a wiki page. Requires agent-write scope when implemented.',
    inputSchema: {
      pageId: z.string()
    },
    handler: notImplemented('archive_page')
  },
  {
    name: 'ingest_source',
    description: 'Reserved write tool: ingest a URL, text source, or object id into the wiki. Requires agent-write scope when implemented.',
    inputSchema: {
      source: z.record(z.any())
    },
    handler: notImplemented('ingest_source')
  },
  {
    name: 'draft_page',
    description: 'Reserved write tool: run wiki maintenance/drafting on a page. Requires agent-write scope when implemented.',
    inputSchema: {
      pageId: z.string()
    },
    handler: notImplemented('draft_page')
  },
  {
    name: 'ask_page',
    description: 'Reserved write tool: ask a page-scoped question and append the answer. Requires agent-write scope when implemented.',
    inputSchema: {
      pageId: z.string(),
      question: z.string()
    },
    handler: notImplemented('ask_page')
  }
];
