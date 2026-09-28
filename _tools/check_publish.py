"""Ad-hoc sanity checks for the publishing prep (not part of the site)."""
import re

h = open("index.html", encoding="utf-8").read()

print("meta property tags:", len(re.findall(r"<meta\s+property=", h)))
print("twitter meta tags :", len(re.findall(r'<meta\s+name="twitter:', h)))
print("og:image          :", re.findall(r'property="og:image" content="([^"]+)"', h))
print("load-error blocks :", re.findall(r"data-load-error-(\w+)", h))
print("data-reload btns  :", len(re.findall(r"data-reload", h)))

css = open("styles.css", encoding="utf-8").read()
print()
print("cursor z-index    :", re.search(r"\.cursor \{[^}]*z-index:\s*(\d+)", css, re.S).group(1))
print("modal z-index     :", re.search(r"\.modal \{[^}]*z-index:\s*(\d+)", css, re.S).group(1))
print("toast z-index     :", re.search(r"\.toast \{[^}]*z-index:\s*(\d+)", css, re.S).group(1))
print("stale '300' refs  :", re.findall(r"cursor \(300\)|z-index:\s*300", css))

# --- 404.html base-path resolution -----------------------------------------
# Mirrors the probe() candidate list in 404.html. GitHub Pages returns 404.html
# *at the requested URL*, so "./" is wrong for any path with a directory part.
print()
DEPLOY_ROOT = "/repo"  # project subdirectory on Pages


def candidates(pathname):
    segments = [s for s in pathname.split("/") if s]
    out = []
    for i in range(len(segments), -1, -1):
        out.append("/" + "/".join(segments[:i] + ["index.html"]))
    return out


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
ok = True
for path, exists in CASES:
    base = resolve(path, exists)
    want = DEPLOY_ROOT + "/" if path.startswith(DEPLOY_ROOT) else "/"
    status = "ok " if base == want else "FAIL"
    if base != want:
        ok = False
    print(f"  {status} {path:<14} -> {base!r} (want {want!r})")

print("404 base resolution:", "all cases pass" if ok else "FAILURES")
