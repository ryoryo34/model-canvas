import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { isAbsolute } from "node:path";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { DocumentStore, MAX_REQUEST_BYTES } from "./store.ts";
import { createMcpServer } from "./mcp.ts";
import { startHttp } from "./http.ts";
import { BoundedStdioTransport } from "./transport.ts";

async function main() {
  const { values } = parseArgs({
    options: {
      document: { type: "string" },
      port: { type: "string", default: "4313" },
    },
  });
  const port = Number(values.port);
  if (
    !values.document ||
    !isAbsolute(values.document) ||
    !Number.isInteger(port) ||
    port < 0 ||
    port > 65535
  )
    throw new Error(
      "Use --document /absolute/path/model.json [--port 4313]. Parent directory must exist.",
    );
  const store = new DocumentStore(values.document);
  try {
    const { server, origin } = await startHttp(
      store,
      port,
      fileURLToPath(new URL("../dist", import.meta.url)),
    );
    let stopping = false;
    const stop = () => {
      if (stopping) return;
      stopping = true;
      server.close();
      server.closeAllConnections();
      store.close();
      void handle.close().finally(() => {
        process.stdin.pause();
      });
    };
    const transport = new BoundedStdioTransport(process.stdin, process.stdout, {
      maxBufferSize: MAX_REQUEST_BYTES,
    });
    const handle = serveStdio(() => createMcpServer(store), {
      transport,
      onerror: () => {
        console.error("MCP transport error; closing session.");
        stop();
      },
    });
    process.stdin.once("end", stop);
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    console.error(`Model Canvas shared mode: ${origin}/?shared=1`);
  } catch {
    store.close();
    throw new Error(
      "Could not start shared server. Check port and document lock.",
    );
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error && error.message.startsWith("Use --")
      ? error.message
      : "Shared server failed to start. Check document validity, permissions, lock and port. Existing files are not reset.",
  );
  process.exitCode = 1;
});
