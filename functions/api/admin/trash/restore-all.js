// POST /api/admin/trash/restore-all — restores every soft-deleted entity.
// Session required. Each restored entity gets a version row of its current
// (deleted) state (action "restore") first; all statements run in one batch.

import {
  json,
  methodNotAllowed,
  nowIso,
  requireAuth,
  snapshotOf,
  unauthorized,
  writeVersion,
} from '../../_lib.js';

export async function onRequest(context) {
  const { env, request } = context;
  if (request.method !== 'POST') return methodNotAllowed();
  if (!(await requireAuth(request, env))) return unauthorized();

  const { results } = await env.DB.prepare(
    'SELECT * FROM entities WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC',
  ).all();

  if (results.length === 0) {
    return json({ restored: 0, ids: [] });
  }

  const now = nowIso();
  const statements = [];
  for (const row of results) {
    statements.push(writeVersion(env.DB, row.id, 'restore', snapshotOf(row)));
    statements.push(
      env.DB.prepare(
        'UPDATE entities SET deleted_at = NULL, updated_at = ? WHERE id = ?',
      ).bind(now, row.id),
    );
  }
  await env.DB.batch(statements);

  return json({ restored: results.length, ids: results.map((r) => r.id) });
}
