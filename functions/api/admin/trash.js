// GET /api/admin/trash — soft-deleted entities, newest first.
// Session required.

import {
  json,
  methodNotAllowed,
  publicEntity,
  requireAuth,
  unauthorized,
} from '../_lib.js';

export async function onRequest(context) {
  const { env, request } = context;
  if (request.method !== 'GET') return methodNotAllowed();
  if (!(await requireAuth(request, env))) return unauthorized();

  const { results } = await env.DB.prepare(
    'SELECT * FROM entities WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC, id ASC',
  ).all();
  return json({ entities: results.map(publicEntity) });
}
