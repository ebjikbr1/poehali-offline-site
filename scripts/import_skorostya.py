"""Import the read-only skorostya-2 checkout into local route data."""
import html
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / 'skorostya-2-source'
PAGES = SOURCE / 'speed-pages'
COORD = re.compile(r'(\d+)\s*км\s*(\d+)\s*пк', re.I)
RANGE = re.compile(r'(\d+)\s*км\s*(\d+)\s*пк\s*[-–—/]\s*(\d+)\s*км\s*(\d+)\s*пк', re.I)


def clean(fragment):
    return ' '.join(html.unescape(re.sub(r'<[^>]*>', ' ', fragment)).split())


def position(km, pk):
    km, pk = int(km), int(pk)
    if not 1 <= pk <= 10:
        raise ValueError((km, pk))
    return (km - 1) * 1000 + (pk - 1) * 100


def parse_group(fragment):
    kind = re.search(r'<details class="group (\w+)', fragment).group(1)
    title = clean(re.search(r'<span class="group-title">(.*?)</span>', fragment, re.S).group(1))
    boundary = RANGE.search(title)
    start = position(*boundary.group(1, 2)) if boundary else None
    end = position(*boundary.group(3, 4)) if boundary else None
    summary = re.search(r'<span class="summary-speeds">(.*?)</span>\s*<span class="count">', fragment, re.S)
    speed = re.search(r'<span class="speed">\s*(\d+)', summary.group(1)) if summary else None
    if not speed:
        raise ValueError(f'Missing base speed: {title}')
    rows = []
    for row in re.findall(r'<tr>(.*?)</tr>', fragment, re.S):
        cells = re.findall(r'<td class="(name|values|note)">(.*?)</td>', row, re.S)
        if not cells:
            continue
        values = {name: clean(value) for name, value in cells}
        speeds = [int(x) for x in re.findall(r'<b>\s*(\d+)\s*</b>', dict(cells).get('values', ''))]
        area = RANGE.search(values.get('name', ''))
        rows.append({'name': values.get('name', ''), 'speeds': speeds,
                     'note': values.get('note', ''),
                     'from': position(*area.group(1, 2)) if area else None,
                     'to': position(*area.group(3, 4)) if area else None})
    return {'kind': kind, 'name': title.split(' (')[0].removeprefix('Ст. ').removeprefix('Перегон '),
            'title': title, 'start': start, 'end': end, 'boundaryInferred': boundary is None,
            'speed': int(speed.group(1)), 'rows': rows}


def main():
    rules = json.loads((SOURCE / 'direction-rules.json').read_text(encoding='utf-8'))['sections']
    brake = json.loads((SOURCE / 'brake-tests.json').read_text(encoding='utf-8'))['records']
    routes = {}
    total_groups = total_rows = 0
    for path in sorted(PAGES.glob('*/*.json')):
        raw = json.loads(path.read_text(encoding='utf-8'))
        section, variant = path.parent.name, path.stem
        track, category = variant.split('-', 1)
        groups = [parse_group(group) for group in raw['groups']]
        total_groups += len(groups)
        total_rows += sum(len(group['rows']) for group in groups)
        route = routes.setdefault(section, {'title': section, 'tracks': {}, 'brakes': []})
        route['tracks'].setdefault(track, {})[category] = {
            'title': raw.get('title', ''), 'subtitle': raw.get('subtitle', ''),
            'direction': rules[section][track], 'groups': groups}
    # Some station summaries omit boundaries on a particular track/category.
    # Reuse boundaries from another page with the same station name in that route.
    for section, route in routes.items():
        by_track_name, by_name = {}, {}
        for track, cats in route['tracks'].items():
            for page in cats.values():
                for group in page['groups']:
                    if group['start'] is not None:
                        by_track_name.setdefault((track, group['name']), (group['start'], group['end']))
                        by_name.setdefault(group['name'], (group['start'], group['end']))
        for track, cats in route['tracks'].items():
            for page in cats.values():
                for group in page['groups']:
                    if group['start'] is None:
                        if group['name'] not in by_name:
                            raise ValueError(f'Missing boundaries in every page: {section} {group["name"]}')
                        group['start'], group['end'] = by_track_name.get((track, group['name']), by_name[group['name']])
    # Brake records are attached by their kilometer/picket position and track.
    # Some source sections span two speed pages; both get the matching subset.
    brake_sections = {
        'Тайшет — Вихоревка': {'vih-taishet'},
        'Вихоревка — Лена': {'kor-vih', 'kor-lena'},
        'Юрты — Нижнеудинск': {'nizh-yurty', 'yurty-nizh'},
        'Коршуниха-Ангарская — Усть-Илимск': {'kor-ust'},
        'Моргудон — Братск — Галачинский': {'bratsk'},
    }
    for route_id, route in routes.items():
        ranges = {}
        for track, cats in route['tracks'].items():
            groups = next(iter(cats.values()))['groups']
            ranges[int(track)] = (min(min(g['start'], g['end']) for g in groups),
                                  max(max(g['start'], g['end']) for g in groups))
        for item in brake:
            if route_id not in brake_sections.get(item['section'], set()):
                continue
            track = item.get('track')
            if track not in ranges or item.get('km') is None or item.get('picket') is None:
                continue
            at = position(item['km'], item['picket'])
            lo, hi = ranges[track]
            if lo <= at <= hi:
                route['brakes'].append({key: item.get(key) for key in ('record_id', 'section', 'segment', 'direction', 'track', 'train_kind', 'location', 'km', 'picket', 'speed_kmh', 'distance_m')})
    commit = subprocess.check_output(['git', '-C', str(SOURCE), 'rev-parse', 'HEAD'], text=True).strip()
    mapped_ids = {item['record_id'] for route in routes.values() for item in route['brakes']}
    unmapped = [item for item in brake if item['record_id'] not in mapped_ids]
    output = {'source': 'https://github.com/ebjikbr1/skorostya-2', 'commit': commit,
              'categories': {'freight': 'Грузовой', 'empty': 'Порожний', 'passenger': 'Пассажирский', '18-100': '18–100'},
              'routes': routes, 'unmappedBrakes': unmapped}
    target = ROOT / 'data' / 'skorostya-map.json'
    target.write_text(json.dumps(output, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'{len(routes)} routes, {len(list(PAGES.glob("*/*.json")))} pages, {total_groups} groups, {total_rows} rows, {sum(len(r["brakes"]) for r in routes.values())} mapped brake points, {len(unmapped)} without route coordinates -> {target}')


if __name__ == '__main__':
    main()
