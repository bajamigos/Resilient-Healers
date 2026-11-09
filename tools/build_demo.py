"""Builds the demo site (demo/index.html) from the real site (index.html).

The two are the same page; the demo copy only differs in one line, the SITE settings:
it's in "demo" mode, so it shows the demo banner and tells the backend site: "demo" on
every request. The backend then uses the demo's own Google Sheet (sample walks, sample
walk leaders, sample reviews), so demo data never touches the real Sheet.

Run after changing index.html:  python3 tools/build_demo.py
"""
import pathlib, re

root = pathlib.Path(__file__).resolve().parent.parent

src = (root / "index.html").read_text()
line = re.search(r'^  const SITE = \{ mode: "real", api: "[^"]+" \};$', src, re.M)
assert line, "SITE line not found in index.html"
out = src.replace(line.group(0), line.group(0).replace('mode: "real"', 'mode: "demo"'))
out = out.replace("<title>Resilient Healers</title>", "<title>Resilient Healers (demo)</title>", 1)
# Link preview for the demo: its own title and address (same picture).
out = out.replace('<meta property="og:title" content="Resilient Healers">', '<meta property="og:title" content="Resilient Healers (demo)">', 1)
out = out.replace('<meta property="og:url" content="https://resilienthealers.github.io/">', '<meta property="og:url" content="https://resilienthealers.github.io/demo/">', 1)
(root / "demo").mkdir(exist_ok=True)
(root / "demo" / "index.html").write_text(out)
print("Wrote demo/index.html")
