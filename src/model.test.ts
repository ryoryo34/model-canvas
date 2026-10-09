import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyCommand,
  assertDocument,
  exportDocument,
  importDocument,
  validateSamples,
} from "./model.ts";
import type { Command, ModelDocument } from "./model.ts";
import { createDemo } from "./fixture.ts";
import { loadLocal, saveLocal, STORAGE_KEY } from "./storage.ts";

function apply(document: ModelDocument, command: Command): ModelDocument {
  const result = applyCommand(document, command);
  assert.ok(result.ok, result.ok ? "" : result.error);
  return result.document;
}
function correctedDemo() {
  return apply(createDemo(), {
    type: "setSample",
    sample: {
      id: "project_draft",
      entityId: "project",
      values: {
        project_title: "Library room",
        project_budget: 4200,
        project_customer: "customer_lumen",
      },
    },
  });
}
function freeze(value: unknown) {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
}

test("fixture identifies each bad record/field and corrections remove all diagnostics", () => {
  const initial = createDemo();
  assertDocument(initial);
  assert.deepEqual(
    validateSamples(initial).map((d) => [d.recordId, d.fieldId, d.code]),
    [
      ["project_draft", "project_title", "required"],
      ["project_draft", "project_budget", "type"],
      ["project_draft", "project_customer", "reference"],
    ],
  );
  assert.deepEqual(validateSamples(correctedDemo()), []);
});
test("typed UI commands and untyped JSON commands produce identical state", () => {
  const commands: Command[] = [
    {
      type: "addEntity",
      entity: { id: "task", name: "Task", fields: [] },
      position: { x: 800, y: 200 },
    },
    { type: "updateEntity", entityId: "task", name: "Work item" },
    {
      type: "addField",
      entityId: "task",
      field: {
        id: "task_project",
        name: "Project",
        type: "string",
        required: false,
      },
    },
    {
      type: "updateField",
      entityId: "task",
      fieldId: "task_project",
      patch: { required: true },
    },
    {
      type: "addRelation",
      relation: {
        id: "project_tasks",
        sourceEntityId: "project",
        targetEntityId: "task",
        targetFieldId: "task_project",
      },
    },
    {
      type: "setSample",
      sample: {
        id: "task_first",
        entityId: "task",
        values: { task_project: "project_garden" },
      },
    },
    { type: "moveEntity", entityId: "task", position: { x: 740, y: 300 } },
    { type: "removeRelation", relationId: "project_tasks" },
    { type: "removeSample", sampleId: "task_first" },
  ];
  let ui = correctedDemo(),
    api = correctedDemo();
  for (const command of commands) {
    freeze(ui);
    ui = apply(ui, command);
    const result = applyCommand(api, JSON.parse(JSON.stringify(command)));
    assert.ok(result.ok);
    api = result.document;
    assert.deepEqual(ui, api);
  }
  assert.equal(ui.model.entities.at(-1)?.name, "Work item");
  assert.deepEqual(validateSamples(ui), []);
});
test("commands never retain caller-owned references or mutate the previous document", () => {
  const initial = createDemo();
  const before = structuredClone(initial);
  freeze(initial);
  const command: Command = {
    type: "addEntity",
    entity: { id: "new_entity", name: "New", fields: [] },
    position: { x: 20, y: 50 },
  };
  const next = apply(initial, command);
  command.entity.name = "Changed outside";
  command.position.x = 500;
  assert.equal(next.model.entities.at(-1)?.name, "New");
  assert.equal(next.layout.new_entity.x, 20);
  assert.deepEqual(initial, before);
});
const badCommands: unknown[] = [
  {
    type: "addField",
    entityId: "project",
    field: {
      id: "toString",
      name: "Reserved",
      type: "string",
      required: false,
    },
  },
  {
    type: "setSample",
    sample: { id: "new_record", entityId: "project", values: new Date() },
  },
  {
    type: "setSample",
    sample: { id: "new_record", entityId: "project", values: new Map() },
  },
  null,
  [],
  {},
  { type: "invented" },
  { type: "constructor" },
  { type: "removeRelation" },
  { type: "updateEntity", entityId: "missing", name: "New" },
  { type: "updateEntity", entityId: "project", name: " " },
  { type: "updateEntity", entityId: "project", name: "New", unexpected: true },
  {
    type: "addEntity",
    entity: { id: "customer", name: "Duplicate", fields: [] },
    position: { x: 0, y: 0 },
  },
  {
    type: "addEntity",
    entity: { id: "__proto__", name: "Unsafe", fields: [] },
    position: { x: 0, y: 0 },
  },
  {
    type: "addField",
    entityId: "project",
    field: {
      id: "customer_name",
      name: "Duplicate",
      type: "string",
      required: false,
    },
  },
  {
    type: "addField",
    entityId: "project",
    field: { id: "new_field", name: "Field", type: "date", required: false },
  },
  {
    type: "updateField",
    entityId: "project",
    fieldId: "missing",
    patch: { name: "Gone" },
  },
  {
    type: "updateField",
    entityId: "project",
    fieldId: "project_customer",
    patch: { type: "number" },
  },
  {
    type: "updateField",
    entityId: "project",
    fieldId: "project_title",
    patch: { id: "changed_id" },
  },
  {
    type: "updateField",
    entityId: "project",
    fieldId: "project_title",
    patch: { required: "true" },
  },
  {
    type: "addRelation",
    relation: {
      id: "r",
      sourceEntityId: "missing",
      targetEntityId: "project",
      targetFieldId: "project_title",
    },
  },
  {
    type: "addRelation",
    relation: {
      id: "r",
      sourceEntityId: "customer",
      targetEntityId: "project",
      targetFieldId: "customer_name",
    },
  },
  {
    type: "addRelation",
    relation: {
      id: "r",
      sourceEntityId: "customer",
      targetEntityId: "project",
      targetFieldId: "project_customer",
    },
  },
  { type: "removeRelation", relationId: "missing" },
  { type: "removeSample", sampleId: "missing" },
  { type: "moveEntity", entityId: "project", position: { x: NaN, y: 0 } },
  { type: "moveEntity", entityId: "project", position: { x: -1, y: 0 } },
  {
    type: "setSample",
    sample: { id: "customer_acorn", entityId: "project", values: {} },
  },
  {
    type: "setSample",
    sample: { id: "new_record", entityId: "missing", values: {} },
  },
  {
    type: "setSample",
    sample: { id: "new_record", entityId: "project", values: { unknown: 3 } },
  },
  {
    type: "setSample",
    sample: {
      id: "new_record",
      entityId: "project",
      values: { project_budget: Infinity },
    },
  },
  {
    type: "setSample",
    sample: {
      id: "new_record",
      entityId: "project",
      values: { project_budget: [] },
    },
  },
];
for (const [index, command] of badCommands.entries())
  test(`invalid command ${index + 1} is rejected atomically`, () => {
    const initial = createDemo();
    const snapshot = exportDocument(initial);
    freeze(initial);
    const result = applyCommand(initial, command);
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.error.length > 0);
    assert.equal(exportDocument(initial), snapshot);
  });
test("renaming labels keeps stable sample and relation identities", () => {
  let doc = correctedDemo();
  doc = apply(doc, {
    type: "updateEntity",
    entityId: "customer",
    name: "Client",
  });
  doc = apply(doc, {
    type: "updateField",
    entityId: "customer",
    fieldId: "customer_name",
    patch: { name: "Display name" },
  });
  assert.equal(doc.model.samples[0].values.customer_name, "Acorn Studio");
  assert.deepEqual(validateSamples(doc), []);
});
test("required checks allow zero and false, optional missing values pass, and strings are never coerced", () => {
  let doc = correctedDemo();
  doc = apply(doc, {
    type: "updateField",
    entityId: "customer",
    fieldId: "customer_active",
    patch: { required: true },
  });
  doc = apply(doc, {
    type: "setSample",
    sample: {
      id: "project_draft",
      entityId: "project",
      values: {
        project_title: "Zero",
        project_budget: 0,
        project_customer: "customer_acorn",
      },
    },
  });
  assert.deepEqual(validateSamples(doc), []);
  doc = apply(doc, {
    type: "setSample",
    sample: {
      id: "project_draft",
      entityId: "project",
      values: {
        project_title: " ",
        project_budget: "0",
        project_customer: null,
      },
    },
  });
  assert.deepEqual(
    validateSamples(doc).map((d) => d.code),
    ["required", "type", "required"],
  );
});
test("reference checks are scoped to source entity and react to disconnect / reconnect and deletion", () => {
  let doc = correctedDemo();
  doc = apply(doc, {
    type: "setSample",
    sample: {
      id: "project_draft",
      entityId: "project",
      values: {
        project_title: "Wrong entity",
        project_customer: "project_garden",
      },
    },
  });
  assert.equal(validateSamples(doc)[0]?.code, "reference");
  doc = apply(doc, { type: "removeRelation", relationId: "customer_projects" });
  assert.deepEqual(validateSamples(doc), []);
  doc = apply(doc, {
    type: "addRelation",
    relation: createDemo().model.relations[0],
  });
  assert.equal(validateSamples(doc)[0]?.code, "reference");
  doc = apply(correctedDemo(), {
    type: "removeSample",
    sampleId: "customer_acorn",
  });
  assert.equal(validateSamples(doc)[0]?.recordId, "project_garden");
});
test("JSON round trip preserves semantic model, stable IDs and layout", () => {
  const doc = apply(correctedDemo(), {
    type: "moveEntity",
    entityId: "customer",
    position: { x: 145.5, y: 250 },
  });
  const result = importDocument(exportDocument(doc));
  assert.ok(result.ok);
  assert.deepEqual(result.document, doc);
});
test("imports reject malformed structures, versions and all dangling references", () => {
  const valid = correctedDemo();
  const mutations: ((doc: any) => void)[] = [
    (doc) => {
      doc.documentVersion = 2;
    },
    (doc) => {
      doc.model = null;
    },
    (doc) => {
      doc.extra = true;
    },
    (doc) => {
      doc.model.entities[0].fields[0].type = "date";
    },
    (doc) => {
      doc.model.entities[1].fields[0].id = "customer_name";
    },
    (doc) => {
      doc.layout.customer.x = "bad";
    },
    (doc) => {
      delete doc.layout.customer;
    },
    (doc) => {
      doc.layout.missing = { x: 0, y: 0 };
    },
    (doc) => {
      doc.model.relations[0].sourceEntityId = "missing";
    },
    (doc) => {
      doc.model.relations[0].targetFieldId = "missing";
    },
    (doc) => {
      doc.model.samples[0].entityId = "missing";
    },
    (doc) => {
      doc.model.samples[0].values.missing = true;
    },
    (doc) => {
      doc.model.samples[2].values.project_customer = "missing";
    },
  ];
  for (const mutate of mutations) {
    const bad = structuredClone(valid);
    mutate(bad);
    assert.equal(importDocument(JSON.stringify(bad)).ok, false);
  }
  for (const bad of ["{", "null", "[]", "true"])
    assert.equal(importDocument(bad).ok, false);
  assert.deepEqual(validateSamples(valid), []);
});
test("a local save restores invalid samples for editing; corrupt or unavailable storage never overwrites data", () => {
  const memory = new Map<string, string>();
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
  };
  const doc = createDemo();
  assert.match(saveLocal(storage, doc), /Saved/);
  assert.deepEqual(loadLocal(storage).document, doc);
  memory.set(STORAGE_KEY, "{bad");
  const recovered = loadLocal(storage);
  assertDocument(recovered.document);
  assert.equal(memory.get(STORAGE_KEY), "{bad");
  assert.match(recovered.message, /not been overwritten/);
  const blocked = {
    getItem() {
      throw new Error("Denied");
    },
    setItem() {
      throw new Error("Quota");
    },
  };
  assert.match(saveLocal(blocked, doc), /failed/);
  assert.match(loadLocal(blocked).message, /not been overwritten/);
});
