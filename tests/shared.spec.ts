import { test, expect } from "@playwright/test";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connectTestClient } from "../server/test-client.ts";

test("real stdio SDK edits reach the browser; UI edits reach MCP, conflicts and disconnect preserve drafts", async ({
  page,
}) => {
  const dir = mkdtempSync(join(tmpdir(), "model-canvas-browser-"));
  const path = join(dir, "model.json");
  let session = await connectTestClient(path);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(`${session.origin}/?shared=1`);
    const connection = page.getByRole("region", { name: "Shared connection" });
    await expect(connection).toContainText("Connected · revision 0");
    await expect(
      page.getByRole("button", { name: "Save locally" }),
    ).toBeDisabled();
    expect(
      (
        await session.apply(0, [
          {
            type: "addEntity",
            entity: { id: "milestone", name: "Milestone", fields: [] },
            position: { x: 80, y: 300 },
          },
        ])
      ).ok,
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "Move Milestone", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("navigation", { name: "Entities" })
      .getByRole("button", { name: /Milestone/ })
      .click();
    await page
      .getByRole("textbox", { name: "Entity name", exact: true })
      .fill("Release milestone");
    await page.getByRole("button", { name: "Rename entity" }).click();
    await expect(connection).toContainText("Connected · revision 2");
    expect(
      (await session.read()).document.model.entities.find(
        (e) => e.id === "milestone",
      )?.name,
    ).toBe("Release milestone");
    expect(JSON.parse(readFileSync(path, "utf8")).revision).toBe(2);

    await page
      .getByRole("textbox", { name: "Entity name", exact: true })
      .fill("Unsent draft");
    expect(
      (
        await session.apply(2, [
          {
            type: "updateEntity",
            entityId: "milestone",
            name: "Remote winner",
          },
        ])
      ).ok,
    ).toBe(true);
    // Submit before or after polling discovers the remote revision: neither path may overwrite it.
    await page.getByRole("button", { name: "Rename entity" }).click();
    await expect(connection).toContainText("reload required");
    await expect(
      page.getByRole("textbox", { name: "Entity name", exact: true }),
    ).toHaveValue("Unsent draft");
    expect(
      (await session.read()).document.model.entities.find(
        (e) => e.id === "milestone",
      )?.name,
    ).toBe("Remote winner");
    await page
      .getByRole("button", { name: "Reload shared document (discard drafts)" })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Entity name", exact: true }),
    ).toHaveValue("Remote winner");

    await page
      .getByRole("textbox", { name: "Entity name", exact: true })
      .fill("Offline draft");
    const port = Number(new URL(session.origin).port);
    await session.close();
    await expect(connection).toContainText("Disconnected");
    await expect(
      page.getByRole("textbox", { name: "Entity name", exact: true }),
    ).toHaveValue("Offline draft");
    session = await connectTestClient(path, port);
    const before = await session.read();
    expect(
      (
        await session.apply(before.revision, [
          {
            type: "updateEntity",
            entityId: "milestone",
            name: "After restart",
          },
        ])
      ).ok,
    ).toBe(true);
    await page.getByRole("button", { name: "Rename entity" }).click();
    await expect(
      page.getByRole("textbox", { name: "Entity name", exact: true }),
    ).toHaveValue("Offline draft");
    expect((await session.read()).revision).toBe(4);
    await page.screenshot({
      path: "test-results/shared-draft-preserved.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Reload shared document (discard drafts)" })
      .click();
    await expect(connection).toContainText("Connected · revision 4");
    await expect(
      page.getByRole("textbox", { name: "Entity name", exact: true }),
    ).toHaveValue("After restart");
    await page.screenshot({
      path: "test-results/shared-roundtrip.png",
      fullPage: true,
    });
    expect(errors).toEqual([]);
  } finally {
    await session.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("lost write response preserves form text and requires reconciliation without replay", async ({
  page,
}) => {
  const dir = mkdtempSync(join(tmpdir(), "model-canvas-lost-response-"));
  const session = await connectTestClient(join(dir, "model.json"));
  try {
    await page.goto(`${session.origin}/?shared=1`);
    const connection = page.getByRole("region", { name: "Shared connection" });
    await expect(connection).toContainText("Connected · revision 0");
    await page.route("**/api/commands", async (route) => {
      await route.fetch();
      await route.abort("failed");
    });
    await page
      .getByRole("textbox", { name: "Entity name", exact: true })
      .fill("Committed but unacknowledged");
    await page.getByRole("button", { name: "Rename entity" }).click();
    await expect(connection).toContainText("Save outcome unknown");
    await expect(
      page.getByRole("textbox", { name: "Entity name", exact: true }),
    ).toHaveValue("Committed but unacknowledged");
    expect((await session.read()).revision).toBe(1);
    await page.getByRole("button", { name: "Rename entity" }).click();
    expect((await session.read()).revision).toBe(1);
    await page
      .getByRole("button", { name: "Reload shared document (discard drafts)" })
      .click();
    await expect(connection).toContainText("Connected · revision 1");
  } finally {
    await session.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("successful form save resumes remote synchronization when no drafts remain", async ({
  page,
}) => {
  const dir = mkdtempSync(join(tmpdir(), "model-canvas-clean-save-"));
  const session = await connectTestClient(join(dir, "model.json"));
  try {
    await page.goto(`${session.origin}/?shared=1`);
    const connection = page.getByRole("region", { name: "Shared connection" });
    await expect(connection).toContainText("Connected · revision 0");
    await page
      .getByRole("textbox", { name: "Entity name", exact: true })
      .fill("Saved client");
    await page.getByRole("button", { name: "Rename entity" }).click();
    await expect(connection).toContainText("Connected · revision 1");
    expect(
      (
        await session.apply(1, [
          { type: "updateEntity", entityId: "project", name: "Remote project" },
        ])
      ).ok,
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "Move Remote project", exact: true }),
    ).toBeVisible();
    await expect(connection).toContainText("Connected · revision 2");
    await expect(connection.getByRole("alert")).toHaveCount(0);
  } finally {
    await session.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("saving one form preserves drafts in other forms when MCP changes arrive", async ({
  page,
}) => {
  const dir = mkdtempSync(join(tmpdir(), "model-canvas-other-draft-"));
  const session = await connectTestClient(join(dir, "model.json"));
  try {
    await page.goto(`${session.origin}/?shared=1`);
    const connection = page.getByRole("region", { name: "Shared connection" });
    await expect(connection).toContainText("Connected · revision 0");
    const fieldName = page
      .getByRole("form", { name: "Edit Name", exact: true })
      .getByLabel("Field name");
    const sampleName = page.getByRole("textbox", { name: /^Name \*/ });
    await fieldName.fill("Unsent field label");
    await sampleName.fill("Unsent sample value");
    await page
      .getByRole("textbox", { name: "Entity name", exact: true })
      .fill("Saved client");
    await page.getByRole("button", { name: "Rename entity" }).click();
    await expect(connection).toContainText("Connected · revision 1");
    await expect(fieldName).toHaveValue("Unsent field label");
    await expect(sampleName).toHaveValue("Unsent sample value");
    expect(
      (
        await session.apply(1, [
          { type: "updateEntity", entityId: "project", name: "Remote project" },
        ])
      ).ok,
    ).toBe(true);
    await expect(connection).toContainText("Drafts preserved; reload required");
    await expect(fieldName).toHaveValue("Unsent field label");
    await expect(sampleName).toHaveValue("Unsent sample value");
    expect((await session.read()).revision).toBe(2);
  } finally {
    await session.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("sample, field, command and drag completion release only their own draft guards", async ({
  page,
}) => {
  const dir = mkdtempSync(join(tmpdir(), "model-canvas-edit-scopes-"));
  const session = await connectTestClient(join(dir, "model.json"));
  try {
    await page.goto(`${session.origin}/?shared=1`);
    const connection = page.getByRole("region", { name: "Shared connection" });
    await expect(connection).toContainText("Connected · revision 0");
    const syncNext = async () => {
      const { revision } = await session.read();
      const name = `Remote project ${revision + 1}`;
      expect(
        (
          await session.apply(revision, [
            { type: "updateEntity", entityId: "project", name },
          ])
        ).ok,
      ).toBe(true);
      await expect(
        page.getByRole("button", { name: `Move ${name}`, exact: true }),
      ).toBeVisible();
      await expect(connection.getByRole("alert")).toHaveCount(0);
    };
    await page.getByRole("textbox", { name: /^Name \*/ }).fill("Saved sample");
    await page.getByRole("button", { name: "Apply sample" }).click();
    await expect(connection).toContainText("Connected · revision 1");
    await syncNext();

    const field = page.getByRole("form", { name: "Edit Name", exact: true });
    await field.getByLabel("Field name").fill("Display name");
    await field.getByRole("button", { name: "Update field" }).click();
    await expect(connection).toContainText("Connected · revision 3");
    await syncNext();

    await page.getByRole("tab", { name: "Command API" }).click();
    await page.getByLabel("Command JSON").fill(
      JSON.stringify({
        type: "updateEntity",
        entityId: "customer",
        name: "Saved command",
      }),
    );
    await page.getByRole("button", { name: "Apply command" }).click();
    await expect(connection).toContainText("Connected · revision 5");
    await syncNext();

    const header = page.getByRole("button", {
      name: "Move Saved command",
      exact: true,
    });
    const box = (await header.boundingBox())!;
    await page.mouse.move(box.x + 50, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + 90, box.y + 40, { steps: 4 });
    await page.mouse.up();
    await expect(connection).toContainText("Connected · revision 7");
    await syncNext();
    // Selecting a card without moving it creates no outstanding draft.
    await header.click();
    await syncNext();
  } finally {
    await session.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("guide navigation keeps hidden drafts protected from MCP updates and never writes", async ({
  page,
}) => {
  const dir = mkdtempSync(join(tmpdir(), "model-canvas-guide-"));
  const session = await connectTestClient(join(dir, "model.json"));
  try {
    await page.goto(`${session.origin}/?shared=1`);
    const connection = page.getByRole("region", { name: "Shared connection" });
    await expect(connection).toContainText("Connected · revision 0");
    await page
      .getByRole("textbox", { name: "Name * string", exact: true })
      .fill("Hidden draft");
    await page.getByRole("button", { name: "Try the example" }).click();
    await expect(
      page.getByRole("textbox", { name: "Title * string", exact: true }),
    ).toBeFocused();
    await page
      .getByRole("textbox", { name: "Title * string", exact: true })
      .fill("Shared practice");
    await page
      .getByRole("textbox", { name: "Budget number", exact: true })
      .fill("4200");
    await page
      .getByRole("combobox", { name: "Customer ID * string", exact: true })
      .fill("customer_lumen");
    expect((await session.read()).revision).toBe(0);
    await page
      .getByRole("button", { name: "Apply sample", exact: true })
      .click();
    await expect(connection).toContainText("Connected · revision 1");
    await expect(
      page.getByRole("region", { name: "Practice steps" }),
    ).toContainText("saved to the shared server");
    await expect(
      page.getByRole("button", { name: "Save this model locally" }),
    ).toHaveCount(0);
    await session.apply(1, [
      { type: "updateEntity", entityId: "customer", name: "Remote customer" },
    ]);
    await expect(connection).toContainText("Drafts preserved; reload required");
    await page
      .getByRole("navigation", { name: "Entities" })
      .getByRole("button", { name: /Customer/ })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Name * string", exact: true }),
    ).toHaveValue("Hidden draft");
    expect((await session.read()).revision).toBe(2);
  } finally {
    await session.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
