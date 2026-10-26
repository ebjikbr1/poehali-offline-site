"""Convert the electronic map extracted from the installed app to web JSON."""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "source-assets" / "phone-emap"
OUT = ROOT / "data" / "phone-map.json"

def number(value: str | None, default: float = 0) -> int | float:
    value = value or ""
    try:
        n = float(value.replace(",", "."))
        return int(n) if n.is_integer() else n
    except ValueError:
        return default

profiles = []
for sector in ET.parse(SOURCE / "profile.xml").getroot().findall("sector"):
    sid = int(sector.attrib["id"])
    for pt in sector.findall("pt"):
        profiles.append({"sector": sid, "start": number(pt.findtext("start")),
                         "length": number(pt.findtext("len")), "gradient": number(pt.findtext("grad"))})

geo = []
for sector in ET.parse(SOURCE / "data.xml").getroot().findall("sector"):
    sid = int(sector.attrib["id"])
    for pt in sector.findall("wpt"):
        geo.append({"sector": sid, "km": number(pt.findtext("ord"))/1000,
                    "lat": number(pt.findtext("lat")), "lon": number(pt.findtext("lon")),
                    "begin": pt.attrib.get("beg") == "1"})

objects = []
for name in ("1", "1n", "2", "2n"):
    for sector in ET.parse(SOURCE / f"{name}.xml").getroot().findall("sector"):
        sid = int(sector.attrib["id"])
        for pt in sector.findall("wpt"):
            speed = number(pt.findtext("speed"))
            if speed > 255:
                speed = 0
            if speed % 5 == 3:
                speed -= 3
            objects.append({"track": name, "sector": sid, "type": int(number(pt.findtext("type"))),
                            "name": pt.findtext("name", ""), "coordinate": number(pt.findtext("coordinate")),
                            "length": number(pt.findtext("length")), "speed": speed})

raw_speed = (SOURCE / "speed.xml").read_text(encoding="utf-8")
raw_speed = raw_speed.split("?>", 1)[-1] if raw_speed.startswith("<?xml") else raw_speed
temp_limits = []
for pt in ET.fromstring(f"<root>{raw_speed}</root>").findall("wpt"):
    temp_limits.append({name: number(pt.findtext(name)) for name in
                        ("coordinate", "length", "speed", "sector", "start_km", "start_pk", "end_km", "end_pk", "way_number")}
                       | {"name": pt.findtext("name", ""), "starred": pt.findtext("starred") == "true"})

OUT.write_text(json.dumps({"profiles": profiles, "geo": geo, "objects": objects, "tempLimits": temp_limits},
                          ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"Profiles: {len(profiles)}; geo points: {len(geo)}; way objects: {len(objects)}; temp limits: {len(temp_limits)}")
print("Object types:", dict(Counter(pt["type"] for pt in objects)))
print("Sectors:", sorted(set(pt["sector"] for pt in geo)))
print("Coordinate range:", min(pt["km"] for pt in geo), max(pt["km"] for pt in geo))
