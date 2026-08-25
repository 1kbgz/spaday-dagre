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
    graph.transition = 0; // positions are asserted synchronously below
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
      edges: graph.querySelectorAll(".spaday-dagre-edge-line").length,
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
      edges: [{ source: "a", target: "b", label: "flow" }],
    };
    document.body.appendChild(graph);
    const seen = [];
    document.addEventListener("dagre-node-click", (e) => seen.push(e.detail));
    document.addEventListener("dagre-edge-click", (e) => seen.push(e.detail));
    graph
      .querySelector('[data-node-id="a"] rect')
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    graph
      .querySelector(".spaday-dagre-edge-hit")
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    // the label itself is a click target for its edge
    graph
      .querySelector(".spaday-dagre-edge-label")
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    return seen;
  });
  expect(r[0]).toBe("a"); // scalar detail — event_value() lands the id in the store
  expect(r[1]).toEqual({ source: "a", target: "b", label: "flow" });
  expect(r[2]).toEqual({ source: "a", target: "b", label: "flow" });
});

test("hovering an edge highlights its endpoint nodes", async ({ page }) => {
  await page.goto("/dist/index.html");
  const r = await page.evaluate(() => {
    const graph = document.createElement("spaday-dagre");
    graph.transition = 0;
    graph.graph = {
      nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
      edges: [{ source: "a", target: "b" }],
    };
    document.body.appendChild(graph);
    const edge = graph.querySelector("[data-edge-source]");
    const connected = () =>
      [...graph.querySelectorAll(".spaday-dagre-connected")].map((n) =>
        n.getAttribute("data-node-id"),
      );
    edge.dispatchEvent(new PointerEvent("pointerenter"));
    const during = connected();
    edge.dispatchEvent(new PointerEvent("pointerleave"));
    return { during, after: connected() };
  });
  expect(r.during.sort()).toEqual(["a", "b"]); // both ends, not the bystander c
  expect(r.after).toEqual([]);
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
    const arrow = getComputedStyle(
      graph.querySelector(".spaday-dagre-arrow path"),
    ).fill;
    return { light, dark, back: fill(), arrow };
  });
  expect(r.arrow).toBe("context-stroke"); // arrowheads follow their edge's (hover) stroke
  expect(r.light).toBe("rgb(250, 250, 250)"); // --spa-surface-2 light default
  expect(r.dark).toBe("rgb(36, 45, 56)"); // #242d38, tuned for contrast on dark pages
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
  // a labeled edge lands its label in the store via event_value("label")
  await page
    .locator('spaday-dagre [data-edge-label="rows"] .spaday-dagre-edge-label')
    .click();
  await expect(page.locator(".status strong")).toHaveText("rows");
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
    .toBe("rgb(36, 45, 56)"); // bind_root_class("wa-dark") re-themes the graph
});

test("zooms at the cursor, pans by drag, resets on double-click", async ({
  page,
}) => {
  await page.goto("/dist/index.html");
  const r = await page.evaluate(() => {
    const graph = document.createElement("spaday-dagre");
    graph.transition = 0;
    graph.graph = {
      nodes: [{ id: "a" }, { id: "b" }],
      edges: [{ source: "a", target: "b" }],
    };
    document.body.appendChild(graph);
    const svg = graph.querySelector("svg");
    const clicks = [];
    graph.addEventListener("dagre-node-click", (e) => clicks.push(e.detail));
    const rect = svg.getBoundingClientRect();
    svg.dispatchEvent(
      new WheelEvent("wheel", {
        deltaY: -240,
        clientX: rect.left + 30,
        clientY: rect.top + 30,
        bubbles: true,
        cancelable: true,
      }),
    );
    const zoomed = graph.view;
    const down = new PointerEvent("pointerdown", {
      pointerId: 1,
      button: 0,
      clientX: rect.left + 40,
      clientY: rect.top + 40,
      bubbles: true,
    });
    svg.dispatchEvent(down);
    svg.dispatchEvent(
      new PointerEvent("pointermove", {
        pointerId: 1,
        clientX: rect.left + 90,
        clientY: rect.top + 70,
        bubbles: true,
      }),
    );
    svg.dispatchEvent(
      new PointerEvent("pointerup", { pointerId: 1, bubbles: true }),
    );
    const panned = graph.view;
    // the drag's trailing click must not select a node
    graph
      .querySelector('[data-node-id="a"] rect')
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    svg.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    return { zoomed, panned, reset: graph.view, clicks };
  });
  expect(r.zoomed.k).toBeGreaterThan(1); // wheel-up zooms in
  expect(r.panned.x).not.toBe(r.zoomed.x); // drag panned the viewport
  expect(r.clicks).toEqual([]); // pan suppressed the click
  expect(r.reset).toEqual({ x: 0, y: 0, k: 1 }); // double-click resets
});

test("re-layout animates while preserving element identity", async ({
  page,
}) => {
  await page.goto("/dist/index.html");
  await page.evaluate(() => {
    const graph = document.createElement("spaday-dagre");
    graph.id = "animated";
    graph.transition = 80;
    graph.graph = {
      nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
      edges: [
        { source: "a", target: "b" },
        { source: "a", target: "c" },
      ],
    };
    document.body.appendChild(graph);
    // node "c" moves in both axes on the TB->LR flip ("b" coincidentally does not)
    const el = graph.querySelector('[data-node-id="c"]');
    el.dataset.identity = "kept"; // marker survives only if the element is reused
    window.__before = Number(el.querySelector("rect").getAttribute("x"));
    graph.layout = { rankdir: "LR" };
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const el = document.querySelector('#animated [data-node-id="c"]');
        return {
          identity: el.dataset.identity,
          moved:
            Number(el.querySelector("rect").getAttribute("x")) !==
            window.__before,
        };
      }),
    )
    .toEqual({ identity: "kept", moved: true }); // same element, tweened to its new spot
});

test("renders diamond and ellipse node shapes", async ({ page }) => {
  await page.goto("/dist/index.html");
  const r = await page.evaluate(() => {
    const graph = document.createElement("spaday-dagre");
    graph.graph = {
      nodes: [
        { id: "chan", shape: "diamond" },
        { id: "mod" },
        { id: "sink", shape: "ellipse" },
      ],
      edges: [
        { source: "mod", target: "chan" },
        { source: "chan", target: "sink" },
      ],
    };
    document.body.appendChild(graph);
    const tag = (id) =>
      graph
        .querySelector(`[data-node-id="${id}"]`)
        .querySelector("rect, ellipse, polygon").tagName;
    const poly = graph
      .querySelector('[data-node-id="chan"]')
      .querySelector("polygon");
    // then flip the diamond back to a rect to exercise shape replacement
    graph.graph = {
      nodes: [{ id: "chan" }, { id: "mod" }, { id: "sink", shape: "ellipse" }],
      edges: [{ source: "mod", target: "chan" }],
    };
    return {
      shapes: { chan: poly.tagName, mod: tag("mod"), sink: tag("sink") },
      diamondPoints: poly.getAttribute("points").split(" ").length,
      reshaped: tag("chan"),
    };
  });
  expect(r.shapes).toEqual({ chan: "polygon", mod: "rect", sink: "ellipse" });
  expect(r.diamondPoints).toBe(4);
  expect(r.reshaped).toBe("rect");
});

test("right-click dispatches enriched contextmenu events with graph context", async ({
  page,
}) => {
  await page.goto("/dist/index.html");
  await page.evaluate(() => {
    const graph = document.createElement("spaday-dagre");
    graph.id = "ctx";
    graph.graph = {
      nodes: [{ id: "a" }, { id: "b" }],
      edges: [{ source: "a", target: "b", label: "flow" }],
    };
    document.body.appendChild(graph);
    window.__events = [];
    window.__native = 0;
    graph.addEventListener("dagre-node-contextmenu", (e) =>
      window.__events.push({ kind: "node", ...e.detail }),
    );
    graph.addEventListener("dagre-edge-contextmenu", (e) =>
      window.__events.push({ kind: "edge", ...e.detail }),
    );
    document.addEventListener("contextmenu", (e) => {
      if (!e.defaultPrevented) window.__native += 1;
    });
  });

  await page.evaluate(() => {
    const graph = document.getElementById("ctx");
    const menu = (el, x, y) =>
      el.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
        }),
      );
    menu(graph.querySelector('[data-node-id="a"] rect'), 40, 30);
    menu(graph.querySelector(".spaday-dagre-edge-hit"), 38, 60);
  });
  await page.mouse.click(5, 5, { button: "right" }); // background: native menu kept

  const r = await page.evaluate(() => ({
    events: window.__events,
    native: window.__native,
  }));
  expect(r.events).toHaveLength(2);
  expect(r.events[0].kind).toBe("node");
  expect(r.events[0].id).toBe("a");
  expect(typeof r.events[0].x).toBe("number"); // pointer position rides the detail
  expect(r.events[1]).toMatchObject({
    kind: "edge",
    source: "a",
    target: "b",
    label: "flow",
  });
  expect(r.native).toBe(1); // suppressed over shapes, kept on the background
});
