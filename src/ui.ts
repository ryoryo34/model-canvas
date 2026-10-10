import type { Command } from "./model.ts";

export type DraftScope = HTMLElement | "command";
export type Dispatch = (
  command: Command,
  draftScope?: DraftScope,
) => Promise<boolean>;
export const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
