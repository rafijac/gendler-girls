// /api/admin/settings — site settings. Session required.
// GET — all settings as { key: value } (values JSON-parsed when possible).
// PUT — body { key, value }: upsert one setting. Writes a settings_versions
//       row with the PRE-change value first (action "update"; null when the
//       key is new), in the same batch as the upsert.

import {
  json,
  methodNotAllowed,
  nowIso,
  parseJsonField,
  readJsonBody,
  requireAuth,
  unauthorized,
  writeSettingsVersion,
} from '../_lib.js';

export async function onRequest(context) {
  const { env, request } = context;
  if (!(await requireAuth(request, env))) return unauthorized();

  if (request.method === 'GET') return handleGet(env);
  if (request.method === 'PUT') return handlePut(env, request);
  return methodNotAllowed();
}

async function handleGet(env) {
  const { results } = await env.DB.prepare(
    'SELECT key, value FROM settings ORDER BY key ASC',
  ).all();
  const settings = {};
  for (const row of results) {
    settings[row.key] = parseJsonField(row.value, row.value);
  }
  return json({ settings });
}

async function handlePut(env, request) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const { key, value } = parsed.body || {};

  if (typeof key !== 'string' || key.length === 0) {
    return json({ error: 'key is required' }, 400);
  }
  if (!('value' in (parsed.body || {}))) {
    return json({ error: 'value is required' }, 400);
  }

  const existing = await env.DB.prepare(
    'SELECT value FROM settings WHERE key = ?',
  )
    .bind(key)
    .first();

  const valueText =
    typeof value === 'string' ? value : JSON.stringify(value);
  const now = nowIso();

  await env.DB.batch([
    writeSettingsVersion(
      env.DB,
      key,
      'update',
      existing ? existing.value : null,
    ),
    env.DB.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).bind(key, valueText, now),
  ]);

  return json({ key, value: parseJsonField(valueText, valueText) });
}
