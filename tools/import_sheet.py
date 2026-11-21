"""Build js/items.js from the practice spreadsheet (items + links only, no history).

Usage:  python tools/import_sheet.py "path/to/Guitar - songs _ practice.xlsx"
"""
import json
import re
import sys
import urllib.parse
from pathlib import Path

import openpyxl

OUT = Path(__file__).resolve().parent.parent / "js" / "items.js"

items = []
ids = set()


def clean_url(u):
    if not u:
        return None
    if "google.com/url?" in u:
        q = urllib.parse.parse_qs(urllib.parse.urlparse(u).query).get("q")
        if q:
            u = urllib.parse.unquote(q[0])
    return u.strip()


def slug(s):
    s = re.sub(r"[^\w]+", "-", s.lower(), flags=re.UNICODE).strip("-")
    return s[:40] or "item"


def norm(s):
    return re.sub(r"[^\w]+", "", (s or "").split(" / ")[0].lower(), flags=re.UNICODE)


def add(topic, section, name, links=None, **extra):
    name = re.sub(r"\s+", " ", str(name)).strip()
    base = f"{topic}-{slug(name)}"
    i, n = base, 2
    while i in ids:
        i, n = f"{base}-{n}", n + 1
    ids.add(i)
    it = {"id": i, "topic": topic, "section": section, "name": name, "links": links or []}
    it.update({k: v for k, v in extra.items() if v not in (None, "", [])})
    items.append(it)
    return it


def row_links(row, skip_first=True):
    """Hyperlinked cells (and bare URLs) in a row, as {label, url}."""
    out = []
    for c in row[1 if skip_first else 0:]:
        url = c.hyperlink.target if c.hyperlink else None
        val = c.value
        if not url and isinstance(val, str) and val.startswith("http"):
            url = val
        if url:
            label = val if isinstance(val, str) and not val.startswith("http") else None
            out.append({"label": (label or "Link").strip(), "url": clean_url(url)})
    return out


def find_song(name):
    n = norm(name)
    for it in items:
        if it["topic"] != "songs":
            continue
        m = norm(it["name"])
        if n == m or (len(n) >= 6 and len(m) >= 6 and (n in m or m in n)):
            return it
    return None


def main(path):
    wb = openpyxl.load_workbook(path)

    # ---- Songs -------------------------------------------------------------
    ws = wb["Songs"]
    for r in range(4, ws.max_row + 1):
        name = ws.cell(r, 2).value
        if not isinstance(name, str) or not name.strip():
            continue
        row = [ws.cell(r, c) for c in range(2, 27)]
        add("songs", "Repertoire", name, row_links(row))

    # ---- SongsPractice (active songs with BPM) -----------------------------
    ws = wb["SongsPractice"]
    last = None
    for r in range(3, ws.max_row + 1):
        name = ws.cell(r, 2).value
        row = [ws.cell(r, c) for c in range(2, 6)]
        links = row_links(row)
        bpm = ws.cell(r, 5).value
        if not isinstance(name, str) or not name.strip():
            if last and links:  # continuation row: extra link for the item above
                label = ws.cell(r - 1, 4).value
                for l in links:
                    if isinstance(label, str) and l["label"] == "Link":
                        l["label"] = label.strip().capitalize()
                last["links"] += links
            continue
        note = None
        c3 = ws.cell(r, 3).value
        if isinstance(c3, str) and not ws.cell(r, 3).hyperlink and not c3.startswith("http") and c3 not in ("Link", "Song"):
            note = f"Strum pattern: {c3}"
        has_data = links or isinstance(bpm, (int, float))
        existing = None if has_data else find_song(name)
        if existing:
            existing["active"] = True
            last = existing
            continue
        last = add("songs", "Active", name, links,
                   bpm=int(bpm) if isinstance(bpm, (int, float)) else None,
                   note=note, active=True)

    # ---- Setlist (tag matching songs) --------------------------------------
    ws = wb["Setlist"]
    for r in range(1, ws.max_row + 1):
        name = ws.cell(r, 1).value
        if isinstance(name, str) and (s := find_song(name)):
            s["setlist"] = True

    # ---- Technique tab: section headers decide the topic -------------------
    sections = [  # (header prefix, topic, section, extra)
        ("Left hand", "technique", "Left hand", {}),
        ("Progressions", "chords", "Progressions", {}),
        ("Triads: (4 frets", "fretboard", "Triads · 4-fret window", {"kind": "triad", "method": "window"}),
        ("Triads (same 3 strings", "fretboard", "Triads · string sets", {"kind": "triad", "method": "strings"}),
        ("Witchery", "technique", "Rumba strum", {}),
        ("Barre chords", "technique", "Barre chords", {}),
        ("Improvisation", "improv", "Backing tracks", {}),
        ("Scales", "technique", "Scales", {"kind": "scale"}),
        ("Bass walk", "chords", "Bass walks", {}),
        ("Pentatonic", "fretboard", "Pentatonic", {"kind": "scale"}),
        ("7th triads", "fretboard", "7th triads", {}),
    ]
    ws = wb["Technique"]
    cur = ("technique", "Warm-up", {})
    for r in range(1, ws.max_row + 1):
        a = ws.cell(r, 1)
        name = a.value
        if r == 64:
            cur = ("technique", "Right hand & misc", {})
        if not isinstance(name, str) or not name.strip():
            continue
        hdr = next((s for s in sections if name.startswith(s[0])), None)
        if hdr:
            cur = hdr[1:]
            continue
        links = []
        if a.hyperlink:
            url = clean_url(a.hyperlink.target)
            if name.startswith("http"):
                name = urllib.parse.urlparse(url).netloc
                links.append({"label": name, "url": url})
            else:
                links.append({"label": "Video", "url": url})
        topic, section, extra = cur
        add(topic, section, name, links, **extra)

    # ---- Singing / ear training -------------------------------------------
    ws = wb["SingingEar training"]
    section = "Singing"
    for r in range(1, ws.max_row + 1):
        name = ws.cell(r, 1).value
        if not isinstance(name, str) or not name.strip():
            continue
        if name.endswith(":"):
            section = name[:-1].strip().capitalize()
            continue
        if r >= 8:
            section = "Ear & voice exercises"
        add("ear", section, name, row_links([ws.cell(r, c) for c in range(1, 6)]))

    # ---- Theory ------------------------------------------------------------
    ws = wb["Theory"]
    last_a = None
    for r in range(1, ws.max_row + 1):
        a, b = ws.cell(r, 1), ws.cell(r, 2)
        links = []
        for c in (a, b):
            if c.hyperlink:
                lab = c.value if c is b else "Video"
                links.append({"label": (lab or "Link").replace(" (YouTube)", "").strip(), "url": clean_url(c.hyperlink.target)})
        if isinstance(a.value, str):
            last_a = a.value.strip()
            name = last_a
            if isinstance(b.value, str) and not b.hyperlink:
                name = f"{last_a} · {b.value}"
            add("fretboard", "Theory & intervals", name, links)
        elif isinstance(b.value, str) and last_a:
            add("fretboard", "Theory & intervals", f"{last_a} · {b.value}", links)

    # Triad items whose name isn't a chord list
    for it in items:
        if it.get("kind") != "triad":
            continue
        if it["name"].startswith("Senbonzakura"):
            it["chords"] = "Am F G C F Em F G Am"
        elif it["name"] == "Random in app":
            it["name"] = "Random progression"
            it["random"] = True

    js = "// Generated by tools/import_sheet.py — items and links only (no history).\n"
    js += "export const SEED_ITEMS = " + json.dumps(items, ensure_ascii=False, indent=1) + ";\n"
    OUT.write_text(js, encoding="utf-8")
    by = {}
    for it in items:
        by.setdefault(f'{it["topic"]} / {it["section"]}', 0)
        by[f'{it["topic"]} / {it["section"]}'] += 1
    for k, v in by.items():
        print(f"{v:3}  {k}")
    print(len(items), "items ->", OUT)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main(sys.argv[1])
