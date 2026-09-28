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
locales/ru.json       Russian overrides for every tagged string
images/               logo + favicon (SVG)
fonts/                self-hosted woff2 (Space Grotesk, Manrope, JetBrains Mono)
<lastname-firstname>/ one directory per candidate:
                      config.json · photo.jpg|png · form.jpg|png
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
well as from a user page:

1. Push the repository to GitHub.
2. **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   branch `main`, folder `/ (root)`.
3. Done — `.nojekyll` stops Pages from running the files through Jekyll, and the
   site is served from `https://<user>.github.io/<repo>/`.

## Accessibility notes

- Keyboard: `/` focuses the search field, `Esc` closes the modal and the sort
  listbox, arrow keys drive the carousel, the sort listbox and the modal.
- The language switch is a labelled `role="group"` of `aria-pressed` buttons.
- `prefers-reduced-motion: reduce` disables the decorative layers and turns every
  transition, including the language wipe, into an instant swap.

## Credit

Built by Konstantin Samusev (kisamusev@edu.hse.ru) for the HSE Lyceum
informatics class, 2026 intake.
