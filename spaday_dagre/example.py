"""A pipeline-explorer showcase, live over a transports wire: the server sweeps an
*active* highlight from ingest through deploy — walking the nodes and the edges
between them — pushing each step to every client, and
node/edge selection rides back to the server as model edits (the same round trip
the other peers' examples exercise). Also on show: node shapes, a right-click
context menu for nodes and edges, view controls, host-driven sizing, and the
spaday page-mode theme convention (``wa-dark``) re-theming the whole page.

Run ``python -m spaday_dagre.example`` and open http://127.0.0.1:8016.
"""

import asyncio

import transports
from pydantic import BaseModel
from spaday import SendPatch, Sequence, SetField, Wire, by_id, close_popup, concat, cond, element, eq, event_value, field, obj, open_popup
from spaday.backends.starlette import serve
from spaday.components.shell import Popup
from starlette.routing import WebSocketRoute

from spaday_dagre import Dagre, package

ORDER = ["ingest", "clean", "features", "train", "evaluate", "deploy"]

# the sweep walks the pipeline node by node, stepping across the edge between each pair
STEPS: list[str] = []
for _i, _node in enumerate(ORDER):
    STEPS.append(_node)
    if _i < len(ORDER) - 1:
        STEPS.append(f"{_node}\u2192{ORDER[_i + 1]}")

GRAPH = {
    "nodes": [
        {"id": "ingest", "label": "Ingest"},
        {"id": "clean", "label": "Clean"},
        {"id": "features", "label": "Features", "shape": "diamond"},
        {"id": "train", "label": "Train"},
        {"id": "evaluate", "label": "Evaluate"},
        {"id": "deploy", "label": "Deploy", "class": "deploy", "shape": "ellipse"},
    ],
    "edges": [
        {"source": "ingest", "target": "clean"},
        {"source": "clean", "target": "features", "label": "rows"},
        {"source": "features", "target": "train"},
        {"source": "features", "target": "evaluate"},
        {"source": "train", "target": "evaluate", "label": "model"},
        {"source": "evaluate", "target": "deploy"},
    ],
}


class Pipeline(BaseModel):
    """The live model every client mirrors: the server owns ``active``; clients edit ``selected``."""

    active: str = "ingest"
    selected: str = ""


pipeline = Pipeline()
session = transports.Session()
session.host(pipeline)
server = transports.Server(session)


async def sweep() -> None:
    """Walk the active highlight from ingest through deploy — nodes and the edges between
    them — forever (server → clients)."""
    stage = 0
    while True:
        await asyncio.sleep(0.9)
        stage = (stage + 1) % len(STEPS)
        pipeline.active = STEPS[stage]


# what a context-menu action selects: the node id, else the edge label, else "source → target"
_menu_choice = cond(
    field("menu.id"),
    field("menu.id"),
    cond(field("menu.label"), field("menu.label"), concat(field("menu.source"), " → ", field("menu.target"))),
)

graph = (
    Dagre(id="pipeline")
    .prop("graph", GRAPH)
    .prop("controls", True)
    .compute("layout", obj({"rankdir": field("rankdir")}))
    # the server-pushed highlight and the echoed selection drive CSS via host attributes
    .bind("data-active", "pipeline.active")
    .bind("data-selected", "pipeline.selected")
    # selection is a server round trip: the edit rides the wire up and takes effect when the
    # server echoes it back into the mirrored model, so every tab agrees
    .on("dagre-node-click", SendPatch("pipeline", "selected", event_value()))
    # the selection key matches the menu's: the label, else "source → target" — so every
    # edge selection has a stable value the highlight CSS can match
    .on(
        "dagre-edge-click",
        SendPatch(
            "pipeline",
            "selected",
            cond(event_value("label"), event_value("label"), concat(event_value("source"), " \u2192 ", event_value("target"))),
        ),
    )
    # right-click a node or edge: capture the event detail into `menu` and open the popup at
    # the pointer (event_value paths walk the detail, which carries the context plus {x, y})
    .on(
        "dagre-node-contextmenu",
        open_popup(by_id("graph-menu"), x=event_value("x"), y=event_value("y"), context_field="menu", context=event_value()),
    )
    .on(
        "dagre-edge-contextmenu",
        open_popup(by_id("graph-menu"), x=event_value("x"), y=event_value("y"), context_field="menu", context=event_value()),
    )
)

# the context menu is ordinary components; its items read the captured context from the store
menu = Popup(
    element(
        "div",
        element("strong").compute("textContent", _menu_choice),
        element("button", "Select").on("click", Sequence(SendPatch("pipeline", "selected", _menu_choice), close_popup(by_id("graph-menu")))),
        element("button", "Clear selection").on("click", Sequence(SendPatch("pipeline", "selected", ""), close_popup(by_id("graph-menu")))),
        class_="ctx-menu",
    ),
    id="graph-menu",
)


def _direction(label: str, rankdir: str):
    return (
        element("button", label).on("click", SetField("rankdir", rankdir)).compute("class", cond(eq(field("rankdir"), rankdir), "seg active", "seg"))
    )


toolbar = element(
    "div",
    element("div", _direction("Top-down", "TB"), _direction("Left-right", "LR"), class_="segmented"),
    element("span", class_="hint").text("Right-click a node or edge · drag to pan · scroll to zoom · double-click to reset"),
    element("label", class_="dark-toggle").child(
        element("input", type="checkbox").bind("checked", "dark", mode="two-way"),
        " Dark",
    ),
    class_="toolbar",
)

status = element("p", class_="status").child(
    element("span").text("Selected"),
    element("strong").bind("textContent", "pipeline.selected", mode="one-way"),
)
active_chip = element("p", class_="active-chip").child(
    element("span").text("Active stage"),
    element("em").bind("textContent", "pipeline.active", mode="one-way"),
)

page = (
    element(
        "main",
        element("p", class_="eyebrow").text("GRAPH RENDERING"),
        element("h1").text("Pipeline explorer"),
        element("p", class_="lede").text("A serializable DAG laid out by dagre — live over a transports wire, configured from Python."),
        element(
            "section",
            element(
                "header",
                element("div", element("h2").text("Model pipeline"), element("div", status, active_chip, class_="chips")),
                toolbar,
                class_="panel-header",
            ),
            element("div", graph, class_="graph-panel"),
            class_="panel",
        ),
        menu,
        class_="page",
    )
).bind_root_class("wa-dark", "dark")


def _active_rule(step: str) -> str:
    """The sweep's walk highlight: a red outline, distinct from the blue selection."""
    if "\u2192" in step:
        source, target = step.split("\u2192")
        edge = f'[data-edge-source="{source}"][data-edge-target="{target}"]'
        return (
            f'  spaday-dagre[data-active="{step}"] {edge} .spaday-dagre-edge-line '
            "{ stroke: var(--spa-walk); stroke-width: 2.5; }\n"
            f'  spaday-dagre[data-active="{step}"] {edge} .spaday-dagre-edge-label '
            "{ fill: var(--spa-walk); }"
        )
    return f'  spaday-dagre[data-active="{step}"] [data-node-id="{step}"] :is(rect, polygon, ellipse) {{ stroke: var(--spa-walk); stroke-width: 2; }}'


def _selected_edge_rule(edge: dict) -> str:
    """A selected edge stays highlighted; its selection key is the label, else "source → target"."""
    key = edge.get("label") or f"{edge['source']} \u2192 {edge['target']}"
    hook = f'[data-edge-source="{edge["source"]}"][data-edge-target="{edge["target"]}"]'
    return (
        f'  spaday-dagre[data-selected="{key}"] {hook} .spaday-dagre-edge-line '
        "{ stroke: var(--spa-accent); stroke-width: 2.5; }\n"
        f'  spaday-dagre[data-selected="{key}"] {hook} .spaday-dagre-edge-label '
        "{ fill: var(--spa-accent); }"
    )


_HIGHLIGHTS = "\n".join(
    [_active_rule(step) for step in STEPS]
    + [
        f'  spaday-dagre[data-selected="{node}"] [data-node-id="{node}"] :is(rect, polygon, ellipse) '
        "{ fill: var(--spa-select-fill); stroke: var(--spa-accent); stroke-width: 2.5; }"
        for node in ORDER
    ]
    + [_selected_edge_rule(edge) for edge in GRAPH["edges"]]
)

STYLES = f"""
<style>
  :root {{
    --spa-surface: #ffffff; --spa-surface-2: #f4f6f8; --spa-border: #e3e6ea;
    --spa-muted: #5f6b76; --spa-accent: #4a90d9; --spa-text: #1c2530;
    --spa-select-fill: #e3eefc; --spa-walk: #d9534a;
  }}
  /* :root outranks a zero-specificity :where() block, so the dark tokens key on the class */
  :root.wa-dark {{
    --spa-surface: #15191e; --spa-surface-2: #1d232b; --spa-border: #333b45;
    --spa-muted: #9aa3ad; --spa-accent: #8fb4dd; --spa-text: #d7dce2;
    --spa-select-fill: #263a52; --spa-walk: #ff8a76;
    color-scheme: dark;
  }}
  body {{ margin: 0; min-height: 100vh; background: var(--spa-surface-2); color: var(--spa-text);
    font-family: Inter, ui-sans-serif, system-ui, sans-serif; }}
  .page {{ box-sizing: border-box; max-width: 64rem; margin: 0 auto; padding: 3rem 1.25rem; }}
  .eyebrow {{ margin: 0; color: var(--spa-accent); font-size: .75rem; font-weight: 800; letter-spacing: .16em; }}
  h1 {{ margin: .35rem 0 0; font-size: clamp(2rem, 5vw, 3rem); letter-spacing: -.03em; }}
  .lede {{ margin: .6rem 0 2rem; color: var(--spa-muted); font-size: 1.05rem; }}
  .panel {{ background: var(--spa-surface); border: 1px solid var(--spa-border); border-radius: 1rem;
    box-shadow: 0 18px 45px rgba(15, 23, 42, .08); padding: 1.25rem; }}
  .panel-header {{ display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem;
    flex-wrap: wrap; margin-bottom: 1rem; }}
  .panel-header h2 {{ margin: 0 0 .3rem; font-size: 1.2rem; }}
  .chips {{ display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }}
  .status, .active-chip {{ display: inline-flex; align-items: center; gap: .5rem; margin: 0; font-size: .85rem; }}
  .status span, .active-chip span {{ color: var(--spa-muted); }}
  .status strong, .active-chip em {{ min-width: 3rem; min-height: 1.3rem; padding: .1rem .55rem;
    border-radius: 999px; background: var(--spa-surface-2); border: 1px solid var(--spa-border);
    font-style: normal; font-weight: 600; }}
  .active-chip em {{ color: var(--spa-walk); border-color: var(--spa-walk); }}
  .toolbar {{ display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }}
  .segmented {{ display: inline-flex; border: 1px solid var(--spa-border); border-radius: .6rem; overflow: hidden; }}
  .seg {{ padding: .4rem .85rem; border: none; background: var(--spa-surface); color: var(--spa-muted);
    font: inherit; font-size: .85rem; cursor: pointer; }}
  .seg + .seg {{ border-left: 1px solid var(--spa-border); }}
  .seg.active {{ background: var(--spa-accent); color: #fff; }}
  .hint {{ color: var(--spa-muted); font-size: .78rem; }}
  .dark-toggle {{ display: inline-flex; align-items: center; gap: .4rem; color: var(--spa-muted);
    font-size: .85rem; cursor: pointer; }}
  .graph-panel {{ height: 30rem; border: 1px solid var(--spa-border); border-radius: .75rem;
    background: var(--spa-surface-2); overflow: hidden; }}
  .graph-panel spaday-dagre {{ height: 100%; }}
{_HIGHLIGHTS}
  .ctx-menu {{ display: flex; flex-direction: column; min-width: 11rem; padding: .3rem;
    background: var(--spa-surface); border: 1px solid var(--spa-border); border-radius: .6rem;
    box-shadow: 0 10px 30px rgba(0, 0, 0, .25); }}
  .ctx-menu strong {{ padding: .35rem .6rem .45rem; font-size: .85rem; border-bottom: 1px solid var(--spa-border); }}
  .ctx-menu button {{ text-align: left; padding: .4rem .6rem; margin-top: .15rem; border: none; border-radius: .4rem;
    background: transparent; color: inherit; font: inherit; font-size: .85rem; cursor: pointer; }}
  .ctx-menu button:hover {{ background: var(--spa-surface-2); color: var(--spa-accent); }}
  @media (max-width: 720px) {{ .page {{ padding: 1.5rem .75rem; }} .graph-panel {{ height: 22rem; }} }}
</style>
"""

app = serve(
    page,
    packages=[package],
    wire=[Wire("/ws", namespace="pipeline")],
    routes=[WebSocketRoute("/ws", transports.ws_endpoint(server))],
    background=[transports.autosync(server), sweep()],
    store={"rankdir": "TB", "dark": False, "menu": {}},
    head=STYLES,
    title="spaday-dagre example",
)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8016)
