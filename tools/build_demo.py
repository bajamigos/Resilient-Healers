"""Builds the demo site (demo/index.html) from the real site (index.html).

The two are the same page; the demo copy only differs in one line, the SITE settings:
it's in "demo" mode (shows the demo banner) and talks to the demo backend, which has
its own Google Sheet with sample walks, sample walk leaders and sample reviews.

Run after changing index.html:  python3 tools/build_demo.py
"""
import pathlib, re

root = pathlib.Path(__file__).resolve().parent.parent
DEMO_API = (root / "tools" / "demo-api-url.txt").read_text().strip()

src = (root / "index.html").read_text()
line = re.search(r'^  const SITE = \{ mode: "real", api: "[^"]+" \};$', src, re.M)
assert line, "SITE line not found in index.html"
out = src.replace(line.group(0), '  const SITE = { mode: "demo", api: "' + DEMO_API + '" };')
out = out.replace("<title>Resilient Healers</title>", "<title>Resilient Healers (demo)</title>", 1)
(root / "demo").mkdir(exist_ok=True)
(root / "demo" / "index.html").write_text(out)
print("Wrote demo/index.html using", DEMO_API[:60] + "…")
