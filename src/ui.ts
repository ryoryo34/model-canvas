import type { Command } from "./model.ts";

export type Dispatch = (command: Command) => Promise<boolean>;
export const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
