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

test("bubbles rich node and edge clicks with pointer coordinates", async ({
  page,
}) => {
  await page.goto("/dist/index.html");
  const r = await page.evaluate(() => {
    const graph = document.createElement("spaday-dagre");
    graph.graph = {
      nodes: [{ id: "a", label: "Alpha" }, { id: "b" }],
      edges: [{ source: "a", target: "b", label: "flow" }],
    };
    document.body.appendChild(graph);
    const seen = [];
    document.addEventListener("dagre-node-click", (e) => seen.push(e.detail));
    document.addEventListener("dagre-edge-click", (e) => seen.push(e.detail));
    const click = (el) =>
      el.dispatchEvent(
        new MouseEvent("click", { bubbles: true, clientX: 42, clientY: 24 }),
      );
    click(graph.querySelector('[data-node-id="a"] rect'));
    click(graph.querySelector('[data-node-id="b"] rect'));
    click(graph.querySelector(".spaday-dagre-edge-hit"));
    // the label itself is a click target for its edge
    click(graph.querySelector(".spaday-dagre-edge-label"));
    return seen;
  });
  // rich detail, matching the contextmenu events — event_value("id")/("x")/("y") paths work
  expect(r[0]).toEqual({ id: "a", label: "Alpha", x: 42, y: 24 });
  expect(r[1]).toEqual({ id: "b", label: "b", x: 42, y: 24 }); // label defaults to the id
  expect(typeof r[0].x).toBe("number");
  expect(typeof r[0].y).toBe("number");
  expect(r[2]).toEqual({
    source: "a",
    target: "b",
    label: "flow",
    x: 42,
    y: 24,
  });
  expect(r[3]).toEqual({
    source: "a",
    target: "b",
    label: "flow",
    x: 42,
    y: 24,
  });
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
    const initial = graph.view; // fit-and-centered on mount
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
    return { initial, zoomed, panned, reset: graph.view, clicks };
  });
  expect(r.zoomed.k).toBeGreaterThan(1); // wheel-up zooms in
  expect(r.panned.x).not.toBe(r.zoomed.x); // drag panned the viewport
  expect(r.clicks).toEqual([]); // pan suppressed the click
  expect(r.reset).toEqual(r.initial); // double-click restores the fit-and-centered view
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

test("the example's node context menu opens at the pointer with graph context", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:8016");
  const node = page.locator('spaday-dagre [data-node-id="evaluate"] rect');
  await expect(node).toBeVisible();
  await node.click({ button: "right" });

  const menu = page.locator("#graph-menu");
  await expect(menu).toBeVisible();
  await expect(menu.locator("strong")).toHaveText("evaluate"); // captured context drives the items
  const nodeBox = await node.boundingBox();
  const menuBox = await menu.boundingBox();
  expect(Math.abs(menuBox.x - (nodeBox.x + nodeBox.width / 2)) < 60).toBe(true); // at the pointer

  await menu.getByRole("button", { name: "Select", exact: true }).click();
  await expect(page.locator(".status strong")).toHaveText("evaluate");
  await expect(menu).toBeHidden(); // the item's action closed the popup

  // reopen, then light-dismiss with a click elsewhere
  await node.click({ button: "right" });
  await expect(menu).toBeVisible();
  await page.locator("h1").click();
  await expect(menu).toBeHidden();

  // edges get the same menu, labeled by the edge context
  await page.evaluate(() => {
    const hit = document.querySelector(
      'spaday-dagre [data-edge-label="rows"] .spaday-dagre-edge-hit',
    );
    const box = hit.getBoundingClientRect();
    hit.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: box.x + box.width / 2,
        clientY: box.y + box.height / 2,
      }),
    );
  });
  await expect(menu).toBeVisible();
  await expect(menu.locator("strong")).toHaveText("rows"); // labeled edges show their label
  await menu.getByRole("button", { name: "Select", exact: true }).click();
  await expect(page.locator(".status strong")).toHaveText("rows"); // the edge's label round-trips
  await expect(menu).toBeHidden();
  // and the selected edge stays highlighted (blue selection, distinct from the red walk)
  await expect
    .poll(() =>
      page
        .locator(
          'spaday-dagre [data-edge-label="rows"] .spaday-dagre-edge-line',
        )
        .evaluate((el) => getComputedStyle(el).stroke),
    )
    .toBe("rgb(74, 144, 217)");
});

test("the example is live over the wire: pushed highlights and echoed selection", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:8016");
  const graph = page.locator("spaday-dagre");
  // the server sweeps the active stage through the pipeline (server -> client push)
  await expect(graph).toHaveAttribute("data-active", /./);
  const first = await graph.getAttribute("data-active");
  await expect
    .poll(() => graph.getAttribute("data-active"), { timeout: 5000 })
    .not.toBe(first);
  // a node click rides to the server and the echoed model drives the selection attribute
  await page.locator('spaday-dagre [data-node-id="clean"] rect').click();
  await expect(graph).toHaveAttribute("data-selected", "clean");
  await expect(page.locator(".status strong")).toHaveText("clean");

  // the two highlight layers stack and diff: while the walk visits the selected node the
  // stroke turns red over the blue selection fill; when it moves on, the stroke falls back
  const styleAt = (active) =>
    page.evaluate((value) => {
      const el = document.querySelector("spaday-dagre");
      el.setAttribute("data-active", value); // deterministic: bypass the sweep's timing
      const rect = el.querySelector('[data-node-id="clean"] rect');
      const cs = getComputedStyle(rect);
      return { fill: cs.fill, stroke: cs.stroke };
    }, active);
  const visited = await styleAt("clean");
  expect(visited.fill).toBe("rgb(227, 238, 252)"); // selection keeps the inside blue
  expect(visited.stroke).toBe("rgb(217, 83, 74)"); // the walk borrows the outline in red
  const departed = await styleAt("ingest");
  expect(departed.fill).toBe("rgb(227, 238, 252)");
  expect(departed.stroke).toBe("rgb(74, 144, 217)"); // and hands it back to the selection
});

test("panning is clamped so the graph cannot be dragged out of view", async ({
  page,
}) => {
  await page.goto("/dist/index.html");
  const r = await page.evaluate(() => {
    const graph = document.createElement("spaday-dagre");
    graph.graph = {
      nodes: [{ id: "a" }, { id: "b" }],
      edges: [{ source: "a", target: "b" }],
    };
    graph.style.cssText = "width:600px;height:400px";
    document.body.appendChild(graph);
    const svg = graph.querySelector("svg");
    const viewport = graph.querySelector(".spaday-dagre-viewport");
    const rect = svg.getBoundingClientRect();
    // how much of the graph remains visible inside the window
    const visible = () => {
      const v = viewport.getBoundingClientRect();
      const s = svg.getBoundingClientRect();
      return {
        w: Math.min(v.right, s.right) - Math.max(v.left, s.left),
        h: Math.min(v.bottom, s.bottom) - Math.max(v.top, s.top),
      };
    };
    const down = (x, y) =>
      svg.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          clientX: rect.left + x,
          clientY: rect.top + y,
          button: 0,
          pointerId: 1,
        }),
      );
    const move = (x, y) =>
      svg.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          clientX: rect.left + x,
          clientY: rect.top + y,
          pointerId: 1,
        }),
      );
    const up = () =>
      svg.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 }));
    // drag hard toward the bottom-right: without clamping the graph leaves the window
    down(5, 5);
    move(rect.width * 40, rect.height * 40);
    up();
    const dragged = visible();
    // and hard toward the top-left
    down(5, 5);
    move(-rect.width * 40, -rect.height * 40);
    up();
    return { dragged, opposite: visible() };
  });
  // after arbitrarily hard drags, a usable chunk of the graph is still inside the window
  expect(r.dragged.w).toBeGreaterThan(20);
  expect(r.dragged.h).toBeGreaterThan(20);
  expect(r.opposite.w).toBeGreaterThan(20);
  expect(r.opposite.h).toBeGreaterThan(20);
});

test("optional controls pan the diagram and reset the view", async ({
  page,
}) => {
  await page.goto("/dist/index.html");
  const r = await page.evaluate(() => {
    const graph = document.createElement("spaday-dagre");
    // sized so two 60px pans stay inside the clamp bounds
    graph.graph = {
      nodes: [
        { id: "a", width: 200, height: 200 },
        { id: "b", width: 200, height: 200 },
      ],
      edges: [{ source: "a", target: "b" }],
    };
    graph.style.cssText = "width:800px;height:600px";
    document.body.appendChild(graph);
    const initial = graph.view; // fit-and-centered on mount
    const before = !!graph.querySelector(".spaday-dagre-controls");
    graph.controls = true;
    const pad = graph.querySelector(".spaday-dagre-controls");
    pad.querySelector('[title="Pan right"]').click();
    pad.querySelector('[title="Pan down"]').click();
    const panned = { ...graph.view };
    pad.querySelector('[title="Reset view"]').click();
    const reset = { ...graph.view };
    const padRect = pad.getBoundingClientRect();
    const frameRect = graph
      .querySelector(".spaday-dagre-frame")
      .getBoundingClientRect();
    graph.controls = false;
    return {
      initial,
      before,
      buttons: pad.querySelectorAll("button").length,
      // the pad sits inside the window's bottom-right corner
      inWindow:
        padRect.right <= frameRect.right &&
        padRect.bottom <= frameRect.bottom &&
        padRect.left > frameRect.left + frameRect.width / 2,
      panned,
      reset,
      removed: !graph.querySelector(".spaday-dagre-controls"),
    };
  });
  expect(r.before).toBe(false); // opt-in
  expect(r.buttons).toBe(5);
  expect(r.inWindow).toBe(true);
  // arrows nudge by a step from the centered initial view
  expect(r.panned).toEqual({ x: r.initial.x + 60, y: r.initial.y + 60, k: 1 });
  expect(r.reset).toEqual(r.initial); // the center circle restores fit-and-center
  expect(r.removed).toBe(true);
});

test("the frame tracks the host's size, including dynamic resize", async ({
  page,
}) => {
  await page.goto("/dist/index.html");
  const r = await page.evaluate(async () => {
    const graph = document.createElement("spaday-dagre");
    graph.style.cssText = "width:600px;height:400px";
    graph.graph = {
      nodes: [{ id: "a" }, { id: "b" }],
      edges: [{ source: "a", target: "b" }],
    };
    document.body.appendChild(graph);
    const frame = graph.querySelector(".spaday-dagre-frame");
    const svg = graph.querySelector("svg");
    const at = () => ({
      frame: frame.getBoundingClientRect(),
      host: graph.getBoundingClientRect(),
      svg: svg.getBoundingClientRect(),
    });
    const sized = at();
    graph.controls = true;
    graph.style.cssText = "width:300px;height:150px"; // shrink: CSS scales, the observer re-places the pad
    await new Promise((resolve) => setTimeout(resolve, 60));
    const resized = at();
    const pad = graph
      .querySelector(".spaday-dagre-controls")
      .getBoundingClientRect();
    return { sized, resized, pad };
  });
  // the host dictates the frame, before and after resize
  expect(r.sized.frame.width).toBeCloseTo(r.sized.host.width, 0);
  expect(r.sized.frame.height).toBeCloseTo(r.sized.host.height, 0);
  expect(r.resized.frame.width).toBeCloseTo(r.resized.host.width, 0);
  expect(r.resized.frame.height).toBeCloseTo(r.resized.host.height, 0);
  // the svg window fills the frame edge to edge, before and after resize
  expect(r.sized.svg.left).toBeCloseTo(r.sized.frame.left, 0);
  expect(r.sized.svg.width).toBeCloseTo(r.sized.frame.width, 0);
  expect(r.resized.svg.height).toBeCloseTo(r.resized.frame.height, 0);
  // the observer kept the control pad inside the shrunken frame
  expect(r.pad.right).toBeLessThanOrEqual(r.resized.frame.right + 1);
  expect(r.pad.bottom).toBeLessThanOrEqual(r.resized.frame.bottom + 1);
});

test("switching layout direction re-fits and re-centers the view", async ({
  page,
}) => {
  await page.goto("/dist/index.html");
  const r = await page.evaluate(() => {
    const graph = document.createElement("spaday-dagre");
    graph.style.cssText = "width:700px;height:500px";
    graph.transition = 0;
    graph.controls = true;
    graph.graph = {
      nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
      edges: [
        { source: "a", target: "b" },
        { source: "a", target: "c" },
      ],
    };
    document.body.appendChild(graph);
    const pad = graph.querySelector(".spaday-dagre-controls");
    pad.querySelector('[title="Pan right"]').click(); // wander off-center
    pad.querySelector('[title="Pan down"]').click();
    graph.layout = { rankdir: "LR" };
    const after = { ...graph.view };
    graph.querySelector("svg").dispatchEvent(new MouseEvent("dblclick"));
    return { after, reset: { ...graph.view } };
  });
  expect(r.after).toEqual(r.reset); // the switch landed exactly on the fit-and-centered view
});

test("edges meet diamond and ellipse boundaries instead of the layout bbox", async ({
  page,
}) => {
  await page.goto("/dist/index.html");
  const r = await page.evaluate(() => {
    const graph = document.createElement("spaday-dagre");
    graph.graph = {
      nodes: [
        { id: "a" },
        { id: "b", shape: "diamond" },
        { id: "c", shape: "ellipse" },
      ],
      edges: [
        { source: "a", target: "b" },
        { source: "b", target: "c" },
      ],
    };
    document.body.appendChild(graph);
    const shape = (id, tag) => {
      const el = graph.querySelector(`[data-node-id="${id}"] ${tag}`);
      const box = el.getBBox();
      return {
        cx: box.x + box.width / 2,
        cy: box.y + box.height / 2,
        hw: box.width / 2,
        hh: box.height / 2,
      };
    };
    const endOf = (source, target) => {
      const d = graph
        .querySelector(
          `[data-edge-source="${source}"][data-edge-target="${target}"] .spaday-dagre-edge-line`,
        )
        .getAttribute("d");
      const nums = d.match(/-?[\d.]+/g).map(Number);
      return { x: nums[nums.length - 2], y: nums[nums.length - 1] };
    };
    const b = shape("b", "polygon");
    const c = shape("c", "ellipse");
    const intoB = endOf("a", "b");
    const intoC = endOf("b", "c");
    return {
      // diamond metric: |dx|/hw + |dy|/hh == 1 exactly on the boundary
      diamond:
        Math.abs(intoB.x - b.cx) / b.hw + Math.abs(intoB.y - b.cy) / b.hh,
      // ellipse metric: (dx/hw)^2 + (dy/hh)^2 == 1 exactly on the boundary
      ellipse: ((intoC.x - c.cx) / c.hw) ** 2 + ((intoC.y - c.cy) / c.hh) ** 2,
    };
  });
  expect(Math.abs(r.diamond - 1)).toBeLessThan(0.05);
  expect(Math.abs(r.ellipse - 1)).toBeLessThan(0.05);
});

test("consumer --dagre-* tokens re-theme both modes; emphasis wears the accent", async ({
  page,
}) => {
  await page.goto("/dist/index.html");
  const r = await page.evaluate(() => {
    const graph = document.createElement("spaday-dagre");
    graph.graph = {
      nodes: [{ id: "a", class: "emphasis" }, { id: "b" }],
      edges: [{ source: "a", target: "b" }],
    };
    document.body.appendChild(graph);
    const style = (id) =>
      getComputedStyle(graph.querySelector(`[data-node-id="${id}"] rect`));
    const before = style("b").fill;
    graph.style.setProperty("--dagre-node-fill", "rgb(10, 20, 30)");
    graph.style.setProperty("--dagre-accent", "rgb(200, 50, 100)");
    const themed = style("b").fill;
    document.documentElement.classList.add("wa-dark");
    const themedDark = style("b").fill;
    document.documentElement.classList.remove("wa-dark");
    const emphasis = {
      stroke: style("a").stroke,
      width: style("a").strokeWidth,
    };
    return { before, themed, themedDark, emphasis };
  });
  expect(r.before).toBe("rgb(250, 250, 250)"); // --spa-surface-2 default holds without tokens
  expect(r.themed).toBe("rgb(10, 20, 30)"); // a host token overrides the default...
  expect(r.themedDark).toBe("rgb(10, 20, 30)"); // ...and wins in dark mode too
  expect(r.emphasis.stroke).toBe("rgb(200, 50, 100)"); // config class "emphasis" is forwarded
  expect(r.emphasis.width).toBe("2.5px"); // and outlined with the accent
});

test("maxLabelWidth caps node width and ellipsizes with a full-label tooltip", async ({
  page,
}) => {
  await page.goto("/dist/index.html");
  const LONG =
    "an extremely long pipeline stage label that would widen the node without bound";
  const r = await page.evaluate((long) => {
    const graph = document.createElement("spaday-dagre");
    graph.transition = 0;
    graph.maxLabelWidth = 120;
    graph.graph = {
      nodes: [
        { id: "long", label: long },
        { id: "short", label: "Short" },
      ],
      edges: [{ source: "long", target: "short" }],
    };
    document.body.appendChild(graph);
    const group = (id) => graph.querySelector(`[data-node-id="${id}"]`);
    const width = (id) =>
      Number(group(id).querySelector("rect").getAttribute("width"));
    const capped = {
      width: width("long"),
      text: group("long").querySelector("text").textContent,
      title: group("long").querySelector("title")?.textContent ?? null,
    };
    const uncapped = {
      text: group("short").querySelector("text").textContent,
      title: group("short").querySelector("title")?.textContent ?? null,
    };
    graph.maxLabelWidth = null; // unsetting re-renders at the natural width
    return { capped, uncapped, restored: width("long") };
  }, LONG);
  expect(r.capped.width).toBeLessThanOrEqual(120 + 33); // label cap + PAD_X * 2
  expect(r.capped.text.endsWith("…")).toBe(true);
  expect(r.capped.title).toBe(LONG); // the full label rides a native tooltip
  expect(r.uncapped.text).toBe("Short"); // labels that fit are untouched
  expect(r.uncapped.title).toBeNull();
  expect(r.restored).toBeGreaterThan(200);
});
