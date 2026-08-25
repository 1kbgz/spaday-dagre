import * as dagre from "@dagrejs/dagre";

export interface DagreNode {
  id: string;
  label?: string;
  width?: number;
  height?: number;
  class?: string;
  shape?: "rect" | "diamond" | "ellipse";
}

export interface DagreEdge {
  source: string;
  target: string;
  label?: string;
  class?: string;
}

export interface DagreGraphConfig {
  nodes?: DagreNode[];
  edges?: DagreEdge[];
}

export interface DagreLayoutConfig {
  rankdir?: "TB" | "BT" | "LR" | "RL";
  align?: "UL" | "UR" | "DL" | "DR";
  nodesep?: number;
  edgesep?: number;
  ranksep?: number;
  marginx?: number;
  marginy?: number;
  ranker?: "network-simplex" | "tight-tree" | "longest-path";
}

const SVG = "http://www.w3.org/2000/svg";
const NODE_FONT = "12px system-ui, sans-serif";
const EDGE_FONT = "11px system-ui, sans-serif";
const PAD_X = 16;
const PAD_Y = 10;
const MIN_W = 60;
const MIN_H = 32;
const EDGE_SAMPLES = 24; // fixed point count so edge paths interpolate cleanly
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 8;

let measureContext: CanvasRenderingContext2D | null = null;

function measure(text: string, font: string): number {
  measureContext ??= document.createElement("canvas").getContext("2d");
  if (!measureContext) return text.length * 7;
  measureContext.font = font;
  return measureContext.measureText(text).width;
}

type Point = { x: number; y: number };

// resample dagre's polyline to a fixed number of evenly spaced points (by arc length),
// so any two edge paths share structure and interpolate point-for-point
function resample(points: Point[], count: number): Point[] {
  if (points.length === 0) return [];
  if (points.length === 1) return Array(count).fill(points[0]);
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    lengths.push(lengths[i - 1] + Math.hypot(dx, dy));
  }
  const total = lengths[lengths.length - 1] || 1;
  const out: Point[] = [];
  let seg = 1;
  for (let i = 0; i < count; i++) {
    const target = (total * i) / (count - 1);
    while (seg < points.length - 1 && lengths[seg] < target) seg++;
    const t =
      (target - lengths[seg - 1]) / (lengths[seg] - lengths[seg - 1] || 1);
    out.push({
      x: points[seg - 1].x + (points[seg].x - points[seg - 1].x) * t,
      y: points[seg - 1].y + (points[seg].y - points[seg - 1].y) * t,
    });
  }
  return out;
}

// a smooth path through resampled points: line to midpoints, quadratic through the
// interior points — the classic rounded polyline, with no d3 dependency
function edgePath(points: Point[]): string {
  if (points.length < 2) return "";
  const parts = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 1; i < points.length - 1; i++) {
    const mid = {
      x: (points[i].x + points[i + 1].x) / 2,
      y: (points[i].y + points[i + 1].y) / 2,
    };
    parts.push(`Q ${points[i].x} ${points[i].y} ${mid.x} ${mid.y}`);
  }
  const last = points[points.length - 1];
  parts.push(`L ${last.x} ${last.y}`);
  return parts.join(" ");
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, value);
  }
  return node;
}

function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

interface NodeLaid {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface EdgeLaid {
  points: Point[];
  label?: Point;
}

// `<spaday-dagre>` renders a serializable node/edge graph laid out by @dagrejs/dagre as
// light-DOM SVG, so the package stylesheet (and any application CSS) reaches every shape.
// Colors ride the spaday shell's --spa-* tokens with wa-dark/wa-light values, following
// the ecosystem's page-mode convention. Interactivity is what dagre-d3 was liked for:
// wheel zoom (cursor-anchored) + drag pan + double-click reset (`zoomable`), animated
// re-layout with per-element identity preserved across renders (`transition`, ms), and
// CSS hover affordances. `dagre-node-click` / `dagre-edge-click` bubble with the node
// id / edge endpoints in `detail`; a drag suppresses the trailing click.
class SpadayDagre extends HTMLElement {
  #graph: DagreGraphConfig = {};
  #layout: DagreLayoutConfig = {};
  #zoomable = true;
  #transition = 250;
  #rendered = false;
  #svg: SVGSVGElement | null = null;
  #viewport: SVGGElement | null = null;
  #nodeEls = new Map<string, SVGGElement>();
  #edgeEls = new Map<string, SVGGElement>();
  #nodeLaid = new Map<string, NodeLaid>();
  #edgeLaid = new Map<string, EdgeLaid>();
  #view = { x: 0, y: 0, k: 1 };
  #frame = 0;
  #dragged = false;

  connectedCallback(): void {
    this.style.display ||= "block";
    if (!this.#rendered) this.#render();
    this.addEventListener("click", (event) => {
      if (this.#dragged) return; // a pan, not a selection
      const target = event.target as Element;
      const node = target.closest("[data-node-id]");
      if (node) {
        // scalar detail: spaday's event_value() maps to `detail`, so the id lands in
        // the store directly via SetField("selected", event_value())
        this.dispatchEvent(
          new CustomEvent("dagre-node-click", {
            detail: node.getAttribute("data-node-id"),
            bubbles: true,
            composed: true,
          }),
        );
        return;
      }
      const edge = target.closest("[data-edge-source]");
      if (edge) {
        this.dispatchEvent(
          new CustomEvent("dagre-edge-click", {
            detail: {
              source: edge.getAttribute("data-edge-source"),
              target: edge.getAttribute("data-edge-target"),
              label: edge.getAttribute("data-edge-label") ?? undefined,
            },
            bubbles: true,
            composed: true,
          }),
        );
      }
    });
  }

  set graph(value: DagreGraphConfig | null) {
    this.#graph = value ?? {};
    this.#render();
  }
  get graph(): DagreGraphConfig {
    return this.#graph;
  }

  set layout(value: DagreLayoutConfig | null) {
    this.#layout = value ?? {};
    this.#render();
  }
  get layout(): DagreLayoutConfig {
    return this.#layout;
  }

  /** Wheel zoom, drag pan, and double-click reset (default true). */
  set zoomable(value: boolean) {
    this.#zoomable = value !== false;
  }
  get zoomable(): boolean {
    return this.#zoomable;
  }

  /** Re-layout transition duration in ms; 0 disables (also disabled by reduced motion).
   * (Named `transition` because `animate` is the Web Animations API's Element.animate.) */
  set transition(value: number | null) {
    this.#transition = Number(value) || 0;
  }
  get transition(): number {
    return this.#transition;
  }

  /** The current pan/zoom, for tests and imperative hosts. */
  get view(): { x: number; y: number; k: number } {
    return { ...this.#view };
  }

  #duration(): number {
    if (!this.#transition) return 0;
    if (
      typeof matchMedia !== "undefined" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return 0;
    return this.#transition;
  }

  #ensureSvg(): { svg: SVGSVGElement; viewport: SVGGElement } {
    if (this.#svg && this.#viewport)
      return { svg: this.#svg, viewport: this.#viewport };
    const svg = el("svg", { role: "img" });
    const defs = el("defs", {});
    const marker = el("marker", {
      id: "spaday-dagre-arrow",
      class: "spaday-dagre-arrow",
      viewBox: "0 0 10 10",
      refX: "9",
      refY: "5",
      markerWidth: "7",
      markerHeight: "7",
      orient: "auto-start-reverse",
    });
    marker.append(el("path", { d: "M 0 0 L 10 5 L 0 10 z" }));
    defs.append(marker);
    const viewport = el("g", { class: "spaday-dagre-viewport" });
    svg.append(defs, viewport);
    this.#svg = svg;
    this.#viewport = viewport;
    this.#wireZoom(svg);
    this.replaceChildren(svg);
    return { svg, viewport };
  }

  #applyView(): void {
    this.#viewport?.setAttribute(
      "transform",
      `translate(${this.#view.x} ${this.#view.y}) scale(${this.#view.k})`,
    );
  }

  // client pixel -> svg user units (the svg may be shrunk by max-width: 100%)
  #toUser(svg: SVGSVGElement, clientX: number, clientY: number): Point {
    const rect = svg.getBoundingClientRect();
    const scale = rect.width
      ? Number(svg.getAttribute("width") || rect.width) / rect.width
      : 1;
    return {
      x: (clientX - rect.left) * scale,
      y: (clientY - rect.top) * scale,
    };
  }

  #wireZoom(svg: SVGSVGElement): void {
    svg.addEventListener(
      "wheel",
      (event) => {
        if (!this.#zoomable) return;
        event.preventDefault();
        const cursor = this.#toUser(svg, event.clientX, event.clientY);
        const k = Math.min(
          MAX_ZOOM,
          Math.max(MIN_ZOOM, this.#view.k * Math.exp(-event.deltaY * 0.002)),
        );
        // keep the point under the cursor fixed while the scale changes
        this.#view.x =
          cursor.x - ((cursor.x - this.#view.x) / this.#view.k) * k;
        this.#view.y =
          cursor.y - ((cursor.y - this.#view.y) / this.#view.k) * k;
        this.#view.k = k;
        this.#applyView();
      },
      { passive: false },
    );
    let panning: Point | null = null;
    svg.addEventListener("pointerdown", (event) => {
      if (!this.#zoomable || event.button !== 0) return;
      panning = this.#toUser(svg, event.clientX, event.clientY);
      this.#dragged = false;
    });
    svg.addEventListener("pointermove", (event) => {
      if (!panning) return;
      const at = this.#toUser(svg, event.clientX, event.clientY);
      const dx = at.x - panning.x;
      const dy = at.y - panning.y;
      if (!this.#dragged && Math.hypot(dx, dy) < 3) return;
      if (!this.#dragged) {
        // capture only once a real drag starts — capturing on pointerdown would
        // retarget the trailing click to the svg and break node/edge selection
        svg.setPointerCapture(event.pointerId);
      }
      this.#dragged = true;
      this.#view.x += dx;
      this.#view.y += dy;
      panning = at;
      this.#applyView();
    });
    const stop = () => {
      panning = null;
      // let the click handler read #dragged for this gesture, then clear it
      setTimeout(() => {
        this.#dragged = false;
      }, 0);
    };
    svg.addEventListener("pointerup", stop);
    svg.addEventListener("pointercancel", stop);
    svg.addEventListener("dblclick", () => {
      if (!this.#zoomable) return;
      this.#view = { x: 0, y: 0, k: 1 };
      this.#applyView();
    });
  }

  #nodeShape(group: SVGGElement, laid: NodeLaid): void {
    const shape = group.querySelector("rect, ellipse, polygon");
    const text = group.querySelector("text");
    if (!shape || !text) return;
    const { x, y, width: w, height: h } = laid;
    if (shape.tagName === "rect") {
      shape.setAttribute("x", String(x - w / 2));
      shape.setAttribute("y", String(y - h / 2));
      shape.setAttribute("width", String(w));
      shape.setAttribute("height", String(h));
    } else if (shape.tagName === "ellipse") {
      shape.setAttribute("cx", String(x));
      shape.setAttribute("cy", String(y));
      shape.setAttribute("rx", String(w / 2));
      shape.setAttribute("ry", String(h / 2));
    } else {
      shape.setAttribute(
        "points",
        `${x},${y - h / 2} ${x + w / 2},${y} ${x},${y + h / 2} ${x - w / 2},${y}`,
      );
    }
    text.setAttribute("x", String(x));
    text.setAttribute("y", String(y));
  }

  #edgeShape(group: SVGGElement, laid: EdgeLaid): void {
    for (const path of group.querySelectorAll("path")) {
      path.setAttribute("d", edgePath(laid.points));
    }
    const text = group.querySelector("text");
    if (text && laid.label) {
      text.setAttribute("x", String(laid.label.x));
      text.setAttribute("y", String(laid.label.y));
    }
  }

  #render(): void {
    if (typeof document === "undefined") return;
    this.#rendered = true;
    const nodes = this.#graph.nodes ?? [];
    const edges = this.#graph.edges ?? [];
    const g = new dagre.graphlib.Graph({ multigraph: true });
    g.setGraph({ marginx: 8, marginy: 8, ...this.#layout });
    g.setDefaultEdgeLabel(() => ({}));
    for (const node of nodes) {
      const label = node.label ?? node.id;
      // Diamonds inflate by sqrt(2) per axis (as in dagre-d3) so the label box
      // still fits inside the rotated square.
      const inflate = node.shape === "diamond" ? Math.SQRT2 : 1;
      g.setNode(node.id, {
        width:
          (node.width ??
            Math.max(MIN_W, measure(label, NODE_FONT) + PAD_X * 2)) * inflate,
        height: (node.height ?? MIN_H + PAD_Y) * inflate,
      });
    }
    const edgeKey = (edge: DagreEdge) => `${edge.source} ${edge.target}`;
    for (const edge of edges) {
      const sized = edge.label
        ? {
            width: measure(edge.label, EDGE_FONT) + 8,
            height: 16,
            labelpos: "c",
          }
        : {};
      g.setEdge(edge.source, edge.target, sized, edgeKey(edge));
    }
    dagre.layout(g);

    const { svg, viewport } = this.#ensureSvg();
    const { width = 0, height = 0 } = g.graph();
    svg.setAttribute("viewBox", `0 0 ${Math.ceil(width)} ${Math.ceil(height)}`);
    svg.setAttribute("width", String(Math.ceil(width)));
    svg.setAttribute("height", String(Math.ceil(height)));
    this.#applyView();

    cancelAnimationFrame(this.#frame);
    const duration = this.#duration();
    const steps: ((t: number) => void)[] = [];
    const nextNodeLaid = new Map<string, NodeLaid>();
    const nextEdgeLaid = new Map<string, EdgeLaid>();
    const seenNodes = new Set<string>();
    const seenEdges = new Set<string>();

    for (const edge of edges) {
      const key = edgeKey(edge);
      const laid = g.edge(edge.source, edge.target, key);
      if (!laid) continue;
      seenEdges.add(key);
      const target: EdgeLaid = {
        points: resample(laid.points ?? [], EDGE_SAMPLES),
        label:
          edge.label && laid.x !== undefined && laid.y !== undefined
            ? { x: laid.x, y: laid.y }
            : undefined,
      };
      nextEdgeLaid.set(key, target);
      let group = this.#edgeEls.get(key);
      if (!group) {
        group = el("g", {
          "data-edge-source": edge.source,
          "data-edge-target": edge.target,
        });
        // hovering an edge lights up both endpoint nodes along with the line
        const endpoints = () => [
          this.#nodeEls.get(edge.source),
          this.#nodeEls.get(edge.target),
        ];
        group.addEventListener("pointerenter", () => {
          for (const node of endpoints())
            node?.classList.add("spaday-dagre-connected");
        });
        group.addEventListener("pointerleave", () => {
          for (const node of endpoints())
            node?.classList.remove("spaday-dagre-connected");
        });
        // a wide transparent twin of the visible path, so thin edges are hoverable
        group.append(
          el("path", { class: "spaday-dagre-edge-hit" }),
          el("path", {
            class: "spaday-dagre-edge-line",
            "marker-end": "url(#spaday-dagre-arrow)",
          }),
        );
        if (target.label) {
          group.append(
            el("text", {
              class: "spaday-dagre-edge-label",
              "text-anchor": "middle",
              "dominant-baseline": "middle",
            }),
          );
        }
        viewport.append(group);
        this.#edgeEls.set(key, group);
        this.#edgeShape(group, target);
      }
      group.setAttribute(
        "class",
        `spaday-dagre-edge ${edge.class ?? ""}`.trim(),
      );
      if (edge.label) group.setAttribute("data-edge-label", edge.label);
      else group.removeAttribute("data-edge-label");
      const text = group.querySelector("text");
      if (text) text.textContent = edge.label ?? "";
      const from = this.#edgeLaid.get(key);
      if (!from || !duration) {
        this.#edgeShape(group, target);
      } else {
        const grp = group;
        steps.push((t) => {
          this.#edgeShape(grp, {
            points: target.points.map((p, i) => ({
              x: from.points[i].x + (p.x - from.points[i].x) * t,
              y: from.points[i].y + (p.y - from.points[i].y) * t,
            })),
            label:
              target.label && from.label
                ? {
                    x: from.label.x + (target.label.x - from.label.x) * t,
                    y: from.label.y + (target.label.y - from.label.y) * t,
                  }
                : target.label,
          });
        });
      }
    }

    for (const node of nodes) {
      const laid = g.node(node.id);
      if (!laid) continue;
      seenNodes.add(node.id);
      const target: NodeLaid = {
        x: laid.x,
        y: laid.y,
        width: laid.width,
        height: laid.height,
      };
      nextNodeLaid.set(node.id, target);
      const tag =
        node.shape === "diamond"
          ? "polygon"
          : node.shape === "ellipse"
            ? "ellipse"
            : "rect";
      let group = this.#nodeEls.get(node.id);
      if (!group) {
        group = el("g", { "data-node-id": node.id });
        group.append(
          el(tag, tag === "rect" ? { rx: "6" } : {}),
          el("text", {
            "text-anchor": "middle",
            "dominant-baseline": "middle",
          }),
        );
        viewport.append(group);
        this.#nodeEls.set(node.id, group);
        this.#nodeShape(group, target);
      } else {
        const shape = group.querySelector("rect, ellipse, polygon");
        if (shape && shape.tagName !== tag) {
          shape.replaceWith(el(tag, tag === "rect" ? { rx: "6" } : {}));
        }
      }
      group.setAttribute(
        "class",
        `spaday-dagre-node ${node.class ?? ""}`.trim(),
      );
      const label = group.querySelector("text");
      if (label) label.textContent = node.label ?? node.id;
      const from = this.#nodeLaid.get(node.id);
      if (!from || !duration) {
        this.#nodeShape(group, target);
      } else {
        const grp = group;
        steps.push((t) => {
          this.#nodeShape(grp, {
            x: from.x + (target.x - from.x) * t,
            y: from.y + (target.y - from.y) * t,
            width: from.width + (target.width - from.width) * t,
            height: from.height + (target.height - from.height) * t,
          });
        });
      }
    }

    for (const [id, group] of this.#nodeEls) {
      if (!seenNodes.has(id)) {
        group.remove();
        this.#nodeEls.delete(id);
      }
    }
    for (const [key, group] of this.#edgeEls) {
      if (!seenEdges.has(key)) {
        group.remove();
        this.#edgeEls.delete(key);
      }
    }
    this.#nodeLaid = nextNodeLaid;
    this.#edgeLaid = nextEdgeLaid;

    if (steps.length && duration) {
      const start = performance.now();
      const tick = (now: number) => {
        const t = ease(Math.min(1, (now - start) / duration));
        for (const step of steps) step(t);
        if (t < 1) this.#frame = requestAnimationFrame(tick);
      };
      this.#frame = requestAnimationFrame(tick);
    }
  }
}

if (
  typeof customElements !== "undefined" &&
  !customElements.get("spaday-dagre")
) {
  customElements.define("spaday-dagre", SpadayDagre);
}

export { SpadayDagre };
