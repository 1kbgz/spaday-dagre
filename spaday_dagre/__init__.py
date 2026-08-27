from pathlib import Path

from spaday import ComponentPackage

from .components import SpadayDagre

__version__ = "0.2.1"

package = ComponentPackage(
    name="dagre",
    assets_dir=Path(__file__).parent / "extension",
    assets=(("css", "css/index.css"), ("js", "cdn/index.js")),
    components=(SpadayDagre,),
)

Dagre = SpadayDagre

__all__ = ["Dagre", "SpadayDagre", "package"]
