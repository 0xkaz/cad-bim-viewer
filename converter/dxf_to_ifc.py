"""DXF to IFC geometric conversion using ezdxf and ifcopenshell."""

import math
from pathlib import Path

import ezdxf
import ifcopenshell
import ifcopenshell.guid


# ifcopenshell >= 0.8 requires plain lists (not tuples) for AGGREGATE attributes
# such as IfcCartesianPoint.Coordinates and IfcDirection.DirectionRatios.
def _create_axis2placement3d(ifc_file, location, axis=(0.0, 0.0, 1.0), ref_direction=(1.0, 0.0, 0.0)):
    return ifc_file.create_entity(
        "IfcAxis2Placement3D",
        Location=ifc_file.create_entity("IfcCartesianPoint", Coordinates=[float(v) for v in location]),
        Axis=ifc_file.create_entity("IfcDirection", DirectionRatios=[float(v) for v in axis]),
        RefDirection=ifc_file.create_entity("IfcDirection", DirectionRatios=[float(v) for v in ref_direction]),
    )


def _polyline_from_points(ifc_file, points):
    cartesian_points = [
        ifc_file.create_entity("IfcCartesianPoint", Coordinates=[float(x), float(y), 0.0]) for x, y in points
    ]
    return ifc_file.create_entity("IfcPolyline", Points=cartesian_points)


def _convert_line(ifc_file, entity, context):
    start = entity.dxf.start
    end = entity.dxf.end
    polyline = _polyline_from_points(ifc_file, [(start.x, start.y), (end.x, end.y)])
    return ifc_file.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=context,
        RepresentationIdentifier="Curve",
        RepresentationType="Curve",
        Items=[polyline],
    )


def _convert_lwpolyline(ifc_file, entity, context):
    points = [(p[0], p[1]) for p in entity.get_points(format="xy")]
    if entity.closed and len(points) >= 3:
        polyline = _polyline_from_points(ifc_file, points)
        profile = ifc_file.create_entity(
            "IfcArbitraryClosedProfileDef",
            ProfileType="AREA",
            OuterCurve=polyline,
        )
        extrude_direction = ifc_file.create_entity("IfcDirection", DirectionRatios=[0.0, 0.0, 1.0])
        solid = ifc_file.create_entity(
            "IfcExtrudedAreaSolid",
            SweptArea=profile,
            Position=_create_axis2placement3d(ifc_file, (0.0, 0.0, 0.0)),
            ExtrudedDirection=extrude_direction,
            Depth=100.0,
        )
        return ifc_file.create_entity(
            "IfcShapeRepresentation",
            ContextOfItems=context,
            RepresentationIdentifier="Body",
            RepresentationType="SweptSolid",
            Items=[solid],
        )

    polyline = _polyline_from_points(ifc_file, points)
    return ifc_file.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=context,
        RepresentationIdentifier="Curve",
        RepresentationType="Curve",
        Items=[polyline],
    )


def _sample_arc(center, radius, start_deg, end_deg, segments=48):
    """Sample points along an arc (degrees, CCW). A full circle uses 0..360."""
    start = math.radians(start_deg)
    end = math.radians(end_deg)
    if end <= start:
        end += 2 * math.pi
    points = []
    for i in range(segments + 1):
        angle = start + (end - start) * i / segments
        points.append((center.x + radius * math.cos(angle), center.y + radius * math.sin(angle)))
    return points


# Circles and arcs are tessellated into polylines instead of parametric IFC
# curves (IfcCircle / IfcTrimmedCurve): those rely on SELECT trimming types that
# are brittle across ifcopenshell versions, and this is a geometry-only export.
def _convert_circle(ifc_file, entity, context):
    center = entity.dxf.center
    points = _sample_arc(center, entity.dxf.radius, 0.0, 360.0, segments=64)
    polyline = _polyline_from_points(ifc_file, points)
    return ifc_file.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=context,
        RepresentationIdentifier="Curve",
        RepresentationType="Curve",
        Items=[polyline],
    )


def _convert_arc(ifc_file, entity, context):
    center = entity.dxf.center
    points = _sample_arc(center, entity.dxf.radius, entity.dxf.start_angle, entity.dxf.end_angle)
    polyline = _polyline_from_points(ifc_file, points)
    return ifc_file.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=context,
        RepresentationIdentifier="Curve",
        RepresentationType="Curve",
        Items=[polyline],
    )


def _convert_entity(ifc_file, entity, context):
    dxftype = entity.dxftype()
    if dxftype == "LINE":
        return _convert_line(ifc_file, entity, context)
    if dxftype == "LWPOLYLINE":
        return _convert_lwpolyline(ifc_file, entity, context)
    if dxftype == "CIRCLE":
        return _convert_circle(ifc_file, entity, context)
    if dxftype == "ARC":
        return _convert_arc(ifc_file, entity, context)
    return None


def convert_dxf_to_ifc(input_path: Path, output_path: Path) -> None:
    """Convert a DXF file to a geometry-only IFC file."""
    doc = ezdxf.readfile(str(input_path))
    msp = doc.modelspace()

    ifc_file = ifcopenshell.file(schema="IFC4")

    project = ifc_file.create_entity(
        "IfcProject",
        GlobalId=ifcopenshell.guid.new(),
        Name="Converted DXF",
    )
    context = ifc_file.create_entity(
        "IfcGeometricRepresentationContext",
        ContextIdentifier="Model",
        ContextType="Model",
        CoordinateSpaceDimension=3,
        Precision=1e-5,
        WorldCoordinateSystem=_create_axis2placement3d(ifc_file, (0.0, 0.0, 0.0)),
    )
    project.RepresentationContexts = [context]

    site = ifc_file.create_entity("IfcSite", GlobalId=ifcopenshell.guid.new(), Name="Site")
    building = ifc_file.create_entity("IfcBuilding", GlobalId=ifcopenshell.guid.new(), Name="Building")
    storey = ifc_file.create_entity("IfcBuildingStorey", GlobalId=ifcopenshell.guid.new(), Name="Storey")

    ifc_file.create_entity(
        "IfcRelAggregates",
        GlobalId=ifcopenshell.guid.new(),
        RelatingObject=project,
        RelatedObjects=[site],
    )
    ifc_file.create_entity(
        "IfcRelAggregates",
        GlobalId=ifcopenshell.guid.new(),
        RelatingObject=site,
        RelatedObjects=[building],
    )
    ifc_file.create_entity(
        "IfcRelAggregates",
        GlobalId=ifcopenshell.guid.new(),
        RelatingObject=building,
        RelatedObjects=[storey],
    )

    products = []
    for entity in msp:
        representation = _convert_entity(ifc_file, entity, context)
        if representation is None:
            continue

        product_shape = ifc_file.create_entity(
            "IfcProductDefinitionShape",
            Representations=[representation],
        )
        product = ifc_file.create_entity(
            "IfcBuildingElementProxy",
            GlobalId=ifcopenshell.guid.new(),
            Name=entity.dxftype(),
            Representation=product_shape,
            ObjectPlacement=_create_axis2placement3d(ifc_file, (0.0, 0.0, 0.0)),
        )
        products.append(product)

    if products:
        ifc_file.create_entity(
            "IfcRelContainedInSpatialStructure",
            GlobalId=ifcopenshell.guid.new(),
            RelatingStructure=storey,
            RelatedElements=products,
        )

    ifc_file.write(str(output_path))
