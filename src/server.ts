import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { TtlCache } from './cache.js';
import type { McpAdapterConfig } from './config.js';
import { fetchJsonWith402Handling } from './http.js';
import { createX402PaymentClient } from './x402.js';

type SnapshotQuery = {
  version?: 'v1' | 'v2';
  format?: 'full' | 'compact_trading';
  fields?: string;
};

const snapshotQuerySchema = z
  .object({
    version: z.enum(['v1', 'v2']).optional(),
    format: z.enum(['full', 'compact_trading']).optional(),
    fields: z.string().optional(),
  })
  .strict();

const assetQuerySchema = snapshotQuerySchema.extend({
  symbol: z.string().min(1),
});

function buildSnapshotUrl(config: McpAdapterConfig, path: string, query?: SnapshotQuery): URL {
  const version = query?.version ?? config.SENTIMENT402_API_VERSION;
  const url = new URL(`/${version}${path}`, config.SENTIMENT402_API_BASE_URL);

  if (query?.format) url.searchParams.set('format', query.format);
  if (query?.fields) url.searchParams.set('fields', query.fields);

  return url;
}

export function createSentiment402McpServer(config: McpAdapterConfig) {
  const server = new McpServer({
    name: '@sentiment402/mcp-adapter',
    version: '0.1.0',
  });

  const cache = new TtlCache<unknown>(config.SENTIMENT402_CACHE_TTL_MS);
  const paymentClient = createX402PaymentClient(config);

  const toToolResponse = (payload: unknown) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
  });

  async function callSnapshotTool(toolId: string, url: URL) {
    const cacheKey = `${toolId}:${url.pathname}?${url.searchParams.toString()}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return toToolResponse(cached);
    }

    const result = await fetchJsonWith402Handling({
      url,
      userAgent: config.SENTIMENT402_USER_AGENT,
      paymentClient,
    });
    if (!result.ok) {
      return toToolResponse(result.paymentRequired);
    }

    cache.set(cacheKey, result.json);
    return toToolResponse(result.json);
  }

  server.registerTool(
    'get_global_snapshot',
    {
      description: 'Get the global market sentiment snapshot',
      inputSchema: snapshotQuerySchema.shape as any,
    },
    async (args: SnapshotQuery) => {
      const parsed = snapshotQuerySchema.parse(args ?? {});
      return callSnapshotTool('get_global_snapshot', buildSnapshotUrl(config, '/snapshot/global', parsed));
    }
  );

  server.registerTool(
    'get_crypto_pulse',
    {
      description: 'Get crypto market sentiment pulse',
      inputSchema: snapshotQuerySchema.shape as any,
    },
    async (args: SnapshotQuery) => {
      const parsed = snapshotQuerySchema.parse(args ?? {});
      return callSnapshotTool('get_crypto_pulse', buildSnapshotUrl(config, '/snapshot/crypto', parsed));
    }
  );

  server.registerTool(
    'get_tradfi_pulse',
    {
      description: 'Get TradFi market sentiment pulse',
      inputSchema: snapshotQuerySchema.shape as any,
    },
    async (args: SnapshotQuery) => {
      const parsed = snapshotQuerySchema.parse(args ?? {});
      return callSnapshotTool('get_tradfi_pulse', buildSnapshotUrl(config, '/snapshot/tradfi', parsed));
    }
  );

  server.registerTool(
    'get_asset_view',
    {
      description: 'Get the latest pulse for a specific asset/ticker',
      inputSchema: assetQuerySchema.shape as any,
    },
    async (args: z.infer<typeof assetQuerySchema>) => {
      const parsed = assetQuerySchema.parse(args);
      const url = buildSnapshotUrl(config, `/snapshot/asset/${encodeURIComponent(parsed.symbol)}`, parsed);
      return callSnapshotTool('get_asset_view', url);
    }
  );

  return server;
}
