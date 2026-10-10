import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { connectTestClient } from "./test-client.ts";
import { MAX_REQUEST_BYTES } from "./store.ts";

const rename = { type: "updateEntity", entityId: "customer", name: "Client" };
test(
  "real SDK initialize/list/get/apply/validate; HTTP races, security boundaries and restart",
  { timeout: 20000 },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "model-canvas-sdk-"));
    const path = join(dir, "model.json");
    let session = await connectTestClient(path);
    try {
      assert.equal(session.client.getServerVersion()?.name, "model-canvas");
      const { tools } = await session.client.listTools();
      assert.deepEqual(tools.map((t) => t.name).sort(), [
        "apply_commands",
        "get_document",
        "validate_samples",
      ]);
      assert.ok(tools.every((t) => t.inputSchema && t.outputSchema));
      const initial = await session.read();
      assert.equal(initial.revision, 0);
      const invalid = await session.client.callTool({
        name: "apply_commands",
        arguments: { expectedRevision: 0, commands: [] },
      });
      assert.equal(invalid.isError, true);
      const schemaErrors = await session.client.callTool({
        name: "apply_commands",
        arguments: {
          expectedRevision: 0,
          commands: Array(100).fill({ type: "addEntity", entity: {} }),
        },
      });
      assert.equal(schemaErrors.isError, true);
      assert.ok(JSON.stringify(schemaErrors.content).length < 1100);
      const pathInput = await session.client.callTool({
        name: "get_document",
        arguments: { path: "/tmp/forbidden" },
      });
      assert.equal(pathInput.isError, true);
      const bytes = readFileSync(path, "utf8");
      const rollback = await session.apply(0, [
        rename,
        { ...rename, entityId: "missing" },
      ]);
      assert.equal(rollback.ok, false);
      assert.deepEqual(await session.read(), initial);
      assert.equal(readFileSync(path, "utf8"), bytes);
      const headers = {
        "X-Model-Canvas": "1",
        "Content-Type": "application/json",
        Origin: session.origin,
      };
      const post = (body: unknown, extra = {}) =>
        fetch(`${session.origin}/api/commands`, {
          method: "POST",
          headers: { ...headers, ...extra },
          body: typeof body === "string" ? body : JSON.stringify(body),
        });
      const [mcp, http] = await Promise.all([
        session.apply(0, [rename]),
        post({
          expectedRevision: 0,
          commands: [{ ...rename, name: "Browser" }],
        }).then((r) => r.json()),
      ]);
      assert.equal([mcp, http].filter((r) => r.ok).length, 1);
      assert.equal([mcp, http].filter((r) => r.code === "conflict").length, 1);
      assert.equal((await session.read()).revision, 1);
      const validated = await session.client.callTool({
        name: "validate_samples",
        arguments: {},
      });
      const validation = validated.structuredContent as {
        revision: number;
        diagnostics: unknown[];
      };
      assert.equal(validation.revision, 1);
      assert.equal(validation.diagnostics.length, 3);
      for (const Origin of [
        "https://evil.example",
        "null",
        "http://localhost:4313",
      ])
        assert.equal(
          (await post({ expectedRevision: 1, commands: [rename] }, { Origin }))
            .status,
          403,
        );
      assert.equal((await post("{")).status, 400);
      assert.equal((await post("x".repeat(MAX_REQUEST_BYTES + 1))).status, 413);
      assert.equal(
        (await post({}, { "Content-Type": "text/plain" })).status,
        415,
      );
      assert.equal((await fetch(`${session.origin}/api/document`)).status, 403);
      assert.equal(
        (
          await fetch(`${session.origin}/api/document`, {
            headers: { ...headers, "Sec-Fetch-Site": "cross-site" },
          })
        ).status,
        403,
      );
      const hostStatus = await new Promise<number | undefined>(
        (resolve, reject) => {
          const req = request(
            `${session.origin}/api/document`,
            { headers: { Host: "evil.example", "X-Model-Canvas": "1" } },
            (res) => {
              res.resume();
              resolve(res.statusCode);
            },
          );
          req.on("error", reject);
          req.end();
        },
      );
      assert.equal(hostStatus, 403);
      assert.equal(
        (await fetch(`${session.origin}/server/main.ts`)).status,
        404,
      );
      const saved = await session.read();
      const origin = session.origin;
      await session.close();
      await assert.rejects(fetch(`${origin}/api/document`, { headers }));
      session = await connectTestClient(path, 0, true);
      assert.deepEqual(await session.read(), saved);
      assert.equal((await session.client.listTools()).tools.length, 3);
    } finally {
      await session.close();
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
test(
  "oversized stdio closes without logging input or corrupting the document",
  { timeout: 10000 },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "model-canvas-wire-"));
    const path = join(dir, "model.json");
    const child = spawn(
      process.execPath,
      [
        "--experimental-strip-types",
        "server/main.ts",
        "--document",
        path,
        "--port",
        "0",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let output = "";
    let errors = "";
    child.stdout.on("data", (data) => {
      output += data;
    });
    child.stderr.on("data", (data) => {
      errors += data;
    });
    child.stdin.on("error", () => {});
    try {
      await once(child.stderr, "data");
      const exited = once(child, "exit");
      child.stdin.end("X".repeat(MAX_REQUEST_BYTES + 1));
      await exited;
      assert.equal(output, "");
      assert.ok(errors.length < 1000);
      assert.ok(!errors.includes("XXXXX"));
      assert.equal(JSON.parse(readFileSync(path, "utf8")).revision, 0);
    } finally {
      child.kill();
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
