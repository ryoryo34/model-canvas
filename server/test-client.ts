import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { fileURLToPath } from "node:url";
import type { Snapshot, StoreResult } from "./store.ts";

export async function connectTestClient(
  path: string,
  port = 0,
  modern = false,
) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      "--experimental-strip-types",
      fileURLToPath(new URL("./main.ts", import.meta.url)),
      "--document",
      path,
      "--port",
      String(port),
    ],
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
  });
  const client = new Client(
    { name: "model-canvas-verification", version: "1.0.0" },
    {
      supportedProtocolVersions: [modern ? "2026-07-28" : "2025-11-25"],
      versionNegotiation: { mode: modern ? { pin: "2026-07-28" } : "legacy" },
    },
  );
  try {
    await client.connect(transport);
    await client.listTools();
  } catch (error) {
    await client.close();
    throw error;
  }
  const origin = stderr.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
  if (!origin) {
    await client.close();
    throw new Error("Missing server readiness URL.");
  }
  return {
    client,
    transport,
    origin,
    async read() {
      const result = await client.callTool({
        name: "get_document",
        arguments: {},
      });
      return result.structuredContent as unknown as Snapshot;
    },
    async apply(expectedRevision: number, commands: unknown[]) {
      const result = await client.callTool({
        name: "apply_commands",
        arguments: { expectedRevision, commands },
      });
      return result.structuredContent as unknown as StoreResult;
    },
    close: () => client.close(),
  };
}
