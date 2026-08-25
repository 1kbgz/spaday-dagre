import { expect, test } from "@playwright/test";

test("lays out and renders nodes, edges, labels, and re-layouts on direction change", async ({
  page,
}) => {
  await page.goto("/dist/index.html");
  const r = await page.evaluate(() => {
    const graph = document.createElement("spaday-dagre");
    graph.graph = {
      nodes: [{ id: "a", label: "Alpha" }, { id: "b" }, { id: "c" }],
      edges: [
        { source: "a", target: "b", label: "flow" },
        { source: "a", target: "c" },
      ],
    };
    document.body.appendChild(graph);
    const pos = (id) => {
      const rect = graph.querySelector(`[data-node-id="${id}"] rect`);
      return {
        x: Number(rect.getAttribute("x")),
        y: Number(rect.getAttribute("y")),
      };
    };
    const tb = { a: pos("a"), b: pos("b") };
    graph.layout = { rankdir: "LR" };
    const lr = { a: pos("a"), b: pos("b") };
    return {
      nodes: graph.querySelectorAll("[data-node-id]").length,
      edges: graph.querySelectorAll("[data-edge-source] path").length,
      labels: [...graph.querySelectorAll("text")].map((t) => t.textContent),
      tbVertical: tb.b.y > tb.a.y, // TB: rank grows downward
      lrHorizontal:
        lr.b.x > lr.a.x && (lr.b.y === lr.a.y) === false
          ? true
          : lr.b.x > lr.a.x, // LR: rank grows rightward
    };
  });
  expect(r.nodes).toBe(3);
  expect(r.edges).toBe(2);
  expect(r.labels).toEqual(expect.arrayContaining(["Alpha", "b", "c", "flow"]));
  expect(r.tbVertical).toBe(true);
  expect(r.lrHorizontal).toBe(true);
});

test("bubbles scalar node clicks and object edge clicks", async ({ page }) => {
  await page.goto("/dist/index.html");
  const r = await page.evaluate(() => {
    const graph = document.createElement("spaday-dagre");
    graph.graph = {
      nodes: [{ id: "a" }, { id: "b" }],
      edges: [{ source: "a", target: "b" }],
    };
    document.body.appendChild(graph);
    const seen = [];
    document.addEventListener("dagre-node-click", (e) => seen.push(e.detail));
    document.addEventListener("dagre-edge-click", (e) => seen.push(e.detail));
    graph
      .querySelector('[data-node-id="a"] rect')
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    graph
      .querySelector("[data-edge-source] path")
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    return seen;
  });
  expect(r[0]).toBe("a"); // scalar detail — event_value() lands the id in the store
  expect(r[1]).toEqual({ source: "a", target: "b" });
});

test("follows the wa-dark page mode on shell tokens", async ({ page }) => {
  await page.goto("/dist/index.html");
  const r = await page.evaluate(() => {
    const graph = document.createElement("spaday-dagre");
    graph.graph = { nodes: [{ id: "a" }], edges: [] };
    document.body.appendChild(graph);
    const fill = () =>
      getComputedStyle(graph.querySelector("[data-node-id] rect")).fill;
    const light = fill();
    document.documentElement.classList.add("wa-dark");
    const dark = fill();
    document.documentElement.classList.remove("wa-dark");
    return { light, dark, back: fill() };
  });
  expect(r.light).toBe("rgb(250, 250, 250)"); // --spa-surface-2 light default
  expect(r.dark).toBe("rgb(29, 35, 43)"); // #1d232b, the shell's dark surface
  expect(r.back).toBe("rgb(250, 250, 250)");
});

test("runs the Python example: click selects, dark mode re-themes", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:8016");
  const node = page.locator('spaday-dagre [data-node-id="train"] rect');
  await expect(node).toBeVisible();
  await node.click();
  await expect(page.locator(".status strong")).toHaveText("train");
  await page.getByRole("button", { name: "Left-right" }).click();
  await expect
    .poll(async () => {
      const box = await page
        .locator('spaday-dagre [data-node-id="deploy"]')
        .boundingBox();
      const first = await page
        .locator('spaday-dagre [data-node-id="ingest"]')
        .boundingBox();
      return box.x > first.x + 100; // LR: deploy far to the right of ingest
    })
    .toBe(true);
  await page.getByRole("checkbox").check();
  await expect
    .poll(() =>
      page
        .locator('spaday-dagre [data-node-id="ingest"] rect')
        .evaluate((el) => getComputedStyle(el).fill),
    )
    .toBe("rgb(29, 35, 43)"); // bind_root_class("wa-dark") re-themes the graph
});
