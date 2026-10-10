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
      .getByLabel("Entity name", { exact: true })
      .fill("Release milestone");
    await page.getByRole("button", { name: "Rename entity" }).click();
    await expect(connection).toContainText("Connected · revision 2");
    expect(
      (await session.read()).document.model.entities.find(
        (e) => e.id === "milestone",
      )?.name,
    ).toBe("Release milestone");
    expect(JSON.parse(readFileSync(path, "utf8")).revision).toBe(2);

    await page.getByLabel("Entity name", { exact: true }).fill("Unsent draft");
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
    await expect(page.getByLabel("Entity name", { exact: true })).toHaveValue(
      "Unsent draft",
    );
    expect(
      (await session.read()).document.model.entities.find(
        (e) => e.id === "milestone",
      )?.name,
    ).toBe("Remote winner");
    await page
      .getByRole("button", { name: "Reload shared document (discard drafts)" })
      .click();
    await expect(page.getByLabel("Entity name", { exact: true })).toHaveValue(
      "Remote winner",
    );

    await page.getByLabel("Entity name", { exact: true }).fill("Offline draft");
    const port = Number(new URL(session.origin).port);
    await session.close();
    await expect(connection).toContainText("Disconnected");
    await expect(page.getByLabel("Entity name", { exact: true })).toHaveValue(
      "Offline draft",
    );
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
    await expect(page.getByLabel("Entity name", { exact: true })).toHaveValue(
      "Offline draft",
    );
    expect((await session.read()).revision).toBe(4);
    await page.screenshot({
      path: "test-results/shared-draft-preserved.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Reload shared document (discard drafts)" })
      .click();
    await expect(connection).toContainText("Connected · revision 4");
    await expect(page.getByLabel("Entity name", { exact: true })).toHaveValue(
      "After restart",
    );
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
      .getByLabel("Entity name", { exact: true })
      .fill("Committed but unacknowledged");
    await page.getByRole("button", { name: "Rename entity" }).click();
    await expect(connection).toContainText("Save outcome unknown");
    await expect(page.getByLabel("Entity name", { exact: true })).toHaveValue(
      "Committed but unacknowledged",
    );
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
