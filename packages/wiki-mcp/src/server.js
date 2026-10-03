import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js';

import { NoeisApiError, NoeisClient } from './client.js';
import { DEFAULT_API_URL, resolveConfigPath } from './config.js';
import { readTools } from './tools/read.js';
import { writeTools } from './tools/write.js';
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
  'file_edition_items',
  'create_folder', 'create_highlight', 'write_concept_note', 'create_notebook_entry',
  'add_highlight_to_notebook_entry', 'create_notebook_folder', 'create_question',
  'pin_highlight_to_concept', 'create_page', 'create_judgment_page'
]);
const externalTools = new Set(['create_article', 'ingest_source', 'draft_page', 'add_source']);

export const toolMetadata = (tool) => {
  const writes = writeNames.has(tool.name);
  const securitySchemes = [{ type: 'oauth2', scopes: [writes ? 'agent-write' : 'read'] }];
  return {
    description: tool.description,
    inputSchema: tool.inputSchema,
    ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
    annotations: {
      readOnlyHint: !writes,
      destructiveHint: writes && !nonDestructiveWrites.has(tool.name),
      idempotentHint: !writes || ['file_edition_items', 'configure_edition'].includes(tool.name),
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

export const createMcpServer = ({ client, token, apiUrl, grantedScopes, resourceMetadataUrl } = {}) => {
  const resolvedClient = client || new NoeisClient({ token, apiUrl });
  const server = new McpServer(SERVER_INFO);

  for (const tool of toolDefinitions) {
    server.registerTool(
      tool.name,
      toolMetadata(tool),
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
          const result = await tool.handler(resolvedClient, args);
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
    tools: toolDefinitions.map(tool => {
      const metadata = toolMetadata(tool);
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
