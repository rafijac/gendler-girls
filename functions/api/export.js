// GET /api/export?token=... — machine snapshot endpoint for the GitHub Action.
// Auth: ?token= constant-time compared against SNAPSHOT_TOKEN env secret.
// Returns the same full JSON backup as /api/admin/export (no download headers).

import {
  buildExport,
  constantTimeEqual,
  json,
  methodNotAllowed,
} from './_lib.js';

export async function onRequest(context) {
  const { env, request } = context;
  if (request.method !== 'GET') return methodNotAllowed();

  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!env.SNAPSHOT_TOKEN || !token) {
    return json({ error: 'Unauthorized' }, 401);
  }
  if (!constantTimeEqual(token, env.SNAPSHOT_TOKEN)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  return json(await buildExport(env.DB));
}
