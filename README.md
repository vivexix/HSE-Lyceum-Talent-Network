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
_tools/               local generators and checks (not published)
                       make_og.py · bump_version.py · check_publish.py
                       measure_hero.py · verify_hero_fix.py
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
| Card 3D (`perspective` + `preserve-3d`) | on | flat 2D lift |
| Hero orbit spin | 3D `rotate3d` tilt + spin | 2D spin, no tilt |
| Language switch | full-page blur wipe | 0.2s cross-fade |
| Smooth scroll | on | off |

### 3D is not gated on `.lite` alone

The card tilt *script* is already inert on mobile — `initTilt()` bails on
`!FINE_POINTER` — but the *stylesheet* still asked for a 3D context on every
card, because the transform carried `perspective(1100px) rotateX() rotateY()`
even when all three custom properties were `0deg`. A permanent perspective is
not free: it forces a composited layer that WebKit rasterises with 3D
transforms, which is what made cards stutter while scrolling on a tablet.

The hero orbits are the other permanent 3D cost: they animate `rotate3d(...)`
on a loop, so a rotating 3D transform is recomposited every frame for as long
as the hero is on screen.

Both are now reduced on touch devices, keeping the motion and dropping the 3D:

- `.card` / `.slide` / `.panel` / `.stat-card` / `.modal-panel` / `.view-panel`
  keep a 2D `translateY` lift; the perspective, both rotations and
  `transform-style: preserve-3d` are dropped. Every hover affordance (border,
  glow, `::after` sheen) is a background or box-shadow change and is untouched.
- The orbits still spin, just in 2D.
- Desktop is unchanged and keeps the full treatment.

Critically this is keyed on **pointer type**, not on `.lite`. The lite
heuristic in `index.html` treats a device as lite on `(hover: none) and
(pointer: coarse)`, a viewport under 820px, reduced motion, low memory, few
cores or save-data — and an **iPad in landscape satisfies none of them**: it
is 1194px wide, reports `hover: hover`, and has plenty of memory and cores.
So it was *not* lite and kept the full 3D, which is exactly the "brilliant on
PC, laggy on a tablet" case. `@media (hover: none), (pointer: coarse)` covers
that gap.

`measure_hero.py` asserts this rather than assuming it. It emulates a coarse
pointer via `--blink-settings` (plain `--touch-events` does not change the
reported media features) and reports `3d=CLEAN` / `3d=PRESENT` per viewport;
a touch profile that still resolves to a perspective, `preserve-3d` or
`spin-tilted` fails the run. Reverting just the media query makes the
non-lite iPad-landscape case fail while the lite profiles still pass, so the
guard is not vacuous.

The two things that actually cost frames on a phone are the large animated
`blur()` and `backdrop-filter` — both are re-rasterised whenever the page
moves, so they are the first things lite gives up.

A filtering animation is expensive on **every** profile, not just lite, because
`filter` cannot be composited on the GPU the way `opacity` and `transform` can.
The scroll reveal and the `view-in` panel entrance therefore animate opacity and
transform only, on all devices. Their motion is unchanged — they still rise,
fade and scale — but a filter is no longer being repainted on every frame. This
is why lite no longer needs to cancel a reveal blur: the expensive part was
removed rather than being hidden behind a profile.

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

### Deploying without the "it didn't work" trap

GitHub Pages serves **every** file with `Cache-Control: max-age=600` and an
`ETag`. Ten minutes is long enough that a correct deploy looks broken: the
browser reloads the HTML but keeps reusing the previous `styles.css` and
`script.js` from its cache, so you are debugging a mix of old and new code.
This is not hypothetical — it is what made the custom-cursor fix appear to
fail on the live site while working perfectly on a local server.

Two defences, both in place:

1. **Versioned asset URLs.** The stylesheet and script carry a `?v=` token
   (`styles.css?v=20260928-1`). A new value is a new URL, so a cached copy
   can never be reused. **Bump it whenever you change CSS or JS:**

   ```bash
   python _tools/bump_version.py
   ```

   The token is a date, so a re-run on the same day is a no-op unless you
   pass `--force`. `check_publish.py` fails loudly if the tokens in
   `index.html` and `404.html` ever drift apart, since a mismatch means the
   page mixes a new stylesheet with an old script.

2. **Verify what is actually live, not what your cache holds.** To check the
   deployed files rather than your local copy:

   ```
   https://<user>.github.io/<repo>/styles.css?nocache=1
   ```

   If a fix "does not work" on the live site but does locally, fetch that URL
   first. If the content is current, it is caching; if it is old, the deploy
   has not happened yet.

To bypass the cache while testing by hand, use a hard reload
(`Ctrl`/`Cmd` + `Shift` + `R`) or open the site in a private window.

### 404 page

`404.html` is uploaded with the site, but GitHub only serves it for unknown
paths when the deployment is a **Pages artifact build** (the Actions
workflow). Under the older "deploy from a branch" source, Pages ignores
`404.html` and shows its own plain 404. The workflow is the reason to prefer
Option A above.

### Tablet and iOS notes

The hero stage is a square cluster of layers — three spinning rings, a glass
orb, two tilted orbits, the logo and four floating chips. It renders correctly
on desktop but had three separate problems on iPad. One was a **WebKit-only
compositing bug**; the other two were geometry that was always suspect but only
became visible at tablet widths.

- **Layer order is now explicit** rather than implied by source order:
  `1` rings · `2` orb · `3` orbits · `4` logo · `5` chips.
- **The logo is an explicit square** (`aspect-ratio: 1/1`, `height: auto`,
  `object-fit: contain`). It was `width: 34%; height: 34%`, which measured
  89×84 on iPad landscape — a non-square box that squashed the monogram. This
  is a genuine distortion fix, independent of the Safari wedge below.
- **Chips sit inside the stage.** The overhang (`right: -10%`, `left: -8%`)
  pushed them past the orb into the hero copy at tablet widths, where the
  section clipped them and the four read as one blob. A dedicated
  `901–1180px` breakpoint covers iPad landscape, which stays two-column and so
  never hit the `900px` stacking rule.

`measure_hero.py` renders the real page in headless Chrome at iPad portrait,
landscape, mini and desktop widths and asserts the geometry — logo squareness,
chip/stage overflow, chip-on-chip overlap, horizontal scrollbar:

```bash
python -m http.server 8799
python _tools/measure_hero.py http://localhost:8799/_probe.html
```

`verify_hero_fix.py` re-runs the same checks against the *pre-fix* stylesheet
and confirms they fail there, so the checks cannot silently become vacuous.

### The "cut" logo — the Safari wedge was real, and it was ours

On iPad/Safari the mark rendered as a circle with roughly one eighth missing and
looked like damaged artwork. **It was a genuine rendering bug, not the design.**
The artwork is a monogram of `l` and `h` — **l**yceum **h**igher School of
Economics — inside a 48×48 `viewBox`, and the ring is drawn as one **closed**
path (`M24 1 … 47 24 … 24 47 … 1 24 Z`) with the glyphs spanning x≈14–37,
i.e. essentially centred. There is no intentional gap.

The cause was `transform-style: preserve-3d` on `.orb` combined with
`rotate3d(1, .4, .2, 68deg)` on `.orb-orbit`. In a preserve-3d context WebKit
intersects the tilted orbit planes with the parent's `border-radius: 50%` box
and clips a wedge out of the composition. Chrome composites the identical
layout correctly, which is why only Safari/iOS showed it.

A second, independent bug made it worse: each orbit declared a static
`transform: rotate3d(...)` **and** an `animation: spin` whose
`to { transform: rotate(360deg) }` replaces the declared transform outright. The
3D tilt was therefore discarded on *every* engine and never rendered, while
`preserve-3d` stayed behind doing nothing except causing the clip. So the tilt
you never saw and the wedge you did see had a single root cause.

Fixed by dropping `preserve-3d` (nothing needs real 3D — the orbits only spin in
2D) and by composing the tilt and the spin in single `spin-tilted` keyframe sets
so both survive. The orbit ellipses now actually draw, which is a visual change
from before: the rings read as tilted rather than as flat circles.

Note `.brand-mark-ring` in the header is a separate `conic-gradient` arc with a
real empty sweep (62%–92%), and it rotates. That one *is* authored that way and
is unrelated to the hero bug.

`_tools/measure_brand.py` reports the header ring's authored arc and box at
iPad and desktop widths:

```bash
python _tools/measure_brand.py --build
python -m http.server 8799
python _tools/measure_brand.py
```

## Accessibility notes

- Keyboard: `/` focuses the search field, `Esc` closes the modal and the sort
  listbox, arrow keys drive the carousel, the sort listbox and the modal.
- The language switch is a labelled `role="group"` of `aria-pressed` buttons.
- `prefers-reduced-motion: reduce` disables the decorative layers and turns every
  transition, including the language wipe, into an instant swap.

## Credit

Built by Konstantin Samusev (kisamusev@edu.hse.ru) for the HSE Lyceum
informatics class, 2026 intake.
