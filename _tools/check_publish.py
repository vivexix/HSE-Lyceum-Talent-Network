"""Exercise the inline lite detector from index.html under simulated devices.

The detector runs before <body> exists, so it is pure logic over two globals
plus a class write. Re-implementing it here would test a copy rather than the
real thing, so instead the block is extracted from index.html and evaluated.
"""
import json
import re
import subprocess
import sys

html = open("index.html", encoding="utf-8").read()
m = re.search(r"<!-- =+\s*\n\s*Render-profile detection.*?</script>", html, re.S)
if not m:
    sys.exit("could not locate the inline lite detector in index.html")

block = m.group(0)
block = block[block.index("<script>") + len("<script>"):block.rindex("</script>")]

# Device profiles: (label, matchMedia result map, navigator extras, query)
PROFILES = [
    ("desktop Chrome", {}, {}, ""),
    ("iPhone Safari", {"(hover: none) and (pointer: coarse)": True,
                       "(max-width: 820px)": True}, {}, ""),
    ("iPad Pro", {"(hover: none) and (pointer: coarse)": True}, {}, ""),
    ("narrow desktop window", {"(max-width: 820px)": True}, {}, ""),
    ("reduced motion", {"(prefers-reduced-motion: reduce)": True}, {}, ""),
    ("low memory Android", {"(hover: none) and (pointer: coarse)": True},
     {"deviceMemory": 2}, ""),
    ("few cores", {}, {"hardwareConcurrency": 2}, ""),
    ("save-data", {}, {"connection": {"saveData": True}}, ""),
    ("MacBook Pro (force off)", {}, {}, "?lite=0"),
    ("phone (force on)", {}, {}, "?lite=1"),
    ("desktop, no API support", {"(max-width: 820px)": True}, {}, ""),
]

TEMPLATE = """
var __matched = __MATCHED__;
var __deviceMemory = __DEVICE_MEMORY__;
var __hardwareConcurrency = __HARDWARE_CONCURRENCY__;
var __saveData = __SAVE_DATA__;

var matchMedia = function (q) { return { matches: !!__matched[q] }; };
// The real block calls window.matchMedia, so mirror the function there too.
var window = { matchMedia: matchMedia };
// Node >= 21 defines a read-only global `navigator`, so `var navigator = ...`
// is silently ignored and the real one would win. Redefine the property
// instead, which is what a browser would let us do.
Object.defineProperty(globalThis, "navigator", {
  value: {
    deviceMemory: __deviceMemory,
    hardwareConcurrency: __hardwareConcurrency,
    connection: __saveData === null ? undefined : { saveData: __saveData }
  },
  writable: true,
  configurable: true
});
var location = { search: __QUERY__ };
var URLSearchParams = function (s) {
  return { get: function (k) { return s ? s.replace(/^\\?/, "").split("=")[1] : null; } };
};
var document = { documentElement: { classList: {
  _set: [],
  add: function (c) { this._set.push(c); }
} } };
__BLOCK__
process.stdout.write(document.documentElement.classList._set.join(","));
"""

def js_obj(value):
    """JSON is valid JS and, unlike repr(), always emits double quotes."""
    return json.dumps(value)


# `null` means "this browser does not expose the property at all", which is
# what the `typeof === "number"` guards in the block are written to survive.
UNSET = "undefined"


def run(label, matched, nav, query):
    js = TEMPLATE.replace("__MATCHED__", js_obj(matched))
    js = js.replace("__DEVICE_MEMORY__", js_obj(nav.get("deviceMemory", UNSET)))
    js = js.replace("__HARDWARE_CONCURRENCY__", js_obj(nav.get("hardwareConcurrency", UNSET)))
    conn = nav.get("connection")
    js = js.replace("__SAVE_DATA__", js_obj(conn["saveData"] if conn else None))
    js = js.replace("__QUERY__", json.dumps(query)).replace("__BLOCK__", block)
    out = subprocess.run(["node", "-e", js], capture_output=True, text=True)
    if out.returncode != 0:
        return f"ERROR {out.stderr.strip()[:160]}"
    return out.stdout or "(no class)"


print(f"{'profile':<28} {'lite?':<8} classes")
print("-" * 52)
expect_lite = {
    "desktop Chrome": False,
    "iPhone Safari": True,
    "iPad Pro": True,
    "narrow desktop window": True,
    "reduced motion": True,
    "low memory Android": True,
    "few cores": True,
    "save-data": True,
    "MacBook Pro (force off)": False,
    "phone (force on)": True,
    "desktop, no API support": True,
}
fails = []
for label, matched, nav, query in PROFILES:
    result = run(label, matched, nav, query)
    got = "lite" in result
    mark = "ok " if got == expect_lite[label] else "FAIL"
    if got != expect_lite[label]:
        fails.append(label)
    print(f"{mark} {label:<25} {str(got):<8} {result}")

print()
print("lite detector:", "all profiles pass" if not fails else f"FAILURES: {fails}")

# --- structural checks ------------------------------------------------------
h = open("index.html", encoding="utf-8").read()
css = open("styles.css", encoding="utf-8").read()
js = open("script.js", encoding="utf-8").read()


def h_src(name):
    """Read an HTML file by name (used for the cache-busting checks below)."""
    return open(name, encoding="utf-8").read()

print()
print("meta property tags:", len(re.findall(r"<meta\s+property=", h)))
print("og:image          :", re.findall(r'property="og:image" content="([^"]+)"', h))
print("load-error blocks :", re.findall(r"data-load-error-(\w+)", h))

# --- cursor paint order -----------------------------------------------------
# The cursor must be the LAST positioned overlay in <body>: on WebKit the
# backdrop-filtered modal/toast get their own compositing layers, so tree
# order decides the paint, not the z-index number alone.
i_cursor = h.find('id="cursor"')
i_modal = h.find('id="modal"')
i_toast = h.find('id="toastRegion"')
i_veil = h.find('id="langVeil"')
i_script = h.find('src="script.js')
print()
print("cursor count            :", h.count('id="cursor"'))
print("cursor after modal      :", i_cursor > i_modal)
print("cursor after toast      :", i_cursor > i_toast)
print("cursor after lang-veil  :", i_cursor > i_veil)
print("cursor before script.js :", i_cursor < i_script)

print()
print("cursor z-index    :", re.search(r"\.cursor \{[^}]*z-index:\s*(\d+)", css, re.S).group(1))
print("modal z-index     :", re.search(r"\.modal \{[^}]*z-index:\s*(\d+)", css, re.S).group(1))
print("toast z-index     :", re.search(r"\.toast \{[^}]*z-index:\s*(\d+)", css, re.S).group(1))
print("cursor isolation  :", "isolation: isolate" in css)
print("stale '300' refs  :", re.findall(r"cursor \(300\)|z-index:\s*300", css))
print("lite rule count   :", len(re.findall(r"\.lite", css)))
print("dither overlay    :", ".bg-field::after" in css)
print("braces balanced   :", css.count("{") == css.count("}"))
print("css comments ok   :", css.count("/*") == css.count("*/"))

# --- lite gating in JS ------------------------------------------------------
print()
print("HEAVY definition       :", "const HEAVY = () => REDUCED() || LITE();" in js)
print("LITE definition        :", 'classList.contains("lite")' in js)
# Each of these must be gated: a CSS-hidden canvas whose rAF loop still runs
# would keep burning battery for nothing. The guard can sit a few lines into
# the function body, so scan up to the next top-level function.
ungated = []
for fn in ("initMatrix", "initCursor", "initIdle", "initMagnetic", "initTilt",
           "initParallax", "initPressFeedback"):
    body = js.split("function " + fn, 1)[1]
    body = re.split(r"\nfunction ", body, 1)[0]
    ok = "HEAVY()" in body
    if not ok:
        ungated.append(fn)
    print(f"  {fn:<19} gated:", ok)
print("ungated init fns      :", ungated or "none")

# --- 404.html base-path resolution -----------------------------------------
# Mirrors the probe() candidate list in 404.html. GitHub Pages returns 404.html
# *at the requested URL*, so "./" is wrong for any path with a directory part.
print()
DEPLOY_ROOT = "/repo"  # project subdirectory on Pages


def candidates(pathname):
    segments = [s for s in pathname.split("/") if s]
    return ["/" + "/".join(segments[:i] + ["index.html"])
            for i in range(len(segments), -1, -1)]


def resolve(pathname, exists):
    for url in candidates(pathname):
        if exists(url):
            return url[: -len("index.html")]
    return None


CASES = [
    ("/repo/", lambda u: u == "/repo/index.html"),
    ("/repo/nope", lambda u: u == "/repo/index.html"),
    ("/repo/a/b/c", lambda u: u == "/repo/index.html"),
    ("/", lambda u: u == "/index.html"),
    ("/typo", lambda u: u == "/index.html"),
]
bad = []
for path, exists in CASES:
    base = resolve(path, exists)
    want = DEPLOY_ROOT + "/" if path.startswith(DEPLOY_ROOT) else "/"
    status = "ok " if base == want else "FAIL"
    if base != want:
        bad.append(path)
    print(f"  {status} {path:<14} -> {base!r} (want {want!r})")

print()
print("404 base resolution:", "all cases pass" if not bad else f"FAILURES: {bad}")

# --- cache busting ----------------------------------------------------------
# GitHub Pages serves every asset with max-age=600, so styles.css/script.js
# must carry a ?v= token or a deploy can look broken for ten minutes. All
# references must share one value, or the page runs a mix of old and new.
print()
tokens = {}
for f in ("index.html", "404.html"):
    toks = set(re.findall(r'(?:href|src)="(?:styles\.css|script\.js)\?v=([0-9A-Za-z._-]+)"', h_src(f)))
    tokens[f] = toks
    print(f"{f:<12} tokens:", sorted(toks) or "NONE")
allt = set().union(*tokens.values())
print("single shared token :", len(allt) == 1, sorted(allt))
print("styles versioned    :", "styles.css?v=" in h_src("index.html"))
print("script versioned    :", "script.js?v=" in h_src("index.html"))
print("404 versioned       :", "styles.css?v=" in h_src("404.html"))
# A bare, unversioned reference would still hit the cached copy.
print("no bare references  :", not re.search(r'(?:href|src)="(?:styles\.css|script\.js)"', h_src("index.html")))

