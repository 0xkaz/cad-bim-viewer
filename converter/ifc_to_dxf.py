"""IFC to DXF geometry export.

IfcConvert (IfcOpenShell's CLI) has no DXF serializer, so we iterate the IFC
geometry with ifcopenshell and write the triangulated faces as 3DFACE entities
into a DXF document. This is a geometry-only export (no materials/attributes).
"""

from pathlib import Path

import ezdxf
import ifcopenshell
import ifcopenshell.geom


def _layer_name(raw: str) -> str:
    """Sanitize an IFC type into a DXF-safe layer name."""
    safe = "".join(c for c in (raw or "IFC") if c.isalnum() or c in "_-")
    return (safe or "IFC")[:31]


def convert_ifc_to_dxf(input_path: Path, output_path: Path) -> None:
    """Convert an IFC file to a geometry-only DXF using ifcopenshell + ezdxf."""
    model = ifcopenshell.open(str(input_path))

    settings = ifcopenshell.geom.settings()
    settings.set(settings.USE_WORLD_COORDS, True)

    doc = ezdxf.new("R2010")
    msp = doc.modelspace()

    iterator = ifcopenshell.geom.iterator(settings, model)
    face_count = 0
    if iterator.initialize():
        while True:
            shape = iterator.get()
            geometry = shape.geometry
            verts = geometry.verts  # flat list: x0, y0, z0, x1, y1, z1, ...
            faces = geometry.faces  # flat list of vertex indices, 3 per triangle
            layer = _layer_name(getattr(shape, "type", "IFC"))
            if layer not in doc.layers:
                doc.layers.add(layer)

            for i in range(0, len(faces), 3):
                a, b, c = faces[i] * 3, faces[i + 1] * 3, faces[i + 2] * 3
                p1 = (verts[a], verts[a + 1], verts[a + 2])
                p2 = (verts[b], verts[b + 1], verts[b + 2])
                p3 = (verts[c], verts[c + 1], verts[c + 2])
                # 3DFACE takes 3 or 4 corners; repeat the last for a triangle.
                msp.add_3dface([p1, p2, p3, p3], dxfattribs={"layer": layer})
                face_count += 1

            if not iterator.next():
                break

    if face_count == 0:
        raise RuntimeError("No renderable geometry found in the IFC model")

    doc.saveas(str(output_path))
