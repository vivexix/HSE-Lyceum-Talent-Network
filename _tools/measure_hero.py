"""Measure the hero stage at real iPad/desktop viewports using headless Chrome.

The overlapping-chips and clipped-logo reports cannot be confirmed by reading
CSS alone: percentage sizing against a rounded parent and `white-space: nowrap`
chips depend on real layout, and the whole point is that WebKit lays them out
differently. This prints measured boxes so the fix is checked against numbers.

    python _tools/measure_hero.py

Requires a local server (the data is fetched, not inlined):
    python -m http.server 8799
"""
import json
import os
import re
import subprocess
import sys
import tempfile

CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
]

# label, width, height, dpr
VIEWPORTS = [
    ("iPad Pro 11 portrait ", 834, 1194, 2),
    ("iPad Pro 11 landscape", 1194, 834, 2),
    ("iPad mini portrait   ", 744, 1133, 2),
    ("desktop control      ", 1440, 900, 1),
]

# Injected into the page; the result is written into the DOM so it survives
# --dump-dom, which cannot evaluate a function on our behalf.
PROBE_JS = r"""
function __probeHero() {
  const box = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {x: r.x, y: r.y, w: r.width, h: r.height};
  };
  const SEL = ['.stage-rings', '.orb', '.orb-logo',
               '.orb-chip--a', '.orb-chip--b', '.orb-chip--c', '.orb-chip--d'];
  const parts = {};
  SEL.forEach(function (s) { parts[s] = box(s); });
  const sr = box('.hero-stage');

  const overflow = [];
  if (sr) {
    SEL.forEach(function (s) {
      const b = parts[s];
      if (!b) return;
      const dx = Math.max(0, sr.x - b.x, (b.x + b.w) - (sr.x + sr.w));
      const dy = Math.max(0, sr.y - b.y, (b.y + b.h) - (sr.y + sr.h));
      if (dx > 0.5 || dy > 0.5) overflow.push({sel: s, dx: dx, dy: dy});
    });
  }

  const chips = ['.orb-chip--a', '.orb-chip--b', '.orb-chip--c', '.orb-chip--d']
    .map(function (s) { return {s: s, b: parts[s]}; }).filter(function (c) { return c.b; });
  const chipOverlap = [];
  for (let i = 0; i < chips.length; i++) {
    for (let j = i + 1; j < chips.length; j++) {
      const a = chips[i].b, c = chips[j].b;
      const ox = Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x);
      const oy = Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y);
      if (ox > 0.5 && oy > 0.5) {
        chipOverlap.push({a: chips[i].s, b: chips[j].s, ox: ox, oy: oy});
      }
    }
  }

  const logo = parts['.orb-logo'];
  const out = {
    lite: document.documentElement.classList.contains('lite'),
    stage: sr ? {w: sr.w, h: sr.h} : null,
    logoW: logo ? logo.w : null,
    logoH: logo ? logo.h : null,
    logoSquare: logo ? Math.abs(logo.w - logo.h) < 1.5 : null,
    chipCount: chips.length,
    overflow: overflow,
    chipOverlap: chipOverlap,
    docWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    hScroll: document.documentElement.scrollWidth > window.innerWidth + 1
  };
  const pre = document.createElement('pre');
  pre.id = '__probe_result';
  pre.textContent = 'HEROPROBE' + JSON.stringify(out) + 'ENDHEROPROBE';
  document.body.appendChild(pre);
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', __probeHero);
} else {
  __probeHero();
}
"""



def build_probe_page(tmpdir="."):
    """Write a copy of index.html with the probe script injected.

    --dump-dom cannot evaluate a function for us, so the probe is injected into
    a copy of the real page, which is then served alongside the real assets so
    it loads the same CSS/JS/data.
    """
    src = open("index.html", encoding="utf-8").read()
    html = src.replace("</body>", "<script>" + PROBE_JS + "</script></body>")
    path = os.path.join(tmpdir, "_probe.html")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(html)
    return path


def find_chrome():
    for p in CHROME_CANDIDATES:
        if os.path.exists(p):
            return p
    return None


def measure(chrome, url, width, height, dpr):
    with tempfile.TemporaryDirectory() as profile:
        cmd = [
            chrome,
            "--headless=new",
            "--disable-gpu",
            "--hide-scrollbars",
            "--no-sandbox",
            f"--user-data-dir={profile}",
            f"--window-size={width},{height}",
            f"--force-device-scale-factor={dpr}",
            "--virtual-time-budget=6000",
            "--dump-dom",
            url,
        ]
        # Chrome echoes the page's UTF-8 (the data is full of Cyrillic) while the
        # console locale here is cp1251, so decoding its output as text raises
        # UnicodeDecodeError. Work in bytes and decode only the probe payload.
        res = subprocess.run(cmd, capture_output=True, timeout=120)
        # The injected script's own source contains the literal marker text, so
        # the marker appears in the dump *before* the real <pre> result and a
        # naive search matches the source. Anchor on the element id instead.
        m = re.search(rb'<pre id="__probe_result">(.*?)</pre>', res.stdout, re.S)
        if not m:
            return None
        payload = re.search(rb"HEROPROBE(.*?)ENDHEROPROBE", m.group(1), re.S)
        return json.loads(payload.group(1).decode("utf-8")) if payload else None


def main():
    if "--build" in sys.argv:
        print("wrote", build_probe_page())
        return
    if "--shot" in sys.argv:
        # A picture of the hero, so the orb/orbit/logo can be eyeballed rather
        # than inferred from numbers.
        shot = os.path.abspath("_hero.png")
        chrome0 = find_chrome()
        with tempfile.TemporaryDirectory() as profile:
            cmd = [chrome0, "--headless=new", "--disable-gpu", "--no-sandbox",
                   "--hide-scrollbars", "--user-data-dir=" + profile,
                   "--window-size=1400,900", "--force-device-scale-factor=2",
                   "--virtual-time-budget=6000", "--screenshot=" + shot,
                   "http://localhost:8799/_probe.html"]
            subprocess.run(cmd, capture_output=True, timeout=120)
        print("wrote", shot, os.path.getsize(shot) // 1024, "KB")
        # Downscale so the result is readable inline rather than a 5 MB PNG.
        try:
            from PIL import Image
            im = Image.open(shot)
            im.thumbnail((1100, 1100))
            small = os.path.abspath("_hero_small.png")
            im.save(small, "PNG", optimize=True)
            print("wrote", small, os.path.getsize(small) // 1024, "KB")
        except Exception as exc:  # Pillow is optional
            print("resize skipped:", exc)
        return
    chrome = find_chrome()
    if not chrome:
        sys.exit("No Chrome/Edge binary found - cannot measure.")
    base = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("-") else "http://localhost:8799/_probe.html"

    print(f"browser : {os.path.basename(chrome)}")
    print(f"target  : {base}\n")

    failures = []
    for label, w, h, dpr in VIEWPORTS:
        data = measure(chrome, base, w, h, dpr)
        if data is None:
            print(f"FAIL {label}  ({w}x{h} @{dpr}x)  no result")
            failures.append(label)
            continue

        problems = []
        if data["overflow"]:
            problems.append(f"{len(data['overflow'])} part(s) overflow the stage")
        if data["chipOverlap"]:
            problems.append(f"{len(data['chipOverlap'])} chip overlap(s)")
        if data["logoSquare"] is False:
            problems.append("logo is not square")
        if data["hScroll"]:
            problems.append("horizontal scrollbar")
        if problems:
            failures.append(label)

        stage = data["stage"] or {}
        status = "ok  " if not problems else "FAIL"
        print(f"{status} {label} ({w}x{h} @{dpr}x)  lite={data['lite']}  "
              f"stage={stage.get('w', 0):.0f}px  "
              f"logo={data['logoW'] or 0:.0f}x{data['logoH'] or 0:.0f}  "
              f"chips={data['chipCount']}")
        for p in problems:
            print(f"       - {p}")
        for o in data["overflow"]:
            print(f"         overflow {o['sel']}: {o['dx']:.0f}px x / {o['dy']:.0f}px y")
        for o in data["chipOverlap"]:
            print(f"         overlap {o['a']} x {o['b']}: {o['ox']:.0f}x{o['oy']:.0f}px")

    print()
    if failures:
        print("FAILURES:", failures)
        sys.exit(1)
    print("all viewports clean")


if __name__ == "__main__":
    main()
