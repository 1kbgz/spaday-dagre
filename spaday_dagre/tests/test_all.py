import ast
from pathlib import Path

from spaday import generate
from spaday.bootstrap import bootstrap

from spaday_dagre import TOKENS, Dagre, package


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


def test_tokens_documents_exactly_what_the_stylesheet_exposes():
    """TOKENS is what a Python author discovers; the stylesheet is what renders. Drift between the
    two is how a package ends up with themeable colors nobody knows about."""
    import re

    css = re.sub(r"\s+", "", (Path(__file__).parents[2] / "js" / "src" / "css" / "index.css").read_text())
    # the public token is only ever read (so an ancestor can set it); the private one holds the chain
    read = set(re.findall(r"var\((--spa-dagre-[a-z-]+)[,)]", css))
    documented = {prop for prop, _ in TOKENS.values()}
    assert read == documented
    assert not re.findall(r"(?<![-\w])(--spa-dagre-[a-z-]+):", css), "a public token must not be defined; it would shadow an inherited one"


#: token → the --dagre-* spelling it shipped under before 0.2.4, which stays working as an alias
#: (cluster text has always been driven by --dagre-node-text)
LEGACY = {
    "node-fill": "node-fill",
    "node-stroke": "node-stroke",
    "node-text": "node-text",
    "edge-stroke": "edge-stroke",
    "edge-label": "edge-label",
    "cluster-fill": "cluster-fill",
    "cluster-stroke": "cluster-stroke",
    "cluster-text": "node-text",
    "accent": "accent",
}


def test_the_tokens_that_shipped_earlier_keep_their_legacy_spelling():
    """The pre-0.2.4 --dagre-* names stay working as aliases, in every mode block."""
    import re

    css = re.sub(r"\s+", "", (Path(__file__).parents[2] / "js" / "src" / "css" / "index.css").read_text())
    for name, legacy in LEGACY.items():
        definitions = re.findall(rf"--_spa-dagre-{name}:([^;]+);", css)
        assert definitions, f"--_spa-dagre-{name} is not defined"
        for definition in definitions:
            assert f"var(--dagre-{legacy}," in definition, f"--spa-dagre-{name} does not chain to its legacy alias"
