import { useState } from "react";
import type { Entity, Field, FieldType, ModelDocument } from "./model.ts";
import { makeId } from "./ui.ts";
import type { Dispatch } from "./ui.ts";

export function Inspector({
  entity,
  document,
  dispatch,
}: {
  entity: Entity;
  document: ModelDocument;
  dispatch: Dispatch;
}) {
  const [sourceId, setSourceId] = useState(
    document.model.entities[0]?.id ?? "",
  );
  const sources = document.model.entities;
  const available = entity.fields.filter(
    (f) =>
      f.type === "string" &&
      !document.model.relations.some((r) => r.targetFieldId === f.id),
  );
  const related = document.model.relations.filter(
    (r) => r.sourceEntityId === entity.id || r.targetEntityId === entity.id,
  );
  return (
    <>
      <div className="inspector-section">
        <span className="eyebrow">SELECTED ENTITY</span>
        <code className="stable-id">{entity.id}</code>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            dispatch(
              {
                type: "updateEntity",
                entityId: entity.id,
                name: String(data.get("name")),
              },
              event.currentTarget,
            );
          }}
        >
          <label>
            Entity name
            <input
              name="name"
              key={entity.name}
              defaultValue={entity.name}
              required
              maxLength={200}
            />
          </label>
          <button type="submit">Rename entity</button>
        </form>
      </div>
      <div className="inspector-section">
        <div className="section-heading">
          <h3>Fields</h3>
          <span>{entity.fields.length}</span>
        </div>
        {entity.fields.map((field) => (
          <FieldEditor
            key={`${field.id}-${field.name}-${field.type}-${field.required}`}
            field={field}
            entityId={entity.id}
            dispatch={dispatch}
          />
        ))}
        <button
          className="full-width"
          onClick={() =>
            dispatch({
              type: "addField",
              entityId: entity.id,
              field: {
                id: makeId("field"),
                name: `Field ${entity.fields.length + 1}`,
                type: "string",
                required: false,
              },
            })
          }
        >
          ＋ Add field
        </button>
      </div>
      <div className="inspector-section">
        <h3>Relations</h3>
        <p className="muted">
          A source record has many records in this entity. References use stable
          sample record IDs.
        </p>
        {related.map((relation) => (
          <div className="relation-row" key={relation.id}>
            <strong>
              {
                document.model.entities.find(
                  (e) => e.id === relation.sourceEntityId,
                )?.name
              }{" "}
              <span>1 → N</span>{" "}
              {
                document.model.entities.find(
                  (e) => e.id === relation.targetEntityId,
                )?.name
              }
            </strong>
            <small>
              via{" "}
              {
                document.model.entities
                  .find((e) => e.id === relation.targetEntityId)
                  ?.fields.find((f) => f.id === relation.targetFieldId)?.name
              }
            </small>
            <button
              className="danger-text"
              aria-label={`Disconnect ${relation.id}`}
              onClick={() =>
                dispatch({ type: "removeRelation", relationId: relation.id })
              }
            >
              Disconnect
            </button>
          </div>
        ))}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            dispatch(
              {
                type: "addRelation",
                relation: {
                  id: makeId("relation"),
                  sourceEntityId: sourceId,
                  targetEntityId: entity.id,
                  targetFieldId: String(data.get("targetField")),
                },
              },
              event.currentTarget,
            );
          }}
        >
          <label>
            Source entity (one)
            <select
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
            >
              {sources.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Reference field (many)
            <select
              name="targetField"
              key={available.map((f) => f.id).join(",")}
              disabled={!available.length}
            >
              {available.length ? (
                available.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))
              ) : (
                <option>No unconnected string fields</option>
              )}
            </select>
          </label>
          <button type="submit" disabled={!available.length}>
            Connect relation
          </button>
        </form>
      </div>
    </>
  );
}
function FieldEditor({
  field,
  entityId,
  dispatch,
}: {
  field: Field;
  entityId: string;
  dispatch: Dispatch;
}) {
  return (
    <form
      className="field-editor"
      aria-label={`Edit ${field.name}`}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        dispatch(
          {
            type: "updateField",
            entityId,
            fieldId: field.id,
            patch: {
              name: String(data.get("name")),
              type: data.get("type") as FieldType,
              required: data.get("required") === "on",
            },
          },
          event.currentTarget,
        );
      }}
    >
      <label>
        Field name
        <input name="name" defaultValue={field.name} required maxLength={200} />
      </label>
      <div className="field-options">
        <label>
          Type
          <select name="type" defaultValue={field.type}>
            <option>string</option>
            <option>number</option>
            <option>boolean</option>
          </select>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            name="required"
            defaultChecked={field.required}
          />
          Required
        </label>
      </div>
      <button type="submit">Update field</button>
    </form>
  );
}
