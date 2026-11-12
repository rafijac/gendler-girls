// /api/admin/entities/:id — admin single-entity CRUD. Session required.
// GET    — one entity (including soft-deleted ones).
// PUT    — update title, slug, type, data, position, visible, album,
//          image_key. Writes a version row with the PRE-change full entity
//          JSON (action "update") in the same batch as the update.
// DELETE — soft delete: version row with pre-change JSON (action "delete"),
//          then deleted_at = now, in one batch.

import {
  getEntity,
  json,
  methodNotAllowed,
  nowIso,
  publicEntity,
  readJsonBody,
  requireAuth,
  snapshotOf,
  unauthorized,
  writeVersion,
} from '../../_lib.js';

export async function onRequest(context) {
  const { env, request, params } = context;
  if (!(await requireAuth(request, env))) return unauthorized();

  const id = params.id;
  if (request.method === 'GET') return handleGet(env, id);
  if (request.method === 'PUT') return handleUpdate(env, request, id);
  if (request.method === 'DELETE') return handleDelete(env, id);
  return methodNotAllowed();
}

async function handleGet(env, id) {
  const row = await getEntity(env.DB, id);
  if (!row) return json({ error: 'Entity not found' }, 404);
  return json({ entity: publicEntity(row) });
}

async function handleUpdate(env, request, id) {
  const row = await getEntity(env.DB, id);
  if (!row) return json({ error: 'Entity not found' }, 404);

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body || {};

  // Only these fields are updatable; anything else in the body is ignored.
  const updates = {};
  if ('title' in body) updates.title = body.title ?? null;
  if ('slug' in body) updates.slug = body.slug ?? null;
  if ('type' in body) updates.type = body.type ?? null;
  if ('position' in body) updates.position = body.position ?? null;
  if ('album' in body) updates.album = body.album ?? null;
  if ('image_key' in body) updates.image_key = body.image_key ?? null;
  if ('visible' in body) {
    updates.visible = body.visible === false || body.visible === 0 ? 0 : 1;
  }
  if ('data' in body) {
    updates.data =
      typeof body.data === 'string' ? body.data : JSON.stringify(body.data ?? {});
  }
  if (Object.keys(updates).length === 0) {
    return json({ error: 'No updatable fields provided' }, 400);
  }
  updates.updated_at = nowIso();

  const setClause = Object.keys(updates)
    .map((col) => `${col} = ?`)
    .join(', ');
  const values = Object.values(updates);

  await env.DB.batch([
    writeVersion(env.DB, id, 'update', snapshotOf(row)),
    env.DB.prepare(`UPDATE entities SET ${setClause} WHERE id = ?`).bind(
      ...values,
      id,
    ),
  ]);

  const updated = await getEntity(env.DB, id);
  return json({ entity: publicEntity(updated) });
}

async function handleDelete(env, id) {
  const row = await getEntity(env.DB, id);
  if (!row) return json({ error: 'Entity not found' }, 404);
  if (row.deleted_at) {
    return json({ error: 'Entity is already deleted' }, 400);
  }

  const now = nowIso();
  await env.DB.batch([
    writeVersion(env.DB, id, 'delete', snapshotOf(row)),
    env.DB.prepare(
      'UPDATE entities SET deleted_at = ?, updated_at = ? WHERE id = ?',
    ).bind(now, now, id),
  ]);

  const deleted = await getEntity(env.DB, id);
  return json({ entity: publicEntity(deleted) });
}
