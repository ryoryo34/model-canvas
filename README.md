# Model Canvas

[English](./README.md) | [日本語](./README.ja.md)

An agent-friendly semantic canvas for exploring domain models with sample data.

## Status

A working local canvas with an optional MCP + browser shared mode. Edit entities and fields, connect one-to-many relations, and test your model with fictional records. UI actions and the JSON command playground use the same atomic, validated command API. The browser-only demo needs no backend. Shared mode exposes a real stdio MCP server; **no LLM chat or model API calls are included**.

## Run locally

Use **Node.js 22.18 or later** and npm. No API keys or account are needed. The default browser demo needs no backend.

```sh
git clone https://github.com/ryoryo34/model-canvas.git
cd model-canvas
# Until the shared-mode PR is merged:
git switch issue-3-mcp-collaboration
npm ci
npm run dev
```

Open <http://127.0.0.1:4311>. The server binds to the loopback interface and fails if port 4311 is already occupied; it does not stop another server or silently choose another port. To choose a free port: `npm run dev -- --port 4312`. Stop with Ctrl+C.

```sh
npm run typecheck
npm test                 # model/store tests and real MCP + HTTP integration
npm run build            # includes typecheck; writes dist/
npm run preview          # serve dist/ locally, after stopping the dev server
npx playwright install chromium  # one-time browser download
npm run test:e2e          # builds UI; demo tests use 4312, shared tests use free ports
```

`npm ci` needs network access to install dependencies. Browser installation also downloads Chromium. Once installed, the demo does not send model data to external services. Tests run with fictional fixtures in isolated browser contexts. Set `MODEL_CANVAS_TEST_PORT=4314 npm run test:e2e` if 4312 is occupied; tests never reuse or stop another server.

## Shared mode: MCP + browser

Shared mode runs **one local Node process** with an authoritative `DocumentStore`, a stdio MCP server, and an HTTP UI. It does not call an LLM. Build the UI once, then let your MCP host launch the server:

```sh
npm run build
mkdir -p work
```

Example stdio configuration (adapt the absolute paths to your machine; this project does not modify any host settings):

```json
{
  "mcpServers": {
    "model-canvas": {
      "command": "node",
      "args": [
        "--experimental-strip-types",
        "/absolute/path/model-canvas/server/main.ts",
        "--document",
        "/absolute/path/model-canvas/work/shared.json",
        "--port",
        "4313"
      ]
    }
  }
}
```

Use an absolute Node executable path if your host cannot find `node`. Launch `node` directly, **not a normal npm script**, in stdio settings: npm's banner can pollute protocol stdout. The server logs its browser URL only to stderr. Open <http://127.0.0.1:4313/?shared=1>; the root URL also redirects here. The page says **Shared mode · MCP + browser**. The host owns this process: disconnect/stop it in the host to stop HTTP and release the file lock. Do not start another server for the same document or port. An occupied port fails without stopping another process.

For a browser-only trial of the shared server, run `npm run shared -- --document "$PWD/work/shared.json" --port 4313` in a terminal and leave stdin open; Ctrl+C stops it. This alone does not attach an MCP client. For a different model, select another file path at startup; tools cannot read or write arbitrary paths.

### Tools and transactions

- `get_document {}` returns `{ revision, document }`.
- `apply_commands { expectedRevision, commands }` returns `{ ok, revision, document }` on success. Pass 1–100 commands from the command API below. Each command uses the existing `applyCommand`; the whole batch saves once and advances revision once. A failed command, stale revision, or failed save commits nothing. Application errors include `code`, `error`, and current `revision`, and set MCP `isError`. Read again and reconsider the edit after a conflict; never blindly retry.
- `validate_samples {}` returns `{ revision, diagnostics }` without changing the model.

Input/output JSON Schemas appear in MCP `listTools`; results contain both text and structured content. For example, after reading revision 0:

```json
{
  "expectedRevision": 0,
  "commands": [
    {
      "type": "addEntity",
      "entity": { "id": "milestone", "name": "Milestone", "fields": [] },
      "position": { "x": 80, "y": 300 }
    },
    {
      "type": "updateEntity",
      "entityId": "milestone",
      "name": "Release milestone"
    }
  ]
}
```

With the browser open, this adds a card. Rename it in the inspector, then call `get_document` to see the UI change. `npm test` uses an actual SDK client/server stdio connection (initialize, list, get, apply, validate). `npm run test:e2e` builds the UI and runs real Chromium with the same SDK transport for this round trip. No model API key is required. **Codex/Claude host configuration and a live LLM-driven agent session have not been verified.**

### Synchronization and persistence

The browser fetches the shared snapshot every 750 ms while connected. UI commands use the displayed revision and show success only after the server saves. Remote updates apply automatically while no unsent drafts or active drags remain. Drafts are tracked per form (and separately for the JSON command editor); a successful save clears only the submitted form, leaving other unsent inputs protected. Completed or cancelled drags release their temporary guard. If another writer changes the document while drafts remain, polling pauses with a reload notice. Conflicts, failed saves, or communication loss preserve the displayed model and form text, block further sends, and require **Reload shared document (discard drafts)**. Copy unsent text first; Export JSON includes only the displayed model, not drafts. Reload fetches before discarding; a failed reconnect keeps drafts. There is no automatic merge or offline replay. A lost write response may mean the save succeeded, so reconcile before trying again. Browser refresh/closing can discard drafts; the page requests the browser's unsaved-work warning.

Applied shared edits save automatically to the explicit startup file; localStorage is neither loaded nor written. **Import JSON** and **Save locally** are disabled in shared mode; **Export JSON** remains available. To seed a shared session, stop the server and use an existing exported `ModelDocument` as the startup file (loaded at revision 0). A missing file starts the fictional demo. The parent directory must exist. The first successful edit writes a `{ storeVersion: 1, revision, document }` envelope; restart restores it, including editable sample diagnostics.

The store rejects invalid files, unsupported versions, directories, and symlinks without resetting them. It writes a private temporary file beside the document, flushes it, then atomically renames it before advancing memory. A `.lock` file prevents a second cooperating process from owning the same canonical path. After a crash/SIGKILL, a stale lock or temporary file may remain: verify its recorded PID is no longer using this document, back up your files, then remove only that stale lock/temp file. Never delete the document to recover a lock. Do not edit the file externally while the server is running. Use a local filesystem; network filesystems, hard-link aliases, and power-loss durability are not supported guarantees.

### Local security and limits

HTTP binds only `127.0.0.1`. Exact Host/Origin checks, Fetch Metadata checks, a required `X-Model-Canvas: 1` API header, JSON-only writes, and no CORS grants block cross-site browser access. The HTTP API is a browser bridge, not an MCP HTTP transport. Local processes are trusted; this is not an authenticated multiuser service. Do not expose it through a proxy or on the Internet.

Requests/stdio buffers are limited to 1 MiB, batches to 100 commands, and persisted documents to 4 MiB. Store errors are capped at 500 characters and MCP error text at 1,000; startup/transport errors do not dump input or stack traces. Oversized stdio closes the connection. Synchronous atomic saves intentionally serialize writers and target small models. No cloud, telemetry, paid APIs, natural-language chat, or user-setting changes are included.

## Try the fictional example

These steps describe the default browser-only mode (`npm run dev`).

1. Start with **Customer** and **Project**. Select an entity on the left or canvas. Rename it, add fields, and change field names, types (`string`, `number`, `boolean`) or `required` in the inspector. Submit each edit with its button.
2. Drag a card header to move it. A focused header also supports arrow keys (16 pixels per press). The canvas scrolls for larger layouts.
3. Select **Project**, then the sample `project_draft`. The initial demo deliberately reports three problems: missing Title, Budget set to `"twelve"`, and Customer ID set to `customer_missing`. Enter a title, a number such as `4200`, and `customer_lumen`, then **Apply sample**. All three diagnostics disappear.
4. **Disconnect** the Customer → Project relation. Its line and reference validation disappear. Reconnect with source **Customer** and reference field **Customer ID**. Existing sample values remain intact.
5. Use **＋ Record** to try more values. Form drafts only affect the document after **Apply sample**. Boolean `false` and numeric `0` are valid; blank inputs become `null`. Invalid numeric text is retained as a string so the validator can explain it.
6. **Save locally** explicitly stores the current document in this browser at this origin. Reload restores that snapshot, including editable sample diagnostics. There is no autosave. The dot on the save button indicates document changes since loading/saving; unsubmitted form drafts are not saved.
7. After fixing missing sample references, **Export JSON**, edit the model, and **Import JSON** to restore its semantic model and positions. Import replaces the current document but does not save it locally until requested. Invalid JSON, unsupported versions, unknown properties, duplicate IDs, and dangling model/sample references are rejected without changing the current document.

Required/type-invalid samples can be imported for repair; missing source-record references must be fixed first. Therefore the intentionally invalid initial example cannot be imported unchanged. Export itself always preserves the current document. Local save/restore preserves even missing sample references to support work in progress. If stored data is corrupt, the app opens the demo and leaves the stored bytes untouched until you explicitly save.

## Shared command API

`src/model.ts` defines `ModelDocument`, `Command`, `applyCommand`, `validateSamples`, `exportDocument`, and `importDocument`. Stable IDs are separate from editable labels. `documentVersion: 1` and `model` hold the semantic data; `layout` holds positions keyed by entity ID.

In browser-only mode, every UI document edit calls `applyCommand(current, command)`. It validates untyped input at runtime, copies the document, checks the resulting structure, and returns either `{ ok: true, document }` or `{ ok: false, error }`. A failure never changes the input document. The JSON command playground calls the same function. Import uses the same structural validator and additionally rejects missing sample references.

Open **Command API** and apply this single JSON command:

```json
{
  "type": "addField",
  "entityId": "project",
  "field": {
    "id": "project_notes",
    "name": "Notes",
    "type": "string",
    "required": false
  }
}
```

The new field appears in the card, inspector, and generated form. Reapplying the command rejects the duplicate ID. Supported commands: `addEntity`, `updateEntity`, `addField`, `updateField`, `addRelation`, `removeRelation`, `setSample`, `removeSample`, `moveEntity`. `setSample` inserts or replaces a record with the same stable ID; it cannot change that record's entity. Deleting a referenced record leaves a visible reference diagnostic. A relation targets a string field that stores the **source sample record ID**, not its name or a business-key field. Each target field can have only one relation. Disconnect it before changing that field to a non-string type.

Tests verify typed commands, JSON commands, and real UI edits produce the same state. See [verification notes](docs/VERIFICATION.md).

## Design and limits

- TypeScript + React + Vite; custom HTML cards and SVG edges avoid a canvas framework dependency. Runtime dependencies are React, React DOM, the official `@modelcontextprotocol/server` 2.3.1 and Zod 4.6.5; the official `@modelcontextprotocol/client` 2.3.1 is a test dependency. The browser bundle does not include the SDK. MCP packages declare Apache-2.0 (their LICENSE describes the MIT-to-Apache transition); Zod uses MIT. SDK selection follows the current [v2 documentation](https://ts.sdk.modelcontextprotocol.io/v2/), [stdio guide](https://ts.sdk.modelcontextprotocol.io/v2/serving/stdio.html), and [client guide](https://ts.sdk.modelcontextprotocol.io/v2/get-started/first-client.html), checked 2026-10-10. SDK v2 supports the legacy initialize handshake and the modern 2026-07-28 protocol; both are tested. No reference-project code or assets were copied. Tests use Node's test runner and Playwright. Versions are pinned in `package-lock.json`; Node 22.18+ is needed for built-in TypeScript stripping in unit tests. Tool references: [Vite](https://vite.dev/guide/), [React](https://react.dev/versions), [TypeScript](https://www.typescriptlang.org/download/).
- Small local models only. Primitive fields and one-to-many relations; no nested values, uniqueness rules, arbitrary constraints, entity/field deletion, undo/redo, zoom, or migrations. Node coordinates are limited to 0–4000. IDs are globally unique across entities, fields, relations, and samples; they use letters, digits, `_`, and `-` and cannot be prototype-reserved names.
- In browser-only mode, local storage is tied to the browser and origin, has browser-defined quotas, and is not a backup. Save explicitly and export files for portability. Storage failures are shown without discarding the working document. Browser refresh closes unsaved work and unsubmitted drafts.
- No login, multiuser collaboration, cloud storage, LLM integration, kintone integration, production database generation, or full JSON Schema export. These are future work, not enabled capabilities. No telemetry, external fonts, or runtime external requests are included; shared mode uses only its local HTTP server.

## Development

See [vision](docs/VISION.md), [workflow](docs/WORKFLOW.md), and [issues](https://github.com/ryoryo34/model-canvas/issues). One issue corresponds to one Codex session and one implementation branch. The browser demo is [Issue #1](https://github.com/ryoryo34/model-canvas/issues/1); shared MCP editing is [Issue #3](https://github.com/ryoryo34/model-canvas/issues/3). See [shared-mode verification](docs/VERIFICATION-MCP.md). Only fictional data belongs in the public repository.

## License

[MIT](LICENSE)
