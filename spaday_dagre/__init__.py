from pathlib import Path

from spaday import ComponentPackage

from .components import SpadayDagre

__version__ = "0.2.3"

package = ComponentPackage(
    name="dagre",
    assets_dir=Path(__file__).parent / "extension",
    assets=(("css", "css/index.css"), ("js", "cdn/index.js")),
    components=(SpadayDagre,),
)

Dagre = SpadayDagre

#: ``css()`` kwarg → (CSS custom property, what it controls), in the shape of
#: :data:`spaday.theme.SHELL_TOKENS`.
#:
#: Each token defaults to the shell token it belongs to, so re-theming the shell carries the graph
#: with it in both page modes; set these to theme the graph alone::
#:
#:     Dagre(graph=g).css(spa_dagre_node_fill="#0C4253", spa_dagre_accent="#FC6B47")
#:
#: The pre-0.2.4 ``--dagre-*`` spelling still works as an alias for each of these.
TOKENS = {
    "spa_dagre_node_fill": ("--spa-dagre-node-fill", "node background (defaults to --spa-surface-2)"),
    "spa_dagre_node_stroke": ("--spa-dagre-node-stroke", "node outline (defaults to --spa-muted)"),
    "spa_dagre_node_text": ("--spa-dagre-node-text", "node label color"),
    "spa_dagre_edge_stroke": ("--spa-dagre-edge-stroke", "edge and arrowhead color (defaults to --spa-muted)"),
    "spa_dagre_edge_label": ("--spa-dagre-edge-label", "edge label color (defaults to --spa-muted)"),
    "spa_dagre_edge_label_halo": ("--spa-dagre-edge-label-halo", "halo drawn behind an edge label (defaults to --spa-surface)"),
    "spa_dagre_cluster_fill": ("--spa-dagre-cluster-fill", "compound cluster background (defaults to --spa-surface)"),
    "spa_dagre_cluster_stroke": ("--spa-dagre-cluster-stroke", "compound cluster outline (defaults to --spa-border)"),
    "spa_dagre_cluster_text": ("--spa-dagre-cluster-text", "cluster label color (defaults to --spa-muted)"),
    "spa_dagre_accent": ("--spa-dagre-accent", "hover / connected / emphasis color (defaults to --spa-accent)"),
    "spa_dagre_control_text": ("--spa-dagre-control-text", "zoom control glyph color (defaults to --spa-muted)"),
    "spa_dagre_control_surface": ("--spa-dagre-control-surface", "zoom control background (defaults to --spa-surface)"),
    "spa_dagre_control_border": ("--spa-dagre-control-border", "zoom control border (defaults to --spa-border)"),
}

__all__ = ["TOKENS", "Dagre", "SpadayDagre", "package"]
