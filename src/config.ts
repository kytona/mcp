import { z } from 'zod';

const envSchema = z
  .object({
    SENTIMENT402_API_VERSION: z.enum(['v1', 'v2']).default('v1'),
    SENTIMENT402_CACHE_TTL_MS: z.coerce.number().int().positive().default(60_000),
    SENTIMENT402_USER_AGENT: z.string().default('sentiment402-mcp/0.1.0'),
    SENTIMENT402_X402_PRIVATE_KEY: z.string().optional(),
    SENTIMENT402_X402_MAX_PAYMENT: z.string().optional(),
    SENTIMENT402_USE_LOCALHOST: z.coerce.boolean().default(false),
  })
  .passthrough();

export type McpAdapterConfig = {
  apiBaseUrl: string;
  apiVersion: 'v1' | 'v2';
  cacheTtlMs: number;
  userAgent: string;
  x402PrivateKey?: string;
  x402MaxPayment?: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): McpAdapterConfig {
  const parsed = envSchema.safeParse(env);
  if (parsed.success) {
    const apiBaseUrl = parsed.data.SENTIMENT402_USE_LOCALHOST
      ? 'http://localhost:8080'
      : 'https://sentiment-api.kytona.com';
    return {
      apiBaseUrl,
      apiVersion: parsed.data.SENTIMENT402_API_VERSION,
      cacheTtlMs: parsed.data.SENTIMENT402_CACHE_TTL_MS,
      userAgent: parsed.data.SENTIMENT402_USER_AGENT,
      x402PrivateKey: parsed.data.SENTIMENT402_X402_PRIVATE_KEY,
      x402MaxPayment: parsed.data.SENTIMENT402_X402_MAX_PAYMENT,
    };
  }

  const message = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid MCP adapter config:\n${message}`);
}
