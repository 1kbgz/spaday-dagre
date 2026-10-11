import fs from "node:fs";
import { expect, test } from "@playwright/test";

const errorsByPage = new WeakMap();

test.beforeEach(async ({ page }) => {
  test.skip(
    !fs.existsSync("dist/lite/index.html"),
    "run make test-pyodide-example first",
  );
  test.setTimeout(240_000);
  const errors = [];
  errorsByPage.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    globalThis.workerFrames = [];
    const NativeWorker = globalThis.Worker;
    globalThis.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        this.addEventListener("message", (event) => {
          if (event.data.type === "wires")
            globalThis.workerFrames.push(...event.data.wires);
        });
      }
    };
  });
  await page.goto("/dist/lite/");
  await page.waitForFunction(
    () =>
      document.documentElement.dataset.ready === "true" ||
      document.querySelector("#pyodide-status")?.textContent ===
        "Unable to start",
    undefined,
    { timeout: 180_000 },
  );
  await expect(page.locator("#pyodide-error")).toBeHidden();
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
});

test.afterEach(async ({ page }) => {
  if (errorsByPage.has(page)) expect(errorsByPage.get(page)).toEqual([]);
});

test("renders the Python pipeline and round-trips selection through transports", async ({
  page,
}) => {
  await expect(
    page.getByRole("heading", { name: "Pipeline explorer" }),
  ).toBeVisible();
  const graph = page.locator("spaday-dagre");
  await expect(graph.locator("[data-node-id]")).toHaveCount(7);
  await expect(graph.locator(".spaday-dagre-edge-line")).toHaveCount(6);
  const initialActive = await graph.getAttribute("data-active");
  await expect
    .poll(() => graph.getAttribute("data-active"))
    .not.toBe(initialActive);

  await graph.locator('[data-node-id="ingest"] rect').click();
  await expect(page.locator(".status strong")).toHaveText("ingest");
  await expect
    .poll(() =>
      page.evaluate(() =>
        globalThis.workerFrames.some((frame) =>
          JSON.parse(frame).patch?.ops?.some(
            (operation) =>
              operation.Set?.path?.some((part) => part.Key === "selected") &&
              operation.Set?.value?.Str === "ingest",
          ),
        ),
      ),
    )
    .toBe(true);
  await expect(graph).toHaveAttribute("data-selected", "ingest");
  await expect(graph.locator('[data-node-id="ingest"]')).toHaveClass(
    /emphasis/,
  );
  await graph
    .locator(".spaday-dagre-edge-label")
    .filter({ hasText: "rows" })
    .click();
  await expect(page.locator(".status strong")).toHaveText("rows");

  await graph
    .locator('[data-node-id="deploy"] ellipse')
    .click({ button: "right" });
  const menu = page.locator("#graph-menu");
  await expect(menu).toBeVisible();
  await menu.getByRole("button", { name: "Select", exact: true }).click();
  await expect(menu).toBeHidden();
  await expect(page.locator(".status strong")).toHaveText("deploy");

  await page.getByRole("button", { name: "Left-right", exact: true }).click();
  await expect
    .poll(() => graph.evaluate((node) => node.layout.rankdir))
    .toBe("LR");
  await page.getByRole("checkbox", { name: "Dark" }).check();
  await expect(page.locator("html")).toHaveClass(/wa-dark/);
  await expect(page.locator("#pyodide-error")).toBeHidden();
});

test("keeps the graph mounted and scroll stable across Python updates", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 400 });
  const graph = page.locator("spaday-dagre");
  await graph.evaluate((node) => {
    globalThis.initialGraph = node;
    globalThis.initialSvg = node.querySelector("svg");
  });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const scroll = await page.evaluate(() => window.scrollY);
  expect(scroll).toBeGreaterThan(0);
  const initialActive = await graph.getAttribute("data-active");
  await expect
    .poll(() => graph.getAttribute("data-active"))
    .not.toBe(initialActive);
  expect(
    await graph.evaluate(
      (node) =>
        node === globalThis.initialGraph &&
        node.querySelector("svg") === globalThis.initialSvg,
    ),
  ).toBe(true);
  expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(scroll, 0);
});
