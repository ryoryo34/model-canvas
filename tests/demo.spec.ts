import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { applyCommand, validateSamples } from "../src/model.ts";
import type { Command, ModelDocument } from "../src/model.ts";
import { createDemo } from "../src/fixture.ts";

async function exportFrom(page: Page): Promise<ModelDocument> {
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await event;
  return JSON.parse(await readFile((await download.path())!, "utf8"));
}
async function importInto(page: Page, data: string) {
  await page.getByLabel("Import document").setInputFiles({
    name: "model.json",
    mimeType: "application/json",
    buffer: Buffer.from(data),
  });
}
async function fixSample(page: Page) {
  await page
    .getByRole("navigation", { name: "Entities" })
    .getByRole("button", { name: /Project/ })
    .click();
  await page
    .getByRole("combobox", { name: "Sample record", exact: true })
    .selectOption("project_draft");
  await page.getByRole("textbox", { name: "Title *" }).fill("Library room");
  await page.getByRole("textbox", { name: "Budget number" }).fill("4200");
  await page
    .getByRole("combobox", { name: /Customer ID \*/ })
    .fill("customer_lumen");
  await page.getByRole("button", { name: "Apply sample" }).click();
  await expect(page.getByText("✓ All samples valid")).toBeVisible();
}

test("initial rendering, required/type/reference correction, local reload and no runtime errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByText("3 validation issues")).toBeVisible();
  await expect(page.getByTestId("relation-edge")).toHaveCount(1);
  await page.screenshot({
    path: "test-results/initial-demo.png",
    fullPage: true,
  });
  await fixSample(page);
  await page.getByRole("button", { name: /Save locally/ }).click();
  await expect(page.getByRole("status")).toContainText("Saved in this browser");
  await page.reload();
  await expect(page.getByText("✓ All samples valid")).toBeVisible();
  expect(validateSamples(await exportFrom(page))).toEqual([]);
  expect(errors).toEqual([]);
});
test("entity and field edits synchronize canvas, inspector and generated form", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "＋ Add entity", exact: true })
    .click();
  await page.getByLabel("Entity name", { exact: true }).fill("Milestone");
  await page.getByRole("button", { name: "Rename entity" }).click();
  await page.getByRole("button", { name: "＋ Add field", exact: true }).click();
  const editor = page.getByRole("form", { name: "Edit Field 1" });
  await editor.getByLabel("Field name").fill("Complete");
  await editor
    .getByRole("combobox", { name: "Type", exact: true })
    .selectOption("boolean");
  await editor.getByLabel("Required").check();
  await editor.getByRole("button", { name: "Update field" }).click();
  await page.getByRole("button", { name: "＋ Record", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Move Milestone" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Milestone samples" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Complete * boolean" })
    .selectOption("false");
  await page.getByRole("button", { name: "Apply sample" }).click();
  const exported = await exportFrom(page);
  const milestone = exported.model.entities.find(
    (e) => e.name === "Milestone",
  )!;
  expect(milestone.fields[0]).toMatchObject({
    name: "Complete",
    type: "boolean",
    required: true,
  });
  expect(
    exported.model.samples.find((s) => s.entityId === milestone.id)?.values[
      milestone.fields[0].id
    ],
  ).toBe(false);
  expect(
    validateSamples(exported).filter((d) => d.entityId === milestone.id),
  ).toEqual([]);
});
test("disconnect and reconnect update diagram and reference validation", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Entities" })
    .getByRole("button", { name: /Project/ })
    .click();
  await page
    .getByRole("button", { name: "Disconnect customer_projects" })
    .click();
  await expect(page.getByTestId("relation-edge")).toHaveCount(0);
  await expect(page.getByText("2 validation issues")).toBeVisible();
  await expect(page.getByText(/References Customer:/)).toHaveCount(0);
  await page
    .getByLabel("Reference field (many)")
    .selectOption("project_customer");
  await page.getByRole("button", { name: "Connect relation" }).click();
  await expect(page.getByTestId("relation-edge")).toHaveCount(1);
  await expect(page.getByText("3 validation issues")).toBeVisible();
  await expect(page.getByText(/References Customer:/)).toBeVisible();
});
test("drag and keyboard movement survive export/import; all rejected imports keep current edits", async ({
  page,
}) => {
  await page.goto("/");
  await fixSample(page);
  const header = page.getByRole("button", { name: "Move Customer" });
  await header.scrollIntoViewIfNeeded();
  const box = (await header.boundingBox())!;
  await page.mouse.move(box.x + 80, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 135, box.y + 60, { steps: 8 });
  await page.mouse.up();
  await header.focus();
  await page.keyboard.press("ArrowRight");
  const original = await exportFrom(page);
  expect(original.layout.customer).toEqual({ x: 135, y: 104 });
  for (const bad of [
    "{",
    JSON.stringify({ ...original, documentVersion: 99 }),
    JSON.stringify({
      ...original,
      model: {
        ...original.model,
        relations: [
          { ...original.model.relations[0], sourceEntityId: "missing" },
        ],
      },
    }),
  ]) {
    await importInto(page, bad);
    await expect(page.getByRole("status")).toContainText("Import rejected");
    expect(await exportFrom(page)).toEqual(original);
  }
  await page
    .getByRole("button", { name: "＋ Add entity", exact: true })
    .click();
  await importInto(page, JSON.stringify(original));
  await expect(page.getByRole("status")).toContainText(
    "Imported document and layout",
  );
  expect(await exportFrom(page)).toEqual(original);
  await expect(page.getByTestId("node-customer")).toHaveCSS("left", "135px");
});
test("browser UI and JSON API share exact state transitions and reject invalid commands atomically", async ({
  page,
}) => {
  await page.goto("/");
  const command: Command = {
    type: "updateEntity",
    entityId: "customer",
    name: "Client",
  };
  await page.getByLabel("Entity name", { exact: true }).fill("Client");
  await page.getByRole("button", { name: "Rename entity" }).click();
  const ui = await exportFrom(page);
  const expected = applyCommand(createDemo(), command);
  expect(expected.ok && expected.document).toEqual(ui);
  await page.reload();
  await page.getByRole("tab", { name: "Command API" }).click();
  await page.getByLabel("Command JSON").fill(JSON.stringify(command));
  await page.getByRole("button", { name: "Apply command" }).click();
  expect(await exportFrom(page)).toEqual(ui);
  await expect(page.getByRole("button", { name: "Move Client" })).toBeVisible();
  await expect(page.getByLabel("Entity name", { exact: true })).toHaveValue(
    "Client",
  );
  for (const bad of [
    "{",
    JSON.stringify({ type: "updateEntity", entityId: "missing", name: "Gone" }),
  ]) {
    await page.getByLabel("Command JSON").fill(bad);
    await page.getByRole("button", { name: "Apply command" }).click();
    expect(await exportFrom(page)).toEqual(ui);
  }
});
test("storage errors are visible and a narrow viewport remains usable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new Error("Quota exceeded");
    };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: /Save locally/ }).click();
  await expect(page.getByRole("status")).toContainText("Local save failed");
  expect((await exportFrom(page)).model.entities).toHaveLength(2);
  await page.screenshot({
    path: "test-results/narrow-demo.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
