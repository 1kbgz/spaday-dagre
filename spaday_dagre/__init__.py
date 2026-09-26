import json
from pathlib import Path

from spaday import ComponentPackage, Token

from .components import SpadayDagre

__version__ = "0.2.4"

# the exact version of each JS library the package serves, written by its JS build
_VERSIONS = Path(__file__).parent / "extension" / "versions.json"

package = ComponentPackage(
    name="dagre",
    assets_dir=Path(__file__).parent / "extension",
    assets=(("css", "css/index.css"), ("js", "cdn/index.js")),
    components=(SpadayDagre,),
    provides=json.loads(_VERSIONS.read_text(encoding="utf-8")) if _VERSIONS.exists() else {},
)

Dagre = SpadayDagre

#: ``css()`` kwarg → (CSS custom property, what it controls).
#:
#: Each token defaults to the shell token it belongs to, so re-theming the shell carries the graph
#: with it in both page modes; set these to theme the graph alone::
#:
#:     Dagre(graph=g).css(spa_dagre_node_fill="#0C4253", spa_dagre_accent="#FC6B47")
#:
#: The pre-0.2.4 ``--dagre-*`` spelling still works as an alias for each of these.
TOKENS = {
    "spa_dagre_node_fill": Token("--spa-dagre-node-fill", "node background", fallback="--spa-surface-2"),
    "spa_dagre_node_stroke": Token("--spa-dagre-node-stroke", "node outline", fallback="--spa-muted"),
    "spa_dagre_node_text": Token("--spa-dagre-node-text", "node label color"),
    "spa_dagre_edge_stroke": Token("--spa-dagre-edge-stroke", "edge and arrowhead color", fallback="--spa-muted"),
    "spa_dagre_edge_label": Token("--spa-dagre-edge-label", "edge label color", fallback="--spa-muted"),
    "spa_dagre_edge_label_halo": Token("--spa-dagre-edge-label-halo", "halo drawn behind an edge label", fallback="--spa-surface"),
    "spa_dagre_cluster_fill": Token("--spa-dagre-cluster-fill", "compound cluster background", fallback="--spa-surface"),
    "spa_dagre_cluster_stroke": Token("--spa-dagre-cluster-stroke", "compound cluster outline", fallback="--spa-border"),
    "spa_dagre_cluster_text": Token("--spa-dagre-cluster-text", "cluster label color", fallback="--spa-muted"),
    "spa_dagre_accent": Token("--spa-dagre-accent", "hover / connected / emphasis color", fallback="--spa-accent"),
    "spa_dagre_control_text": Token("--spa-dagre-control-text", "zoom control glyph color", fallback="--spa-muted"),
    "spa_dagre_control_surface": Token("--spa-dagre-control-surface", "zoom control background", fallback="--spa-surface"),
    "spa_dagre_control_border": Token("--spa-dagre-control-border", "zoom control border", fallback="--spa-border"),
}

__all__ = ["TOKENS", "Dagre", "SpadayDagre", "package"]
