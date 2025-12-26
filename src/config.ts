import { z } from 'zod';

const configSchema = z
  .object({
    SENTIMENT402_API_BASE_URL: z.string().url(),
    SENTIMENT402_API_VERSION: z.enum(['v1', 'v2']).default('v1'),
    SENTIMENT402_CACHE_TTL_MS: z.coerce.number().int().positive().default(60_000),
    SENTIMENT402_USER_AGENT: z.string().default('sentiment402-mcp/0.1.0'),
    SENTIMENT402_X402_PRIVATE_KEY: z.string().optional(),
    SENTIMENT402_X402_MAX_PAYMENT: z.string().optional(),
  })
  .passthrough();

export type McpAdapterConfig = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): McpAdapterConfig {
  const parsed = configSchema.safeParse(env);
  if (parsed.success) return parsed.data;

  const message = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid MCP adapter config:\n${message}`);
}
