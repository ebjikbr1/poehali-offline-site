"""Convert the two public data files bundled with TrainNote 0.6.9 to JSON."""
from __future__ import annotations

import json
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "source-assets" / "assets"
OUT = ROOT / "data"
OUT.mkdir(exist_ok=True)

profile = [
    {
        "start": int(point.findtext("start", "0")),
        "length": int(point.findtext("len", "0")),
        "gradient": float(point.findtext("grad", "0")),
    }
    for point in ET.parse(SOURCE / "profile.xml").getroot()
]
waypoints = [
    {
        "km": float(point.findtext("{*}name", "0")),
        "lat": float(point.attrib["lat"]),
        "lon": float(point.attrib["lon"]),
    }
    for point in ET.parse(SOURCE / "data.xml").getroot()
    if point.findtext("{*}name", "").replace(".", "", 1).isdigit()
]
(OUT / "profile.json").write_text(json.dumps(profile, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
(OUT / "waypoints.json").write_text(json.dumps(waypoints, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"Exported {len(profile)} gradient sections and {len(waypoints)} GPS waypoints")
