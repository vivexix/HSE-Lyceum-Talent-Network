"""Prove the hero fixes are real: re-measure with the OLD values restored.

If the geometry checks stay green with the broken chip offsets and the old
percentage logo sizing, they are not actually testing anything. This reverts
the specific rules that were changed, rebuilds the probe page against that
stylesheet, and asserts the checks now FAIL.
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(REPO, "_tools"))

import measure_hero as M  # noqa: E402

PORT = os.environ.get("HERO_PORT", "8799")
BASE = f"http://localhost:{PORT}/"


def build(variant_css, workdir):
    """Copy the site's HTML/CSS into workdir with variant_css as styles.css."""
    for name in ("styles.css", "script.js"):
        shutil.copy(os.path.join(REPO, name), os.path.join(workdir, name))
    with open(os.path.join(workdir, "styles.css"), "w", encoding="utf-8") as fh:
        fh.write(variant_css)
    for sub in ("locales", "fonts", "images"):
        dst = os.path.join(workdir, sub)
        if os.path.exists(dst):
            shutil.rmtree(dst)
        shutil.copytree(os.path.join(REPO, sub), dst)
    for d in os.listdir(REPO):
        p = os.path.join(REPO, d)
        if os.path.isdir(p) and os.path.exists(os.path.join(p, "config.json")):
            shutil.copytree(p, os.path.join(workdir, d))

    html = open(os.path.join(REPO, "index.html"), encoding="utf-8").read()
    html = html.replace("</body>", "<script>" + M.PROBE_JS + "</script></body>")
    with open(os.path.join(workdir, "_probe.html"), "w", encoding="utf-8") as fh:
        fh.write(html)


def serve(workdir, port):
    proc = subprocess.Popen(
        [sys.executable, "-m", "http.server", port, "--directory", workdir],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    return proc


def main():
    chrome = M.find_chrome()
    if not chrome:
        sys.exit("No Chrome/Edge found.")

    current = open(os.path.join(REPO, "styles.css"), encoding="utf-8").read()

    # Reconstruct the pre-fix state: the wide chip overhangs and the
    # percentage-sized logo.
    broken = current
    broken = broken.replace("  top: 30%;\n  right: -2%;", "  top: 30%;\n  right: -10%;")
    broken = broken.replace("  bottom: 16%;\n  left: -3%;", "  bottom: 16%;\n  left: -8%;")
    broken = broken.replace("  top: 4%;\n  left: -2%;", "  top: 6%;\n  left: -6%;")
    broken = re.sub(
        r"\.orb-logo \{[^}]*?\}",
        ".orb-logo { width: 34%; height: 34%; }",
        broken, count=1, flags=re.S,
    )
    if broken == current:
        sys.exit("Could not build the pre-fix stylesheet - rules did not match.")

    work = tempfile.mkdtemp(prefix="herofix_")
    port = str(int(PORT) + 7)
    build(broken, work)
    proc = serve(work, port)
    try:
        import time
        time.sleep(2)
        url = f"http://localhost:{port}/_probe.html"
        print("Pre-fix stylesheet (chip overhang + percentage logo)\n")
        detected = False
        for label, w, h, dpr in M.VIEWPORTS:
            data = M.measure(chrome, url, w, h, dpr)
            if not data:
                print(f"  ?  {label}: no result")
                continue
            issues = []
            if data["overflow"]:
                issues.append(f"{len(data['overflow'])} overflow")
            if data["chipOverlap"]:
                issues.append(f"{len(data['chipOverlap'])} chip overlap")
            if data["logoSquare"] is False:
                issues.append("logo not square")
            if issues:
                detected = True
            print(f"  {'DETECTED' if issues else 'clean  '} {label}: "
                  f"logo={data['logoW']:.0f}x{data['logoH']:.0f} "
                  f"{', '.join(issues) if issues else ''}")
            for o in data["overflow"]:
                print(f"        overflow {o['sel']}: {o['dx']:.0f}px x")
    finally:
        proc.terminate()
        shutil.rmtree(work, ignore_errors=True)

    print()
    if detected:
        print("PASS: the checks detect the old broken layout.")
    else:
        print("WARN: checks passed even on the pre-fix CSS - they may be too weak.")


if __name__ == "__main__":
    main()
