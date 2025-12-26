import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { loadConfig } from './config.js';
import { createSentiment402McpServer } from './server.js';

async function main() {
  const config = loadConfig();
  const server = createSentiment402McpServer(config);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  // Avoid logging environment values; keep errors concise.
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

