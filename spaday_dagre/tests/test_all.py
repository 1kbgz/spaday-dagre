import ast
from pathlib import Path

from spaday import generate
from spaday.bootstrap import bootstrap

from spaday_dagre import Dagre, package


def test_dagre_serializes_graph_layout_and_events():
    node = Dagre(graph={"nodes": [{"id": "a"}], "edges": []}, layout={"rankdir": "LR"}).to_node()
    assert node["tag"] == "spaday-dagre"
    assert node["props"]["graph"]["Map"]["nodes"]["List"][0]["Map"]["id"] == {"Str": "a"}
    assert node["props"]["layout"]["Map"]["rankdir"] == {"Str": "LR"}
    assert "dagre-node-click" in Dagre.schema.events
    assert "dagre-edge-click" in Dagre.schema.events


def test_package_drives_bootstrap_assets():
    html = bootstrap(packages=[package])
    assert package.name == "dagre"
    assert [(schema.tag, schema.class_name) for schema in package.catalog] == [("spaday-dagre", "SpadayDagre")]
    assert 'href="/components/dagre/css/index.css"' in html
    assert 'src="/components/dagre/cdn/index.js"' in html


def test_generated_component_is_current():
    root = Path(__file__).parent.parent
    fresh = generate(str(root / "components.cem.json"))
    assert ast.dump(ast.parse(fresh)) == ast.dump(ast.parse((root / "components.py").read_text(encoding="utf-8")))
