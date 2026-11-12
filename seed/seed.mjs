// seed.mjs — Gendler Girls memorial site seed generator.
//
// Reads the dataset (seed/content.json, a copy of the extracted family
// content — fine to commit) and generates seed/seed.sql: idempotent
// INSERT OR IGNORE statements for the `entities` and `settings` tables.
//
// All copy comes VERBATIM from content.json. Nothing is invented:
// empty sections stay empty (timeline bodies "", story placeholders "").
// Run:  node seed/seed.mjs            (from the repo root, or anywhere —
//                                     paths resolve relative to this file)
// Then: wrangler d1 execute gendler-girls --local  --file seed/seed.sql
//       wrangler d1 execute gendler-girls --remote --file seed/seed.sql

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const content = JSON.parse(readFileSync(join(HERE, "content.json"), "utf8"));

const SECTIONS = [
  "home",
  "their-story",
  "testimonies",
  "their-legacy",
  "public-appearances",
  "references",
  "family",
];

// Fixed timestamp so the generated SQL is deterministic / diffable.
const TS = "2026-11-12T00:00:00Z";

// ---------------------------------------------------------------- helpers

const esc = (s) => `'${String(s).replace(/'/g, "''")}'`;
const j = (v) => JSON.stringify(v);
const sqlNull = (v) => (v === null || v === undefined ? "NULL" : esc(v));

// Paragraph texts after the heading with `startText`, stopping at the next
// heading (h1–h4) or end of blocks. Returns the paragraphs joined with
// blank lines (the speech/story body format).
function paragraphsAfter(blocks, startText) {
  const start = blocks.findIndex(
    (b) => b.type.startsWith("h") && b.text === startText,
  );
  if (start === -1) throw new Error(`heading not found: ${startText}`);
  const out = [];
  for (let i = start + 1; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type.startsWith("h")) break;
    if (b.type === "p") out.push(b.text);
  }
  return out;
}

// Paragraph texts between two headings (exclusive of both).
function paragraphsBetween(blocks, startText, endText) {
  const start = blocks.findIndex(
    (b) => b.type.startsWith("h") && b.text === startText,
  );
  if (start === -1) throw new Error(`heading not found: ${startText}`);
  const out = [];
  for (let i = start + 1; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type.startsWith("h") && b.text === endText) break;
    if (b.type.startsWith("h")) break;
    if (b.type === "p") out.push(b.text);
  }
  return out;
}

const joinParas = (paras) => paras.join("\n\n");

// ---------------------------------------------------------------- entities

const entities = [];
const pos = Object.fromEntries(SECTIONS.map((s) => [s, 0]));

function add(e) {
  if (!SECTIONS.includes(e.data.section)) {
    throw new Error(`bad section for ${e.id}: ${e.data.section}`);
  }
  entities.push({
    id: e.id,
    type: e.type,
    slug: e.slug,
    title: e.title,
    data: e.data,
    position: pos[e.data.section]++,
    visible: 1,
    album: e.album ?? null,
    image_key: e.image_key ?? null,
  });
}

// ------------------------------------------------------------------ photos
// Captions/alt: WordPress alt text verbatim from wp-media.json; Wix photos
// described from the images themselves (see seed/IMAGES.md). Album
// assignment is sensible-but-not-recoverable from the old site — the family
// can reassign in admin. `album` holds the album SLUG (matches the album
// entity's slug) — this is what the admin dropdown stores and the public
// frontend matches on.

const PHOTOS = [
  // --- home (no album) ---
  {
    id: "photo-gendler-hero", slug: "gendler-hero",
    title: "Leah and Naomi (hero photo)", file: "gendler-hero.jpg",
    section: "home", album: null,
    caption: "Two young women in period coats smile warmly for the camera outdoors.",
    alt: "Two young women in period coats smile warmly for the camera outdoors.",
  },
  {
    id: "photo-sisters2", slug: "sisters2",
    title: "Family outing by the coast", file: "sisters2.jpg",
    section: "home", album: null,
    caption: "Two men and two women in sun hats pose together outdoors near the coast.",
    alt: "Two men and two women in sun hats pose together outdoors near the coast.",
  },
  {
    id: "photo-chaya", slug: "chaya",
    title: "Two women in fur-collared coats", file: "chaya.jpg",
    section: "home", album: null,
    caption: "Two women in fur-collared coats smile together indoors, with onlookers visible behind them.",
    alt: "Two women in fur-collared coats smile together indoors, with onlookers visible behind them.",
  },
  // --- Leah's Family Photos ---
  {
    id: "photo-leah-naomi-gendler", slug: "leah-naomi-gendler",
    title: "Leah and Naomi — vintage portrait", file: "leah-naomi-gendler.jpg",
    section: "their-legacy", album: "leahs-family-photos",
    caption: "Two young women smile warmly together in a faded vintage portrait, one wearing a pearl necklace.",
    alt: "Two young women smile warmly together in a faded vintage portrait, one wearing a pearl necklace.",
  },
  {
    id: "photo-sisters1", slug: "sisters1",
    title: "Leah and Naomi indoors", file: "sisters1.jpg",
    section: "their-legacy", album: "leahs-family-photos",
    caption: "Two women in fur-trimmed coats smile together indoors, other people visible behind them.",
    alt: "Two women in fur-trimmed coats smile together indoors, other people visible behind them.",
  },
  // --- Naomi's Family Photos ---
  {
    id: "photo-sisters1-full", slug: "sisters1-full",
    title: "Leah and Naomi in fur-trimmed coats", file: "sisters1-full.jpg",
    section: "their-legacy", album: "naomis-family-photos",
    caption: "Two women in fur-trimmed coats smile together in a crowded indoor space.",
    alt: "Two women in fur-trimmed coats smile together in a crowded indoor space.",
  },
  {
    id: "photo-sisters2-webp", slug: "sisters2-webp",
    title: "Family outing by the shore", file: "sisters2-webp.jpg",
    section: "their-legacy", album: "naomis-family-photos",
    caption: "Two men and two women in sun hats stand smiling together outdoors near a tree-lined shore.",
    alt: "Two men and two women in sun hats stand smiling together outdoors near a tree-lined shore.",
  },
  // --- Misc. Photos ---
  {
    id: "photo-camp", slug: "camp",
    title: "Camp barracks", file: "camp.jpg",
    section: "their-legacy", album: "misc-photos",
    caption: "Rows of brick barracks lined with barbed-wire fencing lead toward a distant guard tower.",
    alt: "Rows of brick barracks lined with barbed-wire fencing lead toward a distant guard tower.",
  },
  {
    id: "photo-candles", slug: "candles",
    title: "Memorial candles", file: "candles.jpg",
    section: "their-legacy", album: "misc-photos",
    caption: "Rows of lit votive candles glow warmly in glass holders, a symbol of remembrance.",
    alt: "Rows of lit votive candles glow warmly in glass holders, a symbol of remembrance.",
  },
  {
    id: "photo-leah-and-naomi-gendler", slug: "leah-and-naomi-gendler",
    title: "Leah and Naomi — sepia portrait", file: "leah-and-naomi-gendler.jpg",
    section: "their-legacy", album: "misc-photos",
    caption: "Two young women smile together in a vintage sepia-toned portrait, one wearing pearls.",
    alt: "Two young women smile together in a vintage sepia-toned portrait, one wearing pearls.",
  },
  {
    id: "photo-sisters0", slug: "sisters0",
    title: "The two sisters outdoors", file: "sisters0.jpg",
    section: "their-legacy", album: "misc-photos",
    caption: "Two sisters smile together outdoors, one in a tailored jacket, the other in a light coat.",
    alt: "Two sisters smile together outdoors, one in a tailored jacket, the other in a light coat.",
  },
  {
    id: "photo-wix-img-3225", slug: "wix-img-3225",
    title: "Leah and Naomi — black and white", file: "wix-IMG_3225.jpg",
    section: "their-legacy", album: "misc-photos",
    caption: "Two women in dark fur-collared coats smile together indoors, in a black-and-white photograph.",
    alt: "Two women in dark fur-collared coats smile together indoors, in a black-and-white photograph.",
  },
  {
    id: "photo-wix-photo-2023-04-16", slug: "wix-photo-2023-04-16",
    title: "Leah and Naomi as young women", file: "wix-PHOTO-2023-04-16.jpg",
    section: "their-legacy", album: "misc-photos",
    caption: "Two young women smile together in a vintage sepia-toned outdoor portrait.",
    alt: "Two young women smile together in a vintage sepia-toned outdoor portrait.",
  },
  {
    id: "photo-wix-family-israel", slug: "wix-family-israel",
    title: "Family in Israel", file: "wix-family-israel.jpg",
    section: "their-legacy", album: "misc-photos",
    caption: "Two couples pose together outdoors near the water on a sunny day.",
    alt: "Two couples pose together outdoors near the water on a sunny day.",
  },
  // --- References (no album) ---
  {
    id: "photo-chattanooga", slug: "chattanooga",
    title: "Chattanooga News front page, March 23, 1939", file: "chattanooga.jpg",
    section: "references", album: null,
    caption: "The front page of the Chattanooga News March 23, 1939 features the headline of Hitler's speech in Memel.",
    alt: "Front page of the Chattanooga News, March 23, 1939.",
  },
  {
    id: "photo-wix-img-20180408", slug: "wix-img-20180408",
    title: "Chattanooga News front page, March 23, 1939 (Wix original)",
    file: "wix-IMG_20180408.jpg",
    section: "references", album: null,
    caption: "The front page of the Chattanooga News, March 23, 1939.",
    alt: "Photograph of the front page of The Chattanooga News, March 23, 1939, with the headline about Hitler in Memel.",
  },
];

// ------------------------------------------------------------------ albums

const ALBUMS = [
  { id: "album-leah-family-photos", slug: "leahs-family-photos", title: "Leah's Family Photos" },
  { id: "album-naomi-family-photos", slug: "naomis-family-photos", title: "Naomi's Family Photos" },
  { id: "album-misc-photos", slug: "misc-photos", title: "Misc. Photos" },
  { id: "album-naomi-90th-birthday", slug: "naomis-90th-birthday", title: "Naomi's 90th Birthday" },
];

// ------------------------------------------------------------------ videos
// Titles are the real YouTube titles from content.json. Descriptions are
// the labels from content.json — except Naomi's Story, whose description is
// the "In Their Own Words" intro text from the home page (verbatim), which
// describes exactly this documentary interview.

const VIDEO_META = {
  RYo37fxAh1I: { id: "video-naomi-story", slug: "naomi-story", section: "their-story" },
  "8gzAgUUEjjM": { id: "video-leah-story", slug: "leah-story", section: "their-story" },
  aVm6f8G8CNU: { id: "video-silver-cousins", slug: "silver-cousins-interview", section: "testimonies" },
  MndvSjE4sJM: { id: "video-naomi-90th", slug: "naomi-90th-birthday", section: "their-legacy" },
  msR2XLuvcro: { id: "video-ap-footage", slug: "ap-archival-footage", section: "references" },
};

// ------------------------------------------------------- extract from blocks

const home = content.pages.home.blocks;
const legacy = content.pages["their-legacy"].blocks;
const theirStory = content.pages["their-story"].blocks;
const references = content.pages.references.blocks;

// Home text blocks (verbatim paragraphs under each heading).
const heroIntro = joinParas(paragraphsBetween(home, "Sisters. Holocaust Survivors. Witnesses.", "The Timeline"));
const preserving = joinParas(paragraphsAfter(home, "Preserving Their Story"));
const ownWords = joinParas(paragraphsAfter(home, "In Their Own Words"));
const chayaText = joinParas(paragraphsAfter(home, "The Sister Who Did Not Survive"));
const mission = joinParas(paragraphsAfter(home, "Our Mission"));

// Timeline: year headings only — bodies stay EMPTY (no body text on old site).
const timelineStart = home.findIndex((b) => b.text === "The Timeline");
const timelineYears = [];
for (let i = timelineStart + 1; i < home.length; i++) {
  if (home[i].type === "h3") timelineYears.push(home[i].text);
  else if (home[i].type === "img") break;
}

// Their Story intro.
const inTheirWords = joinParas(paragraphsAfter(theirStory, "In Their Words"));

// Legacy: speeches intro + the three levayah speeches in full.
const speechesIntro = joinParas(paragraphsAfter(legacy, "Leah Fink - Speeches"));
const arthurBody = joinParas(
  paragraphsBetween(legacy, "Arthur Fink – Son", "Bubby (1920 – 2017) Speech"),
);
// Eli's body includes the byline paragraph ("Written and delivered by Eli
// Fink – Grandson") — it is part of the published speech text on the old
// site; author/role fields carry the same info for display.
const eliBody = joinParas(
  paragraphsBetween(legacy, "Bubby (1920 – 2017) Speech", "2/19/2017"),
);
const howieBody = joinParas(
  paragraphsAfter(legacy, "By Howie Falkenstein – Grandson"),
);

// Joel's Notes intro (both paragraphs, verbatim).
const joelsNotes = joinParas(paragraphsAfter(legacy, "Joel's Notes"));

// References: AP footage timestamp note (h2 block, verbatim).
const apNote = references.find(
  (b) => b.type === "h2" && b.text.startsWith("In this archival footage"),
).text;

// Sanity checks — fail loudly rather than seeding truncated content.
for (const [name, v] of [
  ["heroIntro", heroIntro], ["preserving", preserving], ["ownWords", ownWords],
  ["chayaText", chayaText], ["mission", mission], ["inTheirWords", inTheirWords],
  ["speechesIntro", speechesIntro], ["arthurBody", arthurBody],
  ["eliBody", eliBody], ["howieBody", howieBody], ["joelsNotes", joelsNotes],
  ["apNote", apNote],
]) {
  if (!v || !v.length) throw new Error(`empty extracted text: ${name}`);
}
if (timelineYears.length !== 6) throw new Error(`expected 6 timeline years, got ${timelineYears.length}`);
if (content.videos.length !== 5) throw new Error(`expected 5 videos, got ${content.videos.length}`);
if (!content.dad_bio_draft.text.includes("_______________")) {
  throw new Error("dad bio draft is missing its blank fields — refusing to seed a cleaned-up copy");
}

// ------------------------------------------------------------- build entities
// Positions are assigned per section in insertion order (0, 1, 2, …).

// --- home ---
add({ ...PHOTOS[0], type: "photo", data: { section: "home", caption: PHOTOS[0].caption, alt: PHOTOS[0].alt }, image_key: `/images/${PHOTOS[0].file}` });
add({ id: "text-home-hero-intro", slug: "home-hero-intro", type: "text_block", title: "Sisters. Holocaust Survivors. Witnesses.", data: { section: "home", body: heroIntro, variant: "hero-intro" } });
for (const year of timelineYears) {
  add({
    id: `timeline-${year.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
    slug: `timeline-${year.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
    type: "timeline_entry", title: year,
    data: { section: "home", year_label: year, body: "" },
  });
}
add({ ...PHOTOS[1], type: "photo", data: { section: "home", caption: PHOTOS[1].caption, alt: PHOTOS[1].alt }, image_key: `/images/${PHOTOS[1].file}` });
add({ id: "text-home-preserving", slug: "home-preserving-their-story", type: "text_block", title: "Preserving Their Story", data: { section: "home", body: preserving, variant: "section-intro" } });
add({ id: "text-home-own-words", slug: "home-in-their-own-words", type: "text_block", title: "In Their Own Words", data: { section: "home", body: ownWords, variant: "section-intro" } });
add({ ...PHOTOS[2], type: "photo", data: { section: "home", caption: PHOTOS[2].caption, alt: PHOTOS[2].alt }, image_key: `/images/${PHOTOS[2].file}` });
add({ id: "text-home-chaya", slug: "home-sister-who-did-not-survive", type: "text_block", title: "The Sister Who Did Not Survive", data: { section: "home", body: chayaText, variant: "section-intro" } });
add({ id: "text-home-mission", slug: "home-our-mission", type: "text_block", title: "Our Mission", data: { section: "home", body: mission, variant: "section-intro" } });

// --- their-story ---
add({ id: "text-their-story-intro", slug: "their-story-in-their-words", type: "text_block", title: "In Their Words", data: { section: "their-story", body: inTheirWords, variant: "section-intro" } });
for (const v of content.videos) {
  const meta = VIDEO_META[v.id];
  if (!meta || meta.section !== "their-story") continue;
  const description = v.id === "RYo37fxAh1I" ? ownWords : v.label;
  add({ id: meta.id, slug: meta.slug, type: "video", title: v.title, data: { section: "their-story", youtube_id: v.id, description } });
  // Written-story placeholder: empty on the old site; the video carries it.
  const label = v.id === "RYo37fxAh1I" ? "Naomi's Story" : "Leah's Story";
  const sid = v.id === "RYo37fxAh1I" ? "story-naomi" : "story-leah";
  const sslug = v.id === "RYo37fxAh1I" ? "naomi-written-story" : "leah-written-story";
  add({ id: sid, slug: sslug, type: "story", title: label, data: { section: "their-story", body: "" } });
}

// --- testimonies ---
{
  const v = content.videos.find((x) => x.id === "aVm6f8G8CNU");
  const meta = VIDEO_META[v.id];
  add({ id: meta.id, slug: meta.slug, type: "video", title: v.title, data: { section: "testimonies", youtube_id: v.id, description: v.label } });
}

// --- their-legacy ---
for (const a of ALBUMS) {
  add({ id: a.id, slug: a.slug, type: "album", title: a.title, data: { section: "their-legacy", description: "" } });
}
// Album photos (indices 3–13 of PHOTOS), in album order.
for (const p of PHOTOS.slice(3, 14)) {
  add({ ...p, type: "photo", data: { section: "their-legacy", caption: p.caption, alt: p.alt }, image_key: `/images/${p.file}` });
}
{
  const v = content.videos.find((x) => x.id === "MndvSjE4sJM");
  const meta = VIDEO_META[v.id];
  add({ id: meta.id, slug: meta.slug, type: "video", title: v.title, data: { section: "their-legacy", youtube_id: v.id, description: v.label } });
}
add({ id: "text-legacy-speeches-intro", slug: "legacy-speeches-intro", type: "text_block", title: "Leah Fink - Speeches", data: { section: "their-legacy", body: speechesIntro, variant: "section-intro" } });
add({ id: "speech-arthur-fink", slug: "arthur-fink", type: "speech", title: "Arthur Fink", data: { section: "their-legacy", author: "Arthur Fink", role: "Son", date: "", body: arthurBody } });
add({ id: "speech-eli-fink", slug: "eli-fink", type: "speech", title: "Bubby (1920–2017) Speech", data: { section: "their-legacy", author: "Eli Fink", role: "Grandson", date: "", body: eliBody } });
add({ id: "speech-howie-falkenstein", slug: "howie-falkenstein", type: "speech", title: "Howie Falkenstein", data: { section: "their-legacy", author: "Howie Falkenstein", role: "Grandson", date: "2/19/2017", body: howieBody } });
add({ id: "text-legacy-joels-notes", slug: "legacy-joels-notes", type: "text_block", title: "Joel's Notes", data: { section: "their-legacy", body: joelsNotes, variant: "section-intro" } });

// --- references ---
{
  const v = content.videos.find((x) => x.id === "msR2XLuvcro");
  const meta = VIDEO_META[v.id];
  add({ id: meta.id, slug: meta.slug, type: "video", title: v.title, data: { section: "references", youtube_id: v.id, description: v.label } });
}
add({ id: "reference-ap-footage", slug: "ap-archival-footage-note", type: "reference", title: "Associated Press Archival Footage", data: { section: "references", body: apNote, youtube_id: "msR2XLuvcro" } });
for (const p of PHOTOS.slice(14)) {
  add({ ...p, type: "photo", data: { section: "references", caption: p.caption, alt: p.alt }, image_key: `/images/${p.file}` });
}

// --- family ---
// The Irwin Jacobson bio draft, VERBATIM — blanks ("born in _______________")
// and typos intact. Marked draft in data so the frontend shows a draft banner.
add({
  id: "story-irwin-jacobson", slug: "irwin-jacobson", type: "story",
  title: "Irwin Jacobson",
  data: { section: "family", body: content.dad_bio_draft.text, draft: true },
});

// No appearances and no note_pages are seeded — both are empty on the old
// site; the family adds them via admin.

// Uniqueness checks.
for (const key of ["id", "slug"]) {
  const seen = new Set();
  for (const e of entities) {
    if (seen.has(e[key])) throw new Error(`duplicate ${key}: ${e[key]}`);
    seen.add(e[key]);
  }
}

// ------------------------------------------------------------------ settings

const settings = {
  site_title: content.site.title,
  site_subtitle: content.site.subtitle,
  contact_note: content.site.contact_note,
  hero_image: "/images/gendler-hero.jpg",
  featured_video: "RYo37fxAh1I",
  theme: "warm",
  section_order: SECTIONS,
  section_visibility: Object.fromEntries(SECTIONS.map((s) => [s, true])),
};

// ------------------------------------------------------------------- emit SQL

const lines = [];
lines.push("-- Gendler Girls — seed data. Generated by seed/seed.mjs from seed/content.json.");
lines.push("-- Idempotent: every statement is INSERT OR IGNORE, so re-running is safe.");
lines.push("-- Regenerate with: node seed/seed.mjs");
lines.push("");
for (const [key, value] of Object.entries(settings)) {
  lines.push(
    `INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (${esc(key)}, ${esc(j(value))}, ${esc(TS)});`,
  );
}
lines.push("");
for (const e of entities) {
  lines.push(
    `INSERT OR IGNORE INTO entities (id, type, slug, title, data, position, visible, album, image_key, created_at, updated_at, deleted_at) VALUES (${esc(e.id)}, ${esc(e.type)}, ${esc(e.slug)}, ${esc(e.title)}, ${esc(j(e.data))}, ${e.position}, ${e.visible}, ${sqlNull(e.album)}, ${sqlNull(e.image_key)}, ${esc(TS)}, ${esc(TS)}, NULL);`,
  );
}
lines.push("");

const counts = {};
for (const e of entities) counts[e.type] = (counts[e.type] ?? 0) + 1;
lines.push(`-- Entities: ${entities.length} total — ` +
  Object.entries(counts).map(([t, n]) => `${t} ${n}`).join(", ") +
  `. Settings: ${Object.keys(settings).length}.`);

writeFileSync(join(HERE, "seed.sql"), lines.join("\n"), "utf8");
console.log(`seed.sql written: ${entities.length} entities, ${Object.keys(settings).length} settings`);
console.log(counts);
