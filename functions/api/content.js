// GET /api/content — public, no auth.
// Returns visible, non-deleted entities (ordered by position) + settings.

import { json, methodNotAllowed, parseJsonField, publicEntity } from './_lib.js';

export async function onRequest(context) {
  const { env, request } = context;
  if (request.method !== 'GET') return methodNotAllowed();

  const { results } = await env.DB.prepare(
    'SELECT * FROM entities WHERE visible = 1 AND deleted_at IS NULL ORDER BY position ASC, id ASC',
  ).all();

  const settingsRows = await env.DB.prepare(
    'SELECT key, value FROM settings ORDER BY key ASC',
  ).all();
  const settings = {};
  for (const row of settingsRows.results) {
    // Values are JSON text; fall back to the raw string when not JSON.
    settings[row.key] = parseJsonField(row.value, row.value);
  }

  return json({ entities: results.map(publicEntity), settings });
}
