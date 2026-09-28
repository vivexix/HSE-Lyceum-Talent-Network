# HSE Lyceum Talent Network

An interactive portal for the informatics class applicant pool: fourteen hand-written
application forms, transcribed into a browsable profile matrix with focus areas,
confidence signals, working styles and the product each candidate wants to build.

A static site — no build step, no package manager, no CDN. Vanilla HTML, CSS and
JavaScript; the typefaces are self-hosted, so the published page makes no
third-party requests at all.

## What's in it

**Two views of one pool** — a spotlight carousel and a dense, sortable catalog.
Search, focus filters and sorting apply to both at once, and everything is also
reachable through the URL (`?q=<query>` for a search, `?c=<slug>` to open a
profile directly).

**Bilingual RU / EN** — English is the authored source (inline in `index.html` and
as literals in `script.js`), and `locales/ru.json` overrides it. A missing key
falls back to the English string rather than blanking the interface. Russian is
the default; the choice persists in `localStorage` under `hse-lang`.

**Candidate profiles** — each card opens a modal with the full transcribed form:
confidence rating, focus areas, working style, the product idea, an unusual hobby,
an unobvious fact, plus the scanned application form and a copy-link action.

**A motion layer, not a decoration budget** — a symbol-matrix canvas anchored to
the hero, a magnetic cursor, 3D tilt with specular glare, reveal-on-scroll,
count-up statistics, and a spotlight ⇄ blur wipe for the language switch and the
view swap. Every one of those honours `prefers-reduced-motion: reduce`.

## Project structure

```
index.html            markup (English strings live inline, tagged data-i18n)
script.js             data pipeline + interaction + motion, one file
styles.css            design tokens, components, keyframes, media queries
404.html              styled not-found page, served by GitHub Pages
locales/ru.json       Russian overrides for every tagged string
images/               logo + favicon (SVG) + og-cover.png (social card)
fonts/                self-hosted woff2 (Space Grotesk, Manrope, JetBrains Mono)
<lastname-firstname>/ one directory per candidate:
                      config.json · photo.jpg|png · form.jpg|png
.github/workflows/    deploy.yml — publishes the repo to GitHub Pages
_tools/               local generators (not published)
.nojekyll             tells GitHub Pages to serve the files as-is
```

## The candidate data

Each candidate directory is named `lastname-firstname` and holds a `config.json`
transcribed from that applicant's form:

```json
{
  "character": { "text_on_drawing": "…" },
  "characteristics": {
    "q1_informatics_confidence": "3.5",
    "q2_informatics_preference": "цифровые сервисы",
    "q3_learning_preference": "…",
    "q6_work_preference": "…",
    "q8_media_preference": "…"
  },
  "about": {
    "q4_ai_usage": "…",
    "q5_desired_product": "…",
    "q7_unusual_hobby": "…",
    "q9_unobvious_fact": "…"
  }
}
```

Free-text answers stay in their original language and are marked `lang="ru"`, so
Russian quotes read correctly even in the English view; the closed-set answers
(`q2`, `q6`, `q8`) are translated through `labels.*` in the locale file.

### Adding or removing a candidate

1. Add the directory with its `config.json`, `photo.*` and `form.*`
   (`.jpg` is probed before `.png`).
2. Add the slug to `STUDENT_DIRS` at the top of `script.js`.
3. Optional, for a correct Russian name: add `"name.<lastname> <firstname>"` to
   `locales/ru.json`. Without it, the transliteration rules in `script.js` are
   used, and `"name.*"` wins where they get it wrong.

## Running it locally

The data is loaded with `fetch()`, so the page has to be served over HTTP —
opening `index.html` from the filesystem will show the empty state instead.

```bash
python -m http.server 8000        # then open http://localhost:8000
# or
npx serve .
```

Any static file server will do, including the Live Server extension in VS Code.

## Publishing to GitHub Pages

The site uses only relative paths, so it works from a project subdirectory as
well as from a user page.

**Option A — automatic deploys (recommended).** `.github/workflows/deploy.yml`
publishes every push to `main`. Set **Settings → Pages → Build and deployment →
Source: GitHub Actions** once, then just push. The workflow uploads the repo
with `actions/upload-pages-artifact` and excludes `_tools/`, `.github/` and the
dotfiles; there is no build step because there is nothing to build.

**Option B — deploy from a branch.** **Settings → Pages → Build and
deployment → Source: Deploy from a branch**, branch `main`, folder
`/ (root)`. Use this if you would rather not grant the Actions workflow
permission. Note that Pages caps a published site at **1 GB**, which this repo
(~31 MB, mostly the scanned forms) sits well inside.

`.nojekyll` stops Pages from running the files through Jekyll, and the result is
served from `https://<user>.github.io/<repo>/`.

Once published, two things are worth knowing:

- `404.html` is served for unknown paths. Because Pages returns it *at the
  requested URL*, its home link is resolved by probing upward for `index.html`
  rather than by a hard-coded path — otherwise a mistyped deep link would point
  the visitor one directory too high.
- If the candidate data ever fails to load, the message adapts to the protocol.
  Served over HTTP it offers a reload; only a page opened from disk is told to
  start a local web server.

### Sharing links

Links are canonical: `?c=<slug>` opens a profile directly and `?q=<query>` runs
a search, and both are what the in-page "copy link" button produces. Because
there is one page and no routing, no `sitemap.xml` is needed. The Open Graph
tags in `index.html` use a **relative** `og:image` (`images/og-cover.png`)
because the absolute URL is not knowable from inside the repository; regenerate
that card with `python _tools/make_og.py` if the wording changes.

## Performance profiles

The site ships one codebase with two render profiles, chosen automatically by
a small inline detector in `index.html` that runs **before first paint** (so
there is no flash of the heavy version, and the page still works with
JavaScript disabled).

**Full profile** — everything above: the symbol matrix, drifting auroras,
animated grain, magnetic cursor, 3D tilt, parallax and the blur wipes.

**Lite profile** — activated by a coarse pointer, a viewport under 820px,
`prefers-reduced-motion`, `navigator.deviceMemory <= 4`,
`hardwareConcurrency <= 4`, or `navigator.connection.saveData`. It removes
only *continuous decorative work*, never content or features:

| | Full | Lite |
|---|---|---|
| Aurora | `blur(120px)`, 3 drifting loops | static gradient, no filter |
| Symbol matrix | rAF canvas, ~4200 cells/frame | not started |
| `backdrop-filter` | on glass, modal, header, toast | off, replaced with solid tints |
| Cursor / magnetic / tilt / parallax | on | off |
| Language switch | full-page blur wipe | 0.2s cross-fade |
| Smooth scroll | on | off |

The two things that actually cost frames on a phone are the large animated
`blur()` and `backdrop-filter` — both are re-rasterised whenever the page
moves, so they are the first things lite gives up.

Force either profile with a query parameter, which is the easiest way to
compare them on one device:

```
?lite=1     force the light version (try it on a desktop)
?lite=0     force the full version (try it on a phone)
```

`script.js` mirrors the same decision through `HEAVY()`, and skips starting
the canvas and pointer loops entirely rather than merely hiding them — a
hidden `<canvas>` whose rAF loop still runs would keep draining the battery.

### Gradient banding on Android

Android GPUs quantise gradients to 8 bits per channel, so the large smooth
radial fields show visible banding — the "RGB pixels instead of a gradient"
look. The existing `.grain` overlay was meant to dither it away, but it
depends on `mix-blend-mode: soft-light`, which some Android compositors skip.
A blend-free dither (`.bg-field::after`, a tiled SVG noise texture at 4.5%
opacity in normal blend mode) is applied on all profiles, since banding is a
display-capability issue rather than a performance one.

## Accessibility notes

- Keyboard: `/` focuses the search field, `Esc` closes the modal and the sort
  listbox, arrow keys drive the carousel, the sort listbox and the modal.
- The language switch is a labelled `role="group"` of `aria-pressed` buttons.
- `prefers-reduced-motion: reduce` disables the decorative layers and turns every
  transition, including the language wipe, into an instant swap.

## Credit

Built by Konstantin Samusev (kisamusev@edu.hse.ru) for the HSE Lyceum
informatics class, 2026 intake.
