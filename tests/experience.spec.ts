import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { createDemo } from "../src/fixture.ts";

async function exported(page: Page) {
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  return JSON.parse(await readFile((await (await event).path())!, "utf8"));
}

for (const [width, height] of [
  [1280, 800],
  [850, 850],
  [390, 844],
]) {
  test(`guided correction, fit and persistence at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.getByText("3 validation issues")).toBeVisible();
    await page.screenshot({
      path: `test-results/experience-${width}-initial.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
    const viewport = (await page.locator(".canvas-scroll").boundingBox())!;
    for (const id of ["customer", "project"]) {
      const node = (await page.getByTestId(`node-${id}`).boundingBox())!;
      expect(node.x).toBeGreaterThanOrEqual(viewport.x);
      expect(node.x + node.width).toBeLessThanOrEqual(
        viewport.x + viewport.width,
      );
      expect(node.y + node.height).toBeLessThanOrEqual(
        viewport.y + viewport.height,
      );
    }
    const initial = await exported(page);
    await page.getByRole("button", { name: "100%", exact: true }).click();
    await page.getByRole("button", { name: "Fit all", exact: true }).click();
    expect(await exported(page)).toEqual(initial);
    await page.getByRole("button", { name: "Try the example" }).click();
    const title = page.getByRole("textbox", {
      name: "Title * string",
      exact: true,
    });
    await expect(title).toBeFocused();
    await expect(
      page.getByRole("combobox", { name: "Sample record", exact: true }),
    ).toHaveValue("project_draft");
    await title.fill("Community demo");
    await page
      .getByRole("textbox", { name: "Budget number", exact: true })
      .fill("4200");
    await page
      .getByRole("combobox", { name: "Customer ID * string", exact: true })
      .fill("customer_lumen");
    // Navigation never applies edits.
    expect(await exported(page)).toEqual(initial);
    await page
      .getByRole("button", { name: "Apply sample", exact: true })
      .click();
    await expect(
      page.getByText("✓ All samples valid", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Practice steps" }),
    ).toContainText("0 issues in project_draft");
    await expect(title).not.toHaveAttribute("aria-invalid", "true");
    await expect(
      page.getByRole("region", { name: "Practice steps" }),
    ).toBeFocused();
    await page.screenshot({
      path: `test-results/experience-${width}-completed-view.png`,
    });
    await page.screenshot({
      path: `test-results/experience-${width}-success.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Save this model locally", exact: true })
      .click();
    const result = await exported(page);
    expect(result.layout).toEqual(initial.layout);
    await page.getByRole("button", { name: "Back to overview" }).click();
    await expect(
      page.getByRole("region", { name: "Quick guide" }),
    ).toBeFocused();
    await page.getByRole("button", { name: "Close guide" }).click();
    await page.getByRole("button", { name: "Show quick guide" }).click();
    expect(await exported(page)).toEqual(result);
    await page.reload();
    expect(await exported(page)).toEqual(result);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
  });
}

test("diagnostics retain record, entity, inspector and command drafts and focus each field", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Name * string", exact: true })
    .fill("Unapplied customer");
  await page
    .getByRole("textbox", { name: "Entity name", exact: true })
    .fill("Unapplied entity");
  await page.getByRole("tab", { name: "Command API", exact: true }).click();
  await page.getByLabel("Command JSON").fill('{"unfinished":');
  await page.getByRole("button", { name: "Try the example" }).click();
  const title = page.getByRole("textbox", {
    name: "Title * string",
    exact: true,
  });
  await title.fill("Unapplied project");
  await page
    .getByRole("combobox", { name: "Sample record", exact: true })
    .selectOption("project_garden");
  await title.fill("Unapplied garden");
  for (const [diagnostic, field] of [
    ["required", "Title * string"],
    ["type", "Budget number"],
    ["reference", "Customer ID * string"],
  ]) {
    await page
      .getByRole("button", { name: new RegExp(`^${diagnostic} project_draft`) })
      .click();
    await expect(
      page.getByRole("combobox", { name: "Sample record", exact: true }),
    ).toHaveValue("project_draft");
    await expect(
      page.getByLabel(field, { exact: true }).filter({ visible: true }),
    ).toBeFocused();
    await expect(title).toHaveValue("Unapplied project");
  }
  await page
    .getByRole("combobox", { name: "Sample record", exact: true })
    .selectOption("project_garden");
  await expect(title).toHaveValue("Unapplied garden");
  await page
    .getByRole("navigation", { name: "Entities" })
    .getByRole("button", { name: /Customer/ })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Name * string", exact: true }),
  ).toHaveValue("Unapplied customer");
  await expect(
    page.getByRole("textbox", { name: "Entity name", exact: true }),
  ).toHaveValue("Unapplied entity");
  await page.getByRole("tab", { name: "Command API", exact: true }).click();
  await expect(page.getByLabel("Command JSON")).toHaveValue('{"unfinished":');
  expect(await exported(page)).toEqual(createDemo());
});

test("scaled drag uses model coordinates; keyboard and export/import keep positions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 850, height: 850 });
  await page.goto("/");
  const header = page.getByRole("button", {
    name: "Move Customer",
    exact: true,
  });
  await header.scrollIntoViewIfNeeded();
  const box = (await header.boundingBox())!;
  const node = (await page.getByTestId("node-customer").boundingBox())!;
  const scale = node.width / 258;
  await page.mouse.move(box.x + 30, box.y + 12);
  await page.mouse.down();
  await page.mouse.move(box.x + 30 + 40 * scale, box.y + 12 + 24 * scale, {
    steps: 5,
  });
  await page.mouse.up();
  await header.press("ArrowRight");
  const moved = await exported(page);
  expect(moved.layout.customer.x).toBeCloseTo(120, 0);
  expect(moved.layout.customer.y).toBeCloseTo(88, 0);
  // Fix only the fictional missing reference to allow import.
  moved.model.samples.find(
    (s: { id: string }) => s.id === "project_draft",
  ).values.project_customer = "customer_lumen";
  await page
    .getByLabel("Import document")
    .setInputFiles({
      name: "model.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(moved)),
    });
  expect(await exported(page)).toEqual(moved);
});

test("a different imported model gets general guidance without fixture actions", async ({
  page,
}) => {
  await page.goto("/");
  const model = createDemo();
  model.model.samples = [];
  await page
    .getByLabel("Import document")
    .setInputFiles({
      name: "model.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(model)),
    });
  await expect(
    page.getByRole("button", { name: "Try the example" }),
  ).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Quick guide" })).toContainText(
    "Select an entity",
  );
  expect(await exported(page)).toEqual(model);
});
