import { useState } from "react";
import type { Entity, ModelDocument, SampleRecord, Value } from "./model.ts";
import { makeId } from "./ui.ts";
import type { Dispatch } from "./ui.ts";

export function SampleEditor({
  entity,
  document,
  dispatch,
}: {
  entity: Entity;
  document: ModelDocument;
  dispatch: Dispatch;
}) {
  const records = document.model.samples.filter(
    (s) => s.entityId === entity.id,
  );
  const [recordId, setRecordId] = useState(records[0]?.id ?? "");
  const record = records.find((s) => s.id === recordId) ?? records[0];
  return (
    <>
      <div className="section-heading">
        <div>
          <span className="eyebrow">GENERATED FROM YOUR MODEL</span>
          <h3>{entity.name} samples</h3>
        </div>
        <button
          onClick={() => {
            const id = makeId("record");
            if (
              dispatch({
                type: "setSample",
                sample: { id, entityId: entity.id, values: {} },
              })
            )
              setRecordId(id);
          }}
        >
          ＋ Record
        </button>
      </div>
      {record ? (
        <>
          <label>
            Sample record
            <select
              value={record.id}
              onChange={(event) => setRecordId(event.target.value)}
            >
              {records.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id}
                </option>
              ))}
            </select>
          </label>
          <RecordForm
            key={`${record.id}-${JSON.stringify(record.values)}-${JSON.stringify(entity.fields)}`}
            entity={entity}
            record={record}
            document={document}
            dispatch={dispatch}
          />
        </>
      ) : (
        <p className="empty-state">
          Create a record to try the generated form.
        </p>
      )}
    </>
  );
}
function RecordForm({
  entity,
  record,
  document,
  dispatch,
}: {
  entity: Entity;
  record: SampleRecord;
  document: ModelDocument;
  dispatch: Dispatch;
}) {
  const [draft, setDraft] = useState<Record<string, string>>(
    Object.fromEntries(
      entity.fields.map((f) => [
        f.id,
        record.values[f.id] === null || record.values[f.id] === undefined
          ? ""
          : String(record.values[f.id]),
      ]),
    ),
  );
  return (
    <form
      className="record-form"
      onSubmit={(event) => {
        event.preventDefault();
        const values: Record<string, Value> = {};
        for (const field of entity.fields) {
          const value = draft[field.id];
          values[field.id] =
            value.trim() === ""
              ? null
              : field.type === "number" && Number.isFinite(Number(value))
                ? Number(value)
                : field.type === "boolean" && ["true", "false"].includes(value)
                  ? value === "true"
                  : value;
        }
        dispatch({ type: "setSample", sample: { ...record, values } });
      }}
    >
      {entity.fields.map((field) => {
        const relation = document.model.relations.find(
          (r) => r.targetFieldId === field.id,
        );
        const referenceRecords = relation
          ? document.model.samples.filter(
              (s) => s.entityId === relation.sourceEntityId,
            )
          : [];
        const invalidBoolean = !["", "true", "false"].includes(draft[field.id]);
        return (
          <label key={field.id}>
            {field.name}
            {field.required ? " *" : ""}
            <span className="input-type">{field.type}</span>
            {field.type === "boolean" ? (
              <select
                value={draft[field.id]}
                onChange={(e) =>
                  setDraft({ ...draft, [field.id]: e.target.value })
                }
              >
                <option value="">Not set</option>
                <option value="true">true</option>
                <option value="false">false</option>
                {invalidBoolean && (
                  <option value={draft[field.id]}>
                    {draft[field.id]} (invalid)
                  </option>
                )}
              </select>
            ) : (
              <input
                value={draft[field.id]}
                list={relation ? `references-${field.id}` : undefined}
                onChange={(e) =>
                  setDraft({ ...draft, [field.id]: e.target.value })
                }
                placeholder={
                  field.type === "number"
                    ? "e.g. 12000"
                    : relation
                      ? "Source record ID"
                      : "Enter a value"
                }
              />
            )}
            {relation && (
              <>
                <datalist id={`references-${field.id}`}>
                  {referenceRecords.map((r) => (
                    <option key={r.id} value={r.id} />
                  ))}
                </datalist>
                <small>
                  References{" "}
                  {
                    document.model.entities.find(
                      (e) => e.id === relation.sourceEntityId,
                    )?.name
                  }
                  :{" "}
                  {referenceRecords.map((r) => r.id).join(", ") ||
                    "no records yet"}
                </small>
              </>
            )}
          </label>
        );
      })}
      <div className="form-actions">
        <button type="submit" className="primary">
          Apply sample
        </button>
        <button
          type="button"
          className="danger-text"
          onClick={() =>
            dispatch({ type: "removeSample", sampleId: record.id })
          }
        >
          Delete record
        </button>
      </div>
      <p className="muted">
        Apply to validate. Invalid values are kept so you can explore and fix
        them.
      </p>
    </form>
  );
}
