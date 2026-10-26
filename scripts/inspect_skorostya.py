import html
import json
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[2] / 'skorostya-2-source'
for rel in sys.argv[1:]:
    data = json.loads((root / rel).read_text(encoding='utf-8'))
    print(rel, len(data['groups']))
    for group in data['groups']:
        kind = re.search(r'<details class="group ([^"]+)', group)
        title = re.search(r'<span class="group-title">(.*?)</span>', group, re.S)
        summary = re.search(r'<span class="summary-speeds">(.*?)</span>\s*<span class="count">', group, re.S)
        clean = lambda text: html.unescape(re.sub(r'<[^>]+>', ' ', text or '')).strip().replace('\n', ' ')
        print(kind.group(1) if kind else '', clean(title.group(1) if title else ''), ' | ', clean(summary.group(1) if summary else ''))
