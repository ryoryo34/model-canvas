import type { Command } from "./model.ts";

export type Dispatch = (command: Command) => boolean;
export const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
