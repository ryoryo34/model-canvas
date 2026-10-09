import { assertDocument, exportDocument } from "./model.ts";
import type { ModelDocument } from "./model.ts";
import { createDemo } from "./fixture.ts";

export const STORAGE_KEY = "model-canvas.document.v1";
export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export function loadLocal(storage: StoragePort): {
  document: ModelDocument;
  message: string;
} {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null)
      return {
        document: createDemo(),
        message: "Fictional demo loaded. Save locally to keep your changes.",
      };
    const document: unknown = JSON.parse(raw);
    assertDocument(document);
    return {
      document,
      message: "Restored from this browser. Sample diagnostics are preserved.",
    };
  } catch {
    return {
      document: createDemo(),
      message:
        "Local data could not be read. Demo opened; stored data has not been overwritten.",
    };
  }
}
export function saveLocal(
  storage: StoragePort,
  document: ModelDocument,
): string {
  try {
    storage.setItem(STORAGE_KEY, exportDocument(document));
    return "Saved in this browser.";
  } catch {
    return "Local save failed. Your current document is intact; export JSON to keep a copy.";
  }
}
