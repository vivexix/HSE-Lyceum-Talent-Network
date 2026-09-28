/* =========================================================
   HSE Lyceum Talent Network — application logic + motion layer
   Vanilla JS, no dependencies.

   The data pipeline is unchanged: every student directory is
   fetched (config.json), media is probed (.jpg → .png), the
   candidate model is built, cards are rendered, live-filtered
   and the profile modal is driven from the same state.
   On top of it sits the presentation layer: symbol-matrix
   canvas, magnetic cursor, 3D tilt, statistics, carousel,
   view transitions and idle choreography.
   ========================================================= */
"use strict";

/* ---------- 1. Data map (student directories) ---------- */
const STUDENT_DIRS = [
  "avdonin-kirill",
  "danilova-anastasia",
  "dirin-ivan",
  "dzhulakyan-yana",
  "egorova-anna",
  "kapustin-kirill",
  "khabarova-lidiya",
  "khitrov-pavel",
  "kozhemyakin-gleb",
  "nikul-oksana",
  "prozorova-anna",
  "samusev_konstantin",
  "vladimirova-elizaveta",
  "zubareva-elina",
];

/* Russian answer → recruiter-style role title */
const ROLE_MAP = {
  "программирование": "Software Developer",
  "цифровые сервисы": "Digital Services Specialist",
  "теория": "CS Theory Researcher",
};

/* Field definitions used by the modal (["…" = label, type]).
   The label is an i18n key; `fieldLabel()` resolves it and humanises the raw
   key as a last resort, so a form question with no translation still reads. */
const PROFILE_FIELDS = [
  ["q1_informatics_confidence", "field.q1_informatics_confidence", "rating"],
  ["q2_informatics_preference", "field.q2_informatics_preference", "tags"],
  ["q3_learning_preference", "field.q3_learning_preference", "text"],
  ["q6_work_preference", "field.q6_work_preference", "text"],
  ["q8_media_preference", "field.q8_media_preference", "text"],
];
const ABOUT_FIELDS = [
  ["q4_ai_usage", "field.q4_ai_usage", "text"],
  ["q5_desired_product", "field.q5_desired_product", "text"],
  ["q7_unusual_hobby", "field.q7_unusual_hobby", "text"],
  ["q9_unobvious_fact", "field.q9_unobvious_fact", "text"],
];

/* ---------- Official contact channels ----------
   Single source of truth for every contact surface on the site. */
const CONTACT = {
  organisation: "HSE Lyceum",
  organisationRu: "Лицей ВШЭ",
  project: "HSE Lyceum Student Directory",
  projectRu: "База анкет лицеистов",
  person: "Konstantin Samusev",
  personRu: "Константин Самусев",
  role: "Project Creator",
  roleRu: "Создатель проекта",
  email: "kisamusev@edu.hse.ru",
  telegram: "@vivexix",
};

/* Telegram and mailto links are derived, never hand-written, so the handle
   only has to be correct once. */
CONTACT.telegramUrl = `https://t.me/${CONTACT.telegram.replace(/^@/, "")}`;
CONTACT.emailUrl = `mailto:${CONTACT.email}`;

/* Localized view of the contact block. */
function contactText() {
  const ru = I18N.lang === "ru";
  return {
    organisation: ru ? CONTACT.organisationRu : CONTACT.organisation,
    project: ru ? CONTACT.projectRu : CONTACT.project,
    person: ru ? CONTACT.personRu : CONTACT.person,
    role: ru ? CONTACT.roleRu : CONTACT.role,
    email: CONTACT.email,
    telegram: CONTACT.telegram,
  };
}

/* =========================================================
   1b · i18n
   English is the authored source: it lives inline in index.html
   and as literals in this file. `locales/<lang>.json` only
   overrides those strings, so a missing key falls back to the
   original English instead of blanking the UI.

   Default language is Russian ('ru'); the choice is persisted
   in localStorage under 'hse-lang'.
   ========================================================= */
const I18N_STORAGE_KEY = "hse-lang";
const DEFAULT_LANG = "ru";
const SUPPORTED = ["ru", "en"];

const I18N = {
  lang: DEFAULT_LANG,
  dict: {},
  originals: new Map(), // node -> English text captured before the first apply
};

/* "Продукт мечты" -> "Продукт мечты"; {name} -> interpolation */
function t(key, vars) {
  let out = I18N.dict[key];
  if (out == null) {
    /* Fall back to the English string captured from the DOM, so a key that
       exists only in code still renders something meaningful. */
    for (const [node, text] of I18N.originals) {
      if (node.dataset && node.dataset.i18n === key) { out = text; break; }
    }
  }
  if (out == null) out = I18N.dict[`en.${key}`] != null ? I18N.dict[`en.${key}`] : key;
  if (!vars) return out;
  return out.replace(/\{(\w+)\}/g, (m, name) => (vars[name] != null ? String(vars[name]) : m));
}

function readStoredLang() {
  try {
    const saved = localStorage.getItem(I18N_STORAGE_KEY);
    return SUPPORTED.includes(saved) ? saved : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG; // private mode / storage blocked
  }
}

function storeLang(lang) {
  try { localStorage.setItem(I18N_STORAGE_KEY, lang); } catch { /* non-fatal */ }
}

/* Locales are cached in memory. The language switch re-renders the whole pool,
   so any network wait inside that window reads as a freeze — the JSON has to be
   in hand before the animation starts. */
const localeCache = new Map();

async function fetchLocale(lang) {
  if (localeCache.has(lang)) return localeCache.get(lang);
  try {
    const res = await fetch(`locales/${lang}.json`, { cache: "force-cache" });
    const data = res.ok ? await res.json() : {};
    localeCache.set(lang, data);
    return data;
  } catch {
    localeCache.set(lang, {}); // offline / file:// — English stays in place
    return {};
  }
}

/* Warm the cache for every non-default locale at boot. */
function prefetchLocales() {
  SUPPORTED.forEach((lang) => {
    if (lang !== "en" && !localeCache.has(lang)) fetchLocale(lang);
  });
}

async function loadLocale(lang) {
  I18N.dict = lang === "en" ? {} : await fetchLocale(lang);
}

/* Capture the authored English once, before any override lands. */
function captureOriginals(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((node) => {
    if (!I18N.originals.has(node)) I18N.originals.set(node, node.textContent.trim());
  });
}

function applyI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((node) => {
    const key = node.dataset.i18n;
    const original = I18N.originals.get(node);
    const next = I18N.dict[key] != null ? I18N.dict[key] : original;
    if (next != null && node.textContent.trim() !== next) node.textContent = next;
  });
  root.querySelectorAll("[data-i18n-attr]").forEach((node) => {
    /* "placeholder:search.placeholder" style: attr=key,value;attr2=key2 */
    node.dataset.i18nAttr.split(";").forEach((pair) => {
      const [attr, key] = pair.split(":");
      if (!attr || !key) return;
      const original = node.getAttribute(`data-i18n-orig-${attr}`);
      const next = I18N.dict[key] != null ? I18N.dict[key] : original;
      if (next != null) node.setAttribute(attr, next);
    });
  });
  document.documentElement.lang = I18N.lang;
  $$("[data-lang-switch]").forEach((group) => {
    group.dataset.active = I18N.lang;
    group.querySelectorAll(".lang-btn").forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn.dataset.lang === I18N.lang));
    });
  });
}

/* Re-render everything that script.js builds in JS, so a language switch
   reaches the cards, statistics, chips, modal and toasts too. */
/* ---------- Name transliteration (ru mode) ----------
   Folder names are Latin transliterations of the students' real names, so the
   Russian view needs Cyrillic. Digraphs are matched before single letters,
   which is what makes Kozhemyakin -> Коземякин and Dzhulakyan -> Джулакян work.
   `NAME_RU` overrides anything the rules get wrong. */
const TRANSLIT_PAIRS = [
  ["shch", "щ"], ["sch", "ш"], ["sh", "ш"], ["ch", "ч"], ["kh", "х"],
  ["zh", "ж"], ["ts", "ц"], ["ck", "к"], ["yo", "ё"], ["ye", "е"],
  ["iy", "ий"], ["yy", "ий"], ["ya", "я"], ["yu", "ю"], ["ae", "э"],
  ["oe", "ё"], ["ll", "лл"], ["nn", "нн"], ["tt", "тт"], ["ss", "сс"],
  ["kk", "кк"], ["mm", "мм"], ["pp", "пп"],
];
const TRANSLIT_SINGLE = {
  a: "а", b: "б", v: "в", g: "г", d: "д", e: "е", z: "з", i: "и", j: "дж",
  k: "к", l: "л", m: "м", n: "н", o: "о", p: "п", r: "р", s: "с", t: "т",
  u: "у", f: "ф", h: "х", c: "к", q: "к", w: "в", x: "кс", y: "й",
};

function translitRu(word) {
  const src = word.toLowerCase();
  let out = "";
  for (let i = 0; i < src.length; ) {
    const pair = src.slice(i, i + 3);
    const digraph = TRANSLIT_PAIRS.find(([latin]) => pair.startsWith(latin));
    if (digraph) {
      out += digraph[1];
      i += digraph[0].length;
      continue;
    }
    out += TRANSLIT_SINGLE[src[i]] != null ? TRANSLIT_SINGLE[src[i]] : src[i];
    i += 1;
  }
  return out;
}

/* Full name, localized. Russian picks the curated map first, then falls back
   to the transliteration rules; other languages keep the original Latin. */
function localizedName(c) {
  if (I18N.lang !== "ru") return c.full;
  const slugKey = c.slug.replace(/[-_]/g, " ");
  if (I18N.dict[`name.${slugKey}`]) return I18N.dict[`name.${slugKey}`];
  return c.full
    .split(/\s+/)
    .map((part) => {
      const tr = translitRu(part);
      return tr.charAt(0).toUpperCase() + tr.slice(1);
    })
    .join(" ");
}

/* Initials for the avatar fallback follow the same rule. */
function localizedInitials(c) {
  if (I18N.lang !== "ru") return initials(c.full);
  return localizedName(c)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

function relocalizeCandidates() {
  candidates.forEach((c) => {
    c.role = roleFromPreference(c.ch.q2_informatics_preference);
  });
}

function refreshDynamicText() {
  if (candidates.length) {
    relocalizing = true;
    try {
      relocalizeCandidates();
      buildFilterChips();
      /* renderPool() already calls renderCatalogOnly() internally — calling
         both here built the entire grid twice per language switch. */
      renderPool();
      renderStats();
    } finally {
      relocalizing = false;
    }
  }
  const p = I18N.dict;
  /* The trigger mirrors the selected option's text, so re-read it after the
     option labels have been translated. */
  if (sortValue) {
    const selected = sortOptions.find((o) => o.getAttribute("aria-selected") === "true") || sortOptions[0];
    if (selected) sortValue.textContent = selected.textContent.trim();
  }
  if (resultCount && p["filter.progress"]) {
    resultCount.textContent = `${p["filter.progress"]} ${visibleCandidates.length}${p["filter.progressDone"] || ""}`;
  }
  if (activeCandidate) {
    renderModalContent(activeCandidate);
    syncInviteButton(activeCandidate);
  }
  if (loadError) {
    const title = loadError.querySelector(".load-error-title");
    if (title) title.textContent = p["status.loadError"] || title.textContent;
  }
  observeReveals();
}

/* ---------- Language switch: spotlight ⇄ blur choreography ----------
   Three beats, mirroring the spotlight ⇄ catalog swap: the page defocuses, the
   dictionary is swapped on a frame nothing is painted, the page resolves.

   The durations here are the `animation-duration` values of `.is-lang-out` /
   `.is-lang-in` in styles.css — the pair has to stay in step, so they are named
   and commented on both sides. */
const LANG_OUT_MS = 300;
const LANG_IN_MS = 560;

/* True only for the length of a swap: the matrix field reads it to sit out, and
   a second click that lands mid-swap is ignored instead of interleaving. */
let langSwapping = false;

/* Everything the swap animates. Tagged `data-lang-root` in index.html, so this
   list and the CSS can never drift apart. */
const langRoots = () => $$("[data-lang-root]");

/* Resolve once that phase's own animation has landed.

   `animationend` is the reliable signal. The previous version listened for
   `transitionend` on `backdrop-filter`, an event browsers routinely never fire
   (Safari needs the -webkit- prefixed name), so it always fell through to the
   timer and the whole swap ran on a blind pause — the dead air that read as a
   frozen page. The timer survives as a safety net for a dropped or cancelled
   event, and it is longer than the CSS duration so it can never cut an animation
   short. */
function waitLangPhase(nodes, name, ms) {
  return new Promise((resolve) => {
    let left = nodes.length;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      nodes.forEach((node) => {
        node.removeEventListener("animationend", onEnd);
        node.removeEventListener("animationcancel", onEnd);
      });
      resolve();
    };
    const onEnd = (event) => {
      /* animationend bubbles: only this node's own copy of the phase counts. */
      if (event.target !== event.currentTarget || event.animationName !== name) return;
      left -= 1;
      if (left <= 0) finish();
    };
    nodes.forEach((node) => {
      node.addEventListener("animationend", onEnd);
      node.addEventListener("animationcancel", onEnd);
    });
    setTimeout(finish, ms + 80);
  });
}

async function setLang(lang) {
  if (!SUPPORTED.includes(lang) || lang === I18N.lang) return;
  /* Ignore a click that lands mid-switch rather than interleaving two swaps. */
  if (langSwapping) return;

  /* Resolve the dictionary BEFORE anything animates. A fetch inside the swap
     window is what made the old View Transitions path feel like a reload: the
     previous frame stayed on screen, frozen, while the network was pending. */
  const dict = lang === "en" ? {} : await fetchLocale(lang);

  const swap = () => {
    I18N.lang = lang;
    I18N.dict = dict;
    storeLang(lang);
    applyI18n();
    refreshDynamicText();
  };

  if (REDUCED() || !document.body) {
    swap();
    return;
  }

  const roots = langRoots();
  const body = document.body;
  langSwapping = true;
  try {
    /* 1 · recede — every root defocuses and drops to invisible (opacity 0,
       blur 12px) while the spotlight bloom flares up behind it. */
    body.classList.add("is-lang-out");
    await waitLangPhase(roots, "lang-blur-out", LANG_OUT_MS);

    /* 2 · swap — the out animation's `both` fill is holding opacity 0, so the
       rebuild of the pool, chips, stats, modal and toasts lands entirely on a
       frame the browser never paints: it cannot flash, and it cannot be seen as
       a "refresh". The reflow is forced here, inside that window, so the new
       text is already laid out when the resolve phase paints its first frame. */
    swap();
    void body.offsetHeight;

    /* 3 · resolve — the same blur run backwards, into the new language. */
    body.classList.remove("is-lang-out");
    body.classList.add("is-lang-in");
    await waitLangPhase(roots, "lang-blur-in", LANG_IN_MS);
  } finally {
    body.classList.remove("is-lang-out", "is-lang-in");
    langSwapping = false;
  }
}

/* ---------- 2. Small helpers ---------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/* "avdonin-kirill" | "samusev_konstantin" → { first, last, full } */
function nameFromSlug(slug) {
  const parts = slug.split(/[-_]+/).filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1));
  if (parts.length < 2) return { first: parts[0] || slug, last: "", full: parts[0] || slug };
  const [last, first] = parts; // folders are "lastname-firstname"
  return { first, last, full: `${first} ${last}` };
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

/* "цифровые сервисы; программирование" → ["цифровые сервисы", "программирование"]
   Also splits the conjunction form ("теория и программирование") so every
   focus area is treated as its own tag everywhere in the UI. */
function splitList(value) {
  return String(value || "")
    .split(/[;,\uFF1B]+|\s+и\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function roleFromPreference(pref) {
  /* When a Russian label exists it is already recruiter-ready, so it wins over
     the English role title in ru mode; English keeps using ROLE_MAP. */
  const titles = splitList(pref)
    .map((item) => {
      const localized = I18N.dict[`labels.${item.toLowerCase()}`];
      return localized || ROLE_MAP[item.toLowerCase()];
    })
    .filter(Boolean);
  const unique = [...new Set(titles)];
  return unique.length ? unique.join(" · ") : "Informatics Specialist";
}

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const lerp = (a, b, t) => a + (b - a) * t;
const pad2 = (n) => String(n).padStart(2, "0");
const REDUCED = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const FINE_POINTER = () => window.matchMedia("(hover: hover) and (pointer: fine)").matches;

/* ---------- 3. Media resolution (.jpg / .png) ---------- */
const mediaCache = new Map();

function probeImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(url);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/* Tries `<dir>/<base>.jpg`, then `.png`; caches the winner (or null). */
async function resolveMedia(dir, base) {
  const key = `${dir}/${base}`;
  if (mediaCache.has(key)) return mediaCache.get(key);
  for (const ext of ["jpg", "png"]) {
    const url = `${dir}/${base}.${ext}`;
    // eslint-disable-next-line no-await-in-loop
    const found = await probeImage(url);
    if (found) {
      mediaCache.set(key, found);
      return found;
    }
  }
  mediaCache.set(key, null);
  return null;
}

/* ---------- 4. Shared UI fragments ---------- */
/* Avatar = initials placeholder underneath; image fades in on top when loaded. */
function buildAvatar(size, photoUrl, name) {
  const wrap = el("div", "avatar");
  if (size === "lg") wrap.classList.add("avatar--lg");
  wrap.appendChild(el("span", "avatar-fallback", initials(name)));
  if (photoUrl) {
    const img = el("img");
    img.alt = `${name} — ${I18N.dict["m.photoAlt"] || "profile photo"}`;
    if (I18N.dict["m.photoAlt"]) img.lang = I18N.lang;
    img.width = size === "lg" ? 96 : 60;
    img.height = size === "lg" ? 96 : 60;
    img.loading = "lazy";
    img.decoding = "async";
    img.onload = () => img.classList.add("is-loaded");
    img.onerror = () => img.remove(); // initials remain visible
    img.src = photoUrl;
    wrap.appendChild(img);
  }
  return wrap;
}

/* Star rating: base stars + colored overlay clipped to a percentage. */
function buildRating(value, large) {
  const num = clamp(parseFloat(value) || 0, 0, 5);
  const rating = el("div", large ? "rating rating--lg" : "rating");
  const stars = el("span", "stars");
  stars.appendChild(document.createTextNode("★★★★★"));
  const fill = el("span", "stars-fill", "★★★★★");
  fill.style.setProperty("--fill", `${(num / 5) * 100}%`);
  stars.appendChild(fill);
  rating.appendChild(stars);
  rating.appendChild(el("span", "rating-value", Number.isInteger(num) ? String(num) : num.toFixed(1)));
  const label = el("span", "rating-label", I18N.dict["rating.label"] || "informatics confidence");
  if (I18N.dict["rating.label"]) label.lang = I18N.lang;
  rating.appendChild(label);
  return rating;
}

/* Closed-set answers → concise English labels. Free-text answers keep their
   original wording (with lang="ru") so the data stays faithful. */
const WORK_MAP = {
  "зависит от задачи": "Depends on task",
  "одному": "Solo builder",
  "в команде": "Team player",
  "сам": "Independent",
};
const LABEL_MAP = { ...ROLE_MAP, ...WORK_MAP };

/* Raw Russian answer -> localized label, falling back to the English map and
   finally to the original wording. */
function displayLabel(raw) {
  const value = String(raw == null ? "" : raw).trim();
  if (!value) return "";
  const localized = I18N.dict[`labels.${value.toLowerCase()}`];
  if (localized) return localized;
  return LABEL_MAP[value.toLowerCase()] || capitalize(value);
}

/* i18n key -> label, with a humanised raw key as the final fallback:
   "q7_unusual_hobby" -> "Q7 Unusual Hobby". */
function fieldLabel(key) {
  const localized = I18N.dict[key];
  if (localized) return localized;
  return humanizeKey(String(key).replace(/^field\./, ""));
}

function humanizeKey(key) {
  const words = String(key).replace(/[_-]+/g, " ").trim();
  if (!words) return "";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/* Focus-area / work-style / media tags — three visual tiers */
function buildTag(raw, kind) {
  const value = String(raw == null ? "" : raw).trim();
  const localized = I18N.dict[`labels.${value.toLowerCase()}`];
  const mapped = localized || LABEL_MAP[value.toLowerCase()];
  const li = el("li", `tag tag--${kind}`, mapped || capitalize(value));
  /* A closed-set answer is always tagged with the language it is shown in;
     only raw free text stays lang="ru". */
  if (localized) li.lang = I18N.lang;
  else if (mapped) li.title = value;
  else li.lang = "ru";
  return li;
}

/* ---------- 5. DOM refs ---------- */
const grid = $("#cardsGrid");
const emptyState = $("#emptyState");
const loadError = $("#loadError");
const resultCount = $("#resultCount");
const searchInput = $("#searchInput");
const searchClear = $("#searchClear");
const emptyReset = $("#emptyReset");
const modal = $("#modal");
const modalClose = $("#modalClose");
const modalPhoto = $("#modalPhoto");
const modalName = $("#modalName");
const modalRole = $("#modalRole");
const modalRating = $("#modalRating");
const modalTags = $("#modalTags");
const modalBody = $("#modalBody");
const inviteBtn = $("#inviteBtn");
const inviteNote = $("#inviteNote");
const modalCopy = $("#modalCopy");
const modalPrev = $("#modalPrev");
const modalNext = $("#modalNext");
const modalIndex = $("#modalIndex");
const modalScroll = $("#modalScroll");
const toastRegion = $("#toastRegion");
const toastText = $("#toastText");

const header = $("#siteHeader");
const siteNav = $("#siteNav");
const navToggle = $("#navToggle");
const scrollProgress = $("#scrollProgress");
const cursorEl = $("#cursor");
const cursorLabel = $("#cursorLabel");
const pointerAura = $("#pointerAura");
const matrixCanvas = $("#matrixCanvas");
const statsGrid = $("#statsGrid");
const statsPanels = $("#statsPanels");
const filterChips = $("#filterChips");
const sortSelect = $("#sortSelect");
const sortWrap = $("#sortWrap");
const sortTrigger = $("#sortTrigger");
const sortMenu = $("#sortMenu");
const sortValue = $("#sortValue");
const sortOptions = Array.from(sortMenu.querySelectorAll(".sort-option"));
const viewSwitch = $("#viewSwitch");
const viewCarousel = $("#viewCarousel");
const viewCatalog = $("#viewCatalog");
const carousel = $("#carousel");
const carouselTrack = $("#carouselTrack");
const carouselDots = $("#carouselDots");
const carouselIndex = $("#carouselIndex");
const carouselPrev = $("#carouselPrev");
const carouselNext = $("#carouselNext");
const openCatalog = $("#openCatalog");
const heroBrowse = $("#heroBrowse");

/* ---------- 6. State ---------- */
const bySlug = new Map();
const invitedSlugs = new Set();
let candidates = [];          // full pool, sorted
let visibleCandidates = [];   // currently matching the filter (display order)
let activeCandidate = null;
let activeIndexInQueue = -1;
let lastFocused = null;
let closeTimer = 0;
let toastTimer = 0;
let viewMode = "carousel";
let sortMode = "name";
let activeChipFilter = "";
let idleTimer = 0;
let hoveredMagnet = null;

/* ---------- 7. Toast ---------- */
function showToast(text) {
  toastText.textContent = text;
  toastRegion.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastRegion.classList.remove("is-visible"), 3600);
}

/* ---------- 8. URL state sync ---------- */
function setUrlParam(key, value) {
  try {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
    history.replaceState(null, "", url);
  } catch {
    /* file:// or exotic origin — state simply won't sync */
  }
}

/* ---------- 9. Candidate model ---------- */
function buildCandidate(slug, cfg) {
  const names = nameFromSlug(slug);
  const ch = cfg.characteristics || {};
  const about = cfg.about || {};
  const drawingText = (cfg.character && cfg.character.text_on_drawing) || "";
  const focusAreas = splitList(ch.q2_informatics_preference);
  const role = roleFromPreference(ch.q2_informatics_preference);
  const haystack = [
    names.full,
    slug.replace(/[-_]/g, " "),
    role,
    ...focusAreas,
    ch.q3_learning_preference,
    ch.q6_work_preference,
    ch.q8_media_preference,
    about.q5_desired_product,
    about.q4_ai_usage,
    about.q7_unusual_hobby,
    about.q9_unobvious_fact,
    drawingText,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return {
    slug,
    ...names,
    cfg,
    ch,
    about,
    drawingText,
    focusAreas,
    role,
    haystack,
    confidence: clamp(parseFloat(ch.q1_informatics_confidence) || 0, 0, 5),
    photoUrl: null,
  };
}

/* ---------- 10. Aggregations used by the statistics block ---------- */
function tally(list) {
  const map = new Map();
  for (const item of list) {
    if (!item) continue;
    const key = item.trim();
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function computeStats(list) {
  const total = list.length;
  const confidenceSum = list.reduce((sum, c) => sum + c.confidence, 0);
  const avgConfidence = total ? confidenceSum / total : 0;
  const focus = tally(list.flatMap((c) => c.focusAreas));
  const work = tally(list.map((c) => c.ch.q6_work_preference));
  const media = tally(list.map((c) => c.ch.q8_media_preference));
  const roles = tally(
    list.map((c) => c.role).flatMap((r) => String(r).split(" · "))
  );
  const distribution = [0, 0, 0, 0, 0];
  for (const c of list) {
    const bucket = clamp(Math.round(c.confidence), 1, 5);
    distribution[bucket - 1] += 1;
  }
  return {
    total,
    avgConfidence,
    focus,
    work,
    media,
    roles,
    distribution,
    createdProducts: list.filter((c) => c.about.q5_desired_product).length,
  };
}

/* Highest signal first, then alphabetical — used by the carousel order. */
function byConfidence(a, b) {
  return b.confidence - a.confidence || a.full.localeCompare(b.full);
}

/* ---------- 11. Card component (full catalog) ---------- */
/* Set while the pool is re-rendered purely to change language. The entrance
   animation and the count-up are first-load flourishes; replaying them on every
   language switch is exactly what made the page look like it was reloading. */
let relocalizing = false;

function buildCard(c, index) {
  const card = el("article", relocalizing ? "card" : "card card-enter");
  card.dataset.slug = c.slug;
  card.style.setProperty("--i", Math.min(index, 11));
  if (!relocalizing) {
    card.addEventListener("animationend", () => card.classList.remove("card-enter"), { once: true });
  }

  const top = el("div", "card-top");
  const displayName = localizedName(c);
  top.appendChild(buildAvatar("sm", c.photoUrl, displayName));
  const id = el("div", "card-id");
  const nameEl = el("h3", "card-name", displayName);
  nameEl.lang = I18N.lang;
  id.appendChild(nameEl);
  id.appendChild(el("p", "card-role", c.role));
  top.appendChild(id);
  top.appendChild(el("span", "card-index", pad2(index + 1)));
  card.appendChild(top);

  card.appendChild(buildRating(c.ch.q1_informatics_confidence));

  const ul = el("ul", "tag-row");
  c.focusAreas.slice(0, 4).forEach((tag) => ul.appendChild(buildTag(tag, "focus")));
  const workStyle = c.ch.q6_work_preference;
  if (workStyle) ul.appendChild(buildTag(workStyle, "meta"));
  card.appendChild(ul);

  if (c.about.q5_desired_product) {
    const teaser = el("p", "card-teaser", c.about.q5_desired_product);
    teaser.lang = "ru";
    card.appendChild(teaser);
  }

  const foot = el("div", "card-foot");
  const meta = el("div", "card-meta");
  if (c.ch.q8_media_preference) meta.appendChild(buildTag(c.ch.q8_media_preference, "ghost"));
  if (c.drawingText) meta.appendChild(buildTag(`«${c.drawingText}»`, "ghost"));
  if (meta.childElementCount) foot.appendChild(meta);

  const actions = el("div", "card-actions");
  const viewBtn = el("button", "btn btn-outline");
  viewBtn.type = "button";
  viewBtn.appendChild(el("span", "btn-label", I18N.dict["m.viewApplication"] || "View Application"));
  viewBtn.setAttribute("aria-label", `${I18N.dict["m.viewApplication"] || "View Application"} — ${displayName}`);
  actions.appendChild(viewBtn);
  foot.appendChild(actions);
  card.appendChild(foot);

  card.setAttribute("data-tilt", "");
  card.addEventListener("click", () => openModal(c));
  return card;
}

/* ---------- 12. Carousel slide component (spotlight) ---------- */
function buildSlide(c, index) {
  const slide = el("article", "slide");
  slide.dataset.slug = c.slug;
  slide.setAttribute("data-tilt", "");
  slide.setAttribute("role", "button");
  slide.setAttribute("tabindex", "0");
  const displayName = localizedName(c);
  slide.setAttribute("aria-label", `Open ${displayName}’s application`);

  slide.appendChild(el("span", "slide-glow"));

  const top = el("div", "slide-top");
  top.appendChild(buildAvatar("lg", c.photoUrl, displayName));
  const rank = el("div", "slide-rank");
  rank.appendChild(el("span", "rank-index", pad2(index + 1)));
  const rankLabel = el("span", "rank-label", I18N.dict["spotlight"] || "spotlight");
  if (I18N.dict["spotlight"]) rankLabel.lang = I18N.lang;
  rank.appendChild(rankLabel);
  top.appendChild(rank);
  slide.appendChild(top);

  const slideName = el("h3", "slide-name", displayName);
  slideName.lang = I18N.lang;
  slide.appendChild(slideName);
  slide.appendChild(el("p", "slide-role", c.role));
  slide.appendChild(buildRating(c.ch.q1_informatics_confidence));

  const ul = el("ul", "tag-row");
  c.focusAreas.slice(0, 3).forEach((tag) => ul.appendChild(buildTag(tag, "focus")));
  if (c.ch.q6_work_preference) ul.appendChild(buildTag(c.ch.q6_work_preference, "meta"));
  slide.appendChild(ul);

  if (c.about.q5_desired_product) {
    const teaser = el("p", "slide-teaser", c.about.q5_desired_product);
    teaser.lang = "ru";
    slide.appendChild(teaser);
  }

  const meta = el("div", "slide-meta");
  if (c.ch.q8_media_preference) meta.appendChild(buildTag(c.ch.q8_media_preference, "ghost"));
  if (c.ch.q3_learning_preference) meta.appendChild(buildTag(c.ch.q3_learning_preference, "ghost"));
  slide.appendChild(meta);

  const cta = el("button", "btn btn-outline");
  cta.type = "button";
  cta.appendChild(el("span", "btn-label", I18N.dict["openProfile"] || "Open profile"));
  cta.tabIndex = -1;
  slide.appendChild(cta);

  const activate = () => openModal(c);
  slide.addEventListener("click", activate);
  slide.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activate();
    }
  });
  return slide;
}

/* ---------- 13. Load all student directories ---------- */

/* A failed load has two very different causes, and the fix differs:
     · file://  — the browser blocks fetch() on local files, so the page must
                  be served over HTTP. Only meaningful during development.
     · http(s):// — the site is published and something went wrong on the
                  network or the server. Telling a visitor to run a local web
                  server would be nonsense, so that copy is swapped out. */
function showLoadError() {
  if (!loadError) return;
  const fromFileSystem = location.protocol === "file:";
  const fsMsg = loadError.querySelector("[data-load-error-filesystem]");
  const netMsg = loadError.querySelector("[data-load-error-network]");
  if (fsMsg) fsMsg.hidden = !fromFileSystem;
  if (netMsg) netMsg.hidden = fromFileSystem;
  loadError.hidden = false;
}

async function loadCandidates() {
  const skeletons = Array.from({ length: 6 }, () => el("div", "skeleton-card"));
  grid.replaceChildren(...skeletons);

  const results = await Promise.all(
    STUDENT_DIRS.map(async (slug) => {
      try {
        const res = await fetch(`${slug}/config.json`, { cache: "force-cache" });
        if (!res.ok) return null;
        return buildCandidate(slug, await res.json());
      } catch {
        return null; // e.g. opened via file:// where fetch is blocked
      }
    })
  );

  candidates = results.filter(Boolean).sort((a, b) => a.full.localeCompare(b.full));
  if (!candidates.length) {
    grid.replaceChildren();
    showView("catalog", { force: true });
    showLoadError();
    resultCount.textContent = I18N.dict["status.noCandidates"] || "No candidates available";
    setFooterStatus(I18N.dict["footer.unavailable"] || "Data unavailable", true);
    return false;
  }

  // Resolve photo.jpg / photo.png per candidate (parallel, cached).
  await Promise.all(
    candidates.map(async (c) => {
      c.photoUrl = await resolveMedia(c.slug, "photo");
      bySlug.set(c.slug, c);
    })
  );

  skeletons.forEach((s) => s.remove());
  renderPool();
  renderStats();
  setFooterStatus(
    I18N.dict["footer.live"]
      ? `${candidates.length} ${I18N.dict["footer.live"]}`
      : `${candidates.length} profiles live`
  );
  return true;
}

/* ---------- 14. Render both views from one pool ---------- */
function sortedPool(mode) {
  if (mode === "confidence") return [...candidates].sort(byConfidence);
  if (mode === "focus") {
    return [...candidates].sort(
      (a, b) => (a.focusAreas[0] || "").localeCompare(b.focusAreas[0] || "") || a.full.localeCompare(b.full)
    );
  }
  return [...candidates].sort((a, b) => a.full.localeCompare(b.full));
}

function renderCatalogOnly() {
  grid.replaceChildren(...sortedPool(sortMode).map((c, i) => buildCard(c, i)));
  initTilt(grid);
  applyFilter(searchInput.value);
}

function renderPool() {
  renderCatalogOnly();

  const spotlight = sortedPool("confidence");
  carouselTrack.replaceChildren(...spotlight.map((c, i) => buildSlide(c, i)));

  carouselDots.replaceChildren(
    ...spotlight.map((c) => {
      const dot = el("button", "carousel-dot");
      dot.type = "button";
      dot.tabIndex = -1;
      dot.dataset.slug = c.slug;
      dot.setAttribute("aria-hidden", "true");
      return dot;
    })
  );

  buildFilterChips();
  resetCarousel();
  applyFilter(searchInput.value);
}

/* ---------- 15. Live filter (instant, keyboard-friendly) ---------- */
function applyFilter(query) {
  const q = query.trim().toLowerCase();
  const tokens = q ? q.split(/\s+/) : [];
  let shown = 0;
  visibleCandidates = [];

  for (const c of candidates) {
    const match = !tokens.length || tokens.every((t) => c.haystack.includes(t));
    if (match) {
      shown += 1;
      visibleCandidates.push(c);
    }
    const slug = CSS.escape(c.slug);
    const card = grid.querySelector(`.card[data-slug="${slug}"]`);
    if (card) card.classList.toggle("is-hidden", !match);
    const slide = carouselTrack.querySelector(`.slide[data-slug="${slug}"]`);
    if (slide) slide.classList.toggle("is-hidden", !match);
    const dot = carouselDots.querySelector(`.carousel-dot[data-slug="${slug}"]`);
    if (dot) dot.classList.toggle("is-hidden", !match);
  }

  const d = I18N.dict;
  if (d["filter.progress"]) {
    resultCount.textContent =
      shown === candidates.length
        ? `${d["filter.progress"]} ${candidates.length} ${d["filter.progressDone"] || ""}`.trim()
        : `${d["filter.progress"]} ${shown} / ${candidates.length}`;
  } else {
    resultCount.textContent =
      shown === candidates.length
        ? `${candidates.length} candidates in the pool`
        : `${shown} of ${candidates.length} candidates`;
  }

  emptyState.hidden = shown !== 0;
  searchClear.hidden = query.length === 0;
  setUrlParam("q", query || null);

  // chip + footer filter highlight follows the single source of truth: the query
  const key = q;
  $$(".chip").forEach((chip) => {
    const isActive = chip.dataset.filter !== "" && chip.dataset.filter === key;
    chip.classList.toggle("is-active", isActive);
    chip.setAttribute("aria-pressed", String(isActive));
  });

  // nothing matches → make sure the grid (with the empty state) is on screen
  if (shown === 0 && viewMode !== "catalog") showView("catalog");
  if (shown === 0) setFooterStatus("No matches for this search");

  // Filtering re-lays-out the strip, so the focused card can end up anywhere.
  // Restart from the first match so index, dots and strip agree again.
  resetCarousel();
}

/* ---------- 16. Filter chips ---------- */
function buildFilterChips() {
  const focus = tally(candidates.flatMap((c) => c.focusAreas));
  const frag = document.createDocumentFragment();

  const all = el("button", "chip is-active");
  all.type = "button";
  all.dataset.filter = "";
  all.setAttribute("aria-pressed", "true");
  all.appendChild(el("span", null, I18N.dict["filter.all"] || "All candidates"));
  all.appendChild(el("span", "chip-count", String(candidates.length)));
  all.addEventListener("click", () => {
    searchInput.value = "";
    applyFilter("");
  });
  frag.appendChild(all);

  for (const [raw, count] of focus) {
    const chip = el("button", "chip");
    chip.type = "button";
    chip.dataset.filter = raw.toLowerCase();
    chip.setAttribute("aria-pressed", "false");
    chip.title = raw;
    chip.appendChild(el("span", null, displayLabel(raw)));
    chip.appendChild(el("span", "chip-count", String(count)));
    chip.addEventListener("click", () => {
      const next = chip.dataset.filter === searchInput.value.trim().toLowerCase() ? "" : raw;
      searchInput.value = next;
      applyFilter(next);
      if (next) showView("catalog");
    });
    frag.appendChild(chip);
  }
  filterChips.replaceChildren(frag);
}

function setFooterStatus(text, warn) {
  const node = $("#footerStatus");
  if (node) node.textContent = text;
  const dot = node && node.previousElementSibling;
  if (dot && dot.classList.contains("status-dot")) {
    dot.style.background = warn ? "var(--danger)" : "var(--success)";
  }
}

/* ---------- 17. View switching: spotlight ⇄ catalog ---------- */
/* Re-measure + re-sync after the view was swapped back in (a hidden box has no
   width, so the geometry captured before the swap is stale). */
function syncCarouselView() {
  if (viewMode !== "carousel") return;
  if (measureCarousel(false)) updateCarouselState();
}

function showView(mode, options = {}) {
  if (mode === viewMode && !options.force) return;
  viewMode = mode;
  const show = mode === "catalog" ? viewCatalog : viewCarousel;
  const hide = mode === "catalog" ? viewCarousel : viewCatalog;

  viewSwitch.dataset.active = mode;
  const buttons = [["carousel", viewSwitch.querySelector('[data-view="carousel"]')], ["catalog", viewSwitch.querySelector('[data-view="catalog"]')]];
  for (const [key, btn] of buttons) {
    if (!btn) continue;
    btn.classList.toggle("is-active", key === mode);
    btn.setAttribute("aria-selected", String(key === mode));
  }

  if (REDUCED()) {
    hide.hidden = true;
    hide.classList.remove("is-active");
    show.hidden = false;
    show.classList.add("is-active");
    syncCarouselView();
    return;
  }

  hide.classList.add("is-leaving");
  window.setTimeout(() => {
    hide.hidden = true;
    hide.classList.remove("is-leaving", "is-active");
    show.hidden = false;
    show.classList.add("is-active");
    syncCarouselView();
  }, 210);
}

/* ---------- 18. Carousel: free-form drag + inertial settle ----------
   The strip is driven by a transform, NOT by native scrolling, so there is no
   scroll-snap boundary to slam into: any card — first or last — can be dragged
   the whole way into the focal view, and the gesture finishes with a
   velocity-aware glide that stops exactly on the nearest centre.
   ------------------------------------------------------------------- */
const visibleSlides = () =>
  Array.from(carouselTrack.querySelectorAll(".slide:not(.is-hidden)"));

/* Geometry + physics state.
   `x` is the track shift in pixels: the value that centres a card, so the
   rendered transform is translate3d(-x, 0, 0). `offsets[i]` is the x that
   centres visible card i. */
const car = {
  items: [],
  offsets: [],
  x: 0,
  vx: 0,          // px per ms
  index: 0,
  view: 0,
  raf: 0,
  tween: null,
  dragging: false,
  pointerId: null,
  grabX: 0,
  grabAt: 0,
  moved: 0,
  lastAt: 0,
  wheelAt: 0,
  pendingReset: false,
};

/* Offsets come from offsetLeft (track and slides share one offsetParent), so
   they stay valid while the track itself is transformed. */
function measureCarousel(reset) {
  const view = carousel.clientWidth;
  if (!view) {
    // The carousel view can be swapped out (`hidden`) while a filter re-renders
    // the pool: a collapsed box measures 0 and would poison every number here.
    car.items = [];
    car.offsets = [];
    car.view = 0;
    return false;
  }

  const items = visibleSlides();
  const trackLeft = carouselTrack.offsetLeft;
  // A reset requested while the view was hidden still has to land.
  const fromStart = reset || car.pendingReset;
  car.items = items;
  car.offsets = items.map(
    (slide) => slide.offsetLeft - trackLeft + slide.offsetWidth / 2 - view / 2
  );
  car.view = view;
  car.pendingReset = false;

  if (!items.length) {
    renderCarousel(0);
    return true;
  }

  const index = fromStart ? 0 : clamp(car.index, 0, items.length - 1);
  car.index = index;
  renderCarousel(car.offsets[index]);
  return true;
}

function nearestIndex(x) {
  let best = 0;
  let dist = Infinity;
  car.offsets.forEach((offset, i) => {
    const d = Math.abs(offset - x);
    if (d < dist) {
      dist = d;
      best = i;
    }
  });
  return best;
}

/* Past the first/last centre the strip still moves — just with heavy damping,
   so an edge card can be pulled into the focal view and parked precisely. */
function rubberBand(x) {
  const first = car.offsets[0];
  const last = car.offsets[car.offsets.length - 1];
  if (x < first) return first - (first - x) * 0.28;
  if (x > last) return last + (x - last) * 0.28;
  return x;
}

function renderCarousel(x) {
  car.x = x;
  if (car.offsets.length) car.index = nearestIndex(x);
  carouselTrack.style.transform = `translate3d(${-x.toFixed(2)}px, 0, 0)`;
  updateCarouselState();
}

function stopCarouselTween() {
  if (car.raf) cancelAnimationFrame(car.raf);
  car.raf = 0;
  car.tween = null;
}

/* Apple-style landing: quick out of the gate, long soft tail, dead stop on the
   centre. Duration scales with the distance travelled. */
function settleCarousel(index, instant) {
  if (!car.offsets.length) return;
  const to = car.offsets[clamp(index, 0, car.offsets.length - 1)];
  const from = car.x;
  stopCarouselTween();

  if (instant || REDUCED() || Math.abs(to - from) < 0.5) {
    car.vx = 0;
    renderCarousel(to);
    return;
  }

  const dur = clamp(200 + Math.abs(to - from) * 0.5, 240, 760);
  car.tween = { from, to, start: performance.now(), dur };
  const tick = (now) => {
    if (!car.tween) return;
    const t = clamp((now - car.tween.start) / car.tween.dur, 0, 1);
    renderCarousel(lerp(from, to, 1 - Math.pow(1 - t, 5)));
    if (t < 1) {
      car.raf = requestAnimationFrame(tick);
    } else {
      car.raf = 0;
      car.tween = null;
      car.vx = 0;
    }
  };
  car.raf = requestAnimationFrame(tick);
}

/* Project where the gesture was heading, then land on the nearest centre. */
function releaseCarousel() {
  if (!car.offsets.length) return;
  const first = car.offsets[0];
  const last = car.offsets[car.offsets.length - 1];
  settleCarousel(nearestIndex(clamp(car.x + car.vx * 240, first, last)));
}

function stepCarousel(direction) {
  if (!car.offsets.length) return;
  settleCarousel(car.index + direction);
}

function resetCarousel() {
  car.pendingReset = true;
  stopCarouselTween();
  car.vx = 0;
  // Not measurable while the view is hidden — pendingReset is honoured by the
  // next measureCarousel (view swap, resize, filter re-render).
  measureCarousel(true);
}

function updateCarouselState() {
  const dots = Array.from(carouselDots.querySelectorAll(".carousel-dot"));
  const items = car.items;

  if (!items.length) {
    carouselIndex.textContent = "00 / 00";
    carouselPrev.disabled = true;
    carouselNext.disabled = true;
    dots.forEach((d) => d.classList.remove("is-active"));
    return;
  }

  // Keep the last good state while the view is hidden; measureCarousel re-syncs
  // as soon as the carousel is measurable again.
  if (!car.view) return;

  const active = clamp(car.index, 0, items.length - 1);
  carouselIndex.textContent = `${pad2(active + 1)} / ${pad2(items.length)}`;
  carouselPrev.disabled = active <= 0;
  carouselNext.disabled = active >= items.length - 1;

  const activeSlug = items[active].dataset.slug;
  dots.forEach((dot) => {
    const show = !dot.classList.contains("is-hidden");
    dot.classList.toggle("is-active", show && dot.dataset.slug === activeSlug);
    dot.tabIndex = show ? 0 : -1;
  });
}

function initCarousel() {
  carouselPrev.addEventListener("click", () => stepCarousel(-1));
  carouselNext.addEventListener("click", () => stepCarousel(1));
  carousel.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      stepCarousel(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      stepCarousel(-1);
    }
  });

  carouselDots.addEventListener("click", (event) => {
    const dot = event.target.closest(".carousel-dot");
    if (!dot) return;
    const index = car.items.findIndex((s) => s.dataset.slug === dot.dataset.slug);
    if (index >= 0) settleCarousel(index);
  });

  /* Trackpad / wheel: horizontal intent scrolls the strip, a plain vertical
     wheel keeps scrolling the page unless shift is held. */
  let wheelTimer = 0;
  carousel.addEventListener(
    "wheel",
    (event) => {
      if (!car.offsets.length) return;
      const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
      if (!horizontal && !event.shiftKey) return;
      event.preventDefault();

      const now = event.timeStamp;
      const dt = Math.max(1, now - (car.wheelAt || now - 16));
      car.wheelAt = now;
      const next = rubberBand(car.x + (horizontal ? event.deltaX : event.deltaY));
      car.vx = (next - car.x) / dt;
      stopCarouselTween();
      renderCarousel(next);

      window.clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(releaseCarousel, 110);
    },
    { passive: false }
  );

  /* Pointer drag — free-form, no boundaries. Isolated to the inner track so the
     outer carousel + page keep vertical panning (touch-action: pan-y). */
  carouselTrack.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    /* No preventDefault() here on purpose: cancelling pointerdown also cancels
       the compatibility mouse events, so the browser never fires `click` and
       tapping a card stopped opening the profile. The native drag ghost is
       suppressed separately (dragstart), text selection by user-select:none. */
    if (!car.offsets.length) return;

    stopCarouselTween();
    car.dragging = true;
    car.pointerId = event.pointerId;
    car.moved = 0;
    car.captured = false;
    car.grabX = event.clientX;
    car.grabAt = car.x;
    car.lastAt = event.timeStamp;
    car.vx = 0;
    carousel.classList.add("is-dragging");
    /* Pointer capture is NOT taken here: while capture is active the browser
       retargets the follow-up `click` to the capture element, so the click
       never reaches the slide and the profile modal stops opening. Capture is
       taken lazily, once a real drag is under way (see pointermove). */
  });
  carouselTrack.addEventListener("pointermove", (event) => {
    if (!car.dragging || event.pointerId !== car.pointerId) return;
    const dx = event.clientX - car.grabX;
    car.moved = Math.abs(dx);
    /* Past the tap tolerance it is unambiguously a drag: take capture now so
       the gesture keeps tracking even if the finger leaves the track. */
    if (car.moved > 8 && !car.captured) {
      car.captured = true;
      car.heldId = event.pointerId;
      try { carouselTrack.setPointerCapture(event.pointerId); } catch { /* refused */ }
    }
    const dt = event.timeStamp - car.lastAt;
    const next = rubberBand(car.grabAt - dx);
    if (dt > 0) car.vx = (next - car.x) / dt;
    car.lastAt = event.timeStamp;
    renderCarousel(next);
  });
  const endDrag = (event) => {
    if (!car.dragging) return;
    if (event && event.pointerId !== undefined && event.pointerId !== car.pointerId) return;
    car.dragging = false;
    car.pointerId = null;
    car.captured = false;
    car.heldId = 0;
    car.wheelAt = 0;
    carousel.classList.remove("is-dragging");
    if (car.heldId) { try { carouselTrack.releasePointerCapture(car.heldId); } catch { /* never captured */ } }
    car.heldId = 0;
    // A finger that rested before lifting must not fling.
    if (event && event.timeStamp - car.lastAt > 90) car.vx = 0;
    releaseCarousel();
  };
  /* Native image/text drag ghost off (pointerdown is no longer cancelled). */
  carouselTrack.addEventListener("dragstart", (event) => event.preventDefault());
  carouselTrack.addEventListener("pointerup", endDrag);
  carouselTrack.addEventListener("pointercancel", endDrag);
  // safety net if pointer capture was refused (pointerleave removed: it fired
  // spuriously mid-drag whenever the finger crossed a slide boundary)
  window.addEventListener("pointerup", endDrag);

  // clicking a slide after a real drag should not open the modal
  carouselTrack.addEventListener(
    "click",
    (event) => {
      if (car.moved > 8) {
        event.preventDefault();
        event.stopPropagation();
        car.moved = 0;
      }
    },
    true
  );

  window.addEventListener("resize", () => {
    stopCarouselTween();
    if (measureCarousel(false)) updateCarouselState();
  });
}

/* ---------- 19. Statistics rendering ---------- */
function animateCount(node, target, decimals = 0) {
  if (!node) return;
  if (REDUCED()) {
    node.textContent = decimals ? target.toFixed(decimals) : String(Math.round(target));
    return;
  }
  const duration = 1400;
  const start = performance.now();
  const settle = () =>
    (node.textContent = decimals ? target.toFixed(decimals) : String(Math.round(target)));
  const tick = (now) => {
    const t = clamp((now - start) / duration, 0, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    const value = lerp(0, target, eased);
    node.textContent = decimals ? value.toFixed(decimals) : String(Math.round(value));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  /* safety net: always land on the exact figure, even if rAF is throttled */
  window.setTimeout(settle, duration + 80);
}

/* Writes the final figure with no animation — used on a language switch, where
   the numbers have not changed and only their labels have. */
function setCountNow(node, target, decimals = 0) {
  if (!node) return;
  node.textContent = decimals ? target.toFixed(decimals) : String(Math.round(target));
}

function sparkBars(values, cap = 14) {
  const wrap = el("div", "stat-spark");
  const list = values.slice(0, cap);
  const max = Math.max(1, ...list);
  list.forEach((v, i) => {
    const bar = el("i");
    bar.style.setProperty("--h", `${clamp((v / max) * 100, 8, 100)}%`);
    bar.style.setProperty("--i", String(i));
    wrap.appendChild(bar);
  });
  return wrap;
}

function statCard({ kicker, value, unit, note, bars, decimals = 0, index = 0 }) {
  const card = el("article", "stat-card glass reveal-delay");
  card.style.setProperty("--i", String(index));
  card.setAttribute("data-tilt", "");
  card.appendChild(el("span", "stat-glow"));
  card.appendChild(el("p", "stat-kicker", kicker));
  const valueRow = el("p", "stat-value");
  const number = el("span", null, decimals ? (0).toFixed(decimals) : "0");
  valueRow.appendChild(number);
  if (unit) valueRow.appendChild(el("span", "stat-unit", unit));
  card.appendChild(valueRow);
  card.appendChild(el("p", "stat-note", note));
  if (bars && bars.length) card.appendChild(sparkBars(bars));
  card.dataset.count = String(value);
  card.dataset.decimals = String(decimals);
  card.countNode = number;
  return card;
}

function panelShell(title, note) {
  const panel = el("article", "panel glass reveal-delay");
  const head = el("header", "panel-head");
  head.appendChild(el("h3", "panel-title", title));
  if (note) head.appendChild(el("p", "panel-note", note));
  panel.appendChild(head);
  return panel;
}

function renderStats() {
  if (!candidates.length) return;
  const s = computeStats(candidates);
  const topFocus = s.focus[0];
  const topWork = s.work[0];
  const topMedia = s.media[0];

  const maxConfidence = Math.max(...candidates.map((c) => c.confidence));
  const d = I18N.dict;
  const cards = [
    {
      kicker: d["card.poolSize"] || "Pool size",
      value: s.total,
      unit: d["card.poolSizeUnit"] || "profiles",
      note: `${s.createdProducts} ${d["card.poolSizeNote"] || "of them already describe the exact product they want to build."}`,
      bars: s.distribution,
    },
    {
      kicker: d["card.avgConfidence"] || "Avg. informatics confidence",
      value: s.avgConfidence,
      decimals: 1,
      unit: d["card.avgConfidenceUnit"] || "/ 5",
      note: d["card.avgConfidenceNote"]
        ? t("card.avgConfidenceNote", { max: maxConfidence })
        : `Self-reported on a 1–5 scale. Highest recorded score: ${maxConfidence}.`,
      bars: candidates.map((c) => c.confidence),
    },
    {
      kicker: d["card.focusAreas"] || "Focus areas in play",
      value: s.focus.length,
      unit: d["card.focusAreasUnit"] || "tracks",
      note: topFocus
        ? (d["card.focusAreasNote"]
            ? t("card.focusAreasNote", { top: displayLabel(topFocus[0]), count: topFocus[1], total: s.total })
            : `“${displayLabel(topFocus[0])}” leads with ${topFocus[1]} of ${s.total} mentions.`)
        : d["card.focusAreasNone"] || "No focus areas recorded yet.",
      bars: s.focus.map((f) => f[1]),
    },
    {
      kicker: d["card.roles"] || "Role archetypes",
      value: s.roles.length,
      unit: d["card.rolesUnit"] || "roles",
      note: d["card.rolesNote"] || "Mapped from each applicant’s preferred informatics track.",
      bars: s.roles.map((r) => r[1]),
    },
  ];

  statsGrid.replaceChildren(...cards.map((spec, i) => statCard({ ...spec, index: i })));

  /* --- panel 1 · focus distribution --- */
  const focusPanel = panelShell(
    d["panel.focus"] || "Focus distribution",
    `${s.focus.length} ${d["panel.focusUnit"] || "tracks"}`
  );
  const focusList = el("ul", "bar-list");
  const maxFocus = s.focus.length ? s.focus[0][1] : 1;
  s.focus.slice(0, 6).forEach(([raw, count], i) => {
    const row = el("li", "bar-row");
    const label = el("span", "bar-label", displayLabel(raw));
    label.title = raw;
    row.appendChild(label);
    const track = el("span", "bar-track");
    const fill = el("i", "bar-fill");
    fill.style.setProperty("--w", `${(count / maxFocus) * 100}%`);
    fill.style.setProperty("--i", String(i));
    track.appendChild(fill);
    row.appendChild(track);
    row.appendChild(el("span", "bar-value", String(count)));
    focusList.appendChild(row);
  });
  focusPanel.appendChild(focusList);

  /* --- panel 2 · working style --- */
  const workPanel = panelShell(d["panel.work"] || "How they like to work", d["panel.workUnit"] || "collaboration");
  const segBar = el("div", "seg-bar");
  const workTop = s.work.slice(0, 3);
  workTop.forEach(([, count], i) => {
    const seg = el("i", `seg seg--${i + 1}`);
    seg.style.setProperty("--w", `${(count / s.total) * 100}%`);
    seg.style.setProperty("--i", String(i));
    seg.title = `${workTop[i][0]} · ${count}`;
    segBar.appendChild(seg);
  });
  workPanel.appendChild(segBar);
  const workLegend = el("ul", "legend");
  const palette = ["rgba(95,134,255,.9)", "rgba(155,107,255,.9)", "rgba(67,230,214,.85)"];
  workTop.forEach(([raw, count], i) => {
    const item = el("li", "legend-item");
    const dot = el("span", "legend-dot");
    dot.style.background = palette[i % palette.length];
    item.appendChild(dot);
    const name = el("span", null, displayLabel(raw));
    name.title = raw;
    item.appendChild(name);
    item.appendChild(el("b", null, String(count)));
    workLegend.appendChild(item);
  });
  workPanel.appendChild(workLegend);
  if (topWork) {
    workPanel.appendChild(
      el("p", "legend-note",
        d["panel.workNote"]
          ? t("panel.workNote", { count: topWork[1], total: s.total })
          : `${topWork[1]} of ${s.total} candidates adapt their working style to the task at hand.`)
    );
  }

  /* --- panel 3 · media signals --- */
  const mediaPanel = panelShell(d["panel.media"] || "Where they hang out", d["panel.mediaUnit"] || "media");
  const mediaList = el("ul", "legend");
  s.media.slice(0, 5).forEach(([raw, count], i) => {
    const item = el("li", "legend-item");
    const dot = el("span", "legend-dot");
    dot.style.background = ["rgba(143,176,255,.9)", "rgba(67,230,214,.85)", "rgba(155,107,255,.9)", "rgba(95,134,255,.8)", "rgba(201,182,255,.85)"][i % 5];
    item.appendChild(dot);
    const mediaName = el("span", null, displayLabel(raw));
    mediaName.title = raw;
    if (!I18N.dict[`labels.${raw.toLowerCase()}`]) mediaName.lang = "ru";
    item.appendChild(mediaName);
    item.appendChild(el("b", null, String(count)));
    mediaList.appendChild(item);
  });
  mediaPanel.appendChild(mediaList);
  if (topMedia) {
    mediaPanel.appendChild(
      el("p", "legend-note",
        d["panel.mediaNote"]
          ? t("panel.mediaNote", {
              top: displayLabel(topMedia[0]),
              percent: Math.round((topMedia[1] / s.total) * 100),
            })
          : `${topMedia[0]} mentions the strongest — ${Math.round((topMedia[1] / s.total) * 100)}% of the pool.`)
    );
  }

  statsPanels.replaceChildren(focusPanel, workPanel, mediaPanel);

  /* --- hero metric chips --- */
  const heroCounts = [
    [$("#metricCandidates"), s.total, 0],
    [$("#metricConfidence"), s.avgConfidence, 1],
    [$("#metricFocus"), s.focus.length, 0],
    [$("#metricRoles"), s.roles.length, 0],
  ];
  heroCounts.forEach(([node, value, decimals]) => {
    if (relocalizing) setCountNow(node, value, decimals);
    else animateCount(node, value, decimals);
  });

  const footerCount = $("#footerCount");
  if (footerCount) {
    footerCount.textContent = I18N.dict["footer.forms"]
      ? `${s.total} ${I18N.dict["footer.forms"]}`
      : `${s.total} forms`;
  }

  /* count-up each stat card the first time it scrolls into view.
     On a language switch the figures are already on screen, so they are written
     straight out instead of counting up from zero again. */
  const counts = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const card = entry.target;
        counts.unobserve(card);
        const target = parseFloat(card.dataset.count);
        const decimals = parseInt(card.dataset.decimals, 10) || 0;
        if (card.countNode) {
          if (relocalizing) setCountNow(card.countNode, target, decimals);
          else animateCount(card.countNode, target, decimals);
        }
      }
    },
    { threshold: 0.35 }
  );
  $$(".stat-card").forEach((card) => counts.observe(card));

  initTilt(document);
  observeReveals();
}

/* ---------- 20. Modal content ---------- */
function fieldBlock(label, wide) {
  const box = el("div", wide ? "field field--wide" : "field");
  box.appendChild(el("span", "field-label", label));
  const value = el("div", "field-value");
  box.appendChild(value);
  return { root: box, value };
}

function renderFieldRows(fieldDefs, source) {
  const wrap = el("div", "field-grid");
  for (const [key, labelKey, type] of fieldDefs) {
    const raw = source[key];
    if (raw == null || String(raw).trim() === "") continue;
    const wide = type === "text" && String(raw).length > 60;
    const labelText = fieldLabel(labelKey);
    const f = fieldBlock(labelText, wide);
    if (I18N.dict[labelKey]) f.root.querySelector(".field-label").lang = I18N.lang;
    if (type === "rating") {
      f.value.appendChild(buildRating(raw));
    } else if (type === "tags") {
      const tr = el("ul", "tag-row");
      splitList(raw).forEach((t) => tr.appendChild(buildTag(t, "focus")));
      f.value.appendChild(tr);
    } else {
      f.value.textContent = raw;
      f.value.lang = "ru";
    }
    wrap.appendChild(f.root);
  }
  return wrap;
}

function renderModalContent(c) {
  const displayName = localizedName(c);
  modalPhoto.replaceChildren(buildAvatar("lg", c.photoUrl, displayName));
  modalName.textContent = displayName;
  modalName.lang = I18N.lang;
  modalRole.textContent = c.role;
  modalRating.replaceChildren(buildRating(c.ch.q1_informatics_confidence, true));

  modalTags.replaceChildren();
  const headTags = el("ul", "tag-row");
  c.focusAreas.forEach((raw) =>
    splitList(raw).forEach((piece) => headTags.appendChild(buildTag(piece, "focus")))
  );
  if (c.ch.q6_work_preference) headTags.appendChild(buildTag(c.ch.q6_work_preference, "meta"));
  if (c.ch.q8_media_preference) headTags.appendChild(buildTag(c.ch.q8_media_preference, "ghost"));
  modalTags.appendChild(headTags);

  const frag = document.createDocumentFragment();

  /* Localized section wrapper: title from the dictionary, English fallback. */
  const section = (key, fallback, fieldDefs, data) => {
    const sec = el("section", "m-section");
    const title = el("h3", "m-title", I18N.dict[key] || fallback);
    if (I18N.dict[key]) title.lang = I18N.lang;
    sec.appendChild(title);
    sec.appendChild(renderFieldRows(fieldDefs, data));
    return sec;
  };

  const profile = section("m.title.profile", "Profile", PROFILE_FIELDS, c.ch);
  if (c.drawingText) {
    const quote = el("blockquote", "drawing-quote", c.drawingText);
    quote.lang = "ru";
    profile.appendChild(quote);
  }
  frag.appendChild(profile);

  const about = section("m.title.about", "About", ABOUT_FIELDS, c.about);
  frag.appendChild(about);

  const scan = el("section", "m-section");
  const scanTitle = el("h3", "m-title", I18N.dict["m.title.scan"] || "Application Scan");
  if (I18N.dict["m.title.scan"]) scanTitle.lang = I18N.lang;
  scan.appendChild(scanTitle);
  const figure = el("figure", "scan-frame");
  const link = el("a");
  link.target = "_blank";
  link.rel = "noopener";
  link.setAttribute(
    "aria-label",
    `Open ${displayName}’s scanned application form full size (new tab)`
  );
  const img = el("img");
  img.alt = `Scanned paper application form of ${displayName}`;
  img.loading = "lazy";
  img.decoding = "async";
  img.onload = () => {
    img.width = img.naturalWidth;
    img.height = img.naturalHeight;
  };
  link.appendChild(img);
  figure.appendChild(link);
  figure.appendChild(
    el("figcaption", "scan-caption", I18N.dict["m.scan.caption"] || "Original paper form — click to open full size")
  );
  if (I18N.dict["m.scan.caption"]) figure.querySelector(".scan-caption").lang = I18N.lang;
  scan.appendChild(figure);
  frag.appendChild(scan);
  modalBody.replaceChildren(frag);

  resolveMedia(c.slug, "form").then((url) => {
    if (!url) {
      figure.replaceChildren(
        el("p", "scan-caption", I18N.dict["m.scan.missing"] || "No scan found for this candidate.")
      );
      return;
    }
    img.src = url;
    link.href = url;
  });
}

/* ---------- 21. Invite to Interview ---------- */
function syncInviteButton(c) {
  const sent = invitedSlugs.has(c.slug);
  inviteBtn.classList.toggle("is-sent", sent);
  inviteBtn.disabled = sent;
  const label = inviteBtn.querySelector(".btn-label");
  if (label) {
    label.textContent = sent
      ? I18N.dict["m.inviteSentBtn"] || "Invitation Sent"
      : I18N.dict["m.inviteBtn"] || "Invite to Interview";
  }
  inviteNote.textContent = sent
    ? (I18N.dict["m.inviteSent"]
        ? t("m.inviteSent", { first: c.first })
        : `Interview invitation sent to ${c.first} — awaiting a reply.`)
    : I18N.dict["m.invite"] || "Interested in this candidate? Start the conversation.";
}

/* ---------- 22. Modal navigation queue (filtered pool, current view order) ---------- */
function modalQueue() {
  const container = viewMode === "catalog" ? grid : carouselTrack;
  const selector = viewMode === "catalog" ? ".card" : ".slide";
  return Array.from(container.querySelectorAll(selector))
    .filter((node) => !node.classList.contains("is-hidden"))
    .map((node) => bySlug.get(node.dataset.slug))
    .filter(Boolean);
}

function syncModalNav(c) {
  const queue = modalQueue();
  const index = queue.findIndex((item) => item.slug === c.slug);
  activeIndexInQueue = index;
  const total = queue.length || candidates.length;
  modalIndex.textContent = `${pad2((index < 0 ? 0 : index) + 1)} / ${pad2(total)}`;
  modalPrev.disabled = index <= 0;
  modalNext.disabled = index === -1 || index >= queue.length - 1;
}

function stepModal(direction) {
  const queue = modalQueue();
  const next = activeIndexInQueue + direction;
  if (next < 0 || next >= queue.length) return;
  openModal(queue[next], { keepFocus: true });
}

/* ---------- 23. Modal: open / close / focus trap ---------- */
function openModal(c, options = {}) {
  activeCandidate = c;
  if (!options.keepFocus) lastFocused = document.activeElement;
  renderModalContent(c);
  syncInviteButton(c);
  syncModalNav(c);
  if (modalScroll) modalScroll.scrollTop = 0;

  clearTimeout(closeTimer);
  modal.hidden = false;
  modal.classList.remove("is-closing");
  document.body.classList.add("modal-open");
  document.addEventListener("keydown", onModalKeydown);
  setUrlParam("c", c.slug);

  // Start from the closed state, then transition to open on the next frame.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      modal.classList.add("is-open");
      if (!options.keepFocus) modalClose.focus({ preventScroll: true });
    });
  });
  initTilt(modal);
}

function closeModal() {
  if (modal.hidden) return;
  modal.classList.remove("is-open");
  modal.classList.add("is-closing");
  document.body.classList.remove("modal-open");
  document.removeEventListener("keydown", onModalKeydown);
  setUrlParam("c", null);

  // Exit is faster than entrance (matches CSS: 150ms).
  closeTimer = setTimeout(() => {
    modal.hidden = true;
    modal.classList.remove("is-closing");
    modalBody.replaceChildren();
    activeCandidate = null;
    activeIndexInQueue = -1;
    if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
    lastFocused = null;
  }, 170);
}

function onModalKeydown(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    closeModal();
    return;
  }
  if (event.key === "ArrowRight" && !event.target.closest("input, textarea, select")) {
    event.preventDefault();
    stepModal(1);
    return;
  }
  if (event.key === "ArrowLeft" && !event.target.closest("input, textarea, select")) {
    event.preventDefault();
    stepModal(-1);
    return;
  }
  if (event.key !== "Tab") return;

  const focusables = modal.querySelectorAll(
    'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
  );
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/* =========================================================
   24 · Ambient FX — interactive symbol-matrix field
   ========================================================= */
const matrix = {
  running: false,
  setIdle: () => {},
  pointer: { x: -9999, y: -9999 },
  target: { x: -9999, y: -9999 },
};

function initMatrix() {
  const canvas = matrixCanvas;
  if (!canvas || REDUCED()) return;
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  const LEVELS = ["#4f6fc4", "#7093de", "#9dbaf9", "#c3d6ff", "#e0eaff", "#ffffff"];
  const GLYPH_COUNT = 3; // 0 dot · 1 plus · 2 diamond
  const SPRITE = 64;
  const sprites = [];

  /* pre-render every (glyph × level) combination once */
  for (let g = 0; g < GLYPH_COUNT; g += 1) {
    for (let l = 0; l < LEVELS.length; l += 1) {
      const sprite = document.createElement("canvas");
      sprite.width = SPRITE;
      sprite.height = SPRITE;
      const sctx = sprite.getContext("2d");
      sctx.translate(SPRITE / 2, SPRITE / 2);
      sctx.fillStyle = LEVELS[l];
      sctx.strokeStyle = LEVELS[l];
      if (g === 0) {
        sctx.beginPath();
        sctx.arc(0, 0, SPRITE * 0.105, 0, Math.PI * 2);
        sctx.fill();
      } else if (g === 1) {
        const arm = SPRITE * 0.26;
        sctx.lineWidth = SPRITE * 0.075;
        sctx.lineCap = "round";
        sctx.beginPath();
        sctx.moveTo(-arm, 0);
        sctx.lineTo(arm, 0);
        sctx.moveTo(0, -arm);
        sctx.lineTo(0, arm);
        sctx.stroke();
      } else {
        const r = SPRITE * 0.27;
        sctx.lineWidth = SPRITE * 0.07;
        sctx.beginPath();
        sctx.moveTo(0, -r);
        sctx.lineTo(r, 0);
        sctx.lineTo(0, r);
        sctx.lineTo(-r, 0);
        sctx.closePath();
        sctx.stroke();
      }
      sprites.push(sprite);
    }
  }

  let dpr = 1;
  let spacing = 30;
  let cols = 0;
  let rows = 0;
  let intensity = new Float32Array(0);
  let glyphOf = new Uint8Array(0);
  let width = 0;
  let height = 0;
  let last = 0;
  let idle = false;

  function measure() {
    dpr = clamp(window.devicePixelRatio || 1, 1, 1.75);
    width = window.innerWidth;
    height = window.innerHeight;
    spacing = width < 640 ? 34 : width < 1024 ? 32 : 30;
    cols = Math.ceil(width / spacing) + 2;
    rows = Math.ceil(height / spacing) + 2;
    /* keep the grid under ~4200 cells so it stays buttery on big screens */
    while (cols * rows > 4200) {
      spacing += 4;
      cols = Math.ceil(width / spacing) + 2;
      rows = Math.ceil(height / spacing) + 2;
    }
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    intensity = new Float32Array(cols * rows);
    glyphOf = new Uint8Array(cols * rows);
    for (let i = 0; i < glyphOf.length; i += 1) {
      /* deterministic sprinkle: mostly dots, occasional diamonds */
      const seed = (i * 2654435761) % 100;
      glyphOf[i] = seed < 12 ? 2 : 0;
    }
  }

  function draw(now) {
    const pointer = matrix.pointer;
    const radius = Math.max(190, Math.min(width, height) * 0.3);

    ctx.clearRect(0, 0, width, height);
    const offsetX = (pointer.x - width / 2) * 0.012;
    const offsetY = (pointer.y - height / 2) * 0.012;

    for (let row = 0; row < rows; row += 1) {
      const y = row * spacing - spacing / 2;
      for (let col = 0; col < cols; col += 1) {
        const index = row * cols + col;
        const x = col * spacing - spacing / 2;
        const dx = x - pointer.x;
        const dy = y - pointer.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        /* ambient ripple + pointer heat */
        const wave = 0.055 + 0.055 * Math.sin(now / 2400 + x * 0.021 + y * 0.018);
        const heat = dist < radius ? Math.pow(1 - dist / radius, 1.6) : 0;
        const goal = clamp(wave + heat * 1.35, 0, 1);

        const current = intensity[index];
        intensity[index] = current + (goal - current) * (goal > current ? 0.24 : 0.055);
        const value = intensity[index];
        if (value <= 0.02) continue;

        const level = clamp(Math.round(value * (LEVELS.length - 1)), 0, LEVELS.length - 1);
        const glyph = value > 0.66 ? 1 : glyphOf[index];
        const sprite = sprites[glyph * LEVELS.length + level];
        const size = spacing * (0.3 + value * 0.5);
        ctx.globalAlpha = clamp(value * 0.92, 0, 1);
        ctx.drawImage(sprite, x - size / 2 + offsetX, y - size / 2 + offsetY, size, size);
      }
    }
    ctx.globalAlpha = 1;
  }

  function loop(now) {
    if (!matrix.running) return;
    requestAnimationFrame(loop);
    if (document.hidden) return;
    /* A language swap defocuses the whole page: the field has nothing new to say
       while it is blurred, and its per-frame repaint would only compete with the
       blur for the same frames. It picks straight back up when the swap lands. */
    if (langSwapping) return;

    /* idle attractor: a slow lissajous wanders the field when nobody moves */
    if (idle) {
      matrix.target.x = width * (0.5 + 0.34 * Math.sin(now / 5200));
      matrix.target.y = height * (0.5 + 0.3 * Math.cos(now / 7100));
    }

    const p = matrix.pointer;
    const t = matrix.target;
    p.x = lerp(p.x, t.x, idle ? 0.02 : 0.17);
    p.y = lerp(p.y, t.y, idle ? 0.02 : 0.17);

    /* ~50 fps ceiling keeps the CPU cool on high-refresh displays */
    if (now - last < 19) return;
    last = now;
    draw(now);
  }

  measure();
  matrix.running = true;
  matrix.setIdle = (value) => {
    idle = value;
  };

  window.addEventListener("resize", measure);
  window.addEventListener("pointermove", (event) => {
    matrix.target.x = event.clientX;
    matrix.target.y = event.clientY;
    if (!matrix.running) return;
    matrix.pointer.x = event.clientX;
    matrix.pointer.y = event.clientY;
  });
  requestAnimationFrame(loop);
}

/* =========================================================
   25 · Ambient FX — glowing magnetic cursor
   ========================================================= */
const CURSOR_LABELS = {
  home: "Top",
  browse: "Browse",
  open: "Open profile",
  stats: "Statistics",
  prev: "Previous",
  next: "Next",
  catalog: "Full catalog",
  copy: "Copy link",
  invite: "Invite",
  close: "Close",
};
const HOT_SELECTOR =
  "a, button, [role='button'], input, select, textarea, .card, .slide, .chip, .tag, .nav-link, .footer-mail, [data-tilt]";

function initCursor() {
  if (!cursorEl || !FINE_POINTER() || REDUCED()) return;
  document.body.classList.add("has-pointer");

  const pos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const goal = { x: pos.x, y: pos.y };
  const aura = { x: pos.x, y: pos.y };

  document.addEventListener(
    "pointermove",
    (event) => {
      goal.x = event.clientX;
      goal.y = event.clientY;
      document.body.classList.add("has-pointer");
    },
    { passive: true }
  );

  document.addEventListener("pointerover", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const hot = target && target.closest(HOT_SELECTOR);
    cursorEl.classList.toggle("is-hot", Boolean(hot));
    const token = hot && hot.getAttribute("data-cursor");
    const isField = target && target.closest("input, textarea, select");
    if (token && CURSOR_LABELS[token] && !isField) {
      cursorLabel.textContent = CURSOR_LABELS[token];
      cursorEl.classList.add("is-label");
    } else {
      cursorEl.classList.remove("is-label");
    }
  });

  document.addEventListener("pointerdown", () => cursorEl.classList.add("is-down"));
  document.addEventListener("pointerup", () => cursorEl.classList.remove("is-down"));
  document.addEventListener("pointerleave", () => cursorEl.classList.remove("is-hot", "is-label"));

  (function frame() {
    pos.x = lerp(pos.x, goal.x, 0.22);
    pos.y = lerp(pos.y, goal.y, 0.22);
    aura.x = lerp(aura.x, goal.x, 0.075);
    aura.y = lerp(aura.y, goal.y, 0.075);
    cursorEl.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
    if (pointerAura) pointerAura.style.transform = `translate3d(${aura.x}px, ${aura.y}px, 0)`;
    requestAnimationFrame(frame);
  })();
}

/* magnetic elements lean towards the pointer, then spring back */
function initMagnetic(root = document) {
  if (REDUCED() || !FINE_POINTER()) return;
  root.querySelectorAll("[data-magnetic]").forEach((node) => {
    if (node.dataset.magneticReady) return;
    node.dataset.magneticReady = "1";
    const strength = Number(node.dataset.magnetic) || 8;
    node.addEventListener("pointermove", (event) => {
      const box = node.getBoundingClientRect();
      const dx = (event.clientX - (box.left + box.width / 2)) / (box.width / 2);
      const dy = (event.clientY - (box.top + box.height / 2)) / (box.height / 2);
      node.style.setProperty("--mag-x", `${clamp(dx, -1, 1) * strength}px`);
      node.style.setProperty("--mag-y", `${clamp(dy, -1, 1) * strength}px`);
    });
    node.addEventListener("pointerleave", () => {
      node.style.setProperty("--mag-x", "0px");
      node.style.setProperty("--mag-y", "0px");
    });
  });
}

/* 3D tilt + moving specular glare */
function initTilt(root = document) {
  if (REDUCED() || !FINE_POINTER()) return;
  root.querySelectorAll("[data-tilt]").forEach((node) => {
    if (node.dataset.tiltReady) return;
    node.dataset.tiltReady = "1";
    const max = 7;

    node.addEventListener("pointermove", (event) => {
      const box = node.getBoundingClientRect();
      const px = (event.clientX - box.left) / box.width;
      const py = (event.clientY - box.top) / box.height;
      node.style.transition = "transform 0.1s linear, box-shadow 0.4s var(--ease-out)";
      node.style.setProperty("--ry", `${(px - 0.5) * max * 2}deg`);
      node.style.setProperty("--rx", `${(0.5 - py) * max * 2}deg`);
      node.style.setProperty("--ty", "-6px");
      node.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
      node.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
    });

    node.addEventListener("pointerleave", () => {
      node.style.transition = "";
      node.style.setProperty("--ry", "0deg");
      node.style.setProperty("--rx", "0deg");
      node.style.setProperty("--ty", "0px");
      node.style.setProperty("--mx", "50%");
      node.style.setProperty("--my", "0%");
    });
  });
}

/* hero orb drifts with the pointer */
function initParallax() {
  const nodes = $$("[data-parallax]");
  if (!nodes.length || REDUCED() || !FINE_POINTER()) return;
  const depth = Number(nodes[0].dataset.parallax) || 18;
  const target = { x: 0, y: 0 };
  const current = { x: 0, y: 0 };
  let raf = 0;

  const render = () => {
    raf = 0;
    current.x = lerp(current.x, target.x, 0.09);
    current.y = lerp(current.y, target.y, 0.09);
    nodes.forEach((node) => {
      node.style.setProperty("--p-x", current.x.toFixed(2));
      node.style.setProperty("--p-y", current.y.toFixed(2));
    });
    if (Math.abs(current.x - target.x) > 0.05 || Math.abs(current.y - target.y) > 0.05) {
      raf = requestAnimationFrame(render);
    }
  };

  window.addEventListener(
    "pointermove",
    (event) => {
      target.x = (event.clientX / window.innerWidth - 0.5) * depth * 2;
      target.y = (event.clientY / window.innerHeight - 0.5) * depth * 2;
      if (!raf) raf = requestAnimationFrame(render);
    },
    { passive: true }
  );
}

/* reveal-on-scroll */
let revealObserver = null;
function observeReveals() {
  const nodes = $$(".reveal:not(.is-inview), [data-reveal]:not(.is-inview)");
  if (!nodes.length) return;
  if (REDUCED()) {
    nodes.forEach((node) => node.classList.add("is-inview"));
    return;
  }
  if (!revealObserver) {
    revealObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const node = entry.target;
          if (node.dataset.reveal) node.style.setProperty("--d", node.dataset.reveal);
          node.classList.add("is-inview");
          revealObserver.unobserve(node);
        }
      },
      { threshold: 0.16, rootMargin: "0px 0px -8% 0px" }
    );
  }
  nodes.forEach((node) => revealObserver.observe(node));
}

/* instant press feedback: ripple + scale on every button */
function initPressFeedback() {
  document.addEventListener("pointerdown", (event) => {
    const button = event.target.closest(".btn, .chip, .rail-btn, .carousel-nav, .search-clear");
    if (button) button.classList.add("is-pressed");
  });
  document.addEventListener("pointerup", () => {
    $$(".is-pressed").forEach((node) => node.classList.remove("is-pressed"));
  });

  document.addEventListener("click", (event) => {
    const button = event.target.closest(".btn");
    if (!button || REDUCED()) return;
    const box = button.getBoundingClientRect();
    const size = Math.max(box.width, box.height);
    const ripple = el("span", "btn-ripple");
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.left = `${event.clientX - box.left - size / 2}px`;
    ripple.style.top = `${event.clientY - box.top - size / 2}px`;
    button.appendChild(ripple);
    ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
  });
}

/* =========================================================
   26 · Scroll layer · idle choreography
   ========================================================= */
function initScrollLayer() {
  let lastY = window.scrollY;
  let raf = 0;

  const update = () => {
    raf = 0;
    const y = window.scrollY;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (scrollProgress) scrollProgress.style.width = `${max > 0 ? clamp((y / max) * 100, 0, 100) : 0}%`;
    header.classList.toggle("is-stuck", y > 14);
    const isNavOpen = document.body.classList.contains("nav-open");
    if (!isNavOpen && y > 460 && y > lastY + 6) header.classList.add("is-hidden");
    else if (y < lastY - 6 || y <= 460 || isNavOpen) header.classList.remove("is-hidden");
    lastY = y;
  };

  window.addEventListener(
    "scroll",
    () => {
      if (!raf) raf = requestAnimationFrame(update);
    },
    { passive: true }
  );
  update();

  const links = $$(".nav-link");
  const sections = links
    .map((link) => document.getElementById(link.dataset.nav))
    .filter(Boolean);
  if (!sections.length) return;

  const navObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        links.forEach((link) => link.classList.toggle("is-active", link.dataset.nav === entry.target.id));
      }
    },
    { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
  );
  sections.forEach((section) => navObserver.observe(section));
}

function initIdle() {
  if (REDUCED()) return;
  const IDLE_AFTER = 6500;

  const wake = () => {
    clearTimeout(idleTimer);
    if (document.body.classList.contains("is-idle")) {
      document.body.classList.remove("is-idle");
      matrix.setIdle(false);
      cursorEl.classList.remove("is-idle");
    }
    idleTimer = setTimeout(sleep, IDLE_AFTER);
  };

  const sleep = () => {
    if (modal && !modal.hidden) return wake();
    document.body.classList.add("is-idle");
    matrix.setIdle(true);
    cursorEl.classList.add("is-idle");
    return null;
  };

  ["pointermove", "pointerdown", "keydown", "wheel", "touchstart", "focusin"].forEach((event) =>
    window.addEventListener(event, wake, { passive: true })
  );
  wake();
}

function scrollToSection(id) {
  const node = document.getElementById(id);
  if (!node) return;
  node.scrollIntoView({ behavior: REDUCED() ? "auto" : "smooth", block: "start" });
}

/* =========================================================
   27 · Events & init
   ========================================================= */
function resetSearch() {
  searchInput.value = "";
  applyFilter("");
  searchInput.focus();
}

function initEvents() {
  searchInput.addEventListener("input", (e) => applyFilter(e.target.value));
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && e.target.value) {
      e.preventDefault();
      resetSearch();
    }
  });
  searchClear.addEventListener("click", resetSearch);
  emptyReset.addEventListener("click", resetSearch);

  // Retry affordance in the "could not load" panel (see showLoadError).
  const reloadBtn = loadError && loadError.querySelector("[data-reload]");
  if (reloadBtn) reloadBtn.addEventListener("click", () => location.reload());

  modal.addEventListener("click", (e) => {
    if (e.target.closest("[data-modal-close]")) closeModal();
  });

  modalPrev.addEventListener("click", () => stepModal(-1));
  modalNext.addEventListener("click", () => stepModal(1));

  modalCopy.addEventListener("click", async () => {
    if (!activeCandidate) return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("c", activeCandidate.slug);
      await navigator.clipboard.writeText(url.toString());
      showToast(
        I18N.dict["toast.copied"]
          ? t("toast.copied", { name: localizedName(activeCandidate) })
          : `Profile link for ${activeCandidate.full} copied`
      );
    } catch {
      showToast(I18N.dict["toast.noClipboard"] || "Clipboard unavailable in this browser");
    }
  });

  inviteBtn.addEventListener("click", () => {
    if (!activeCandidate || inviteBtn.disabled) return;
    invitedSlugs.add(activeCandidate.slug);
    syncInviteButton(activeCandidate);
    showToast(
      I18N.dict["toast.invited"]
        ? t("toast.invited", { name: localizedName(activeCandidate) })
        : `Interview invitation sent to ${activeCandidate.full}`
    );
  });

  /* ---------- Custom sort dropdown (no native <select>) ----------
     The native control is replaced by a button + listbox so the control can
     wear the site's glass language. `#sortSelect` stays as a hidden mirror of
     the current value: it keeps the form semantics, the URL/state sync and the
     existing "change" contract working. */
  const closeSort = () => {
    if (!sortWrap) return;
    sortWrap.classList.remove("is-open");
    sortTrigger.setAttribute("aria-expanded", "false");
    sortMenu.hidden = true;
  };
  const openSort = () => {
    if (!sortWrap) return;
    sortWrap.classList.add("is-open");
    sortTrigger.setAttribute("aria-expanded", "true");
    sortMenu.hidden = false;
    const active = sortOptions.find((o) => o.getAttribute("aria-selected") === "true");
    if (active) active.focus();
  };
  const setSort = (value, focusTrigger) => {
    const option = sortOptions.find((o) => o.dataset.value === value) || sortOptions[0];
    sortMode = option.dataset.value;
    sortSelect.value = sortMode;
    sortValue.textContent = option.textContent.trim();
    sortOptions.forEach((o) => o.setAttribute("aria-selected", String(o === option)));
    closeSort();
    renderCatalogOnly();
    if (focusTrigger) sortTrigger.focus();
  };
  sortTrigger.addEventListener("click", (e) => {
    e.stopPropagation();
    sortWrap.classList.contains("is-open") ? closeSort() : openSort();
  });
  sortOptions.forEach((option, index) => {
    option.addEventListener("click", () => setSort(option.dataset.value, true));
    option.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setSort(option.dataset.value, true);
        return;
      }
      let next = index;
      if (e.key === "ArrowDown") next = (index + 1) % sortOptions.length;
      else if (e.key === "ArrowUp") next = (index - 1 + sortOptions.length) % sortOptions.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = sortOptions.length - 1;
      else if (e.key === "Escape") {
        closeSort();
        sortTrigger.focus();
        return;
      } else if (e.key === "Tab") {
        closeSort();
        return;
      } else return;
      e.preventDefault();
      sortOptions[next].focus();
    });
  });
  document.addEventListener("click", (e) => {
    if (sortWrap && !e.target.closest("#sortWrap")) closeSort();
  });
  /* keep the hidden mirror in sync for anything still reading it */
  sortSelect.addEventListener("change", () => setSort(sortSelect.value, false));
  setSort(sortMode, false);

  viewSwitch.addEventListener("click", (event) => {
    const button = event.target.closest("[data-view]");
    if (!button) return;
    showView(button.dataset.view);
  });

  const goToCatalog = () => {
    showView("catalog");
    scrollToSection("candidates");
  };
  openCatalog.addEventListener("click", goToCatalog);
  heroBrowse.addEventListener("click", goToCatalog);

  /* burger menu: toggle drawer, close on link click or outside click */
  const setNavOpen = (open) => {
    navToggle.classList.toggle("active", open);
    siteNav.classList.toggle("active", open);
    document.body.classList.toggle("nav-open", open);
    navToggle.setAttribute("aria-expanded", String(open));
  };
  navToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    setNavOpen(!siteNav.classList.contains("active"));
  });
  siteNav.addEventListener("click", (e) => {
    if (e.target.closest(".nav-link")) setNavOpen(false);
  });
  document.addEventListener("click", (e) => {
    if (!siteNav.classList.contains("active")) return;
    if (e.target.closest("#navToggle, #siteNav")) return;
    setNavOpen(false);
  });

  $$("[data-footer-filter]").forEach((link) => {
    link.addEventListener("click", () => {
      const value = link.dataset.footerFilter;
      searchInput.value = value;
      applyFilter(value);
      showView("catalog");
    });
  });

  /* ---------- Language switcher ---------- */
  $$("[data-lang-switch]").forEach((group) => {
    group.addEventListener("click", (event) => {
      const btn = event.target.closest(".lang-btn");
      if (!btn) return;
      event.preventDefault();
      setLang(btn.dataset.lang);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (modal.hidden === false) return;
    if (event.key !== "/" || event.metaKey || event.ctrlKey) return;
    if (event.target.closest("input, textarea, select")) return;
    event.preventDefault();
    searchInput.focus();
    searchInput.select();
  });
}

/* ---------- Contact block ----------
   Everything the footer shows as an official channel is generated from the
   single CONTACT object, so updating the details means editing one place. */
function renderContact() {
  const box = $(".footer-contact");
  if (!box) return;
  const d = I18N.dict;
  const c = contactText();

  const line = box.querySelector(".footer-contact-line");
  if (line) {
    line.replaceChildren();
    const who = el("strong", null, `${c.person} · ${c.role}`);
    who.lang = I18N.lang;
    line.appendChild(who);
    const org = el("span", "footer-contact-org", `${c.organisation} — ${c.project}`);
    org.lang = I18N.lang;
    line.appendChild(org);
  }

  const note = box.querySelector(".footer-contact-note");
  if (note) {
    note.textContent = d["footer.contactNote"] || "Partnerships, internships and recruitment enquiries.";
    if (d["footer.contactNote"]) note.lang = I18N.lang;
  }

  const credit = $("#footerCredit");
  if (credit) {
    credit.textContent = `${d["footer.credit"] || "Built by Konstantin Samusev, 2026."} · ${CONTACT.email}`;
    if (d["footer.credit"]) credit.lang = I18N.lang;
  }

  const links = box.querySelector(".footer-contact-links");
  if (links) {
    const rows = [
      { icon: "mail", label: d["contact.email"] || "Email", value: CONTACT.email, href: CONTACT.emailUrl },
      { icon: "send", label: "Telegram", value: CONTACT.telegram, href: CONTACT.telegramUrl },
    ];
    const frag = document.createDocumentFragment();
    rows.forEach((row) => {
      const a = el("a", "footer-mail");
      a.href = row.href;
      if (/^https?:/.test(row.href)) { a.target = "_blank"; a.rel = "noopener"; }
      a.appendChild(contactIcon(row.icon));
      const text = el("span", "footer-mail-text");
      const lbl = el("span", "footer-mail-label", row.label);
      if (d["contact.email"]) lbl.lang = I18N.lang;
      const val = el("span", "footer-mail-value", row.value);
      val.lang = "en";
      text.appendChild(lbl);
      text.appendChild(val);
      a.appendChild(text);
      frag.appendChild(a);
    });
    links.replaceChildren(frag);
  }
}

function contactIcon(kind) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.5");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  const shapes = {
    mail: "M1.8 3.2h12.4v9.6H1.8zM2.6 4.6L8 8.6l5.4-4",
    send: "M14.2 1.8L7.4 8.6m6.8-6.8L9.6 14.2 7.4 8.6 1.8 6.4z",
  };
  path.setAttribute("d", shapes[kind] || shapes.mail);
  svg.appendChild(path);
  return svg;
}

async function init() {
  /* i18n first: every renderer below reads the dictionary. */
  I18N.lang = readStoredLang();
  /* Persist the resolved language on first load so the choice is explicit
     rather than implied by a missing key. */
  storeLang(I18N.lang);
  captureOriginals();
  await loadLocale(I18N.lang);
  applyI18n();
  renderContact();
  /* Warm the other language now, so a later switch has no network wait. */
  prefetchLocales();

  initMatrix();
  initCursor();
  initMagnetic();
  initParallax();
  initCarousel();
  initScrollLayer();
  initIdle();
  initPressFeedback();
  initEvents();
  observeReveals();

  requestAnimationFrame(() => {
    document.body.classList.remove("is-booting");
    document.body.classList.add("is-ready");
  });

  let ok = false;
  try {
    ok = await loadCandidates();
  } catch (error) {
    console.error("Portal: could not build the candidate pool", error);
  }
  if (!ok) return;

  const params = new URLSearchParams(window.location.search);
  const q = params.get("q") || "";
  if (q) searchInput.value = q;
  applyFilter(searchInput.value);
  if (q) showView("catalog", { force: true });

  const slug = params.get("c");
  if (slug && bySlug.has(slug)) openModal(bySlug.get(slug));
}

init();
