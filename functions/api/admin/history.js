// GET /api/admin/history — recent version rows across all entities,
// newest first, limit 100. Joins the entity title + type for display.
// Session required.

import {
  json,
  methodNotAllowed,
  requireAuth,
  unauthorized,
} from '../_lib.js';

export async function onRequest(context) {
  const { env, request } = context;
  if (request.method !== 'GET') return methodNotAllowed();
  if (!(await requireAuth(request, env))) return unauthorized();

  const { results } = await env.DB.prepare(
    `SELECT v.id, v.entity_id, v.action, v.created_at,
            e.title AS entity_title, e.type AS entity_type
     FROM versions v
     LEFT JOIN entities e ON v.entity_id = e.id
     ORDER BY v.id DESC
     LIMIT 100`,
  ).all();

  return json({ history: results });
}
