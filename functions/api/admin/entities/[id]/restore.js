// POST /api/admin/entities/:id/restore — restore one soft-deleted entity.
// Session required. Writes a version row of the current (deleted) state
// (action "restore") first, then clears deleted_at, in one batch.

import {
  getEntity,
  json,
  methodNotAllowed,
  nowIso,
  publicEntity,
  requireAuth,
  snapshotOf,
  unauthorized,
  writeVersion,
} from '../../../_lib.js';

export async function onRequest(context) {
  const { env, request, params } = context;
  if (request.method !== 'POST') return methodNotAllowed();
  if (!(await requireAuth(request, env))) return unauthorized();

  const row = await getEntity(env.DB, params.id);
  if (!row) return json({ error: 'Entity not found' }, 404);
  if (!row.deleted_at) {
    return json({ error: 'Entity is not deleted' }, 400);
  }

  await env.DB.batch([
    writeVersion(env.DB, params.id, 'restore', snapshotOf(row)),
    env.DB.prepare(
      'UPDATE entities SET deleted_at = NULL, updated_at = ? WHERE id = ?',
    ).bind(nowIso(), params.id),
  ]);

  const restored = await getEntity(env.DB, params.id);
  return json({ entity: publicEntity(restored) });
}
