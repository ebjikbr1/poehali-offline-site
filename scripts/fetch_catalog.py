"""Snapshot public reference tables used by the installed TrainNote 0.6.9.

The original APK names an HTTP-only API. This script performs read-only GETs;
the browser application uses the resulting local JSON and makes no API calls.
"""
from __future__ import annotations

import json
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "catalog"
OUT.mkdir(parents=True, exist_ok=True)
BASE = "http://trainnote.h1n.ru/api/v1/"


def get(endpoint: str):
    request = Request(BASE + endpoint, headers={"User-Agent": "TrainNoteLocalReferenceExport/1.0"})
    with urlopen(request, timeout=20) as response:
        payload = response.read()
    value = json.loads(payload)
    if not isinstance(value, list):
        raise ValueError(f"{endpoint}: expected list")
    return value


def save(name: str, value: list) -> None:
    (OUT / f"{name}.json").write_text(
        json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    print(f"{name}: {len(value)}")


def main() -> None:
    errors = []
    global_paths = {
        "branches": "branches", "depots": "depots", "loco": "loco",
        "norm_time": "norm_time", "traffic_type": "traffic_type",
        "cur_time": "cur_time", "cur_time_alt": "cur_time_alt",
        "train_numbers": "train_numbers",
    }
    results = {}
    for name, endpoint in global_paths.items():
        try:
            results[name] = get(endpoint)
            save(name, results[name])
        except (HTTPError, URLError, TimeoutError, ValueError) as exc:
            errors.append(f"{endpoint}: {exc}")
    depots = results.get("depots", [])
    depot_ids = sorted({str(d.get("_id")) for d in depots if d.get("_id") is not None})
    by_depot = [
        "haul", "haul_pusher", "station", "station_on_haul", "loco_on_haul",
        "udr_cargo", "udr_pass", "udr_pusher", "udr_reserve", "udr_work",
    ]
    for endpoint in by_depot:
        rows = []
        for depot_id in depot_ids:
            try:
                rows.extend(get(f"{endpoint}/{depot_id}"))
            except (HTTPError, URLError, TimeoutError, ValueError) as exc:
                errors.append(f"{endpoint}/{depot_id}: {exc}")
        save(endpoint, rows)
    (OUT / "fetch-report.json").write_text(json.dumps({"depotIds": depot_ids, "errors": errors}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Depots: {len(depot_ids)}; errors: {len(errors)}")


if __name__ == "__main__":
    main()
