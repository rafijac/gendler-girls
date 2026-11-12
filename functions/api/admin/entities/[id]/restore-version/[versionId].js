// POST /api/admin/entities/:id/restore-version/:versionId — revert an
// entity to a previous version snapshot. Session required.
// Writes a version row of the CURRENT state (action "restore") first, then
// replaces the entity's fields from the snapshot. If the snapshot was not
// deleted, deleted_at is cleared (so this also un-deletes).

import {
  getEntity,
  json,
  methodNotAllowed,
  nowIso,
  parseJsonField,
  publicEntity,
  requireAuth,
  snapshotOf,
  unauthorized,
  writeVersion,
} from '../../../../_lib.js';

export async function onRequest(context) {
  const { env, request, params } = context;
  if (request.method !== 'POST') return methodNotAllowed();
  if (!(await requireAuth(request, env))) return unauthorized();

  const version = await env.DB.prepare(
    'SELECT * FROM versions WHERE id = ? AND entity_id = ?',
  )
    .bind(params.versionId, params.id)
    .first();
  if (!version) return json({ error: 'Version not found' }, 404);

  const row = await getEntity(env.DB, params.id);
  if (!row) return json({ error: 'Entity not found' }, 404);

  const snapshot = parseJsonField(version.data, null);
  if (!snapshot || typeof snapshot !== 'object') {
    return json({ error: 'Version snapshot is corrupt' }, 500);
  }

  const dataText =
    typeof snapshot.data === 'string'
      ? snapshot.data
      : JSON.stringify(snapshot.data ?? {});
  const now = nowIso();

  await env.DB.batch([
    writeVersion(env.DB, params.id, 'restore', snapshotOf(row)),
    env.DB.prepare(
      `UPDATE entities SET type = ?, slug = ?, title = ?, data = ?,
       position = ?, visible = ?, album = ?, image_key = ?,
       deleted_at = ?, updated_at = ? WHERE id = ?`,
    ).bind(
      snapshot.type ?? row.type,
      snapshot.slug ?? null,
      snapshot.title ?? null,
      dataText,
      snapshot.position ?? row.position,
      snapshot.visible === false || snapshot.visible === 0 ? 0 : 1,
      snapshot.album ?? null,
      snapshot.image_key ?? null,
      snapshot.deleted_at || null,
      now,
      params.id,
    ),
  ]);

  const restored = await getEntity(env.DB, params.id);
  return json({ entity: publicEntity(restored) });
}
