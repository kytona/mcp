# Sentiment402 MCP Adapter (stdio)

A thin MCP server that exposes Sentiment402 snapshot endpoints as MCP tools. It calls the public Sentiment402 HTTP API over HTTPS and relays x402 payment requirements when the API responds with `402 Payment Required`.

This adapter is intentionally stateless and contains no database credentials or admin headers. It is safe to run locally or package as a public MCP tool.

## Tool surface

| Tool | HTTP endpoint | Description |
| --- | --- | --- |
| `get_global_snapshot` | `GET /{version}/snapshot/global` | Global market sentiment snapshot |
| `get_crypto_pulse` | `GET /{version}/snapshot/crypto` | Crypto market sentiment pulse |
| `get_tradfi_pulse` | `GET /{version}/snapshot/tradfi` | TradFi market sentiment pulse |
| `get_asset_view` | `GET /{version}/snapshot/asset/:symbol` | Latest pulse for a specific asset |

### Common inputs

All tools accept the same optional query inputs (and `get_asset_view` additionally requires a `symbol`).

- `version`: `v1` or `v2` (defaults to `SENTIMENT402_API_VERSION`)
- `format`: `full` or `compact_trading`
- `fields`: comma-separated allowlist (only meaningful when `format=compact_trading`)
- `symbol`: required for `get_asset_view`

Example tool arguments:

```json
{
  "format": "compact_trading",
  "fields": "headline,trend,confidence"
}
```

## x402 payment handling

When the Sentiment402 API responds with `402`, the adapter returns a structured `PAYMENT_REQUIRED` payload. If `SENTIMENT402_X402_PRIVATE_KEY` is configured, it will attempt an x402 payment automatically using the options returned by the API. If the payment cannot be completed, the `PAYMENT_REQUIRED` payload is returned.

Example payload (truncated):

```json
{
  "error": "PAYMENT_REQUIRED",
  "x402Version": 1,
  "resource": "https://api.sentiment402.com/v1/snapshot/global",
  "accepts": [
    {
      "scheme": "exact",
      "network": "base",
      "asset": "USDC",
      "amount": "100000",
      "payTo": "0x..."
    }
  ],
  "rawHeader": "..."
}
```

## Caching

A small in-memory cache is used to reduce repeated requests.

- Default TTL: `60000` ms
- Cache key: `{tool}:{path}?{query}`
- Only `2xx` JSON responses are cached
- `402` responses are never cached

## Configuration

Environment variables:

- `SENTIMENT402_API_BASE_URL` (required) — e.g. `https://your-api-domain.com`
- `SENTIMENT402_API_VERSION` (optional) — `v1` or `v2` (default `v1`)
- `SENTIMENT402_CACHE_TTL_MS` (optional) — cache TTL in ms (default `60000`)
- `SENTIMENT402_USER_AGENT` (optional) — default `sentiment402-mcp/0.1.0`
- `SENTIMENT402_X402_PRIVATE_KEY` (optional) — EVM private key for auto-paying x402 requests
- `SENTIMENT402_X402_MAX_PAYMENT` (optional) — max payment in base units (default `100000`, i.e. $0.10 USDC)

No API keys are required for the Sentiment402 API. The private key is only needed if you want auto-pay for `402` responses.

## Run locally

Build and start:

```bash
pnpm install
pnpm build
SENTIMENT402_API_BASE_URL="https://…" pnpm start
```

You can also run directly in dev mode:

```bash
SENTIMENT402_API_BASE_URL="https://…" pnpm dev
```

## MCP host config example

Example for a stdio MCP host configuration:

```json
{
  "command": "node",
  "args": ["/path/to/sentiment402/mcp/dist/index.js"],
  "env": {
    "SENTIMENT402_API_BASE_URL": "https://api.sentiment402.com",
    "SENTIMENT402_API_VERSION": "v1"
  }
}
```

## Test script

The repo includes a stdio test runner that calls a tool and prints the response.

```bash
pnpm build
SENTIMENT402_API_BASE_URL="https://…" pnpm test:mcp
```

Optional overrides:

- `SENTIMENT402_MCP_TOOL` (default `get_global_snapshot`)
- `SENTIMENT402_MCP_TOOL_ARGS` (JSON string)
- `SENTIMENT402_MCP_SERVER_CMD` / `SENTIMENT402_MCP_SERVER_ARGS` to customize the server process

## Safety notes

- The adapter only calls the public HTTPS API and never touches internal databases.
- The MCP response body contains only the API response or a `PAYMENT_REQUIRED` payload.
