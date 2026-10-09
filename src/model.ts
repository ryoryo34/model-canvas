/** Stable identities are independent of labels and canvas coordinates. */
export type FieldType = "string" | "number" | "boolean";
export interface Field {
  id: string;
  name: string;
  type: FieldType;
  required: boolean;
}
export interface Entity {
  id: string;
  name: string;
  fields: Field[];
}
/** One source record can be referenced by many target records via a string field. */
export interface Relation {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  targetFieldId: string;
}
export type Value = string | number | boolean | null;
export interface SampleRecord {
  id: string;
  entityId: string;
  values: Record<string, Value>;
}
export interface Position {
  x: number;
  y: number;
}
export interface ModelDocument {
  documentVersion: 1;
  model: { entities: Entity[]; relations: Relation[]; samples: SampleRecord[] };
  layout: Record<string, Position>;
}
export type Command =
  | { type: "addEntity"; entity: Entity; position: Position }
  | { type: "updateEntity"; entityId: string; name: string }
  | { type: "addField"; entityId: string; field: Field }
  | {
      type: "updateField";
      entityId: string;
      fieldId: string;
      patch: Partial<Pick<Field, "name" | "type" | "required">>;
    }
  | { type: "addRelation"; relation: Relation }
  | { type: "removeRelation"; relationId: string }
  | { type: "setSample"; sample: SampleRecord }
  | { type: "removeSample"; sampleId: string }
  | { type: "moveEntity"; entityId: string; position: Position };
export type Result =
  { ok: true; document: ModelDocument } | { ok: false; error: string };
export interface Diagnostic {
  recordId: string;
  entityId: string;
  fieldId: string;
  code: "required" | "type" | "reference";
  message: string;
}

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function object(
  value: unknown,
  path: string,
): asserts value is Record<string, unknown> {
  ensure(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `${path}: expected an object.`,
  );
  ensure(
    Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null,
    `${path}: expected a plain JSON object.`,
  );
}

function keys(value: Record<string, unknown>, allowed: string[], path: string) {
  ensure(
    Object.keys(value).every((key) => allowed.includes(key)),
    `${path}: unknown property.`,
  );
}
function text(value: unknown, path: string): asserts value is string {
  ensure(
    typeof value === "string" && value.trim().length > 0 && value.length <= 200,
    `${path}: expected 1–200 nonblank characters.`,
  );
}
function id(value: unknown, path: string): asserts value is string {
  text(value, path);
  ensure(
    /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value) &&
      !Object.hasOwn(Object.prototype, value) &&
      value !== "prototype",
    `${path}: use letters, digits, underscores or hyphens; reserved IDs are forbidden.`,
  );
}
function list(value: unknown, path: string): asserts value is unknown[] {
  ensure(Array.isArray(value), `${path}: expected an array.`);
}
function position(value: unknown) {
  object(value, "Position");
  keys(value, ["x", "y"], "Position");
  for (const key of ["x", "y"])
    ensure(
      typeof value[key] === "number" &&
        Number.isFinite(value[key]) &&
        value[key] >= 0 &&
        value[key] <= 4000,
      "Position: x and y must be finite numbers from 0 to 4000.",
    );
}

/** Checks structural integrity only. Invalid sample values remain editable diagnostics. */
export function assertDocument(value: unknown): asserts value is ModelDocument {
  object(value, "Document");
  keys(value, ["documentVersion", "model", "layout"], "Document");
  ensure(
    value.documentVersion === 1,
    "Unsupported documentVersion. Expected version 1.",
  );
  object(value.model, "Model");
  keys(value.model, ["entities", "relations", "samples"], "Model");
  const { entities, relations, samples } = value.model;
  list(entities, "Entities");
  list(relations, "Relations");
  list(samples, "Samples");
  object(value.layout, "Layout");
  const seen = new Set<string>();
  const claim = (value: unknown) => {
    id(value, "ID");
    ensure(!seen.has(value), `Duplicate ID: ${value}.`);
    seen.add(value);
  };
  const entityMap = new Map<string, Entity>();
  for (const entity of entities) {
    object(entity, "Entity");
    keys(entity, ["id", "name", "fields"], "Entity");
    claim(entity.id);
    text(entity.name, "Entity name");
    list(entity.fields, "Fields");
    for (const field of entity.fields) {
      object(field, "Field");
      keys(field, ["id", "name", "type", "required"], "Field");
      claim(field.id);
      text(field.name, "Field name");
      ensure(
        ["string", "number", "boolean"].includes(field.type as string),
        "Field type must be string, number or boolean.",
      );
      ensure(
        typeof field.required === "boolean",
        "Field required must be boolean.",
      );
    }
    entityMap.set(entity.id as string, entity as unknown as Entity);
    ensure(
      Object.hasOwn(value.layout, entity.id as string),
      `Missing layout for ${entity.id}.`,
    );
    position(value.layout[entity.id as string]);
  }
  for (const key of Object.keys(value.layout))
    ensure(entityMap.has(key), `Layout references unknown entity: ${key}.`);
  const relationFields = new Set<string>();
  for (const relation of relations) {
    object(relation, "Relation");
    keys(
      relation,
      ["id", "sourceEntityId", "targetEntityId", "targetFieldId"],
      "Relation",
    );
    claim(relation.id);
    id(relation.sourceEntityId, "Source entity");
    id(relation.targetEntityId, "Target entity");
    id(relation.targetFieldId, "Target field");
    ensure(
      entityMap.has(relation.sourceEntityId),
      `Unknown source entity: ${relation.sourceEntityId}.`,
    );
    const field = entityMap
      .get(relation.targetEntityId)
      ?.fields.find((f) => f.id === relation.targetFieldId);
    ensure(
      field,
      `Unknown target entity/field: ${relation.targetEntityId}/${relation.targetFieldId}.`,
    );
    ensure(
      field.type === "string",
      "A relation must use a string field containing a source record ID.",
    );
    ensure(
      !relationFields.has(field.id),
      `Field ${field.id} already has a relation.`,
    );
    relationFields.add(field.id);
  }
  for (const sample of samples) {
    object(sample, "Sample");
    keys(sample, ["id", "entityId", "values"], "Sample");
    claim(sample.id);
    id(sample.entityId, "Sample entity");
    const entity = entityMap.get(sample.entityId);
    ensure(entity, `Unknown sample entity: ${sample.entityId}.`);
    object(sample.values, "Sample values");
    for (const [fieldId, fieldValue] of Object.entries(sample.values)) {
      ensure(
        entity.fields.some((f) => f.id === fieldId),
        `Unknown sample field: ${fieldId}.`,
      );
      ensure(
        fieldValue === null ||
          ["string", "boolean"].includes(typeof fieldValue) ||
          (typeof fieldValue === "number" && Number.isFinite(fieldValue)),
        `Sample ${sample.id}/${fieldId}: values must be finite JSON primitives.`,
      );
    }
  }
}

/** The single atomic boundary used by both UI gestures and JSON command input. */
export function applyCommand(current: ModelDocument, input: unknown): Result {
  try {
    assertDocument(current);
    object(input, "Command");
    const commandKeys: Record<string, string[]> = {
      addEntity: ["entity", "position"],
      updateEntity: ["entityId", "name"],
      addField: ["entityId", "field"],
      updateField: ["entityId", "fieldId", "patch"],
      addRelation: ["relation"],
      removeRelation: ["relationId"],
      setSample: ["sample"],
      removeSample: ["sampleId"],
      moveEntity: ["entityId", "position"],
    };
    ensure(
      typeof input.type === "string" && Object.hasOwn(commandKeys, input.type),
      "Unknown command type.",
    );
    const allowed = commandKeys[input.type];
    keys(input, ["type", ...allowed], "Command");
    ensure(
      allowed.every((key) => Object.hasOwn(input, key)),
      "Command is missing a required property.",
    );
    const next = structuredClone(current);
    const entity = (entityId: unknown) => {
      id(entityId, "Entity ID");
      const found = next.model.entities.find((e) => e.id === entityId);
      ensure(found, `Unknown entity: ${entityId}.`);
      return found;
    };
    // Runtime validation below and assertDocument gate every commit, including untyped JSON callers.
    const command = input as unknown as Command;
    switch (command.type) {
      case "addEntity":
        object(command.entity, "Entity");
        id(command.entity.id, "Entity ID");
        ensure(
          !next.model.entities.some((e) => e.id === command.entity.id),
          `Duplicate ID: ${command.entity.id}.`,
        );
        next.model.entities.push(structuredClone(command.entity));
        next.layout[command.entity.id] = structuredClone(command.position);
        break;
      case "updateEntity":
        entity(command.entityId).name = command.name;
        break;
      case "addField":
        entity(command.entityId).fields.push(structuredClone(command.field));
        break;
      case "updateField": {
        id(command.fieldId, "Field ID");
        const field = entity(command.entityId).fields.find(
          (f) => f.id === command.fieldId,
        );
        ensure(field, `Unknown field: ${command.fieldId}.`);
        object(command.patch, "Field patch");
        keys(command.patch, ["name", "type", "required"], "Field patch");
        Object.assign(field, command.patch);
        break;
      }
      case "addRelation":
        next.model.relations.push(structuredClone(command.relation));
        break;
      case "removeRelation":
        id(command.relationId, "Relation ID");
        ensure(
          next.model.relations.some((r) => r.id === command.relationId),
          `Unknown relation: ${command.relationId}.`,
        );
        next.model.relations = next.model.relations.filter(
          (r) => r.id !== command.relationId,
        );
        break;
      case "setSample": {
        object(command.sample, "Sample");
        id(command.sample.id, "Sample ID");
        const index = next.model.samples.findIndex(
          (s) => s.id === command.sample.id,
        );
        if (index === -1)
          next.model.samples.push(structuredClone(command.sample));
        else {
          ensure(
            next.model.samples[index].entityId === command.sample.entityId,
            "A sample cannot change its entity.",
          );
          next.model.samples[index] = structuredClone(command.sample);
        }
        break;
      }
      case "removeSample":
        id(command.sampleId, "Sample ID");
        ensure(
          next.model.samples.some((s) => s.id === command.sampleId),
          `Unknown sample: ${command.sampleId}.`,
        );
        next.model.samples = next.model.samples.filter(
          (s) => s.id !== command.sampleId,
        );
        break;
      case "moveEntity":
        entity(command.entityId);
        next.layout[command.entityId] = structuredClone(command.position);
        break;
    }
    assertDocument(next);
    return { ok: true, document: next };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid command.",
    };
  }
}

export function validateSamples(document: ModelDocument): Diagnostic[] {
  const issues: Diagnostic[] = [];
  for (const record of document.model.samples) {
    const entity = document.model.entities.find(
      (e) => e.id === record.entityId,
    )!;
    for (const field of entity.fields) {
      const value = record.values[field.id];
      const missing =
        value === undefined ||
        value === null ||
        (typeof value === "string" && value.trim() === "");
      const add = (code: Diagnostic["code"], message: string) =>
        issues.push({
          recordId: record.id,
          entityId: entity.id,
          fieldId: field.id,
          code,
          message,
        });
      if (missing) {
        if (field.required) add("required", `${field.name} is required.`);
        continue;
      }
      if (typeof value !== field.type) {
        add(
          "type",
          `${field.name} must be ${field.type}; got ${typeof value}.`,
        );
        continue;
      }
      const relation = document.model.relations.find(
        (r) => r.targetEntityId === entity.id && r.targetFieldId === field.id,
      );
      if (
        relation &&
        !document.model.samples.some(
          (s) => s.entityId === relation.sourceEntityId && s.id === value,
        )
      ) {
        add(
          "reference",
          `${field.name}: source record “${String(value)}” does not exist in ${document.model.entities.find((e) => e.id === relation.sourceEntityId)!.name}.`,
        );
      }
    }
  }
  return issues;
}

export function exportDocument(document: ModelDocument): string {
  assertDocument(document);
  return JSON.stringify(document, null, 2);
}
export function importDocument(json: string): Result {
  try {
    const document: unknown = JSON.parse(json);
    assertDocument(document);
    const broken = validateSamples(document).find(
      (d) => d.code === "reference",
    );
    ensure(
      !broken,
      broken
        ? `Import rejected: ${broken.recordId} / ${broken.message}`
        : "Invalid reference.",
    );
    return { ok: true, document };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid JSON document.",
    };
  }
}
