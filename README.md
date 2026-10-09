# Model Canvas

[English](./README.md) | [日本語](./README.ja.md)

An agent-friendly semantic canvas for exploring domain models with sample data.

## Status

A working, browser-only local demo. Edit entities and fields, connect one-to-many relations, and test your model with fictional records. UI actions and the JSON command playground use the same atomic, validated command API. **No AI, LLM, or MCP connection is running.**

## Run locally

Use **Node.js 22.18 or later** and npm. No API keys, account, or backend are needed.

```sh
git clone https://github.com/ryoryo34/model-canvas.git
cd model-canvas
# Until the initial-demo PR is merged:
git switch issue-1-initial-demo
npm ci
npm run dev
```

Open <http://127.0.0.1:4311>. The server binds to the loopback interface and fails if port 4311 is already occupied; it does not stop another server or silently choose another port. To choose a free port: `npm run dev -- --port 4312`. Stop with Ctrl+C.

```sh
npm run typecheck
npm test                 # semantic model, commands, import/export and storage
npm run build            # includes typecheck; writes dist/
npm run preview          # serve dist/ locally, after stopping the dev server
npx playwright install chromium  # one-time browser download
npm run test:e2e          # starts its own server; stop dev/preview on 4311 first
```

`npm ci` needs network access to install dependencies. Browser installation also downloads Chromium. Once installed, the demo does not send model data to external services. Tests run with fictional fixtures in isolated browser contexts.

## Try the fictional example

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

Every UI document edit calls `applyCommand(current, command)`. It validates untyped input at runtime, copies the document, checks the resulting structure, and returns either `{ ok: true, document }` or `{ ok: false, error }`. A failure never changes the input document. The JSON command playground calls the same function. Import uses the same structural validator and additionally rejects missing sample references.

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

- TypeScript + React + Vite; custom HTML cards and SVG edges avoid a canvas framework dependency. Runtime dependencies are only React and React DOM. Tests use Node's test runner and Playwright. Versions are pinned in `package-lock.json`; Node 22.18+ is needed for built-in TypeScript stripping in unit tests. Tool references: [Vite](https://vite.dev/guide/), [React](https://react.dev/versions), [TypeScript](https://www.typescriptlang.org/download/).
- Small local models only. Primitive fields and one-to-many relations; no nested values, uniqueness rules, arbitrary constraints, entity/field deletion, undo/redo, zoom, or migrations. Node coordinates are limited to 0–4000. IDs are globally unique across entities, fields, relations, and samples; they use letters, digits, `_`, and `-` and cannot be prototype-reserved names.
- Local storage is tied to the browser and origin, has browser-defined quotas, and is not a backup. Save explicitly and export files for portability. Storage failures are shown without discarding the working document. Browser refresh closes unsaved work and unsubmitted drafts.
- No login, collaboration, cloud storage, LLM/MCP server, kintone integration, production database generation, or full JSON Schema export. These are future work, not enabled capabilities. No telemetry, external fonts, or runtime external requests are included.

## Development

See [vision](docs/VISION.md), [workflow](docs/WORKFLOW.md), and [issues](https://github.com/ryoryo34/model-canvas/issues). One issue corresponds to one Codex session and one implementation branch. This demo is scoped to [Issue #1](https://github.com/ryoryo34/model-canvas/issues/1). Only fictional data belongs in the public repository.

## License

[MIT](LICENSE)
