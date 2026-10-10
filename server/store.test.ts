import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
  renameSync,
  mkdirSync,
  rmdirSync,
  symlinkSync,
  lstatSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DocumentStore } from "./store.ts";
import { createDemo } from "../src/fixture.ts";

const rename = { type: "updateEntity", entityId: "customer", name: "Client" };
test("batch commits once, rejects stale revisions, rolls back a later invalid command and restores from disk", () => {
  const dir = mkdtempSync(join(tmpdir(), "model-canvas-store-"));
  const path = join(dir, "model.json");
  const store = new DocumentStore(path);
  try {
    const before = store.snapshot();
    const bytes = readFileSync(path, "utf8");
    assert.equal(
      store.apply({
        expectedRevision: 0,
        commands: [rename, { ...rename, entityId: "missing" }],
      }).ok,
      false,
    );
    assert.deepEqual(store.snapshot(), before);
    assert.equal(readFileSync(path, "utf8"), bytes);
    assert.equal(
      store.apply({
        expectedRevision: 0,
        commands: [
          rename,
          {
            type: "moveEntity",
            entityId: "customer",
            position: { x: 12, y: 34 },
          },
        ],
      }).ok,
      true,
    );
    assert.equal(store.snapshot().revision, 1);
    const stale = store.apply({ expectedRevision: 0, commands: [rename] });
    assert.ok(!stale.ok && stale.code === "conflict");
    const copy = store.snapshot();
    copy.document.model.entities[0].name = "Aliased";
    assert.equal(store.snapshot().document.model.entities[0].name, "Client");
    assert.throws(() => new DocumentStore(path));
    const saved = store.snapshot();
    store.close();
    const restored = new DocumentStore(path);
    assert.deepEqual(restored.snapshot(), saved);
    restored.close();
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("invalid existing files are preserved, raw exports can seed the store, and bad inputs never commit", () => {
  const dir = mkdtempSync(join(tmpdir(), "model-canvas-invalid-"));
  const path = join(dir, "model.json");
  try {
    for (const raw of [
      "{broken",
      JSON.stringify({ storeVersion: 1, revision: -1, document: createDemo() }),
      JSON.stringify({ storeVersion: 2 }),
    ]) {
      writeFileSync(path, raw);
      assert.throws(() => new DocumentStore(path));
      assert.equal(readFileSync(path, "utf8"), raw);
      assert.equal(existsSync(`${path}.lock`), false);
    }
    unlinkSync(path);
    symlinkSync(join(dir, "missing"), path);
    assert.throws(() => new DocumentStore(path));
    assert.equal(lstatSync(path).isSymbolicLink(), true);
    unlinkSync(path);
    writeFileSync(path, JSON.stringify(createDemo()));
    const store = new DocumentStore(path);
    try {
      for (const input of [
        null,
        {},
        { expectedRevision: 0, commands: [] },
        { expectedRevision: 0, commands: Array(101).fill(rename) },
        { expectedRevision: 0, commands: [rename], documentPath: "ignored" },
        { expectedRevision: 0.5, commands: [rename] },
      ])
        assert.equal(store.apply(input).ok, false);
      assert.equal(store.snapshot().revision, 0);
      // Force rename failure, then restore the previous file. Memory never advances.
      renameSync(path, `${path}.backup`);
      mkdirSync(path);
      const result = store.apply({ expectedRevision: 0, commands: [rename] });
      assert.ok(!result.ok && result.code === "storage");
      assert.equal(store.snapshot().revision, 0);
      rmdirSync(path);
      renameSync(`${path}.backup`, path);
    } finally {
      store.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
