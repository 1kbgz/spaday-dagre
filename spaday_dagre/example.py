"""A small pipeline DAG: store-driven graph mutation, node-click status, and the
spaday page-mode theme convention (``wa-dark``) re-theming the graph.

Run ``python -m spaday_dagre.example`` and open http://127.0.0.1:8016.
"""

from spaday import SetField, element, event_value, field, obj
from spaday.backends.starlette import serve

from spaday_dagre import Dagre, package

GRAPH = {
    "nodes": [
        {"id": "ingest", "label": "Ingest"},
        {"id": "clean", "label": "Clean"},
        {"id": "features", "label": "Features"},
        {"id": "train", "label": "Train"},
        {"id": "evaluate", "label": "Evaluate"},
        {"id": "deploy", "label": "Deploy", "class": "deploy"},
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
    .compute("layout", obj({"rankdir": field("rankdir")}))
    .on("dagre-node-click", SetField("selected", event_value()))
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
    .child(element("h1").text("spaday-dagre"), controls, status, graph)
    .bind_root_class("wa-dark", "dark")
)

app = serve(
    page,
    packages=[package],
    store={"rankdir": "TB", "dark": False, "selected": ""},
)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8016)
