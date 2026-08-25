import * as dagre from "@dagrejs/dagre";

export interface DagreNode {
  id: string;
  label?: string;
  width?: number;
  height?: number;
  class?: string;
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

let measureContext: CanvasRenderingContext2D | null = null;

function measure(text: string, font: string): number {
  measureContext ??= document.createElement("canvas").getContext("2d");
  if (!measureContext) return text.length * 7;
  measureContext.font = font;
  return measureContext.measureText(text).width;
}

// a smooth path through dagre's edge points: line to midpoints, quadratic through the
// interior points — the classic rounded polyline, with no d3 dependency
function edgePath(points: { x: number; y: number }[]): string {
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

// `<spaday-dagre>` renders a serializable node/edge graph laid out by @dagrejs/dagre as
// light-DOM SVG, so the package stylesheet (and any application CSS) reaches every shape.
// Colors ride the spaday shell's --spa-* tokens with wa-dark/wa-light values, following
// the ecosystem's page-mode convention. `dagre-node-click` / `dagre-edge-click` bubble
// with the node id / edge endpoints in `detail`.
class SpadayDagre extends HTMLElement {
  #graph: DagreGraphConfig = {};
  #layout: DagreLayoutConfig = {};
  #rendered = false;

  connectedCallback(): void {
    this.style.display ||= "block";
    if (!this.#rendered) this.#render();
    this.addEventListener("click", (event) => {
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
      g.setNode(node.id, {
        width:
          node.width ?? Math.max(MIN_W, measure(label, NODE_FONT) + PAD_X * 2),
        height: node.height ?? MIN_H + PAD_Y,
      });
    }
    for (const [i, edge] of edges.entries()) {
      const sized = edge.label
        ? {
            width: measure(edge.label, EDGE_FONT) + 8,
            height: 16,
            labelpos: "c",
          }
        : {};
      g.setEdge(edge.source, edge.target, sized, String(i));
    }
    dagre.layout(g);

    const { width = 0, height = 0 } = g.graph();
    const svg = el("svg", {
      viewBox: `0 0 ${Math.ceil(width)} ${Math.ceil(height)}`,
      width: String(Math.ceil(width)),
      height: String(Math.ceil(height)),
      role: "img",
    });
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
    svg.append(defs);

    for (const [i, edge] of edges.entries()) {
      const laid = g.edge(edge.source, edge.target, String(i));
      if (!laid) continue;
      const group = el("g", {
        class: `spaday-dagre-edge ${edge.class ?? ""}`.trim(),
        "data-edge-source": edge.source,
        "data-edge-target": edge.target,
      });
      group.append(
        el("path", {
          d: edgePath(laid.points ?? []),
          "marker-end": "url(#spaday-dagre-arrow)",
        }),
      );
      if (edge.label && laid.x !== undefined && laid.y !== undefined) {
        const text = el("text", {
          class: "spaday-dagre-edge-label",
          x: String(laid.x),
          y: String(laid.y),
          "text-anchor": "middle",
          "dominant-baseline": "middle",
        });
        text.textContent = edge.label;
        group.append(text);
      }
      svg.append(group);
    }

    for (const node of nodes) {
      const laid = g.node(node.id);
      if (!laid) continue;
      const group = el("g", {
        class: `spaday-dagre-node ${node.class ?? ""}`.trim(),
        "data-node-id": node.id,
      });
      group.append(
        el("rect", {
          x: String(laid.x - laid.width / 2),
          y: String(laid.y - laid.height / 2),
          width: String(laid.width),
          height: String(laid.height),
          rx: "6",
        }),
      );
      const text = el("text", {
        x: String(laid.x),
        y: String(laid.y),
        "text-anchor": "middle",
        "dominant-baseline": "middle",
      });
      text.textContent = node.label ?? node.id;
      group.append(text);
      svg.append(group);
    }

    this.replaceChildren(svg);
  }
}

if (
  typeof customElements !== "undefined" &&
  !customElements.get("spaday-dagre")
) {
  customElements.define("spaday-dagre", SpadayDagre);
}

export { SpadayDagre };
