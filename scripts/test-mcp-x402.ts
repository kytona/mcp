import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { config as loadEnv } from "dotenv";

loadEnv();

const useLocalhost = process.env.SENTIMENT402_USE_LOCALHOST === "true";
const apiBaseUrl = useLocalhost ? "http://localhost:8080" : "https://sentiment-api.kytona.com";
const maxPayment = process.env.SENTIMENT402_X402_MAX_PAYMENT ?? "100000";
const toolName = process.env.SENTIMENT402_MCP_TOOL ?? "get_global_snapshot";
const toolArgsRaw = process.env.SENTIMENT402_MCP_TOOL_ARGS ?? "{}";
let toolArgs: Record<string, unknown> = {};
if (toolArgsRaw) {
  try {
    toolArgs = JSON.parse(toolArgsRaw) as Record<string, unknown>;
  } catch (error) {
    console.error("Invalid SENTIMENT402_MCP_TOOL_ARGS JSON");
    process.exit(1);
  }
}

const serverCommand = process.env.SENTIMENT402_MCP_SERVER_CMD ?? "node";
const serverArgs = process.env.SENTIMENT402_MCP_SERVER_ARGS ? process.env.SENTIMENT402_MCP_SERVER_ARGS.split(" ").filter(Boolean) : ["dist/index.js"];

const paymentKey = process.env.SENTIMENT402_X402_PRIVATE_KEY;
if (!paymentKey) {
  console.error("Missing SENTIMENT402_X402_PRIVATE_KEY for x402 payment test.");
  process.exit(1);
}

const serverEnv: Record<string, string> = {
  SENTIMENT402_API_VERSION: process.env.SENTIMENT402_API_VERSION ?? "v1",
  SENTIMENT402_CACHE_TTL_MS: process.env.SENTIMENT402_CACHE_TTL_MS ?? "60000",
  SENTIMENT402_USER_AGENT: process.env.SENTIMENT402_USER_AGENT ?? "sentiment402-mcp/0.1.0",
  SENTIMENT402_X402_MAX_PAYMENT: maxPayment,
  SENTIMENT402_X402_PRIVATE_KEY: paymentKey,
};
if (useLocalhost) {
  serverEnv.SENTIMENT402_USE_LOCALHOST = "true";
}

async function main() {
  console.log("================================================================================");
  console.log("MCP X402 PAYMENT TEST (stdio)");
  console.log("================================================================================");
  console.log(`Base URL: ${apiBaseUrl}`);
  console.log(`Max payment per request: ${maxPayment} units (0.10 USDC)`);
  console.log("");

  const transport = new StdioClientTransport({
    command: serverCommand,
    args: serverArgs,
    env: serverEnv,
    stderr: "inherit",
  });
  const client = new Client({ name: "sentiment402-mcp-test", version: "0.1.0" });

  await client.connect(transport);
  console.log("--------------------------------------------------------------------------------");
  console.log(`TOOL: ${toolName}`);
  console.log("--------------------------------------------------------------------------------");

  const result = await client.callTool({ name: toolName, arguments: toolArgs });

  const contentItems: unknown[] = Array.isArray(result.content) ? result.content : [];
  const textOutput = contentItems
    .filter((item): item is { type: "text"; text: string } => {
      return typeof item === "object" && item !== null && "type" in item && "text" in item && (item as { type: string }).type === "text" && typeof (item as { text: string }).text === "string";
    })
    .map((item) => item.text)
    .join("\n")
    .trim();

  if (textOutput) {
    try {
      const parsed = JSON.parse(textOutput);
      if (parsed?.error === "PAYMENT_REQUIRED") {
        console.log("📋 Payment Requirements:");
        if (parsed.resource) {
          console.log(`   Resource: ${parsed.resource}`);
        }
        if (Array.isArray(parsed.accepts)) {
          parsed.accepts.forEach(
            (
              accept: {
                scheme?: string;
                network?: string;
                amount?: string;
                asset?: string;
                payTo?: string;
              },
              index: number
            ) => {
              const line = [
                accept.network,
                accept.scheme,
                accept.amount ? `${accept.amount} units` : undefined,
                accept.asset ? `of ${accept.asset}` : undefined,
                accept.payTo ? `→ ${accept.payTo}` : undefined,
              ]
                .filter(Boolean)
                .join(" • ");
              console.log(`   [${index + 1}] ${line}`);
            }
          );
        }
        return;
      }
      if (parsed && typeof parsed === "object") {
        const transaction = typeof parsed.transaction === "string" ? parsed.transaction : undefined;
        const payer = typeof parsed.payer === "string" ? parsed.payer : undefined;
        const network = typeof parsed.network === "string" ? parsed.network : undefined;
        if (transaction || payer || network) {
          console.log(
            JSON.stringify(
              {
                settlement: {
                  transaction,
                  payer,
                  network,
                },
              },
              null,
              2
            )
          );
        }
      }
      console.log("✅ Tool response:");
      console.log(JSON.stringify(parsed, null, 2));
    } catch {
      console.log(textOutput);
    }
  } else {
    console.log("Tool returned no text content.");
  }

  await client.close();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
