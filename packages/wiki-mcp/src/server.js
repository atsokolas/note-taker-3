import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { DEFAULT_API_URL, NoeisApiError, NoeisClient } from './client.js';
import { readTools } from './tools/read.js';
import { writeTools } from './tools/write.js';
import { renderWikiSchemaPrompt, wikiSchemaPrompt } from './prompts/wiki_schema.js';

export const SERVER_INFO = {
  name: 'noeis-wiki',
  version: '0.1.1'
};

export const toolDefinitions = [...readTools, ...writeTools];

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

export const createMcpServer = ({ client = new NoeisClient() } = {}) => {
  const server = new McpServer(SERVER_INFO);

  for (const tool of toolDefinitions) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema
      },
      async (args = {}) => {
        try {
          const result = await tool.handler(client, args);
          return textContent(result);
        } catch (error) {
          return errorContent(error);
        }
      }
    );
  }

  server.registerPrompt(
    wikiSchemaPrompt.name,
    {
      description: wikiSchemaPrompt.description
    },
    async () => renderWikiSchemaPrompt(client)
  );

  return server;
};

const printHelp = () => {
  process.stdout.write(`Noeis Wiki MCP\n\n`);
  process.stdout.write(`Usage: noeis-wiki-mcp\n\n`);
  process.stdout.write(`Environment:\n`);
  process.stdout.write(`  NOEIS_TOKEN    Required agent token from Noeis Settings -> Connected agents\n`);
  process.stdout.write(`  NOEIS_API_URL  Optional API URL, defaults to ${DEFAULT_API_URL}\n\n`);
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
