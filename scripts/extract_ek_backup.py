"""Extract only the electronic-map files from this phone's Android backup."""
from __future__ import annotations

import io
import tarfile
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKUP = ROOT / "user-backup" / "trainnote-full.ab"
DEST = ROOT / "source-assets" / "phone-emap"

raw = BACKUP.read_bytes()
header = raw.split(b"\n", 4)
if len(header) != 5 or header[:4] != [b"ANDROID BACKUP", b"5", b"1", b"none"]:
    raise SystemExit("Unsupported or encrypted Android backup")

data = zlib.decompress(header[4])
with tarfile.open(fileobj=io.BytesIO(data), mode="r:") as archive:
    members = archive.getmembers()
    print(f"Archive entries: {len(members)}")
    for member in members:
        if "emap" in member.name.lower() or member.name.lower().endswith(".xml"):
            print(member.name, member.size)
    for member in members:
        parts = Path(member.name).parts
        if not member.isfile() or "app_emap" not in parts or ".." in parts:
            continue
        relative = parts[parts.index("app_emap") + 1 :]
        if not relative:
            continue
        target = DEST.joinpath(*relative)
        target.parent.mkdir(parents=True, exist_ok=True)
        source = archive.extractfile(member)
        if source is not None:
            target.write_bytes(source.read())
            print("Extracted", target.relative_to(ROOT))
