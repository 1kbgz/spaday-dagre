"""A small pipeline DAG: store-driven graph mutation, node shapes, node-click
status, a node context menu, view controls, and the spaday page-mode theme
convention (``wa-dark``) re-theming the graph.

Run ``python -m spaday_dagre.example`` and open http://127.0.0.1:8016.
"""

from spaday import Sequence, SetField, by_id, close_popup, element, event_value, field, obj, open_popup
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
    element("div")
    .style(
        display="flex",
        flex_direction="column",
        min_width="10rem",
        background="var(--spa-surface, #fff)",
        border="1px solid var(--spa-border, #e6e6e6)",
        border_radius="6px",
        box_shadow="0 2px 8px rgba(0, 0, 0, 0.2)",
        padding="0.25rem",
    )
    .child(
        element("strong").style(padding="0.3rem 0.6rem").compute("textContent", field("menu.id")),
        element("button", "Select").on("click", Sequence(SetField("selected", field("menu.id")), close_popup(by_id("node-menu")))),
        element("button", "Clear selection").on("click", Sequence(SetField("selected", ""), close_popup(by_id("node-menu")))),
    ),
    id="node-menu",
)

controls = element("p").child(
    element("button", "Top-down").on("click", SetField("rankdir", "TB")),
    element("button", "Left-right").on("click", SetField("rankdir", "LR")),
    element("label").child(
        element("input", type="checkbox").bind("checked", "dark", mode="two-way"),
        " Dark theme",
    ),
)
status = element("p", class_="status").child(
    "selected: ",
    element("strong").bind("textContent", "selected", mode="one-way"),
)

page = (
    element("main")
    .style(margin="1rem", font_family="system-ui")
    .child(element("h1").text("spaday-dagre"), controls, status, graph, menu)
    .bind_root_class("wa-dark", "dark")
)

app = serve(
    page,
    packages=[package],
    store={"rankdir": "TB", "dark": False, "selected": "", "menu": {}},
)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8016)
