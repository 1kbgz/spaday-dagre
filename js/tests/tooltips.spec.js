import { expect, test } from "@playwright/test";

async function hoverEdgeLabel(page) {
  const point = await page
    .locator("#graph .spaday-dagre-edge-label")
    .evaluate((label) => {
      const rect = label.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
  await page.mouse.move(point.x, point.y);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/dist/index.html");
  await page.evaluate(() => {
    const graph = document.createElement("spaday-dagre");
    graph.id = "graph";
    graph.style.cssText = "width: 640px; height: 320px";
    graph.transition = 0;
    graph.graph = {
      nodes: [
        {
          id: "a",
          label: "Alpha",
          tooltip: "Node <b>literal</b>\nSecond line",
        },
        { id: "b", label: "Beta" },
        { id: "c", label: "Gamma" },
      ],
      edges: [
        { source: "a", target: "b", label: "flow", tooltip: "Edge tooltip" },
        { source: "a", target: "c" },
      ],
    };
    document.body.appendChild(graph);
  });
});

test("shows plain-text tooltips over nodes, edge labels, and edge lines", async ({
  page,
}) => {
  const graph = page.locator("#graph");
  const tooltip = graph.getByRole("tooltip");
  await graph.locator('[data-node-id="a"] rect').hover();
  await expect(tooltip).toHaveText("Node <b>literal</b>\nSecond line");
  await expect(tooltip).toBeVisible();
  await expect(tooltip.locator("b")).toHaveCount(0);
  await hoverEdgeLabel(page);
  await expect(tooltip).toHaveText("Edge tooltip");
  const point = await graph
    .locator(".spaday-dagre-edge-hit")
    .first()
    .evaluate((path) => {
      const point = path.getPointAtLength(path.getTotalLength() / 4);
      return new DOMPoint(point.x, point.y)
        .matrixTransform(path.getScreenCTM())
        .toJSON();
    });
  await page.mouse.move(point.x, point.y);
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveText("Edge tooltip");
  await graph.locator('[data-node-id="c"] rect').hover();
  await expect(tooltip).toBeHidden();
});

test("updates hovered tooltips and hides them when cleared or removed", async ({
  page,
}) => {
  const graph = page.locator("#graph");
  const tooltip = graph.getByRole("tooltip");
  await graph.locator('[data-node-id="a"] rect').hover();
  await expect(tooltip).toBeVisible();
  await graph.evaluate((host) => {
    host.graph = {
      ...host.graph,
      nodes: host.graph.nodes.map((node) => ({
        ...node,
        tooltip: "Updated tooltip",
      })),
    };
  });
  await expect(tooltip).toHaveText("Updated tooltip");
  await graph.evaluate((host) => {
    host.graph = {
      ...host.graph,
      nodes: host.graph.nodes.map((node) => ({ ...node, tooltip: "" })),
    };
  });
  await expect(tooltip).toBeHidden();
  await hoverEdgeLabel(page);
  await expect(tooltip).toHaveText("Edge tooltip");
  await graph.evaluate((host) => {
    host.graph = {
      ...host.graph,
      edges: [{ ...host.graph.edges[0], tooltip: "Updated edge" }],
    };
  });
  await expect(tooltip).toHaveText("Updated edge");
  await graph.evaluate((host) => {
    host.graph = { ...host.graph, edges: [] };
  });
  await expect(tooltip).toBeHidden();
});

test("uses the full ellipsized label unless a custom tooltip is supplied", async ({
  page,
}) => {
  const graph = page.locator("#graph");
  const tooltip = graph.getByRole("tooltip");
  const label = "A pipeline stage with a label too long to fit inside the node";
  await graph.evaluate((host, label) => {
    host.maxLabelWidth = 80;
    host.graph = { nodes: [{ id: "long", label }] };
  }, label);
  await graph.locator('[data-node-id="long"] rect').hover();
  await expect(tooltip).toHaveText(label);
  await expect(graph.locator("title")).toHaveText(label);
  await graph.evaluate((host) => {
    host.graph = {
      nodes: [{ ...host.graph.nodes[0], tooltip: "Custom tooltip" }],
    };
  });
  await expect(tooltip).toHaveText("Custom tooltip");
});

test("supports clusters and isolates tooltips across graph instances and reconnections", async ({
  page,
}) => {
  const graph = page.locator("#graph");
  await graph.evaluate((host) => {
    host.graph = {
      nodes: [
        { id: "cluster", tooltip: "Cluster tooltip" },
        { id: "child", parent: "cluster" },
      ],
    };
    const other = document.createElement("spaday-dagre");
    other.id = "other";
    other.style.cssText = "height: 200px; width: 640px";
    other.graph = { nodes: [{ id: "other", tooltip: "Other graph" }] };
    document.body.append(other);
  });
  await graph
    .locator(".spaday-dagre-cluster rect")
    .hover({ position: { x: 10, y: 10 } });
  await expect(graph.getByRole("tooltip")).toHaveText("Cluster tooltip");
  const other = page.locator("#other");
  await other.locator("rect").hover();
  await expect(other.getByRole("tooltip")).toHaveText("Other graph");
  await expect(graph.getByRole("tooltip")).toBeHidden();
  await other.evaluate((host) => {
    host.remove();
    document.body.append(host);
  });
  await expect(other.getByRole("tooltip")).toBeHidden();
  await expect(other.locator(".spaday-dagre-tooltip")).toHaveCount(1);
  await graph.evaluate((host) => host.remove());
  await other.evaluate((host) => host.remove());
  await expect(page.locator(".spaday-dagre-tooltip")).toHaveCount(0);
});

test("hides tooltips when leaving the graph, dragging, or zooming", async ({
  page,
}) => {
  const node = page.locator('#graph [data-node-id="a"] rect');
  const tooltip = page.getByRole("tooltip");
  await node.hover();
  await expect(tooltip).toBeVisible();
  await page.mouse.down();
  await expect(tooltip).toBeHidden();
  await page.mouse.move(20, 20);
  await page.mouse.up();
  await node.hover();
  await expect(tooltip).toBeVisible();
  await page.mouse.wheel(0, 100);
  await expect(tooltip).toBeHidden();
  await node.hover();
  await expect(tooltip).toBeVisible();
  await page.mouse.move(700, 500);
  await expect(tooltip).toBeHidden();
});
