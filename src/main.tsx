import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  applyCommand,
  exportDocument,
  importDocument,
  validateSamples,
} from "./model.ts";
import type { ModelDocument } from "./model.ts";
import { Canvas } from "./Canvas.tsx";
import { Inspector } from "./Inspector.tsx";
import { hasPractice, PracticeSteps } from "./ExperienceGuide.tsx";
import { SampleEditor } from "./SampleEditor.tsx";
import { makeId } from "./ui.ts";
import type { Dispatch } from "./ui.ts";
import { loadLocal, saveLocal } from "./storage.ts";
import "./style.css";
import { createDemo } from "./fixture.ts";
import { useSharedDocument } from "./shared.ts";

const sharedMode =
  new URLSearchParams(window.location.search).get("shared") === "1";

const example = JSON.stringify(
  {
    type: "addField",
    entityId: "project",
    field: {
      id: "project_notes",
      name: "Notes",
      type: "string",
      required: false,
    },
  },
  null,
  2,
);
function boot() {
  if (sharedMode)
    return {
      document: createDemo(),
      message: "Connecting to shared document…",
    };
  try {
    return loadLocal(window.localStorage);
  } catch {
    return loadLocal({
      getItem() {
        throw new Error("Storage unavailable");
      },
      setItem() {},
    });
  }
}

function App() {
  const [initial] = useState(boot);
  const [document, setDocument] = useState(initial.document);
  const current = useRef(document);
  const [selected, setSelected] = useState(
    document.model.entities[0]?.id ?? "",
  );
  const [message, setMessage] = useState(initial.message);
  const [commandJson, setCommandJson] = useState(example);
  const [tab, setTab] = useState<"samples" | "commands">("samples");
  const [guide, setGuide] = useState<"overview" | "practice" | "closed">(
    "overview",
  );
  const [recordIds, setRecordIds] = useState<Record<string, string>>({});
  const [destination, setDestination] = useState<{
    recordId: string;
    fieldId: string;
  }>();
  const [sampleApplied, setSampleApplied] = useState(0);
  useEffect(() => {
    if (!sampleApplied) return;
    const result = window.document.getElementById("practice-result");
    result?.focus({ preventScroll: true });
    result?.scrollIntoView({ block: "center" });
  }, [sampleApplied]);
  const overview = useRef<HTMLElement>(null);
  const reopenGuide = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (guide === "closed") reopenGuide.current?.focus({ preventScroll: true });
  }, [guide]);
  const showSample = (entityId: string, recordId: string, fieldId: string) => {
    setSelected(entityId);
    setRecordIds((ids) => ({ ...ids, [entityId]: recordId }));
    setTab("samples");
    setDestination({ recordId, fieldId });
  };
  useEffect(() => {
    if (!destination) return;
    const input = window.document.getElementById(
      `sample:${destination.recordId}:${destination.fieldId}`,
    );
    input?.focus({ preventScroll: true });
    input?.scrollIntoView({ block: "center" });
  }, [destination]);
  const backToOverview = () => {
    setGuide("overview");
    overview.current?.scrollIntoView({ block: "start" });
    overview.current?.focus({ preventScroll: true });
  };
  const [dirty, setDirty] = useState(false);
  const [revision, setRevision] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const diagnostics = validateSamples(document);
  const entity = document.model.entities.find((e) => e.id === selected);
  const replace = (next: ModelDocument) => {
    current.current = next;
    setDocument(next);
    setDirty(true);
  };
  const shared = useSharedDocument(
    sharedMode,
    (next, reset) => {
      current.current = next;
      setDocument(next);
      if (reset) setRevision((r) => r + 1);
    },
    setMessage,
  );
  const dispatch: Dispatch = async (command, draftScope) => {
    const announcePractice = () => {
      if (
        guide === "practice" &&
        command.type === "setSample" &&
        command.sample.id === "project_draft"
      )
        setSampleApplied((count) => count + 1);
    };
    if (sharedMode) {
      const applied = await shared.apply(command, draftScope);
      if (applied) announcePractice();
      return applied;
    }
    const result = applyCommand(current.current, command);
    if (!result.ok) {
      setMessage(`Command rejected: ${result.error}`);
      return false;
    }
    replace(result.document);
    setMessage(`Applied ${command.type}.`);
    announcePractice();
    return true;
  };
  const applyJson = async () => {
    try {
      if (sharedMode) {
        await shared.apply(JSON.parse(commandJson), "command");
        return;
      }
      const result = applyCommand(current.current, JSON.parse(commandJson));
      if (!result.ok) {
        setMessage(`Command rejected: ${result.error}`);
        return;
      }
      replace(result.document);
      setRevision((r) => r + 1);
      setMessage("JSON command applied through the shared command API.");
    } catch {
      setMessage("Invalid command JSON. Current document preserved.");
    }
  };
  const download = () => {
    const blob = new Blob([exportDocument(current.current)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = "model-canvas.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage(
      "JSON exported. Resolve missing sample references before importing it.",
    );
  };
  const readFile = async (file: File | undefined) => {
    if (!file) return;
    const before = current.current;
    try {
      const result = importDocument(await file.text());
      if (!result.ok) {
        setMessage(
          `Import rejected: ${result.error} Current document preserved.`,
        );
        return;
      }
      if (current.current !== before) {
        setMessage(
          "Document changed while reading the file. Import again to avoid losing those changes.",
        );
        return;
      }
      replace(result.document);
      setSelected(result.document.model.entities[0]?.id ?? "");
      setRevision((r) => r + 1);
      setMessage("Imported document and layout. Save locally to keep it.");
    } catch {
      setMessage("Could not read the file. Current document preserved.");
    }
  };
  const save = () => {
    try {
      const status = saveLocal(window.localStorage, current.current);
      setMessage(status);
      if (status === "Saved in this browser.") setDirty(false);
    } catch {
      setMessage("Local save failed. Export JSON to keep a copy.");
    }
  };
  return (
    <>
      <header className="app-header">
        <div className="brand">
          <span className="brand-icon">◈</span>
          <div>
            Model Canvas<small>A small studio for big ideas</small>
          </div>
        </div>
        <div className="header-actions">
          <span className="local-badge">
            <i /> {sharedMode ? "Shared mode · MCP + browser" : "Local demo"}
          </span>
          <button
            disabled={sharedMode}
            onClick={() => fileInput.current?.click()}
          >
            Import JSON
          </button>
          <button onClick={download}>Export JSON</button>
          <button disabled={sharedMode} className="primary" onClick={save}>
            Save locally{dirty ? " •" : ""}
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          aria-label="Import document"
          className="file-input"
          onChange={(event) => {
            void readFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </header>
      {sharedMode && (
        <section className="shared-banner" aria-label="Shared connection">
          <strong role="status">{shared.status}</strong>
          <span>
            Applied edits save to the server file. Drafts pause incoming
            changes.
          </span>
          <button
            disabled={shared.pending}
            onClick={() => void shared.reload()}
          >
            Reload shared document (discard drafts)
          </button>
          {shared.reloadNeeded && (
            <span role="alert">
              Reload required before more edits. Copy unsent form text first;
              Export JSON preserves the displayed model.
            </span>
          )}
        </section>
      )}
      <div className="workspace-bar">
        <div>
          <span className="eyebrow">WORKSPACE / FICTIONAL EXAMPLE</span>
          <h1>Customer & project studio</h1>
        </div>
        <span className="version">
          Document v{document.documentVersion}
          <span>All changes stay on this device</span>
        </span>
      </div>
      <div
        className="workspace"
        inert={sharedMode && (!shared.ready || shared.pending)}
        onChangeCapture={(event) => {
          const target = event.target as HTMLElement;
          shared.markDraft(
            target.id === "command-json" ? "command" : target.closest("form"),
          );
        }}
        onPointerDownCapture={(event) => {
          if (event.button === 0)
            shared.markDraft(
              (event.target as HTMLElement).closest(".node-header"),
            );
        }}
        onPointerUpCapture={(event) =>
          shared.clearDraft(
            (event.target as HTMLElement).closest(".node-header"),
          )
        }
        onPointerCancelCapture={(event) =>
          shared.clearDraft(
            (event.target as HTMLElement).closest(".node-header"),
          )
        }
        onLostPointerCapture={(event) =>
          shared.clearDraft(
            (event.target as HTMLElement).closest(".node-header"),
          )
        }
      >
        <aside className="sidebar">
          <div className="section-heading">
            <h2>Entities</h2>
            <span>
              {document.model.entities.length.toString().padStart(2, "0")}
            </span>
          </div>
          <nav aria-label="Entities">
            {document.model.entities.map((item, index) => (
              <button
                key={item.id}
                aria-pressed={selected === item.id}
                className={`entity-nav ${selected === item.id ? "selected" : ""}`}
                onClick={() => setSelected(item.id)}
              >
                <span className="entity-icon">{index + 1}</span>
                <span>
                  {item.name}
                  <small>{item.fields.length} fields</small>
                </span>
                <span>↗</span>
              </button>
            ))}
          </nav>
          <button
            className="add-entity"
            onClick={async () => {
              const id = makeId("entity");
              if (
                await dispatch({
                  type: "addEntity",
                  entity: {
                    id,
                    name: `Entity ${document.model.entities.length + 1}`,
                    fields: [],
                  },
                  position: {
                    x: 64 + (document.model.entities.length % 3) * 300,
                    y:
                      80 + Math.floor(document.model.entities.length / 3) * 240,
                  },
                })
              )
                setSelected(id);
            }}
          >
            ＋ Add entity
          </button>
          <div className="sidebar-note">
            <span>01 / MODEL</span>
            <p>Make the structure visible.</p>
            <small>
              Select an entity to edit its fields. Try your model with
              real-shaped, fictional data below.
            </small>
          </div>
          <div className="legend">
            <span>
              <i className="dot" /> Entity
            </span>
            <span>1 ── N &nbsp; One-to-many</span>
            <span>
              <b>*</b> Required field
            </span>
          </div>
        </aside>
        <main>
          <section
            className="experience-guide"
            aria-label="Quick guide"
            ref={overview}
            tabIndex={-1}
          >
            {guide === "closed" ? (
              <button ref={reopenGuide} onClick={() => setGuide("overview")}>
                Show quick guide
              </button>
            ) : (
              <>
                <div className="section-heading">
                  <span className="eyebrow">01 / SEE YOUR MODEL AT WORK</span>
                  <button
                    aria-label="Close guide"
                    onClick={() => setGuide("closed")}
                  >
                    Close
                  </button>
                </div>
                <h2>Test your model with sample data.</h2>
                <p>
                  {hasPractice(document)
                    ? "The fictional example starts with 3 deliberate errors. Fix a record to see required fields, types, and customer references work together."
                    : "Select an entity, try sample values, and apply them to check your model. Choose any diagnostic to jump to its record and field."}
                </p>
                <div className="guide-actions">
                  {hasPractice(document) && (
                    <button
                      className="primary"
                      onClick={() => {
                        setGuide("practice");
                        showSample("project", "project_draft", "project_title");
                      }}
                    >
                      {guide === "practice"
                        ? "Return to practice record"
                        : "Try the example"}{" "}
                      →
                    </button>
                  )}
                  <span>Explore → Fix & validate → Save / export</span>
                </div>
                <small>
                  Navigation keeps unapplied inputs. Only Apply changes the
                  sample.
                </small>
              </>
            )}
          </section>
          <section className="canvas-section" aria-label="Model canvas">
            <div className="canvas-toolbar">
              <div>
                <h2>Model canvas</h2>
                <span>
                  {document.model.entities.length} entities ·{" "}
                  {document.model.relations.length} relations
                </span>
              </div>
              <span className="hint">
                Drag headers to arrange · Arrow keys to move
              </span>
            </div>
            <Canvas
              document={document}
              selected={selected}
              onSelect={setSelected}
              dispatch={dispatch}
            />
          </section>
          <section className="sandbox">
            <div className="sandbox-header">
              <div role="tablist" aria-label="Workspace tools">
                <button
                  role="tab"
                  aria-selected={tab === "samples"}
                  onClick={() => setTab("samples")}
                >
                  Sample playground
                </button>
                <button
                  role="tab"
                  aria-selected={tab === "commands"}
                  onClick={() => setTab("commands")}
                >
                  Command API
                </button>
              </div>
              <span
                className={diagnostics.length ? "issue-badge" : "valid-badge"}
              >
                {diagnostics.length
                  ? `${diagnostics.length} validation issues`
                  : "✓ All samples valid"}
              </span>
            </div>
            <div hidden={tab !== "samples"}>
              <div className="sample-grid">
                <div>
                  {document.model.entities.map((item) => (
                    <div
                      key={`${item.id}-${revision}`}
                      hidden={selected !== item.id}
                    >
                      <SampleEditor
                        entity={item}
                        document={document}
                        dispatch={dispatch}
                        diagnostics={diagnostics}
                        recordId={recordIds[item.id]}
                        onRecordChange={(id) =>
                          setRecordIds((ids) => ({ ...ids, [item.id]: id }))
                        }
                        practice={
                          item.id === "project" &&
                          guide === "practice" &&
                          hasPractice(document) ? (
                            <PracticeSteps
                              document={document}
                              diagnostics={diagnostics}
                              sharedMode={sharedMode}
                              save={save}
                              download={download}
                              back={backToOverview}
                              close={() => {
                                setGuide("closed");
                                showSample(
                                  "project",
                                  "project_draft",
                                  "project_title",
                                );
                              }}
                            />
                          ) : undefined
                        }
                      />
                    </div>
                  ))}
                  {!entity && (
                    <p>Select or add an entity to create a sample.</p>
                  )}
                </div>
                <div className="validation">
                  <div className="section-heading">
                    <h3>Validation</h3>
                    <span>LIVE</span>
                  </div>
                  <p className="muted">
                    Required values, primitive types, and source records.
                  </p>
                  {diagnostics.length === 0 ? (
                    <div className="all-valid">
                      <span>✓</span>
                      <strong>Your samples fit the model.</strong>
                      <p>Change a field or value to explore the constraints.</p>
                    </div>
                  ) : (
                    <ul className="diagnostics">
                      {diagnostics.map((d) => (
                        <li key={`${d.recordId}-${d.fieldId}-${d.code}`}>
                          <button
                            onClick={() =>
                              showSample(d.entityId, d.recordId, d.fieldId)
                            }
                          >
                            <span className="diagnostic-code">{d.code}</span>
                            <code>{d.recordId}</code>
                            <p>{d.message}</p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
            <div hidden={tab !== "commands"}>
              <div className="command-panel">
                <div>
                  <h3>A shared, explicit operation boundary</h3>
                  <p>
                    Paste a single JSON command. It uses exactly the same
                    validation and state transition as the UI.
                  </p>
                  <p className="muted">
                    {sharedMode
                      ? "Commands save through the shared server. MCP clients use the same DocumentStore. No LLM chat is running."
                      : "Developer demo only. No AI, LLM, or MCP connection is running."}
                  </p>
                </div>
                <div>
                  <label htmlFor="command-json">Command JSON</label>
                  <textarea
                    id="command-json"
                    value={commandJson}
                    onChange={(e) => setCommandJson(e.target.value)}
                    spellCheck={false}
                    rows={10}
                  />
                  <button className="primary" onClick={applyJson}>
                    Apply command
                  </button>
                </div>
              </div>
            </div>
          </section>
        </main>
        <aside className="inspector">
          <div className="section-heading">
            <h2>Inspector</h2>
            <span>PROPERTIES</span>
          </div>
          {document.model.entities.map((item) => (
            <div key={`${item.id}-${revision}`} hidden={selected !== item.id}>
              <Inspector
                entity={item}
                document={document}
                dispatch={dispatch}
              />
            </div>
          ))}
          {!entity && <p>Select an entity on the canvas.</p>}
        </aside>
      </div>
      <footer role="status">
        <span className="status-dot" />
        {message}
        <span className="footer-note">No account. No API key. No cloud.</span>
      </footer>
    </>
  );
}

createRoot(window.document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
