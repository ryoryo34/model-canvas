import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { applyCommand, assertDocument } from "../src/model.ts";
import type { ModelDocument } from "../src/model.ts";
import { createDemo } from "../src/fixture.ts";

export const MAX_REQUEST_BYTES = 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
export const MAX_COMMANDS = 100;
export interface Snapshot {
  revision: number;
  document: ModelDocument;
}
export type StoreResult =
  | ({ ok: true } & Snapshot)
  | {
      ok: false;
      code: "conflict" | "invalid" | "storage";
      error: string;
      revision: number;
    };

/** One process owns the file. Synchronous commits serialize HTTP and MCP writers. */
export class DocumentStore {
  private state: Snapshot;
  private path: string;
  private lock: string;
  private closed = false;

  constructor(documentPath: string) {
    const absolute = resolve(documentPath);
    this.path = join(realpathSync(dirname(absolute)), basename(absolute));
    this.lock = `${this.path}.lock`;
    const fd = openSync(this.lock, "wx", 0o600);
    try {
      writeFileSync(fd, String(process.pid));
    } finally {
      closeSync(fd);
    }
    try {
      const info = lstatSync(this.path, { throwIfNoEntry: false });
      if (info) {
        if (!info.isFile() || info.size > MAX_DOCUMENT_BYTES)
          throw new Error("Invalid document file.");
        const value = JSON.parse(readFileSync(this.path, "utf8"));
        if (value && value.storeVersion === 1) {
          if (
            Object.keys(value).some(
              (k) => !["storeVersion", "revision", "document"].includes(k),
            ) ||
            !Number.isSafeInteger(value.revision) ||
            value.revision < 0
          )
            throw new Error("Invalid revision.");
          assertDocument(value.document);
          this.state = { revision: value.revision, document: value.document };
        } else {
          assertDocument(value);
          this.state = { revision: 0, document: value };
        }
      } else {
        this.state = { revision: 0, document: createDemo() };
        this.persist(this.state);
      }
    } catch {
      this.close();
      throw new Error(
        "Cannot open document: invalid file or storage unavailable. Existing bytes preserved.",
      );
    }
  }

  snapshot(): Snapshot {
    return structuredClone(this.state);
  }

  apply(input: unknown): StoreResult {
    const fail = (
      code: "conflict" | "invalid" | "storage",
      error: string,
    ): StoreResult => ({
      ok: false,
      code,
      error: error.slice(0, 500),
      revision: this.state.revision,
    });
    if (this.closed) return fail("storage", "Document store is closed.");
    if (!input || typeof input !== "object" || Array.isArray(input))
      return fail("invalid", "Expected an object.");
    const request = input as Record<string, unknown>;
    if (
      Object.keys(request).some(
        (k) => !["expectedRevision", "commands"].includes(k),
      ) ||
      !Number.isSafeInteger(request.expectedRevision) ||
      (request.expectedRevision as number) < 0 ||
      !Array.isArray(request.commands) ||
      request.commands.length < 1 ||
      request.commands.length > MAX_COMMANDS
    )
      return fail(
        "invalid",
        "Provide expectedRevision and 1–100 commands only.",
      );
    try {
      if (Buffer.byteLength(JSON.stringify(request)) > MAX_REQUEST_BYTES)
        return fail("invalid", "Request exceeds 1 MiB.");
    } catch {
      return fail("invalid", "Expected JSON data.");
    }
    if (request.expectedRevision !== this.state.revision)
      return fail(
        "conflict",
        "Revision conflict. Get/reload the latest document before editing again.",
      );
    if (this.state.revision === Number.MAX_SAFE_INTEGER)
      return fail("invalid", "Revision limit reached.");
    let document = this.state.document;
    for (const [index, command] of request.commands.entries()) {
      const result = applyCommand(document, command);
      if (!result.ok)
        return fail("invalid", `Command ${index + 1}: ${result.error}`);
      document = result.document;
    }
    const next = { revision: this.state.revision + 1, document };
    try {
      this.persist(next);
    } catch {
      return fail(
        "storage",
        "Save failed or document exceeds 4 MiB. No changes committed.",
      );
    }
    this.state = next;
    return { ok: true, ...this.snapshot() };
  }

  private persist(next: Snapshot) {
    const bytes = JSON.stringify({ storeVersion: 1, ...next });
    if (Buffer.byteLength(bytes) > MAX_DOCUMENT_BYTES)
      throw new Error("Document too large.");
    const temp = `${this.path}.${randomUUID()}.tmp`;
    const fd = openSync(temp, "wx", 0o600);
    try {
      try {
        writeFileSync(fd, bytes);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      renameSync(temp, this.path);
    } finally {
      if (existsSync(temp)) unlinkSync(temp);
    }
  }

  close() {
    if (!this.closed) {
      this.closed = true;
      unlinkSync(this.lock);
    }
  }
}
