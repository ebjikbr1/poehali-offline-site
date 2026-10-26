"""Export the user's own TrainNote database to private local JSON files."""
from __future__ import annotations

import base64
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "user-backup" / "current.db"
OUT = ROOT / "user-backup"
# The original database stores local wall-clock fields as epoch-like values.
# UTC decoding reproduces the times shown by the installed 0.6.9 UI.
TZ = timezone.utc


def value(item):
    if isinstance(item, bytes):
        return {"base64": base64.b64encode(item).decode("ascii")}
    return item


def iso(timestamp: object) -> str:
    if not timestamp:
        return ""
    number = float(timestamp)
    if number > 10**11:
        number /= 1000
    return datetime.fromtimestamp(number, TZ).strftime("%Y-%m-%dT%H:%M")


def main() -> None:
    connection = sqlite3.connect(SOURCE)
    connection.row_factory = sqlite3.Row
    tables = [row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
    raw = {table: [{key: value(row[key]) for key in row.keys()} for row in connection.execute(f'SELECT * FROM "{table}"')] for table in tables}
    (OUT / "current.json").write_text(json.dumps(raw, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    trains_by_day = {}
    for train in raw.get("train_list", []):
        trains_by_day.setdefault(train.get("common_id"), []).append({
            "id": f"original-train-{train['_id']}",
            "number": train.get("number") or "", "loco": train.get("seria_lok") or "",
            "from": train.get("st_start") or "", "to": train.get("st_end") or "",
            "depart": iso(train.get("departure")), "arrive": iso(train.get("arrival")),
            "distance": train.get("haul_length") or 0, "weight": train.get("weight") or 0,
            "axles": train.get("os") or 0, "fuelFact": train.get("fuel_fact") or 0,
            "fuelNorm": train.get("fuel_norm") or 0,
        })
    days = []
    for day in raw.get("common_table", []):
        sign_on = iso(day.get("yavka_time_stamp"))
        sign_off = iso(day.get("sdacha_time_stamp"))
        date = iso(day.get("day_separator_time_stamp"))[:10] or sign_on[:10]
        if not date:
            continue
        days.append({
            "id": f"original-day-{day['_id']}", "date": date,
            "signOn": sign_on, "signOff": sign_off, "norm": 0,
            "trains": trains_by_day.get(day["_id"], []),
        })
    seed = {"format": "trainnote-html-v1", "data": {"days": days}}
    (OUT / "seed.json").write_text(json.dumps(seed, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Exported {len(tables)} tables, {len(days)} workdays and {sum(map(len,trains_by_day.values()))} trains")


if __name__ == "__main__":
    main()
