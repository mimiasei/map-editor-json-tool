#!/usr/bin/env python3
"""Crawl oldenera.th.gl's unit database and dump each unit's sid + Value stat.

Usage:
    python3 scripts/fetch_unit_values.py [-o units_values.json]

The listing page (BASE_URL) links to one detail page per unit at
/db/units/<sid> — the URL slug itself is the unit's real sid (e.g. the
"Mother Superior" page lives at /db/units/inquisitor_upg), so no separate
name-to-sid mapping is needed.

On each detail page, the numeric "Value" stat sits in a sibling div, not a
child, of the div containing the "Value" label link:
    <div class="...">
      <div class="text-xs uppercase tracking-wider text-muted-foreground">
        <a href="/db/mechanics#unit-stats">Value</a>
      </div>
      <div class="text-lg font-semibold text-yellow-400 mt-0.5">1806</div>
    </div>
"""

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request

from html.parser import HTMLParser

BASE_URL = "https://oldenera.th.gl/db/units"
USER_AGENT = "Mozilla/5.0 (compatible; unit-value-crawler/1.0)"
REQUEST_DELAY_SECONDS = 0.3

# The listing page's faction section headers (e.g. "Dungeon", "Demon") link to
# /db/units/<faction>, matching the same href pattern as real unit detail
# pages but pointing at a faction overview page with no Value stat — exclude
# them by their bare faction-name slug.
FACTION_SLUGS = {"human", "undead", "dungeon", "nature", "demon", "unfrozen", "neutral"}


def fetch(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


def find_unit_sids(listing_html: str) -> list[str]:
    sids = re.findall(r'href="/db/units/([a-z0-9_]+)"', listing_html)
    # dict.fromkeys dedupes while preserving first-seen order.
    return [sid for sid in dict.fromkeys(sids) if sid not in FACTION_SLUGS]


def extract_name(detail_html: str) -> str | None:
    match = re.search(r'<h1[^>]*>([^<]+)</h1>', detail_html)
    return match.group(1).strip() if match else None


class _DivTree(HTMLParser):
    """Builds a minimal parent/children tree of <div>/<a> tags so the
    "Value" label can be matched to its sibling div by real DOM structure
    instead of a fragile regex over raw HTML."""

    def __init__(self):
        super().__init__()
        self.root = {"tag": "root", "children": [], "parent": None, "text": ""}
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        if tag not in ("div", "a"):
            return
        node = {"tag": tag, "children": [], "parent": self.stack[-1], "text": ""}
        self.stack[-1]["children"].append(node)
        self.stack.append(node)

    def handle_endtag(self, tag):
        if tag not in ("div", "a"):
            return
        if len(self.stack) > 1:
            self.stack.pop()

    def handle_data(self, data):
        if len(self.stack) > 1:
            self.stack[-1]["text"] += data


def extract_value(detail_html: str) -> int | None:
    parser = _DivTree()
    parser.feed(detail_html)

    def walk(node):
        for child in node["children"]:
            yield child
            yield from walk(child)

    for node in walk(parser.root):
        if node["tag"] == "a" and node["text"].strip() == "Value":
            label_div = node["parent"]
            if label_div is None or label_div["parent"] is None:
                continue
            siblings = label_div["parent"]["children"]
            index = siblings.index(label_div)
            for sibling in siblings[index + 1:]:
                if sibling["tag"] == "div":
                    digits = re.sub(r"[^\d]", "", sibling["text"])
                    if digits:
                        return int(digits)
                    break
    return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("-o", "--output", default="units_values.json", help="Output JSON file path")
    args = parser.parse_args()

    print(f"Fetching listing page: {BASE_URL}", file=sys.stderr)
    listing_html = fetch(BASE_URL)
    sids = find_unit_sids(listing_html)
    print(f"Found {len(sids)} unit sids", file=sys.stderr)

    results = []
    for i, sid in enumerate(sids, start=1):
        url = f"{BASE_URL}/{sid}"
        print(f"[{i}/{len(sids)}] {sid}", file=sys.stderr)
        try:
            detail_html = fetch(url)
        except urllib.error.URLError as e:
            print(f"  failed to fetch {url}: {e}", file=sys.stderr)
            continue

        name = extract_name(detail_html)
        value = extract_value(detail_html)
        if value is None:
            print(f"  warning: no Value found for {sid}", file=sys.stderr)

        results.append({"sid": sid, "name": name, "value": value})
        time.sleep(REQUEST_DELAY_SECONDS)

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(f"Wrote {len(results)} entries to {args.output}", file=sys.stderr)


if __name__ == "__main__":
    main()
