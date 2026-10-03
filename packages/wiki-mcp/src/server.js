import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js';

import { NoeisApiError, NoeisClient } from './client.js';
import { DEFAULT_API_URL, resolveConfigPath } from './config.js';
import { readTools } from './tools/read.js';
import { writeTools } from './tools/write.js';
import chatgptAccessPolicy from './chatgptAccessPolicy.cjs';
const { CHATGPT_ACCESS_PROFILE, isChatgptToolAllowed } = chatgptAccessPolicy;
import { renderWikiSchemaPrompt, wikiSchemaPrompt } from './prompts/wiki_schema.js';

export const SERVER_INFO = {
  name: 'noeis-wiki',
  version: '0.3.0'
};

const profileTool = {
  name: 'get_profile',
  description: 'Identify the NOEIS account represented by this connection. The opaque profile id is stable across reconnects and contains no email or display name.',
  inputSchema: {},
  outputSchema: { id: z.string().min(1).regex(/\S/), nickname: z.string().optional() },
  _meta: { 'openai/profile': true },
  handler: async (client) => {
    const connection = await client.getConnectionInfo();
    const id = String(connection?.workspace?.id || '');
    if (!id.trim()) throw new Error('NOEIS did not return an authenticated account identity. Reconnect.');
    return { id, nickname: connection.workspace.label || 'NOEIS workspace' };
  }
};

export const toolDefinitions = [profileTool, ...readTools, ...writeTools];

const writeNames = new Set(writeTools.map(tool => tool.name));
const nonDestructiveWrites = new Set([
  'file_edition_items', 'save_source_thought',
  'create_folder', 'create_highlight', 'write_concept_note', 'create_notebook_entry',
  'add_highlight_to_notebook_entry', 'create_notebook_folder', 'create_question',
  'pin_highlight_to_concept', 'create_page', 'create_judgment_page'
]);
const externalTools = new Set(['create_article', 'ingest_source', 'draft_page', 'add_source']);

const chatgptDescriptions = {
  ingest_source: 'Prepare sourced Wiki research for human review. Existing accepted wording remains unchanged. Read get_ingest_run and any candidate or limitations before claiming completion. An unmatched source stays unclaimed; ask the reader to create its page in NOEIS.',
  draft_page: 'Prepare a candidate refresh of an owned Wiki page from its current sources. The accepted head remains unchanged. Read the candidate and let the reader accept or reject it in NOEIS.',
  add_source: 'Attach an additional source to an owned Wiki page without replacing its accepted wording. Candidate preparation and human acceptance are separate steps.'
};

// These outcomes describe preparation, never adoption of accepted knowledge.
// Return a copy: legacy callers may share the API result with this connection.
const chatgptIngestResult = result => {
  if (!result || typeof result !== 'object') return result;
  let nextStep;
  if (['pending', 'processing'].includes(result.status)) {
    nextStep = `Research preparation is still processing. Check get_ingest_run slowly${result.runId ? ` with runId ${result.runId}` : ''}; no accepted change is confirmed.`;
  } else if (result.status === 'failed') {
    nextStep = 'Research preparation failed. Inspect the returned error before retrying; no accepted change is confirmed.';
  } else if (result.suggestedCreatePage) {
    nextStep = 'No existing page claimed this source. Ask the reader to create a page in NOEIS; this connection cannot create or accept a knowledge page.';
  } else if (result.status === 'ignored') {
    nextStep = 'No accepted change is confirmed. Read list_proposals to see whether this source produced a proposal; the reader reviews next steps in NOEIS.';
  } else {
    nextStep = 'Research preparation settled. Read the affected pages and get_research_candidate where available; proposed wording remains pending human review and acceptance in NOEIS.';
  }
  return { ...result, nextStep };
};

export const toolMetadata = (tool, accessProfile) => {
  const writes = writeNames.has(tool.name);
  const securitySchemes = [{ type: 'oauth2', scopes: [writes ? 'agent-write' : 'read'] }];
  return {
    description: accessProfile === CHATGPT_ACCESS_PROFILE ? (chatgptDescriptions[tool.name] || tool.description) : tool.description,
    inputSchema: tool.inputSchema,
    ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
    annotations: {
      readOnlyHint: !writes,
      destructiveHint: writes && !nonDestructiveWrites.has(tool.name),
      idempotentHint: !writes || ['file_edition_items', 'configure_edition', 'save_source_thought'].includes(tool.name),
      openWorldHint: externalTools.has(tool.name)
    },
    _meta: { ...tool._meta, securitySchemes }
  };
};

const textContent = (value) => ({
  content: [
    {
      type: 'text',
      text: typeof value === 'string' ? value : JSON.stringify(value, null, 2)
    }
  ]
});

const errorContent = (error) => ({
  isError: true,
  content: [
    {
      type: 'text',
      text: error instanceof NoeisApiError
        ? JSON.stringify({
          error: error.message,
          status: error.status,
          retryAfter: error.retryAfter,
          body: error.body
        }, null, 2)
        : String(error?.message || error)
    }
  ]
});

export const createMcpServer = ({ client, token, apiUrl, appUrl, grantedScopes, accessProfile, resourceMetadataUrl } = {}) => {
  const resolvedClient = client || new NoeisClient({ token, apiUrl, appUrl });
  const server = new McpServer(SERVER_INFO);

  const exposedTools = accessProfile === CHATGPT_ACCESS_PROFILE
    ? toolDefinitions.filter(tool => isChatgptToolAllowed(tool.name))
    : toolDefinitions;

  for (const tool of exposedTools) {
    server.registerTool(
      tool.name,
      toolMetadata(tool, accessProfile),
      async (args = {}) => {
        const scope = writeNames.has(tool.name) ? 'agent-write' : 'read';
        if (grantedScopes && !grantedScopes.includes(scope) && !(scope === 'read' && grantedScopes.includes('agent-write'))) {
          return {
            isError: true,
            content: [{ type: 'text', text: `This connection requires ${scope} permission for ${tool.name}. Nothing was changed. Reconnect with the reader's approval.` }],
            ...(resourceMetadataUrl ? { _meta: { 'mcp/www_authenticate': [`Bearer resource_metadata="${resourceMetadataUrl}", error="insufficient_scope", scope="${scope}"`] } } : {})
          };
        }
        try {
          const rawResult = await tool.handler(resolvedClient, args);
          const result = accessProfile === CHATGPT_ACCESS_PROFILE && ['ingest_source', 'get_ingest_run'].includes(tool.name)
            ? chatgptIngestResult(rawResult) : rawResult;
          return { ...textContent(result), ...(tool.outputSchema ? { structuredContent: result } : {}) };
        } catch (error) {
          const result = errorContent(error);
          if (resourceMetadataUrl && error instanceof NoeisApiError && [401, 403].includes(error.status)) {
            result._meta = { 'mcp/www_authenticate': [`Bearer resource_metadata="${resourceMetadataUrl}", scope="${scope}"`] };
          }
          return result;
        }
      }
    );
  }

  server.registerPrompt(
    wikiSchemaPrompt.name,
    {
      description: wikiSchemaPrompt.description
    },
    async () => renderWikiSchemaPrompt(resolvedClient)
  );

  // SDK 1.29 retains OAuth schemes only inside _meta. Publish both placements
  // required by the host, while keeping SDK validation and dispatch unchanged.
  server.server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: exposedTools.map(tool => {
      const metadata = toolMetadata(tool, accessProfile);
      return {
        name: tool.name,
        description: metadata.description,
        inputSchema: toJsonSchemaCompat(z.object(tool.inputSchema)),
        ...(tool.outputSchema ? { outputSchema: toJsonSchemaCompat(z.object(tool.outputSchema)) } : {}),
        annotations: metadata.annotations,
        securitySchemes: metadata._meta.securitySchemes,
        _meta: metadata._meta
      };
    })
  }));

  return server;
};

const printHelp = () => {
  process.stdout.write(`Noeis Wiki MCP\n\n`);
  process.stdout.write(`Usage: noeis-wiki-mcp\n\n`);
  process.stdout.write(`Environment:\n`);
  process.stdout.write(`  NOEIS_TOKEN       Agent token from Noeis Settings -> Connected agents\n`);
  process.stdout.write(`  NOEIS_API_URL     Optional API URL, defaults to ${DEFAULT_API_URL}\n`);
  process.stdout.write(`  NOEIS_CONFIG_DIR  Optional config directory, defaults to ~/.config/noeis\n\n`);
  process.stdout.write(`Without NOEIS_TOKEN, both are read from ${resolveConfigPath()},\n`);
  process.stdout.write(`which \`noeis login --token ntk_at_...\` writes.\n\n`);
};

export const main = async (argv = []) => {
  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    return;
  }
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
};
