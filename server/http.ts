import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DocumentStore, MAX_REQUEST_BYTES } from "./store.ts";

export async function startHttp(
  store: DocumentStore,
  port: number,
  dist: string,
) {
  let origin = "";
  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    if (
      req.headers.host !== new URL(origin).host ||
      (req.headers.origin !== undefined && req.headers.origin !== origin) ||
      (req.headers["sec-fetch-site"] &&
        !["same-origin", "none"].includes(
          String(req.headers["sec-fetch-site"]),
        ))
    ) {
      json(res, 403, { error: "Host or Origin not allowed." });
      return;
    }
    const url = new URL(req.url ?? "/", origin);
    const path = url.pathname;
    if (
      req.method === "GET" &&
      path === "/" &&
      url.searchParams.get("shared") !== "1"
    ) {
      res.writeHead(302, { Location: "/?shared=1" });
      res.end();
      return;
    }
    if (path.startsWith("/api/")) {
      // Non-simple header prevents cross-site requests, including reads without Origin.
      if (req.headers["x-model-canvas"] !== "1") {
        json(res, 403, { error: "Same-origin API header required." });
        return;
      }
      if (req.method === "GET" && path === "/api/document") {
        json(res, 200, store.snapshot());
        return;
      }
      if (req.method === "POST" && path === "/api/commands") {
        if (req.headers.origin !== origin) {
          json(res, 403, { error: "Same-origin POST required." });
          return;
        }
        if (req.headers["content-type"] !== "application/json") {
          json(res, 415, { error: "Expected application/json." });
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > MAX_REQUEST_BYTES) {
            json(res, 413, { error: "Request exceeds 1 MiB." });
            return;
          }
          chunks.push(chunk);
        }
        let input: unknown;
        try {
          input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch {
          json(res, 400, { error: "Invalid JSON." });
          return;
        }
        const result = store.apply(input);
        json(
          res,
          result.ok
            ? 200
            : result.code === "conflict"
              ? 409
              : result.code === "storage"
                ? 503
                : 400,
          result,
        );
        return;
      }
      json(res, 404, { error: "Unknown API route or method." });
      return;
    }
    // Only serve the built UI; never expose source, document files or arbitrary paths.
    if (
      req.method !== "GET" ||
      !(path === "/" || /^\/assets\/[a-zA-Z0-9_-]+\.(js|css)$/.test(path))
    ) {
      json(res, 404, { error: "Not found." });
      return;
    }
    try {
      const body = readFileSync(
        resolve(dist, path === "/" ? "index.html" : `.${path}`),
      );
      res.writeHead(200, {
        "Content-Type": path.endsWith(".js")
          ? "text/javascript"
          : path.endsWith(".css")
            ? "text/css"
            : "text/html; charset=utf-8",
      });
      res.end(body);
    } catch {
      json(res, 404, { error: "UI unavailable. Run npm run build first." });
    }
  };
  const server = createServer((req, res) => {
    void handle(req, res).catch(() => {
      if (!res.headersSent)
        json(res, 400, { error: "Request could not be processed." });
      else res.end();
    });
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No HTTP address.");
  origin = `http://127.0.0.1:${address.port}`;
  return { server, origin };
}
