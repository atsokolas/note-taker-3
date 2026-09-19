const DEFAULT_API_URL = 'https://note-taker-3-unrg.onrender.com';
const DEFAULT_APP_URL = 'https://www.noeis.io';

const trimSlash = (value = '') => String(value || '').replace(/\/+$/g, '');

const errorSchema = {
  type: 'object',
  properties: {
    error: { type: 'string' }
  }
};

const itemTypeSchema = {
  type: 'string',
  enum: ['notebook', 'library', 'concept', 'judgment'],
  description: 'Noeis surface. notebook = Think Notebook notes; library = saved reading; concept = Think concept; judgment = a held Judgment page.'
};

const hitSchema = {
  type: 'object',
  properties: {
    type: itemTypeSchema,
    id: { type: 'string' },
    title: { type: 'string' },
    snippet: { type: 'string' },
    href: { type: 'string', description: 'Path on the Noeis app, e.g. /think?tab=notebook&entryId=…' },
    openUrl: { type: 'string', format: 'uri', description: 'Absolute URL on the Noeis app.' },
    updatedAt: { type: 'string', format: 'date-time', nullable: true }
  }
};

const buildMuseOpenApiSpec = ({ apiUrl = DEFAULT_API_URL, appUrl = DEFAULT_APP_URL } = {}) => {
  const serverUrl = trimSlash(apiUrl || DEFAULT_API_URL);
  const siteUrl = trimSlash(appUrl || DEFAULT_APP_URL);
  return {
    openapi: '3.0.3',
    info: {
      title: 'Noeis Muse Connector',
      version: '1.0.0',
      description: [
        'HTTP API for Meta Muse custom connectors.',
        'Authenticate with a Noeis Connected-agents token as `Authorization: Bearer ntk_at_…`.',
        'Do not use an OAuth browser flow.',
        `Human docs: ${serverUrl}/api/v1/docs`,
        `App: ${siteUrl}`,
        'read scope covers GET. Creating a capture requires agent-write.'
      ].join(' ')
    },
    servers: [
      { url: serverUrl, description: 'Noeis API' }
    ],
    tags: [
      { name: 'Auth', description: 'Credential verification' },
      { name: 'Search', description: 'Find notes, reading, concepts, and judgments' },
      { name: 'Items', description: 'Open one object by id' },
      { name: 'Capture', description: 'Write a quick Notebook note' }
    ],
    security: [{ bearerAuth: [] }],
    paths: {
      '/api/v1/me': {
        get: {
          operationId: 'getMe',
          tags: ['Auth'],
          summary: 'Who am I',
          description: 'Verify this Bearer token. Returns workspace identity and granted scopes without reading notes, library, concepts, or judgments.',
          responses: {
            200: {
              description: 'Authenticated workspace and grant',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      format: { type: 'string', example: 'noeis.muse-connector' },
                      workspace: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          label: { type: 'string' },
                          username: { type: 'string' }
                        }
                      },
                      grant: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', nullable: true },
                          label: { type: 'string' },
                          scopes: { type: 'array', items: { type: 'string' } },
                          status: { type: 'string' }
                        }
                      },
                      capabilities: {
                        type: 'object',
                        properties: {
                          read: { type: 'boolean' },
                          agentWrite: { type: 'boolean' }
                        }
                      }
                    }
                  }
                }
              }
            },
            401: { description: 'Missing or invalid token', content: { 'application/json': { schema: errorSchema } } }
          }
        }
      },
      '/api/v1/search': {
        get: {
          operationId: 'searchWorkspace',
          tags: ['Search'],
          summary: 'Search notes, library, concepts, and judgments',
          description: 'Search the signed-in workspace. Use this when the user asks to find a note, article, concept, or judgment. Pass types to narrow: notebook, library, concept, judgment.',
          parameters: [
            {
              name: 'q',
              in: 'query',
              required: true,
              schema: { type: 'string' },
              description: 'Search query.'
            },
            {
              name: 'types',
              in: 'query',
              required: false,
              schema: { type: 'string' },
              description: 'Comma-separated types: notebook, library, concept, judgment. Aliases: notes, reading, articles, think.'
            },
            {
              name: 'limit',
              in: 'query',
              required: false,
              schema: { type: 'integer', minimum: 1, maximum: 50, default: 10 }
            }
          ],
          responses: {
            200: {
              description: 'Ranked hits',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      query: { type: 'string' },
                      types: { type: 'array', items: itemTypeSchema },
                      hits: { type: 'array', items: hitSchema }
                    }
                  }
                }
              }
            },
            400: { description: 'Missing query', content: { 'application/json': { schema: errorSchema } } },
            401: { description: 'Unauthorized', content: { 'application/json': { schema: errorSchema } } }
          }
        }
      },
      '/api/v1/recent': {
        get: {
          operationId: 'listRecent',
          tags: ['Search'],
          summary: 'List recent notes and reading',
          description: 'Newest Notebook notes, Library articles, Think concepts, and Judgments. Use this for “what did I read lately” or “recent notes” when there is no search query.',
          parameters: [
            {
              name: 'types',
              in: 'query',
              required: false,
              schema: { type: 'string' },
              description: 'Comma-separated types: notebook, library, concept, judgment.'
            },
            {
              name: 'limit',
              in: 'query',
              required: false,
              schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 }
            }
          ],
          responses: {
            200: {
              description: 'Recent items grouped by type',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      types: { type: 'array', items: itemTypeSchema },
                      items: { type: 'array', items: hitSchema }
                    }
                  }
                }
              }
            },
            401: { description: 'Unauthorized', content: { 'application/json': { schema: errorSchema } } }
          }
        }
      },
      '/api/v1/notebook/{id}': {
        get: {
          operationId: 'getNotebookEntry',
          tags: ['Items'],
          summary: 'Get a Notebook note',
          description: 'Open one Think Notebook note by id. These are the reader’s own notes, not Library articles.',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
          ],
          responses: {
            200: { description: 'Notebook note', content: { 'application/json': { schema: { type: 'object' } } } },
            404: { description: 'Not found', content: { 'application/json': { schema: errorSchema } } }
          }
        }
      },
      '/api/v1/library/{id}': {
        get: {
          operationId: 'getLibraryArticle',
          tags: ['Items'],
          summary: 'Get a Library article',
          description: 'Open one saved Library article (recent reading) by id, including a text excerpt.',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
          ],
          responses: {
            200: { description: 'Library article', content: { 'application/json': { schema: { type: 'object' } } } },
            404: { description: 'Not found', content: { 'application/json': { schema: errorSchema } } }
          }
        }
      },
      '/api/v1/concepts/{idOrName}': {
        get: {
          operationId: 'getConcept',
          tags: ['Items'],
          summary: 'Get a Think concept',
          description: 'Open one Think concept by Mongo id or exact name.',
          parameters: [
            { name: 'idOrName', in: 'path', required: true, schema: { type: 'string' } }
          ],
          responses: {
            200: { description: 'Concept', content: { 'application/json': { schema: { type: 'object' } } } },
            404: { description: 'Not found', content: { 'application/json': { schema: errorSchema } } }
          }
        }
      },
      '/api/v1/judgments/{id}': {
        get: {
          operationId: 'getJudgment',
          tags: ['Items'],
          summary: 'Get a Judgment',
          description: 'Open one held Judgment (wiki page with a current judgment or kind) by page id. Returns the held sentence, governing question, and why/against lines — not the full wiki body.',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
          ],
          responses: {
            200: { description: 'Judgment', content: { 'application/json': { schema: { type: 'object' } } } },
            404: { description: 'Not found', content: { 'application/json': { schema: errorSchema } } }
          }
        }
      },
      '/api/v1/captures': {
        post: {
          operationId: 'createCapture',
          tags: ['Capture'],
          summary: 'Create a quick Notebook capture',
          description: 'Write a new Think Notebook note. Requires agent-write scope. Use this when the user asks to capture, jot, or save a thought into Noeis.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    content: { type: 'string', description: 'Note body. Aliases: text, note, body.' },
                    tags: { type: 'array', items: { type: 'string' } }
                  }
                }
              }
            }
          },
          responses: {
            201: { description: 'Created notebook note', content: { 'application/json': { schema: { type: 'object' } } } },
            400: { description: 'Missing content', content: { 'application/json': { schema: errorSchema } } },
            403: { description: 'Token lacks agent-write', content: { 'application/json': { schema: errorSchema } } }
          }
        }
      }
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'ntk_at_',
          description: 'Noeis Connected-agents token. Create under Connections → Connected agents. Shown once; stored hashed. Send as Authorization: Bearer ntk_at_…'
        }
      }
    }
  };
};

module.exports = {
  DEFAULT_API_URL,
  DEFAULT_APP_URL,
  buildMuseOpenApiSpec
};
