# Sentiment402 MCP Adapter (stdio)

A thin MCP server that exposes Sentiment402 snapshot endpoints as MCP tools. It calls the public Sentiment402 API over HTTPS and relays x402 payment requirements when the API responds with `402 Payment Required`.

This adapter is intentionally stateless and contains no database credentials or admin headers. It is safe to run locally or package as a public MCP tool.

## Tool surface

| Tool                  | HTTP endpoint                           | Description                       |
| --------------------- | --------------------------------------- | --------------------------------- |
| `get_global_snapshot` | `GET /v1/snapshot/global`        | Global market sentiment snapshot  |
| `get_crypto_pulse`    | `GET /v1/snapshot/crypto`        | Crypto market sentiment pulse     |
| `get_tradfi_pulse`    | `GET /v1/snapshot/tradfi`        | TradFi market sentiment pulse     |
| `get_asset_view`      | `GET /v1/snapshot/asset/:symbol` | Latest pulse for a specific asset |

### Common inputs

All tools accept the same optional query inputs (and `get_asset_view` additionally requires a `symbol`).

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
  "resource": "https://sentiment-api.kytona.com/v1/snapshot/global",
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

Defaults:

- API base URL: `https://sentiment-api.kytona.com`
- API version: `v1`

Environment variables:

- `SENTIMENT402_API_BASE_URL` (optional) — default `https://sentiment-api.kytona.com`
- `SENTIMENT402_API_VERSION` (optional) — `v1` (default `v1`)
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
pnpm start
```

You can also run directly in dev mode:

```bash
pnpm dev
```

To point at localhost:

```bash
SENTIMENT402_API_BASE_URL="http://localhost:8080" pnpm dev
```

## MCP host config example

Example for a stdio MCP host configuration:

```json
{
  "command": "node",
  "args": ["/path/to/sentiment402/mcp/dist/index.js"],
  "env": {
    "SENTIMENT402_API_BASE_URL": "https://sentiment-api.kytona.com",
    "SENTIMENT402_API_VERSION": "v1"
  }
}
```

## Client Setup Instructions

### Claude Desktop

Claude Desktop supports MCP servers via stdio configuration.

**Config file location:**

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

#### Option 1: Run from GitHub (Recommended)

```json
{
  "mcpServers": {
    "sentiment402": {
      "command": "npx",
      "args": ["-y", "github:kytona/mcp"],
      "env": {
        "SENTIMENT402_API_VERSION": "v1",
        "SENTIMENT402_X402_PRIVATE_KEY": "your_evm_private_key_here"
      }
    }
  }
}
```

This automatically downloads and runs the latest version from GitHub.

#### Option 2: Run from Local Clone

1. Clone and build:

   ```bash
   git clone https://github.com/kytona/mcp.git
   cd mcp
   pnpm install
   pnpm build
   ```

2. Configure Claude:

   ```json
   {
     "mcpServers": {
       "sentiment402": {
         "command": "node",
         "args": ["/absolute/path/to/mcp/dist/index.js"],
        "env": {
          "SENTIMENT402_API_VERSION": "v1",
          "SENTIMENT402_X402_PRIVATE_KEY": "your_evm_private_key_here"
        }
       }
     }
   }
   ```

3. Restart Claude Desktop and look for the 🔌 icon to see available tools.

**Resources:**

- [Claude MCP Documentation](https://docs.anthropic.com/en/docs/model-context-protocol)
- [Using Remote MCP Servers](https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp)

### ChatGPT Desktop

ChatGPT supports MCP via Developer Mode (requires ChatGPT Plus).

#### Setup Steps

1. **Enable Developer Mode:**

   - Open ChatGPT → **Settings**
   - Go to **Apps & Connectors** → **Advanced settings**
   - Enable **Developer mode**

2. **Add MCP Server (NPX - Recommended):**

   - In **Apps & Connectors**, click **Create**
   - Enter:
     - **Name**: `Sentiment402`
     - **Command**: `npx`
     - **Args**: `-y github:kytona/mcp`
     - **Environment Variables**:
       ```
       SENTIMENT402_API_VERSION=v1
       SENTIMENT402_X402_PRIVATE_KEY=your_evm_private_key_here
       ```
   - Check **I trust this application**
   - Click **Create**

3. **Use in Chat:**
   - Click the **+** in the prompt field
   - Go to **More** → **Developer mode**
   - Enable the Sentiment402 connector

#### Using Local Clone

1. Clone and build as described above for Claude
2. In ChatGPT Developer mode, configure:
   - **Command**: `node`
   - **Args**: `/absolute/path/to/mcp/dist/index.js`
   - **Environment Variables**: Same as above

**Resources:**

- [ChatGPT MCP Integration](https://help.openai.com/en/articles/model-context-protocol)
- [MCP Developer Documentation](https://modelcontextprotocol.io/)

### Running on a Cloud Server

To run the MCP server remotely and connect from Claude/ChatGPT:

#### 1. Deploy to Cloud

```bash
# On your cloud server (AWS, DigitalOcean, etc.)
git clone https://github.com/kytona/mcp.git
cd mcp
pnpm install
pnpm build

# Run with PM2 for persistence
npm install -g pm2
pm2 start dist/index.js --name sentiment402-mcp
pm2 save
pm2 startup
```

#### 2. Expose via ngrok (Development Only)

```bash
# Install ngrok: https://ngrok.com/download
ngrok tcp 8000

# Note the forwarding address: tcp://0.tcp.ngrok.io:12345
```

#### 3. Configure Client

For Claude or ChatGPT, update the command to connect via TCP:

```json
{
  "command": "node",
  "args": ["-e", "const net = require('net'); const client = net.connect({host: '0.tcp.ngrok.io', port: 12345}); process.stdin.pipe(client); client.pipe(process.stdout);"]
}
```

**⚠️ Security Warning**: ngrok exposes your server publicly. For production, use:

- VPN (Tailscale, WireGuard)
- SSH tunneling
- Proper authentication middleware

**Resources:**

- [Using ngrok with MCP](https://ngrok.com/docs/using-ngrok-with/using-mcp)
- [MCP Security Best Practices](https://modelcontextprotocol.io/docs/security)

### Other MCP Clients (Cline, etc.)

For other MCP-compatible clients, use a similar stdio configuration:

```json
{
  "mcpServers": {
    "sentiment402": {
      "command": "npx",
      "args": ["-y", "github:kytona/mcp"],
      "env": {
        "SENTIMENT402_API_VERSION": "v1"
      }
    }
  }
}
```

Refer to your client's documentation for the exact config file location.

## Test script

The repo includes a stdio test runner that calls a tool and prints the response.

```bash
pnpm build
pnpm test:mcp
```

To point at localhost:

```bash
SENTIMENT402_API_BASE_URL="http://localhost:8080" pnpm test:mcp
```

Optional overrides:

- `SENTIMENT402_MCP_TOOL` (default `get_global_snapshot`)
- `SENTIMENT402_MCP_TOOL_ARGS` (JSON string)
- `SENTIMENT402_MCP_SERVER_CMD` / `SENTIMENT402_MCP_SERVER_ARGS` to customize the server process

## License

MIT. See `LICENSE`.

## Safety notes

- The adapter only calls the public HTTPS API and never touches internal databases.
- The MCP response body contains only the API response or a `PAYMENT_REQUIRED` payload.
