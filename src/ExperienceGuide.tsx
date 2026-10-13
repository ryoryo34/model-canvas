import type { Diagnostic, ModelDocument } from "./model.ts";

export function hasPractice(document: ModelDocument) {
  const project = document.model.entities.find((e) => e.id === "project");
  return (
    !!project &&
    [
      ["project_title", "string"],
      ["project_budget", "number"],
      ["project_customer", "string"],
    ].every(([id, type]) =>
      project.fields.some((f) => f.id === id && f.type === type),
    ) &&
    document.model.samples.some(
      (s) => s.id === "project_draft" && s.entityId === "project",
    ) &&
    document.model.samples.some(
      (s) => s.id === "customer_lumen" && s.entityId === "customer",
    ) &&
    document.model.relations.some(
      (r) =>
        r.sourceEntityId === "customer" &&
        r.targetFieldId === "project_customer",
    )
  );
}

export function PracticeSteps({
  document,
  diagnostics,
  sharedMode,
  save,
  download,
  back,
  close,
}: {
  document: ModelDocument;
  diagnostics: Diagnostic[];
  sharedMode: boolean;
  save: () => void;
  download: () => void;
  back: () => void;
  close: () => void;
}) {
  const issues = diagnostics.filter((d) => d.recordId === "project_draft");
  const record = document.model.samples.find((s) => s.id === "project_draft")!;
  const fields = document.model.entities.find(
    (e) => e.id === "project",
  )!.fields;
  const tips = [
    { id: "project_title", rule: "Required", example: "Community demo" },
    { id: "project_budget", rule: "Number", example: "4200" },
    {
      id: "project_customer",
      rule: "Existing customer",
      example: "customer_lumen",
    },
  ];
  return (
    <section
      className="practice-steps"
      aria-label="Practice steps"
      id={issues.length ? undefined : "practice-result"}
      tabIndex={-1}
    >
      <span className="eyebrow">
        {issues.length ? "02 / TRY & VALIDATE" : "03 / KEEP YOUR MODEL"}
      </span>
      <h3>
        {issues.length
          ? "Fix the fictional record"
          : "This record fits your model"}
      </h3>
      <p aria-live="polite">
        {issues.length
          ? `${issues.length} issues left in project_draft. Type values below, then Apply sample.`
          : "0 issues in project_draft. The applied values now pass validation."}
      </p>
      <ul>
        {tips.map((tip) => (
          <li key={tip.id}>
            <strong>{fields.find((f) => f.id === tip.id)?.name}</strong>
            <span>
              {issues.some((d) => d.fieldId === tip.id)
                ? `${tip.rule} · try ${tip.example}`
                : `✓ ${String(record.values[tip.id] ?? "Not set")}`}
            </span>
          </li>
        ))}
      </ul>
      {!issues.length && (
        <>
          <p>
            {diagnostics.length
              ? "Other records still have issues. Choose a diagnostic to continue."
              : "All samples valid. Your model checks required values, types, and relations."}
          </p>
          <div className="guide-actions">
            {sharedMode ? (
              <span>Applied edits are saved to the shared server.</span>
            ) : (
              <button onClick={save}>Save this model locally</button>
            )}
            <button onClick={download}>Download model JSON</button>
          </div>
        </>
      )}
      <div className="guide-actions">
        <button onClick={back}>Back to overview</button>
        <button onClick={close}>Close practice</button>
      </div>
    </section>
  );
}
