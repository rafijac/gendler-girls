// GET /api/admin/entities/:id/versions — version rows for one entity,
// newest first. Session required. Each row's `data` is the full entity
// JSON snapshot, returned parsed (as `snapshot`).

import {
  getEntity,
  json,
  methodNotAllowed,
  parseJsonField,
  requireAuth,
  unauthorized,
} from '../../../_lib.js';

export async function onRequest(context) {
  const { env, request, params } = context;
  if (request.method !== 'GET') return methodNotAllowed();
  if (!(await requireAuth(request, env))) return unauthorized();

  const row = await getEntity(env.DB, params.id);
  if (!row) return json({ error: 'Entity not found' }, 404);

  const { results } = await env.DB.prepare(
    'SELECT * FROM versions WHERE entity_id = ? ORDER BY id DESC',
  )
    .bind(params.id)
    .all();

  return json({
    entity_id: params.id,
    versions: results.map((v) => ({
      id: v.id,
      entity_id: v.entity_id,
      action: v.action,
      created_at: v.created_at,
      snapshot: parseJsonField(v.data, null),
    })),
  });
}
