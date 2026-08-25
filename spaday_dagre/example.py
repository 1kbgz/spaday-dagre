"""A pipeline-explorer showcase: node shapes, node-click status, a right-click
node menu, view controls, host-driven sizing, and the spaday page-mode theme
convention (``wa-dark``) re-theming the whole page with the graph.

Run ``python -m spaday_dagre.example`` and open http://127.0.0.1:8016.
"""

from spaday import Sequence, SetField, by_id, close_popup, cond, element, eq, event_value, field, obj, open_popup
from spaday.backends.starlette import serve
from spaday.components.shell import Popup

from spaday_dagre import Dagre, package

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

graph = (
    Dagre(id="pipeline")
    .prop("graph", GRAPH)
    .prop("controls", True)
    .compute("layout", obj({"rankdir": field("rankdir")}))
    .on("dagre-node-click", SetField("selected", event_value()))
    .on("dagre-edge-click", SetField("selected", event_value("label")))
    # right-click a node: capture {id, x, y} into `menu` and open the popup at the pointer
    .on(
        "dagre-node-contextmenu",
        # event_value paths walk the event's detail, which carries {id, x, y}
        open_popup(
            by_id("node-menu"),
            x=event_value("x"),
            y=event_value("y"),
            context_field="menu",
            context=event_value(),
        ),
    )
)

# the context menu itself is ordinary components; its items read the captured context from the store
menu = Popup(
    element(
        "div",
        element("strong").compute("textContent", field("menu.id")),
        element("button", "Select").on("click", Sequence(SetField("selected", field("menu.id")), close_popup(by_id("node-menu")))),
        element("button", "Clear selection").on("click", Sequence(SetField("selected", ""), close_popup(by_id("node-menu")))),
        class_="ctx-menu",
    ),
    id="node-menu",
)


def _direction(label: str, rankdir: str):
    return (
        element("button", label).on("click", SetField("rankdir", rankdir)).compute("class", cond(eq(field("rankdir"), rankdir), "seg active", "seg"))
    )


toolbar = element(
    "div",
    element("div", _direction("Top-down", "TB"), _direction("Left-right", "LR"), class_="segmented"),
    element("span", class_="hint").text("Right-click a node · drag to pan · scroll to zoom · double-click to reset"),
    element("label", class_="dark-toggle").child(
        element("input", type="checkbox").bind("checked", "dark", mode="two-way"),
        " Dark",
    ),
    class_="toolbar",
)

status = element("p", class_="status").child(
    element("span").text("Selected"),
    element("strong").bind("textContent", "selected", mode="one-way"),
)

page = (
    element(
        "main",
        element("p", class_="eyebrow").text("GRAPH RENDERING"),
        element("h1").text("Pipeline explorer"),
        element("p", class_="lede").text("A serializable DAG laid out by dagre — shapes, interactivity, and context menus, configured from Python."),
        element(
            "section",
            element(
                "header",
                element("div", element("h2").text("Model pipeline"), status),
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

STYLES = """
<style>
  :root {
    --spa-surface: #ffffff; --spa-surface-2: #f4f6f8; --spa-border: #e3e6ea;
    --spa-muted: #5f6b76; --spa-accent: #4a90d9; --spa-text: #1c2530;
  }
  /* :root outranks a zero-specificity :where() block, so the dark tokens key on the class */
  :root.wa-dark {
    --spa-surface: #15191e; --spa-surface-2: #1d232b; --spa-border: #333b45;
    --spa-muted: #9aa3ad; --spa-accent: #8fb4dd; --spa-text: #d7dce2;
    color-scheme: dark;
  }
  body { margin: 0; min-height: 100vh; background: var(--spa-surface-2); color: var(--spa-text);
    font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
  .page { box-sizing: border-box; max-width: 64rem; margin: 0 auto; padding: 3rem 1.25rem; }
  .eyebrow { margin: 0; color: var(--spa-accent); font-size: .75rem; font-weight: 800; letter-spacing: .16em; }
  h1 { margin: .35rem 0 0; font-size: clamp(2rem, 5vw, 3rem); letter-spacing: -.03em; }
  .lede { margin: .6rem 0 2rem; color: var(--spa-muted); font-size: 1.05rem; }
  .panel { background: var(--spa-surface); border: 1px solid var(--spa-border); border-radius: 1rem;
    box-shadow: 0 18px 45px rgba(15, 23, 42, .08); padding: 1.25rem; }
  .panel-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem;
    flex-wrap: wrap; margin-bottom: 1rem; }
  .panel-header h2 { margin: 0 0 .3rem; font-size: 1.2rem; }
  .status { display: inline-flex; align-items: center; gap: .5rem; margin: 0; font-size: .85rem; }
  .status span { color: var(--spa-muted); }
  .status strong { min-width: 3rem; min-height: 1.3rem; padding: .1rem .55rem; border-radius: 999px;
    background: var(--spa-surface-2); border: 1px solid var(--spa-border); }
  .toolbar { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
  .segmented { display: inline-flex; border: 1px solid var(--spa-border); border-radius: .6rem; overflow: hidden; }
  .seg { padding: .4rem .85rem; border: none; background: var(--spa-surface); color: var(--spa-muted);
    font: inherit; font-size: .85rem; cursor: pointer; }
  .seg + .seg { border-left: 1px solid var(--spa-border); }
  .seg.active { background: var(--spa-accent); color: #fff; }
  .hint { color: var(--spa-muted); font-size: .78rem; }
  .dark-toggle { display: inline-flex; align-items: center; gap: .4rem; color: var(--spa-muted);
    font-size: .85rem; cursor: pointer; }
  .graph-panel { height: 30rem; border: 1px solid var(--spa-border); border-radius: .75rem;
    background: var(--spa-surface-2); overflow: hidden; }
  .graph-panel spaday-dagre { height: 100%; }
  .ctx-menu { display: flex; flex-direction: column; min-width: 11rem; padding: .3rem;
    background: var(--spa-surface); border: 1px solid var(--spa-border); border-radius: .6rem;
    box-shadow: 0 10px 30px rgba(0, 0, 0, .25); }
  .ctx-menu strong { padding: .35rem .6rem .45rem; font-size: .85rem; border-bottom: 1px solid var(--spa-border); }
  .ctx-menu button { text-align: left; padding: .4rem .6rem; margin-top: .15rem; border: none; border-radius: .4rem;
    background: transparent; color: inherit; font: inherit; font-size: .85rem; cursor: pointer; }
  .ctx-menu button:hover { background: var(--spa-surface-2); color: var(--spa-accent); }
  @media (max-width: 720px) { .page { padding: 1.5rem .75rem; } .graph-panel { height: 22rem; } }
</style>
"""

app = serve(
    page,
    packages=[package],
    store={"rankdir": "TB", "dark": False, "selected": "", "menu": {}},
    head=STYLES,
    title="spaday-dagre example",
)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8016)
