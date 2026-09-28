"""Bump the ?v= cache-busting token in index.html and 404.html.

GitHub Pages serves every file with `Cache-Control: max-age=600`, so a
deployed CSS/JS fix can look broken for up to ten minutes while the browser
keeps reusing the previous copy. The `?v=` query string on the stylesheet and
script tags sidesteps that, but only if it actually changes.

Run this as the last step before committing a change to styles.css or
script.js:

    python _tools/bump_version.py

It replaces today's date-based token with the current date. Running it twice
in one day is a no-op unless --force is passed, since a same-day re-run would
produce the identical URL and defeat the purpose.
"""
import datetime as dt
import re
import sys

FILES = ["index.html", "404.html"]
# Matches href="styles.css?v=..." and src="script.js?v=..."
PATTERN = re.compile(r'((?:href|src)="(?:styles\.css|script\.js)\?v=)([0-9A-Za-z._-]+)(")')


def main():
    force = "--force" in sys.argv
    today = dt.date.today().strftime("%Y%m%d") + "-1"

    changed = []
    for path in FILES:
        with open(path, encoding="utf-8") as fh:
            src = fh.read()

        found = PATTERN.findall(src)
        if not found:
            sys.exit(f"{path}: no ?v= token found — was the markup changed?")

        current = {token for _, token, _ in found}
        if len(current) > 1:
            sys.exit(f"{path}: mismatched ?v= tokens {sorted(current)} — "
                     f"styles.css and script.js must use the same value")

        old = current.pop()
        if old.startswith(today) and not force:
            print(f"{path}: already up to date ({old}) — use --force to re-bump")
            continue

        new_src = PATTERN.sub(lambda m: m.group(1) + today + m.group(3), src)
        with open(path, "w", encoding="utf-8", newline="") as fh:
            fh.write(new_src)
        changed.append((path, old, today))

    if not changed:
        return
    for path, old, new in changed:
        print(f"{path}: {old} -> {new}")
    print("\nCommit these alongside your CSS/JS changes.")


if __name__ == "__main__":
    main()
