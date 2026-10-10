import { useEffect, useRef, useState } from "react";
import type { ModelDocument } from "./model.ts";
import type { DraftScope } from "./ui.ts";
import type { Snapshot, StoreResult } from "../server/store.ts";

/** Poll only while safe; conflict/reconnect requires an explicit discard-and-reload. */
export function useSharedDocument(
  enabled: boolean,
  receive: (document: ModelDocument, reset: boolean) => void,
  message: (text: string) => void,
) {
  const callbacks = useRef({ receive, message });
  callbacks.current = { receive, message };
  const state = useRef({
    revision: -1,
    drafts: new Map<DraftScope, number>(),
    blocked: false,
    pending: false,
    generation: 0,
  });
  const hasDrafts = () => {
    // Forms unmount when users navigate away. The command text lives in App
    // across tab switches, so its scope remains until saved or explicitly reset.
    for (const scope of state.current.drafts.keys()) {
      if (typeof scope !== "string" && !scope.isConnected)
        state.current.drafts.delete(scope);
    }
    return state.current.drafts.size > 0;
  };
  const [status, setStatus] = useState("Connecting");
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);
  const [reloadNeeded, setReloadNeeded] = useState(false);
  const headers = { "X-Model-Canvas": "1" };
  const block = (text: string) => {
    state.current.blocked = true;
    setReloadNeeded(true);
    setStatus(text);
  };
  const get = async (): Promise<Snapshot> => {
    const response = await fetch("/api/document", {
      headers,
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Shared document unavailable");
    return response.json();
  };
  const accept = (snapshot: Snapshot, reset: boolean) => {
    state.current.revision = snapshot.revision;
    callbacks.current.receive(snapshot.document, reset);
    setReady(true);
    setStatus(`Connected · revision ${snapshot.revision}`);
  };
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const generation = state.current.generation;
      try {
        if (!state.current.pending && !state.current.blocked) {
          const snapshot = await get();
          if (
            !active ||
            state.current.pending ||
            state.current.blocked ||
            generation !== state.current.generation
          )
            return;
          if (snapshot.revision !== state.current.revision) {
            if (hasDrafts())
              block(
                "Remote changes available. Drafts preserved; reload required.",
              );
            else accept(snapshot, true);
          }
        }
      } catch {
        if (active && generation === state.current.generation)
          block(
            "Disconnected. Drafts preserved; reconnect with Reload shared document.",
          );
      } finally {
        if (active) timer = setTimeout(() => void poll(), 750);
      }
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
    // Callbacks are refs; the connection lifetime is tied only to the mode.
  }, [enabled]);
  useEffect(() => {
    if (!enabled) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (hasDrafts() || state.current.pending) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [enabled]);
  const apply = async (
    command: unknown,
    draftScope?: DraftScope,
  ): Promise<boolean> => {
    const submittedVersion =
      draftScope === undefined
        ? undefined
        : state.current.drafts.get(draftScope);
    if (!ready || state.current.pending || state.current.blocked) {
      callbacks.current.message(
        "Shared edit not sent. Wait for the current save, or reload the shared document.",
      );
      return false;
    }
    state.current.pending = true;
    state.current.generation++;
    setPending(true);
    try {
      const response = await fetch("/api/commands", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: state.current.revision,
          commands: [command],
        }),
        signal: AbortSignal.timeout(5000),
      });
      const result = (await response.json()) as StoreResult;
      if (!result.ok) {
        callbacks.current.message(
          `Command rejected: ${result.error ?? "Invalid request"}`,
        );
        if (!response.ok && response.status !== 400)
          block("Conflict or save failure. Drafts preserved; reload required.");
        return false;
      }
      accept(result, false);
      callbacks.current.message(`Saved shared revision ${result.revision}.`);
      // Acknowledging one form must not clear another form (or edits made
      // after this submission). Failures and unknown outcomes clear nothing.
      if (
        draftScope !== undefined &&
        state.current.drafts.get(draftScope) === submittedVersion
      )
        state.current.drafts.delete(draftScope);
      return true;
    } catch {
      block(
        "Disconnected. Save outcome unknown; reload to reconcile. Drafts preserved.",
      );
      callbacks.current.message(
        "Do not retry blindly: the server may have saved this command.",
      );
      return false;
    } finally {
      state.current.pending = false;
      setPending(false);
    }
  };
  const reload = async () => {
    if (state.current.pending) return;
    state.current.pending = true;
    state.current.generation++;
    setPending(true);
    try {
      const snapshot = await get();
      state.current.drafts.clear();
      state.current.blocked = false;
      setReloadNeeded(false);
      accept(snapshot, true);
      callbacks.current.message(
        "Loaded shared document. Previous form drafts discarded by request.",
      );
    } catch {
      block(
        "Disconnected. Drafts preserved; reconnect with Reload shared document.",
      );
    } finally {
      state.current.pending = false;
      setPending(false);
    }
  };
  return {
    status,
    ready,
    pending,
    reloadNeeded,
    apply,
    reload,
    markDraft: (scope: DraftScope | null) => {
      if (enabled && scope !== null)
        state.current.drafts.set(
          scope,
          (state.current.drafts.get(scope) ?? 0) + 1,
        );
    },
    clearDraft: (scope: DraftScope | null) => {
      if (scope !== null) state.current.drafts.delete(scope);
    },
  };
}
