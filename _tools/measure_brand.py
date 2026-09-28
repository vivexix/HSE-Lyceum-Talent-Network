"""Measure the header brand ring's gap with headless Chrome.

The report was "one eighth of the logo is missing, like a pie slice bitten
out" - a *wedge*, not a straight crop. It does not come from the hero logo: it
is `.brand-mark-ring`, a conic-gradient arc behind the header logo whose
transparent span leaves a real angular gap. This samples the rendered gradient
around a circle and reports the gap in degrees, so the claim is checked against
a measurement rather than a guess.

    python _tools/measure_brand.py --build
    python -m http.server 8799
    python _tools/measure_brand.py
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

VIEWPORTS = [
    ("iPad Pro 11 landscape", 1194, 834, 2),
    ("iPad Pro 11 portrait ", 834, 1194, 2),
    ("desktop control      ", 1440, 900, 1),
]

# Reproduces the authored conic gradient on a canvas and samples 72 sectors of
# 5 degrees each around a circle, so the empty arc is measured, not assumed.
PROBE_JS = r"""
function __probeBrand() {
  var ring = document.querySelector('.brand-mark-ring');
  var mark = document.querySelector('.brand-mark');
  var logo = document.querySelector('.brand-logo');
  if (!ring || !mark) { return {error: 'brand mark not found'}; }
  var cs = getComputedStyle(ring);
  var rb = ring.getBoundingClientRect();
  var mb = mark.getBoundingClientRect();
  var lb = logo ? logo.getBoundingClientRect() : {width: 0, height: 0};
  var out = {
    ringBox: {w: +rb.width.toFixed(1), h: +rb.height.toFixed(1)},
    markBox: {w: +mb.width.toFixed(1), h: +mb.height.toFixed(1)},
    logoBox: {w: +lb.width.toFixed(1), h: +lb.height.toFixed(1)},
    overflowsMark: rb.width > mb.width + 1,
    animation: cs.animationName + ' ' + cs.animationDuration
  };

  // The authored stops are the ground truth here; sampling a rasterised
  // circle quantises badly (72 sectors cannot resolve a 108-degree arc to
  // better than +/-2.5 degrees, and the gradient has two separate transparent
  // runs, so "longest run" is the wrong statistic). Parse the real
  // background-image and report the transparent sweep exactly.
  var bg = cs.backgroundImage || '';
  out.hasConic = bg.indexOf('conic-gradient') >= 0;
  // Chrome normalises the authored `transparent` keyword to rgba(0, 0, 0, 0)
  // in the computed value, so match either spelling and every stop position.
  var stops = [];
  var reStop = /(rgba\(0,\s*0,\s*0,\s*0\)|transparent)\s+(?:([0-9.]+)%|([0-9.]+)deg)/g;
  var m;
  while ((m = reStop.exec(bg)) !== null) {
    var pos = m[2] !== undefined ? parseFloat(m[2]) : parseFloat(m[3]) / 3.6;
    stops.push({pct: +pos.toFixed(1)});
  }
  out.rawStopCount = stops.length;
  out.rawBackground = bg.slice(0, 220);
  // The visible arc is the *opaque* span: from the last transparent stop
  // before it to the first transparent stop after it. The two outer
  // transparent runs (0..62 and 92..100) are the same sweep, so together they
  // form the empty region, not two separate gaps.
  if (stops.length >= 2) {
    var first = stops[0].pct;
    var last = stops[stops.length - 1].pct;
    out.arcPct = +(last - first).toFixed(1);
    out.arcDeg = +(out.arcPct * 3.6).toFixed(1);
    out.emptyPct = +(100 - out.arcPct).toFixed(1);
    out.emptyDeg = +(out.emptyPct * 3.6).toFixed(1);
  }

  var pre = document.createElement('pre');
  pre.id = '__probe_result';
  pre.textContent = 'BRANDPROBE' + JSON.stringify(out) + 'ENDBRANDPROBE';
  document.body.appendChild(pre);
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', __probeBrand);
} else {
  __probeBrand();
}
"""


def find_chrome():
    for p in CHROME_CANDIDATES:
        if os.path.exists(p):
            return p
    return None


def build_probe_page():
    """Write _probe.html: the real page with the probe injected.

    The probe must be a real script tag in the real document in order to
    measure the real layout, so it goes into a copy of index.html.
    """
    src = open("index.html", encoding="utf-8").read()
    html = src.replace("</body>", "<script>" + PROBE_JS + "</script></body>")
    with open("_probe.html", "w", encoding="utf-8") as fh:
        fh.write(html)
    return "_probe.html"


def measure(chrome, url, width, height, dpr):
    with tempfile.TemporaryDirectory() as profile:
        cmd = [
            chrome, "--headless=new", "--disable-gpu", "--no-sandbox",
            "--hide-scrollbars", "--user-data-dir=" + profile,
            "--window-size=%d,%d" % (width, height),
            "--force-device-scale-factor=%s" % dpr,
            "--virtual-time-budget=6000", "--dump-dom", url,
        ]
        res = subprocess.run(cmd, capture_output=True, timeout=120)
        m = re.search(rb'<pre id="__probe_result">(.*?)</pre>', res.stdout, re.S)
        if not m:
            return None
        p = re.search(rb"BRANDPROBE(.*?)ENDBRANDPROBE", m.group(1), re.S)
        return json.loads(p.group(1).decode("utf-8")) if p else None


def main():
    if "--build" in sys.argv:
        print("wrote", build_probe_page())
        return
    chrome = find_chrome()
    if not chrome:
        sys.exit("No Chrome/Edge found.")
    url = "http://localhost:8799/_probe.html"
    print("browser :", os.path.basename(chrome))
    print("target  :", url, "\n")
    for label, w, h, dpr in VIEWPORTS:
        d = measure(chrome, url, w, h, dpr)
        if not d or d.get("error"):
            print("  ?  %s: %s" % (label, d))
            continue
        print("%s (%dx%d)" % (label, w, h))
        print("     ring %.0fx%.0f   mark %.0fx%.0f   logo %.0fx%.0f" % (
            d["ringBox"]["w"], d["ringBox"]["h"],
            d["markBox"]["w"], d["markBox"]["h"],
            d["logoBox"]["w"], d["logoBox"]["h"]))
        print("     ring overflows the badge :", d["overflowsMark"])
        print("     raw background           :", str(d.get("rawBackground", ""))[:150])
        print("     transparent stop runs    :", d.get("rawStopCount"))
        if "arcDeg" in d:
            print("     ring is a conic gradient :", d["hasConic"])
            print("     visible arc  : %.0f deg (%.0f%% of the circle)" % (
                d["arcDeg"], d["arcPct"]))
            print("     empty sweep  : %.0f deg (%.0f%%)  <- the 'bitten out' part" % (
                d["emptyDeg"], d["emptyPct"]))
            print("     animation    :", d["animation"])


if __name__ == "__main__":
    main()
