/* Gendler Girls — Admin SPA. Vanilla JS, no framework.
 *
 * Talks to the /api/admin/* endpoints (session cookie auth).
 * Every fetch uses credentials: "same-origin". On 401 we return to the
 * login screen with a "session expired" message.
 */
"use strict";

/* ---------------- Constants ---------------- */

const SECTIONS = [
  ["home", "Home"],
  ["their-story", "Their Story"],
  ["testimonies", "Testimonies"],
  ["their-legacy", "Their Legacy"],
  ["public-appearances", "Public Appearances"],
  ["references", "References"],
  ["family", "Family"],
];
const SECTION_LABELS = Object.fromEntries(SECTIONS);
const SECTION_KEYS = SECTIONS.map(([k]) => k);

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

/* Per-type form definition.
 * kind: text | textarea | select | checkbox | youtube | image | album | section
 *  - "title" is the entity's top-level title (not in data).
 *  - "album" is the entity's top-level album (not in data).
 *  - "image" is the entity's top-level image_key (not in data).
 *  - "section" lives in data.section.
 *  - everything else lives in data.
 * titleFrom: for types with no title field, the title is derived from this
 * data field (used for the list view + slug generation).
 */
const TYPE_CONFIG = {
  photo: {
    label: "Photo", plural: "Photos", icon: "🖼️", titleFrom: "caption",
    fields: [
      { kind: "image" },
      { kind: "text", key: "caption", label: "Caption", placeholder: "What is shown in this photo?" },
      { kind: "album" },
      { kind: "section" },
    ],
  },
  video: {
    label: "Video", plural: "Videos", icon: "▶️",
    fields: [
      { kind: "text", key: "title", label: "Title", required: true },
      { kind: "youtube", key: "youtube_id", label: "YouTube link or video ID", required: true,
        hint: "Paste a full YouTube link (youtube.com or youtu.be) or just the video ID." },
      { kind: "textarea", key: "description", label: "Description", rows: 3 },
      { kind: "section" },
    ],
  },
  speech: {
    label: "Speech", plural: "Speeches", icon: "🎤",
    fields: [
      { kind: "text", key: "title", label: "Title", required: true },
      { kind: "text", key: "author", label: "Author" },
      { kind: "text", key: "role", label: "Role", placeholder: "e.g. Grandson" },
      { kind: "text", key: "date", label: "Date" },
      { kind: "textarea", key: "body", label: "Speech text", rows: 14, required: true },
      { kind: "section", def: "their-legacy" },
    ],
  },
  story: {
    label: "Story", plural: "Stories", icon: "📖",
    fields: [
      { kind: "text", key: "title", label: "Title", required: true },
      { kind: "textarea", key: "body", label: "Story", rows: 14, required: true },
      { kind: "checkbox", key: "draft", label: "Draft — not finished yet" },
      { kind: "section" },
    ],
  },
  timeline_entry: {
    label: "Timeline entry", plural: "Timeline", icon: "📅", titleFrom: "year_label",
    fields: [
      { kind: "text", key: "year_label", label: "Year or date label", required: true, placeholder: "e.g. 1944" },
      { kind: "textarea", key: "body", label: "What happened", rows: 5, required: true },
      { kind: "section", def: "home" },
    ],
  },
  reference: {
    label: "Reference", plural: "References", icon: "🔗",
    fields: [
      { kind: "text", key: "title", label: "Title", required: true },
      { kind: "textarea", key: "body", label: "Text", rows: 6, required: true },
      { kind: "youtube", key: "youtube_id", label: "YouTube link (optional)",
        hint: "Optional — paste a YouTube link if this reference has a video." },
      { kind: "section", def: "references" },
    ],
  },
  appearance: {
    label: "Public appearance", plural: "Public Appearances", icon: "🎙️",
    fields: [
      { kind: "text", key: "title", label: "Title", required: true },
      { kind: "text", key: "date_label", label: "Date" },
      { kind: "text", key: "place", label: "Place" },
      { kind: "textarea", key: "body", label: "Description", rows: 6 },
      { kind: "section", def: "public-appearances" },
    ],
  },
  note_page: {
    label: "Joel's Note page", plural: "Joel's Notes", icon: "📝", titleFrom: "transcription",
    fields: [
      { kind: "image" },
      { kind: "textarea", key: "transcription", label: "Transcription", rows: 10,
        hint: "Type out what the handwritten page says." },
      { kind: "section", def: "their-legacy" },
    ],
  },
  text_block: {
    label: "Page text", plural: "Page Text", icon: "✏️",
    fields: [
      { kind: "text", key: "title", label: "Title", required: true },
      { kind: "textarea", key: "body", label: "Text", rows: 10, required: true },
      { kind: "section" },
    ],
  },
  album: {
    label: "Album", plural: "Albums", icon: "📚",
    fields: [
      { kind: "text", key: "title", label: "Album name", required: true },
      { kind: "textarea", key: "description", label: "Description", rows: 4 },
    ],
  },
};
const TYPE_ORDER = Object.keys(TYPE_CONFIG);

/* ---------------- State ---------------- */

const viewEl = document.getElementById("view");
const toastEl = document.getElementById("toast");
const topbarNav = document.getElementById("topbar-nav");
let toastTimer = null;
let albumsCache = null;   // album entities, for dropdowns
let photosCache = null;   // photo entities, for the library picker + hero pick
let videosCache = null;   // video entities, for the featured-video pick

/* ---------------- Helpers ---------------- */

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function parseData(entity) {
  if (!entity) return {};
  if (typeof entity.data === "string") {
    try { return JSON.parse(entity.data) || {}; } catch { return {}; }
  }
  return entity.data || {};
}

function parseSettingValue(v) {
  if (typeof v === "string") {
    try { return JSON.parse(v); } catch { return v; }
  }
  return v;
}

function imageUrl(imageKey) {
  if (!imageKey) return "";
  return imageKey.startsWith("/") ? imageKey : "/uploads/" + imageKey;
}

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "item";
}

/* Accepts a full youtube.com/watch?v= link, youtu.be/ link, /embed/ or
 * /shorts/ link, or a bare 11-char ID. Returns the ID or null. */
function extractYouTubeId(input) {
  const s = String(input || "").trim();
  if (!s) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/(?:[?&]v=|\/embed\/|\/shorts\/|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

function youtubeThumb(id) {
  return id ? "https://i.ytimg.com/vi/" + id + "/mqdefault.jpg" : "";
}

function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d) ? String(iso) : d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function showToast(msg, kind) {
  toastEl.textContent = msg;
  toastEl.className = "toast" + (kind ? " " + kind : "");
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 4000);
}

/* Disable a button and show a working label; returns a restore function. */
function busy(btn, label) {
  if (!btn) return () => {};
  const prev = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = label || "Saving…";
  return () => { btn.disabled = false; btn.innerHTML = prev; };
}

function errorMessage(err) {
  return (err && err.message) ? err.message : "Something went wrong. Please try again.";
}

/* ---------------- API ---------------- */

async function api(path, options) {
  const opts = Object.assign({ credentials: "same-origin" }, options || {});
  const res = await fetch(path, opts);
  if (res.status === 401) {
    // Session expired or not logged in — back to the login screen.
    showLogin("Your session expired — please log in again.");
    throw new Error("__unauthorized__");
  }
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body.error || body.message || "";
    } catch { /* not JSON */ }
    throw new Error(detail || ("Request failed (" + res.status + ")"));
  }
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

const apiGet = (path) => api(path);
const apiJson = (path, method, body) => api(path, {
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/* ---------------- Cached lookups ---------------- */

async function getAlbums() {
  if (!albumsCache) {
    const list = await apiGet("/api/admin/entities?type=album");
    albumsCache = (Array.isArray(list) ? list : []).filter((e) => !e.deleted_at);
  }
  return albumsCache;
}

async function getPhotos() {
  if (!photosCache) {
    const list = await apiGet("/api/admin/entities?type=photo");
    photosCache = (Array.isArray(list) ? list : []).filter((e) => !e.deleted_at);
  }
  return photosCache;
}

async function getVideos() {
  if (!videosCache) {
    const list = await apiGet("/api/admin/entities?type=video");
    videosCache = (Array.isArray(list) ? list : []).filter((e) => !e.deleted_at);
  }
  return videosCache;
}

function invalidateCaches() {
  albumsCache = null;
  photosCache = null;
  videosCache = null;
}

/* ---------------- Login ---------------- */

function showLogin(message) {
  topbarNav.hidden = true;
  viewEl.innerHTML = `
    <div class="login-box">
      <h1>Gendler Girls</h1>
      <p class="lede">Family admin — add and edit the memorial site.</p>
      ${message ? `<div class="form-error">${esc(message)}</div>` : ""}
      <form id="login-form">
        <div class="field">
          <label for="password">Family password</label>
          <input type="password" id="password" name="password" autocomplete="current-password" required autofocus>
        </div>
        <button class="btn btn-block" type="submit" id="login-btn">Log in</button>
      </form>
    </div>`;
  document.getElementById("login-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const btn = document.getElementById("login-btn");
    const restore = busy(btn, "Logging in…");
    const password = document.getElementById("password").value;
    try {
      await apiJson("/api/admin/login", "POST", { password });
      topbarNav.hidden = false;
      showToast("Welcome back!", "success");
      renderDashboard();
    } catch (err) {
      restore();
      if (err.message === "__unauthorized__") return;
      showLogin("Wrong password — please try again.");
    }
  });
}

document.getElementById("logout-btn").addEventListener("click", async (ev) => {
  const restore = busy(ev.currentTarget, "Logging out…");
  try { await apiJson("/api/admin/logout", "POST", {}); } catch { /* ignore */ }
  restore();
  showLogin();
});

/* ---------------- Dashboard ---------------- */

async function renderDashboard() {
  topbarNav.hidden = false;
  viewEl.innerHTML = `<h1>What would you like to do?</h1>
    <p class="lede">Pick a section to add, edit, hide, or reorder content. Nothing is ever permanently deleted — removed items go to the Trash.</p>
    <div class="card-grid" id="dash-grid"><p class="loading">Loading…</p></div>`;

  // Fetch a count per type in parallel; a failed fetch just shows no count.
  const counts = {};
  await Promise.all(TYPE_ORDER.map(async (type) => {
    try {
      const list = await apiGet("/api/admin/entities?type=" + type);
      counts[type] = (Array.isArray(list) ? list : []).filter((e) => !e.deleted_at).length;
    } catch { counts[type] = null; }
  }));
  let trashCount = null;
  try {
    const trash = await apiGet("/api/admin/trash");
    trashCount = Array.isArray(trash) ? trash.length : 0;
  } catch { /* ignore */ }

  const grid = document.getElementById("dash-grid");
  if (!grid) return; // user navigated away while loading
  grid.innerHTML =
    TYPE_ORDER.map((type) => {
      const cfg = TYPE_CONFIG[type];
      const count = counts[type];
      return `<button class="card" type="button" data-nav="list" data-type="${type}">
        <span class="card-title">${cfg.icon} ${cfg.plural}</span>
        <span class="card-sub">${count == null ? "" : `<span class="card-count">${count}</span> item${count === 1 ? "" : "s"} — `}add, edit, hide, reorder</span>
      </button>`;
    }).join("") +
    `<button class="card card-danger" type="button" data-nav="trash">
      <span class="card-title">🗑️ Trash</span>
      <span class="card-sub">${trashCount == null ? "" : `<span class="card-count">${trashCount}</span> deleted item${trashCount === 1 ? "" : "s"} — `}restore things you removed</span>
    </button>
    <button class="card" type="button" data-nav="history">
      <span class="card-title">🕐 History</span>
      <span class="card-sub">recent changes — undo one if needed</span>
    </button>
    <button class="card" type="button" data-nav="settings">
      <span class="card-title">🎨 Display settings</span>
      <span class="card-sub">page order, show/hide pages, hero photo, featured video, theme</span>
    </button>
    <button class="card" type="button" id="export-btn">
      <span class="card-title">💾 Export backup</span>
      <span class="card-sub">Downloads a complete backup of all content, including deleted items.</span>
    </button>`;

  grid.querySelectorAll("[data-nav]").forEach((el) => {
    el.addEventListener("click", () => {
      const nav = el.getAttribute("data-nav");
      if (nav === "list") renderList(el.getAttribute("data-type"));
      else if (nav === "trash") renderTrash();
      else if (nav === "history") renderHistory();
      else if (nav === "settings") renderSettings();
    });
  });
  document.getElementById("export-btn").addEventListener("click", exportBackup);
}

async function exportBackup() {
  const btn = document.getElementById("export-btn");
  const restore = busy(btn, "Preparing backup…");
  try {
    const res = await fetch("/api/admin/export", { credentials: "same-origin" });
    if (res.status === 401) {
      showLogin("Your session expired — please log in again.");
      return;
    }
    if (!res.ok) throw new Error("Backup download failed (" + res.status + ")");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "gendler-girls-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("Backup downloaded.", "success");
  } catch (err) {
    showToast(errorMessage(err), "error");
  } finally {
    restore();
  }
}

/* ---------------- Per-type list ---------------- */

function thumbFor(entity) {
  const data = parseData(entity);
  if (entity.type === "video" && data.youtube_id) {
    return `<img class="list-thumb" src="${esc(youtubeThumb(data.youtube_id))}" alt="" loading="lazy">`;
  }
  if (entity.image_key) {
    return `<img class="list-thumb" src="${esc(imageUrl(entity.image_key))}" alt="" loading="lazy">`;
  }
  return `<div class="list-thumb-placeholder" aria-hidden="true">${TYPE_CONFIG[entity.type]?.icon || "📄"}</div>`;
}

function metaFor(entity) {
  const data = parseData(entity);
  const parts = [];
  if (data.section && SECTION_LABELS[data.section]) parts.push(SECTION_LABELS[data.section]);
  if (entity.album) parts.push("Album: " + entity.album);
  if (entity.type === "video" && data.youtube_id) parts.push("YouTube");
  if (entity.type === "speech" && data.author) parts.push(data.author);
  if (entity.type === "timeline_entry" && data.year_label) parts.push(data.year_label);
  if (entity.type === "appearance" && data.date_label) parts.push(data.date_label);
  return parts.join(" · ");
}

async function renderList(type) {
  const cfg = TYPE_CONFIG[type];
  viewEl.innerHTML = `
    <button class="back-link" type="button" id="back-btn">← Back to dashboard</button>
    <h1>${cfg.icon} ${cfg.plural}</h1>
    <p><button class="btn" type="button" id="add-btn">+ Add ${cfg.label.toLowerCase()}</button></p>
    <div id="list-wrap"><p class="loading">Loading…</p></div>`;
  document.getElementById("back-btn").addEventListener("click", renderDashboard);
  document.getElementById("add-btn").addEventListener("click", () => renderForm(type, null));

  let items;
  try {
    const list = await apiGet("/api/admin/entities?type=" + type);
    items = (Array.isArray(list) ? list : [])
      .filter((e) => !e.deleted_at)
      .sort((a, b) => (a.position || 0) - (b.position || 0));
  } catch (err) {
    if (err.message === "__unauthorized__") return;
    document.getElementById("list-wrap").innerHTML =
      `<div class="form-error">${esc(errorMessage(err))}</div>`;
    return;
  }

  const wrap = document.getElementById("list-wrap");
  if (!items.length) {
    wrap.innerHTML = `<div class="empty">No ${cfg.plural.toLowerCase()} yet.<br>Tap “Add ${cfg.label.toLowerCase()}” above to create the first one.</div>`;
    return;
  }

  wrap.innerHTML = `<div class="list">${items.map((e, i) => {
    const data = parseData(e);
    const hidden = !e.visible;
    return `<div class="list-row${hidden ? " hidden-item" : ""}" data-id="${esc(e.id)}">
      ${thumbFor(e)}
      <div class="list-main">
        <div class="list-title">${esc(e.title || "(no title)")}${hidden ? '<span class="badge badge-hidden">Hidden</span>' : ""}${data.draft ? '<span class="badge badge-draft">Draft</span>' : ""}</div>
        <div class="list-meta">${esc(metaFor(e))}</div>
        <div class="row-actions">
          <button class="btn btn-secondary btn-small" type="button" data-action="edit">Edit</button>
          <button class="btn btn-secondary btn-small" type="button" data-action="toggle">${hidden ? "Show" : "Hide"}</button>
          <button class="btn btn-secondary btn-small" type="button" data-action="up" ${i === 0 ? "disabled" : ""}>↑ Move up</button>
          <button class="btn btn-secondary btn-small" type="button" data-action="down" ${i === items.length - 1 ? "disabled" : ""}>↓ Move down</button>
          <button class="btn btn-danger-outline btn-small" type="button" data-action="delete">Delete</button>
        </div>
      </div>
    </div>`;
  }).join("")}</div>`;

  wrap.querySelectorAll(".list-row").forEach((row, i) => {
    const id = row.getAttribute("data-id");
    const entity = items[i];
    row.querySelector('[data-action="edit"]').addEventListener("click", () => renderForm(type, id));
    row.querySelector('[data-action="toggle"]').addEventListener("click", async (ev) => {
      const restore = busy(ev.currentTarget, "Saving…");
      try {
        await apiJson("/api/admin/entities/" + encodeURIComponent(id), "PUT", { visible: entity.visible ? 0 : 1 });
        invalidateCaches();
        showToast(entity.visible ? "Hidden from the public site." : "Now visible on the public site.", "success");
        renderList(type);
      } catch (err) {
        restore();
        if (err.message !== "__unauthorized__") showToast(errorMessage(err), "error");
      }
    });
    const upBtn = row.querySelector('[data-action="up"]');
    const downBtn = row.querySelector('[data-action="down"]');
    if (upBtn) upBtn.addEventListener("click", (ev) => moveItem(ev.currentTarget, type, items, i, i - 1));
    if (downBtn) downBtn.addEventListener("click", (ev) => moveItem(ev.currentTarget, type, items, i, i + 1));
    row.querySelector('[data-action="delete"]').addEventListener("click", async (ev) => {
      if (!confirm(`Delete “${entity.title || "this item"}”?\n\nIt will move to the Trash, where you can restore it later. Nothing is permanently deleted.`)) return;
      const restore = busy(ev.currentTarget, "Deleting…");
      try {
        await api("/api/admin/entities/" + encodeURIComponent(id), { method: "DELETE" });
        invalidateCaches();
        showToast("Moved to Trash.", "success");
        renderList(type);
      } catch (err) {
        restore();
        if (err.message !== "__unauthorized__") showToast(errorMessage(err), "error");
      }
    });
  });
}

/* Swap positions with the neighbor at index j. */
async function moveItem(btn, type, items, i, j) {
  const restore = busy(btn, "Moving…");
  const a = items[i], b = items[j];
  const posA = a.position == null ? i : a.position;
  const posB = b.position == null ? j : b.position;
  try {
    await apiJson("/api/admin/entities/" + encodeURIComponent(a.id), "PUT", { position: posB });
    await apiJson("/api/admin/entities/" + encodeURIComponent(b.id), "PUT", { position: posA });
    showToast("Moved.", "success");
    renderList(type);
  } catch (err) {
    restore();
    if (err.message !== "__unauthorized__") showToast(errorMessage(err), "error");
  }
}

/* ---------------- Add / edit form ---------------- */

/* Uploads a file through the upload endpoint (which creates a photo entity),
 * then returns that entity's image_key and deletes the temporary photo
 * entity again (it lands in the Trash, restorable). Used when a photo or
 * note page is edited with a new file, or a note page is created from a file.
 * Returns { imageKey } or throws. */
async function uploadImageAndTakeKey(file, caption, album, section) {
  const form = new FormData();
  form.append("file", file);
  form.append("caption", caption || "");
  if (album) form.append("album", album);
  if (section) form.append("section", section);
  const created = await api("/api/admin/upload", { method: "POST", body: form });
  const imageKey = created && created.image_key;
  if (!imageKey) throw new Error("Upload succeeded but no image was returned.");
  // Remove the temporary photo entity; the real entity keeps the image key.
  try {
    await api("/api/admin/entities/" + encodeURIComponent(created.id), { method: "DELETE" });
  } catch { /* leave it in the photos list rather than failing the save */ }
  invalidateCaches();
  return imageKey;
}

function validateImageFile(file) {
  if (!file) return null;
  if (!file.type || !file.type.startsWith("image/")) {
    return "That file is not an image. Please choose a photo (JPG, PNG, etc.).";
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return "That photo is too big (" + (file.size / 1024 / 1024).toFixed(1) + " MB). Photos must be 10 MB or smaller.";
  }
  return null;
}

async function renderForm(type, entityId) {
  const cfg = TYPE_CONFIG[type];
  const isEdit = !!entityId;
  viewEl.innerHTML = `
    <button class="back-link" type="button" id="back-btn">← Back to ${cfg.plural}</button>
    <h1>${isEdit ? "Edit" : "Add"} ${cfg.label.toLowerCase()}</h1>
    <div id="form-wrap"><p class="loading">Loading…</p></div>`;
  document.getElementById("back-btn").addEventListener("click", () => renderList(type));

  let entity = null;
  let data = {};
  if (isEdit) {
    try {
      entity = await apiGet("/api/admin/entities/" + encodeURIComponent(entityId));
      data = parseData(entity);
    } catch (err) {
      if (err.message === "__unauthorized__") return;
      document.getElementById("form-wrap").innerHTML =
        `<div class="form-error">${esc(errorMessage(err))}</div>`;
      return;
    }
  }

  const hasImage = cfg.fields.some((f) => f.kind === "image");
  const hasAlbum = cfg.fields.some((f) => f.kind === "album");
  let albums = [];
  let library = [];
  try {
    if (hasAlbum) albums = await getAlbums();
    if (hasImage) library = await getPhotos();
  } catch (err) {
    if (err.message === "__unauthorized__") return;
    // Non-fatal: dropdowns/library just come up empty.
  }

  const sectionField = cfg.fields.find((f) => f.kind === "section");
  const defaultSection = (sectionField && sectionField.def) || "home";
  const currentSection = data.section || defaultSection;
  const titleValue = isEdit ? (entity.title || "") : "";
  const slugValue = isEdit ? (entity.slug || "") : "";

  // Form-local image state.
  const imgState = {
    file: null,
    imageKey: isEdit ? (entity.image_key || null) : null, // library pick / existing
    filePreviewUrl: null,
  };

  const wrap = document.getElementById("form-wrap");
  wrap.innerHTML = `<form class="form-card" id="entity-form" novalidate>
    <div id="form-error" hidden></div>
    ${cfg.fields.map((f) => fieldHtml(f, entity, data, { albums, library, currentSection, imgState })).join("")}
    ${isEdit ? "" : `
    <div class="field">
      <label for="f-slug">Web address name (slug)</label>
      <input type="text" id="f-slug" name="slug" value="${esc(slugValue)}" placeholder="auto-generated from the title">
      <span class="hint">Lowercase letters, numbers and dashes. You can edit it — it becomes part of the page's web address.</span>
    </div>`}
    <div class="form-actions">
      <button class="btn" type="submit" id="save-btn">${isEdit ? "Save changes" : "Add " + cfg.label.toLowerCase()}</button>
      <button class="btn btn-secondary" type="button" id="cancel-btn">Cancel</button>
    </div>
  </form>`;

  document.getElementById("cancel-btn").addEventListener("click", () => renderList(type));

  // Auto-generate the slug from the title as the admin types (create only,
  // and only until they edit the slug themselves).
  const slugInput = document.getElementById("f-slug");
  if (slugInput) {
    let slugTouched = false;
    slugInput.addEventListener("input", () => { slugTouched = true; });
    const titleInput = document.getElementById("f-title");
    const captionInput = document.getElementById("f-caption");
    const yearInput = document.getElementById("f-year_label");
    const transcriptionInput = document.getElementById("f-transcription");
    const source = titleInput || captionInput || yearInput || transcriptionInput;
    if (source) {
      source.addEventListener("input", () => {
        if (!slugTouched) slugInput.value = slugify(source.value);
      });
    }
  }

  // Image field wiring: file input + library picker.
  if (hasImage) {
    const fileInput = document.getElementById("f-file");
    const preview = document.getElementById("image-preview");
    const fileError = document.getElementById("file-error");
    fileInput.addEventListener("change", () => {
      const file = fileInput.files && fileInput.files[0];
      const err = validateImageFile(file);
      if (err) {
        fileError.textContent = err;
        fileInput.value = "";
        return;
      }
      fileError.textContent = "";
      imgState.file = file || null;
      if (file) {
        imgState.imageKey = null; // a new upload wins over the library pick
        document.querySelectorAll(".library-thumb").forEach((t) => t.classList.remove("selected"));
        if (imgState.filePreviewUrl) URL.revokeObjectURL(imgState.filePreviewUrl);
        imgState.filePreviewUrl = URL.createObjectURL(file);
        preview.src = imgState.filePreviewUrl;
        preview.hidden = false;
      } else if (imgState.imageKey) {
        preview.src = imageUrl(imgState.imageKey);
        preview.hidden = false;
      } else {
        preview.hidden = true;
      }
    });
    document.querySelectorAll(".library-thumb").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".library-thumb").forEach((t) => t.classList.remove("selected"));
        btn.classList.add("selected");
        imgState.imageKey = btn.getAttribute("data-key");
        imgState.file = null;
        fileInput.value = "";
        fileError.textContent = "";
        preview.src = imageUrl(imgState.imageKey);
        preview.hidden = false;
      });
    });
  }

  document.getElementById("entity-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const errBox = document.getElementById("form-error");
    const showError = (msg) => {
      errBox.textContent = msg;
      errBox.className = "form-error";
      errBox.hidden = false;
      errBox.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    errBox.hidden = true;

    const form = ev.target;
    const val = (name) => {
      const el = form.elements[name];
      return el ? String(el.value || "").trim() : "";
    };

    // Gather values.
    const newData = {};
    let title = "";
    let album = null;
    let youtubeError = null;
    for (const f of cfg.fields) {
      if (f.kind === "image" || f.kind === "album") continue;
      if (f.kind === "section") { newData.section = val("section") || defaultSection; continue; }
      if (f.kind === "title") continue;
      if (f.kind === "text" && f.key === "title") { title = val("title"); continue; }
      if (f.kind === "checkbox") { newData[f.key] = !!form.elements[f.key].checked; continue; }
      if (f.kind === "youtube") {
        const raw = val(f.key);
        if (!raw) { if (f.required) youtubeError = "Please paste a YouTube link."; continue; }
        const id = extractYouTubeId(raw);
        if (!id) { youtubeError = "That doesn't look like a YouTube link. Paste a full youtube.com or youtu.be link, or just the 11-character video ID."; continue; }
        newData[f.key] = id;
        continue;
      }
      newData[f.key] = val(f.key);
    }
    if (hasAlbum) album = val("album") || null;
    if (cfg.titleFrom) {
      const src = newData[cfg.titleFrom] || "";
      title = src.length > 80 ? src.slice(0, 77).trimEnd() + "…" : src;
      if (!title) title = cfg.label;
    }
    if (youtubeError) { showError(youtubeError); return; }

    // Required-field check.
    for (const f of cfg.fields) {
      if (!f.required) continue;
      const v = f.key === "title" ? title : newData[f.key];
      if (!v) { showError(`Please fill in “${f.label}”.`); return; }
    }

    // Image is required for photos and note pages.
    if (hasImage && !isEdit && !imgState.file && !imgState.imageKey) {
      showError("Please choose a photo to upload, or pick one from the photo library below.");
      return;
    }
    if (hasImage && isEdit && !imgState.file && !imgState.imageKey) {
      showError("Please choose a photo to upload, or pick one from the photo library below.");
      return;
    }

    const saveBtn = document.getElementById("save-btn");
    const restore = busy(saveBtn, "Saving…");
    try {
      let imageKey = imgState.imageKey;

      if (type === "photo" && !isEdit && imgState.file) {
        // Direct upload path: the upload endpoint creates the photo entity.
        const formData = new FormData();
        formData.append("file", imgState.file);
        formData.append("caption", newData.caption || "");
        formData.append("title", title || newData.caption || "");
        if (album) formData.append("album", album);
        formData.append("section", newData.section || defaultSection);
        await api("/api/admin/upload", { method: "POST", body: formData });
        invalidateCaches();
        showToast("Photo added.", "success");
        renderList(type);
        return;
      }

      if (imgState.file) {
        // Replace / attach via upload, then keep the image key on this entity.
        imageKey = await uploadImageAndTakeKey(
          imgState.file, newData.caption || newData.transcription || title, album, newData.section || defaultSection);
      }

      if (isEdit) {
        const body = { title, data: newData };
        if (hasAlbum) body.album = album;
        if (hasImage) body.image_key = imageKey;
        await apiJson("/api/admin/entities/" + encodeURIComponent(entityId), "PUT", body);
        showToast("Saved.", "success");
      } else {
        const slug = slugInput ? slugify(slugInput.value) || slugify(title) : slugify(title);
        // New items go at the end of the list.
        let position = 0;
        try {
          const list = await apiGet("/api/admin/entities?type=" + type);
          position = (Array.isArray(list) ? list : []).reduce(
            (max, e) => Math.max(max, e.position == null ? 0 : e.position), -1) + 1;
        } catch { /* position 0 fallback */ }
        const body = {
          type, slug, title, data: newData,
          position, visible: 1,
        };
        if (hasAlbum) body.album = album;
        if (hasImage) body.image_key = imageKey;
        await apiJson("/api/admin/entities", "POST", body);
        showToast("Saved.", "success");
      }
      invalidateCaches();
      renderList(type);
    } catch (err) {
      restore();
      if (err.message === "__unauthorized__") return;
      showError(errorMessage(err));
    }
  });
}

function fieldHtml(f, entity, data, ctx) {
  const isEdit = !!entity;
  if (f.kind === "image") {
    const currentKey = isEdit ? entity.image_key : null;
    const thumbs = ctx.library.filter((p) => p.image_key).map((p) => {
      const d = parseData(p);
      const selected = currentKey && p.image_key === currentKey;
      return `<button type="button" class="library-thumb${selected ? " selected" : ""}" data-key="${esc(p.image_key)}" title="${esc(d.caption || p.title || "")}">
        <img src="${esc(imageUrl(p.image_key))}" alt="${esc(d.caption || p.title || "Photo")}" loading="lazy">
      </button>`;
    }).join("");
    return `<div class="field">
      <label for="f-file">Photo</label>
      <input type="file" id="f-file" name="file" accept="image/*">
      <span class="hint">JPG, PNG, or similar — 10 MB or smaller.</span>
      <span class="field-error" id="file-error"></span>
      <img class="image-preview" id="image-preview" alt="" ${currentKey ? `src="${esc(imageUrl(currentKey))}"` : "hidden"}>
      <div class="divider">or pick from the photo library</div>
      ${thumbs ? `<div class="library-grid">${thumbs}</div>` : `<p class="lede">No photos in the library yet — upload one above.</p>`}
    </div>`;
  }
  if (f.kind === "album") {
    const current = isEdit ? (entity.album || "") : "";
    return `<div class="field">
      <label for="f-album">Album</label>
      <select id="f-album" name="album">
        <option value="">No album</option>
        ${ctx.albums.map((a) => `<option value="${esc(a.slug || a.title)}" ${a.slug === current || a.title === current ? "selected" : ""}>${esc(a.title)}</option>`).join("")}
      </select>
      <span class="hint">Group this photo into a family album, or leave it ungrouped.</span>
    </div>`;
  }
  if (f.kind === "section") {
    const current = ctx.currentSection;
    return `<div class="field">
      <label for="f-section">Page it appears on</label>
      <select id="f-section" name="section">
        ${SECTIONS.map(([k, label]) => `<option value="${k}" ${k === current ? "selected" : ""}>${label}</option>`).join("")}
      </select>
    </div>`;
  }
  if (f.kind === "checkbox") {
    return `<div class="field checkbox-field">
      <label><input type="checkbox" id="f-${f.key}" name="${f.key}" ${data[f.key] ? "checked" : ""}> ${esc(f.label)}</label>
    </div>`;
  }
  if (f.kind === "textarea") {
    return `<div class="field">
      <label for="f-${f.key}">${esc(f.label)}${f.required ? " *" : ""}</label>
      <textarea id="f-${f.key}" name="${f.key}" rows="${f.rows || 6}" placeholder="${esc(f.placeholder || "")}">${esc(data[f.key] || "")}</textarea>
      ${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ""}
    </div>`;
  }
  if (f.kind === "youtube") {
    return `<div class="field">
      <label for="f-${f.key}">${esc(f.label)}${f.required ? " *" : ""}</label>
      <input type="text" id="f-${f.key}" name="${f.key}" value="${esc(data[f.key] ? "https://www.youtube.com/watch?v=" + data[f.key] : "")}" placeholder="https://www.youtube.com/watch?v=…" inputmode="url">
      ${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ""}
    </div>`;
  }
  // text (including the title field)
  const value = f.key === "title" ? (isEdit ? entity.title : "") : (data[f.key] || "");
  return `<div class="field">
    <label for="f-${f.key}">${esc(f.label)}${f.required ? " *" : ""}</label>
    <input type="text" id="f-${f.key}" name="${f.key}" value="${esc(value)}" placeholder="${esc(f.placeholder || "")}">
    ${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ""}
  </div>`;
}

/* ---------------- Trash ---------------- */

async function renderTrash() {
  viewEl.innerHTML = `
    <button class="back-link" type="button" id="back-btn">← Back to dashboard</button>
    <h1>🗑️ Trash</h1>
    <p class="lede">Deleted items stay here until you restore them. Nothing is permanently deleted from this page.</p>
    <p><button class="btn btn-secondary" type="button" id="restore-all-btn">Restore all</button></p>
    <div id="trash-wrap"><p class="loading">Loading…</p></div>`;
  document.getElementById("back-btn").addEventListener("click", renderDashboard);

  let items;
  try {
    const list = await apiGet("/api/admin/trash");
    items = Array.isArray(list) ? list : [];
  } catch (err) {
    if (err.message === "__unauthorized__") return;
    document.getElementById("trash-wrap").innerHTML =
      `<div class="form-error">${esc(errorMessage(err))}</div>`;
    return;
  }

  const wrap = document.getElementById("trash-wrap");
  if (!items.length) {
    wrap.innerHTML = `<div class="empty">The trash is empty — nothing has been deleted.</div>`;
    document.getElementById("restore-all-btn").disabled = true;
    return;
  }

  wrap.innerHTML = `<div class="list">${items.map((e) => {
    const cfg = TYPE_CONFIG[e.type] || { label: e.type, icon: "📄" };
    return `<div class="list-row" data-id="${esc(e.id)}">
      ${thumbFor(e)}
      <div class="list-main">
        <div class="list-title">${esc(e.title || "(no title)")}</div>
        <div class="list-meta">${cfg.icon} ${cfg.label} · deleted ${esc(fmtTime(e.deleted_at))}</div>
        <div class="row-actions">
          <button class="btn btn-secondary btn-small" type="button" data-action="restore">Restore</button>
        </div>
      </div>
    </div>`;
  }).join("")}</div>`;

  wrap.querySelectorAll(".list-row").forEach((row) => {
    const id = row.getAttribute("data-id");
    row.querySelector('[data-action="restore"]').addEventListener("click", async (ev) => {
      const restore = busy(ev.currentTarget, "Restoring…");
      try {
        await apiJson("/api/admin/entities/" + encodeURIComponent(id) + "/restore", "POST", {});
        invalidateCaches();
        showToast("Restored.", "success");
        renderTrash();
      } catch (err) {
        restore();
        if (err.message !== "__unauthorized__") showToast(errorMessage(err), "error");
      }
    });
  });

  document.getElementById("restore-all-btn").addEventListener("click", async (ev) => {
    if (!confirm(`Restore all ${items.length} deleted item${items.length === 1 ? "" : "s"}?\n\nThey will return to their original places on the site.`)) return;
    const restore = busy(ev.currentTarget, "Restoring…");
    try {
      await apiJson("/api/admin/trash/restore-all", "POST", {});
      invalidateCaches();
      showToast("Everything restored.", "success");
      renderTrash();
    } catch (err) {
      restore();
      if (err.message !== "__unauthorized__") showToast(errorMessage(err), "error");
    }
  });
}

/* ---------------- History ---------------- */

const ACTION_LABELS = {
  create: "Added",
  update: "Edited",
  delete: "Deleted",
  restore: "Restored",
};

async function renderHistory() {
  viewEl.innerHTML = `
    <button class="back-link" type="button" id="back-btn">← Back to dashboard</button>
    <h1>🕐 History</h1>
    <p class="lede">Recent changes, newest first. “Revert” undoes that change — for a deletion, it restores the item.</p>
    <div id="history-wrap"><p class="loading">Loading…</p></div>`;
  document.getElementById("back-btn").addEventListener("click", renderDashboard);

  let rows;
  try {
    const list = await apiGet("/api/admin/history");
    rows = Array.isArray(list) ? list : [];
  } catch (err) {
    if (err.message === "__unauthorized__") return;
    document.getElementById("history-wrap").innerHTML =
      `<div class="form-error">${esc(errorMessage(err))}</div>`;
    return;
  }

  const wrap = document.getElementById("history-wrap");
  if (!rows.length) {
    wrap.innerHTML = `<div class="empty">No changes recorded yet.</div>`;
    return;
  }

  wrap.innerHTML = `<div class="list">${rows.map((r) => {
    const cfg = TYPE_CONFIG[r.type] || { label: r.type || "Item", icon: "📄" };
    const action = ACTION_LABELS[r.action] || r.action;
    return `<div class="list-row" data-id="${esc(r.entity_id)}" data-version="${esc(r.id)}" data-action-type="${esc(r.action)}">
      <div class="list-main">
        <div class="list-title">${esc(r.title || "(no title)")}</div>
        <div class="list-meta">${cfg.icon} ${cfg.label} · ${esc(action)} · ${esc(fmtTime(r.created_at))}</div>
        <div class="row-actions">
          <button class="btn btn-secondary btn-small" type="button" data-action="revert">Revert this change</button>
        </div>
      </div>
    </div>`;
  }).join("")}</div>`;

  wrap.querySelectorAll(".list-row").forEach((row) => {
    const entityId = row.getAttribute("data-id");
    const versionId = row.getAttribute("data-version");
    const actionType = row.getAttribute("data-action-type");
    row.querySelector('[data-action="revert"]').addEventListener("click", async (ev) => {
      const title = row.querySelector(".list-title").textContent;
      const what = actionType === "delete"
        ? `restore “${title}”`
        : `revert “${title}” to how it was before this change`;
      if (!confirm(`Are you sure you want to ${what}?`)) return;
      const restore = busy(ev.currentTarget, "Reverting…");
      try {
        if (actionType === "delete") {
          await apiJson("/api/admin/entities/" + encodeURIComponent(entityId) + "/restore", "POST", {});
        } else {
          await apiJson(
            "/api/admin/entities/" + encodeURIComponent(entityId) +
            "/restore-version/" + encodeURIComponent(versionId), "POST", {});
        }
        invalidateCaches();
        showToast("Reverted.", "success");
        renderHistory();
      } catch (err) {
        restore();
        if (err.message !== "__unauthorized__") showToast(errorMessage(err), "error");
      }
    });
  });
}

/* ---------------- Display settings ---------------- */

async function renderSettings() {
  viewEl.innerHTML = `
    <button class="back-link" type="button" id="back-btn">← Back to dashboard</button>
    <h1>🎨 Display settings</h1>
    <p class="lede">Control how the public site looks: the order of the pages, which pages show, the big photo at the top, the featured video, and the color theme.</p>
    <div id="settings-wrap"><p class="loading">Loading…</p></div>`;
  document.getElementById("back-btn").addEventListener("click", renderDashboard);

  let settings = {};
  let photos = [];
  let videos = [];
  try {
    [settings, photos, videos] = await Promise.all([
      apiGet("/api/admin/settings"),
      getPhotos(),
      getVideos(),
    ]);
  } catch (err) {
    if (err.message === "__unauthorized__") return;
    document.getElementById("settings-wrap").innerHTML =
      `<div class="form-error">${esc(errorMessage(err))}</div>`;
    return;
  }
  settings = settings || {};

  const savedOrder = parseSettingValue(settings.section_order);
  let order = Array.isArray(savedOrder) && savedOrder.length
    ? savedOrder.filter((k) => SECTION_KEYS.includes(k))
    : SECTION_KEYS.slice();
  // Include any section missing from the saved order, at the end.
  SECTION_KEYS.forEach((k) => { if (!order.includes(k)) order.push(k); });

  const savedVisibility = parseSettingValue(settings.section_visibility);
  const visibility = {};
  SECTION_KEYS.forEach((k) => {
    visibility[k] = savedVisibility && typeof savedVisibility === "object" && k in savedVisibility
      ? !!savedVisibility[k] : true;
  });

  const heroImage = parseSettingValue(settings.hero_image) || "";
  const featuredVideo = parseSettingValue(settings.featured_video) || "";
  const theme = parseSettingValue(settings.theme) || "warm";

  const wrap = document.getElementById("settings-wrap");
  wrap.innerHTML = `
    <div class="setting-block">
      <h2>Page order &amp; visibility</h2>
      <p class="lede">Use the arrows to reorder the pages. Untick a page to hide it from the public site (its content stays saved).</p>
      <div id="section-order">${order.map((k) => sectionOrderRow(k, visibility[k])).join("")}</div>
    </div>

    <div class="setting-block">
      <h2>Hero photo</h2>
      <p class="lede">The big photo at the top of the Home page.</p>
      <div class="field">
        <label for="hero-select">Hero photo</label>
        <select id="hero-select">
          <option value="">No hero photo</option>
          ${photos.filter((p) => p.image_key).map((p) => {
            const d = parseData(p);
            return `<option value="${esc(p.image_key)}" ${p.image_key === heroImage ? "selected" : ""}>${esc(d.caption || p.title || p.image_key)}</option>`;
          }).join("")}
        </select>
      </div>
      ${heroImage ? `<img class="image-preview" src="${esc(imageUrl(heroImage))}" alt="Current hero photo">` : ""}
    </div>

    <div class="setting-block">
      <h2>Featured video</h2>
      <p class="lede">The video shown in the “In Their Own Words” spot on the Home page.</p>
      <div class="field">
        <label for="video-select">Featured video</label>
        <select id="video-select">
          <option value="">No featured video</option>
          ${videos.map((v) => {
            const d = parseData(v);
            return `<option value="${esc(d.youtube_id || "")}" ${(d.youtube_id || "") === featuredVideo && d.youtube_id ? "selected" : ""}>${esc(v.title || d.youtube_id || "")}</option>`;
          }).join("")}
        </select>
      </div>
    </div>

    <div class="setting-block">
      <h2>Color theme</h2>
      <div class="radio-row">
        <label class="radio-option"><input type="radio" name="theme" value="warm" ${theme === "warm" ? "checked" : ""}> Warm</label>
        <label class="radio-option"><input type="radio" name="theme" value="light" ${theme === "light" ? "checked" : ""}> Light</label>
        <label class="radio-option"><input type="radio" name="theme" value="dark" ${theme === "dark" ? "checked" : ""}> Dark</label>
      </div>
    </div>

    <div class="form-actions">
      <button class="btn" type="button" id="settings-save-btn">Save display settings</button>
    </div>`;

  const orderEl = document.getElementById("section-order");
  function refreshOrderRows() {
    orderEl.innerHTML = order.map((k) => sectionOrderRow(k, visibility[k])).join("");
    wireOrderRows();
  }
  function wireOrderRows() {
    orderEl.querySelectorAll(".order-row").forEach((row) => {
      const key = row.getAttribute("data-key");
      const idx = order.indexOf(key);
      row.querySelector('[data-order="up"]').addEventListener("click", () => {
        if (idx <= 0) return;
        [order[idx - 1], order[idx]] = [order[idx], order[idx - 1]];
        refreshOrderRows();
      });
      row.querySelector('[data-order="down"]').addEventListener("click", () => {
        if (idx < 0 || idx >= order.length - 1) return;
        [order[idx + 1], order[idx]] = [order[idx], order[idx + 1]];
        refreshOrderRows();
      });
      row.querySelector('[data-vis]').addEventListener("change", (ev) => {
        visibility[key] = ev.target.checked;
      });
    });
  }
  wireOrderRows();

  document.getElementById("settings-save-btn").addEventListener("click", async (ev) => {
    const restore = busy(ev.currentTarget, "Saving…");
    try {
      const hero = document.getElementById("hero-select").value || null;
      const video = document.getElementById("video-select").value || null;
      const themeEl = document.querySelector('input[name="theme"]:checked');
      const chosenTheme = themeEl ? themeEl.value : "warm";
      await apiJson("/api/admin/settings", "PUT", { key: "section_order", value: order });
      await apiJson("/api/admin/settings", "PUT", { key: "section_visibility", value: visibility });
      await apiJson("/api/admin/settings", "PUT", { key: "hero_image", value: hero });
      await apiJson("/api/admin/settings", "PUT", { key: "featured_video", value: video });
      await apiJson("/api/admin/settings", "PUT", { key: "theme", value: theme });
      showToast("Display settings saved.", "success");
    } catch (err) {
      if (err.message !== "__unauthorized__") showToast(errorMessage(err), "error");
    } finally {
      restore();
    }
  });
}

function sectionOrderRow(key, visible) {
  return `<div class="order-row" data-key="${esc(key)}">
    <span class="order-name">${esc(SECTION_LABELS[key])}${visible ? "" : ' <span class="dim">(hidden)</span>'}</span>
    <label style="display:flex;align-items:center;gap:6px;font-size:15px;">
      <input type="checkbox" data-vis ${visible ? "checked" : ""} style="width:20px;height:20px;accent-color:var(--accent);"> Show
    </label>
    <button class="btn btn-secondary btn-small" type="button" data-order="up">↑</button>
    <button class="btn btn-secondary btn-small" type="button" data-order="down">↓</button>
  </div>`;
}

/* ---------------- Init ---------------- */

(async function init() {
  try {
    const me = await apiGet("/api/admin/me");
    if (me && me.authenticated) {
      renderDashboard();
    } else {
      showLogin();
    }
  } catch (err) {
    if (err.message === "__unauthorized__") return; // showLogin already called
    showLogin();
  }
})();
