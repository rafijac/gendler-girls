// Shared helpers for the Gendler Girls Pages Functions API.
// Vanilla JS, Workers runtime only — Web Crypto, no Node APIs.
// NOTE: files starting with "_" in functions/ are never routed by Pages.

export const SESSION_COOKIE_NAME = 'gg_session';
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

export function nowIso() {
  return new Date().toISOString();
}

// ---- JSON responses -------------------------------------------------------

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

export function unauthorized() {
  return json({ error: 'Unauthorized' }, 401);
}

export function methodNotAllowed() {
  return json({ error: 'Method not allowed' }, 405);
}

// ---- Constant-time string compare (manual XOR over char codes) ------------

export function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    const ca = i < a.length ? a.charCodeAt(i) : 0;
    const cb = i < b.length ? b.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}

// ---- Crypto (Web Crypto only) ---------------------------------------------

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  );
  return bytesToHex(digest);
}

export async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(message),
  );
  return bytesToHex(sig);
}

// ---- Sessions -------------------------------------------------------------
// Cookie value: "<expMillis>.<hmac-sha256-hex(SESSION_SECRET, expMillis)>"

export function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq > 0 && trimmed.slice(0, eq) === name) {
      return trimmed.slice(eq + 1);
    }
  }
  return null;
}

export async function makeSessionCookie(env) {
  const exp = String(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  const sig = await hmacHex(env.SESSION_SECRET, exp);
  return (
    `${SESSION_COOKIE_NAME}=${exp}.${sig}; ` +
    `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}`
  );
}

export function clearSessionCookie() {
  return (
    `${SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; ` +
    `Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
  );
}

export async function verifySession(request, env) {
  if (!env.SESSION_SECRET) return false;
  const token = getCookie(request, SESSION_COOKIE_NAME);
  if (!token) return false;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return false;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expMs = Number(exp);
  if (!Number.isFinite(expMs) || expMs <= Date.now()) return false;
  const expected = await hmacHex(env.SESSION_SECRET, exp);
  return constantTimeEqual(sig, expected);
}

// Returns true when the request carries a valid admin session cookie.
export async function requireAuth(request, env) {
  return verifySession(request, env);
}

// ---- Entity helpers -------------------------------------------------------

// Parse a JSON-text column; fall back to `fallback` when empty/unparseable.
export function parseJsonField(value, fallback = {}) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// Public/admin API shape for one entity row: `data` as an object,
// `visible` as a boolean.
export function publicEntity(row) {
  return {
    id: row.id,
    type: row.type,
    slug: row.slug,
    title: row.title,
    data: parseJsonField(row.data, {}),
    position: row.position,
    visible: row.visible === 1,
    album: row.album,
    image_key: row.image_key,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
  };
}

// Full-entity JSON snapshot stored in `versions.data` (same shape as the API).
export function snapshotOf(row) {
  return publicEntity(row);
}

export async function getEntity(db, id) {
  const row = await db
    .prepare('SELECT * FROM entities WHERE id = ?')
    .bind(id)
    .first();
  return row || null;
}

// ---- Version rows ---------------------------------------------------------
// These return prepared (unexecuted) statements so callers can run them
// together with the mutation in a single db.batch([...]) — atomic.

// snapshot: full entity JSON object (or its JSON string).
export function writeVersion(db, entityId, action, snapshot) {
  const data =
    typeof snapshot === 'string' ? snapshot : JSON.stringify(snapshot);
  return db
    .prepare(
      'INSERT INTO versions (entity_id, data, action, created_at) VALUES (?, ?, ?, ?)',
    )
    .bind(entityId, data, action, nowIso());
}

// value: the pre-change settings value (JSON text, or null when the key is new).
export function writeSettingsVersion(db, key, action, value) {
  return db
    .prepare(
      'INSERT INTO settings_versions (key, value, action, created_at) VALUES (?, ?, ?, ?)',
    )
    .bind(key, value, action, nowIso());
}

// ---- Full backup payload (shared by /api/admin/export and /api/export) ----

export async function buildExport(db) {
  const entities = await db
    .prepare('SELECT * FROM entities ORDER BY position ASC, id ASC')
    .all();
  const versions = await db
    .prepare('SELECT * FROM versions ORDER BY id ASC')
    .all();
  const settings = await db
    .prepare('SELECT * FROM settings ORDER BY key ASC')
    .all();
  const settingsVersions = await db
    .prepare('SELECT * FROM settings_versions ORDER BY id ASC')
    .all();
  return {
    exported_at: nowIso(),
    entities: entities.results,
    versions: versions.results,
    settings: settings.results,
    settings_versions: settingsVersions.results,
  };
}

// Parse a JSON request body; returns { ok, body } or { ok: false, response }.
export async function readJsonBody(request) {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false, response: json({ error: 'Invalid JSON body' }, 400) };
  }
}
