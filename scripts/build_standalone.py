"""Build a single-file, directly openable HTML copy of the tracker."""
from __future__ import annotations

import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

def read(name: str) -> str:
    return (ROOT / name).read_text(encoding="utf-8")

def module_body(name: str) -> str:
    return re.sub(r"^export\s+", "", read(name), flags=re.MULTILINE)

catalog_names = ["branches", "depots", "haul", "loco", "station", "station_on_haul",
                 "traffic_type", "udr_cargo", "udr_pass", "udr_reserve", "udr_work"]
data = {
    "profile": json.loads(read("data/profile.json")),
    "waypoints": json.loads(read("data/waypoints.json")),
    "map": json.loads(read("data/phone-map.json")),
    "speeds": json.loads(read("data/skorostya-map.json")),
    "catalog": {name: json.loads(read(f"data/catalog/{name}.json")) for name in catalog_names},
    "seed": json.loads(read("user-backup/seed.json")),
}
payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
payload = payload.replace("<", "\\u003c").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")

app = read("app.js")
app = app.replace("import {calculateFuelNorm} from './fuel.js';\n", "", 1)
app = app.replace("import {calculateBrakes,gradients,axlePressures} from './brakes.js';\n", "", 1)
app = app.replace("import {resolveSpeedSegments} from './speed-map.js';\n", "", 1)
app = app.replace("import {sourcePage,sourceCoordinateSpeeds} from './source-map.js';\n", "", 1)
start = app.rfind("Promise.all([")
end = app.find("]).then(([p,w,entries,seed,map,speeds])=>{", start)
if start < 0 or end < 0:
    raise SystemExit("App data loader changed; update standalone builder")
app = app[:start] + "Promise.resolve([embeddedData.profile,embeddedData.waypoints,Object.entries(embeddedData.catalog),embeddedData.seed,embeddedData.map,embeddedData.speeds])" + app[end+2:]

script = "\n".join([
    f"const embeddedData={payload};",
    "const {calculateFuelNorm}=(()=>{", module_body("fuel.js"), "return {calculateFuelNorm};})();",
    "const {calculateBrakes,gradients,axlePressures}=(()=>{", module_body("brakes.js"),
    "return {calculateBrakes,gradients,axlePressures};})();",
    module_body("speed-map.js"),
    module_body("source-map.js"),
    app,
])
html = """<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#3f4140">
<link rel="manifest" href="poehali.webmanifest">
<title>Поехали — Блокнот машиниста</title>
<style>""" + read("styles.css") + """</style></head>
<body data-start="tracker"><div id="app"></div><script>""" + script + """</script><script>
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(console.warn);
</script></body></html>"""
(ROOT / "poehali.html").write_text(html, encoding="utf-8")
print(f"Built {ROOT / 'poehali.html'} ({len(html.encode('utf-8')):,} bytes)")
