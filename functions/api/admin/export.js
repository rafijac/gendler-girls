// GET /api/admin/export — full JSON backup as a download:
// { exported_at, entities (ALL incl. deleted, raw rows), versions,
//   settings, settings_versions }. Session required.

import {
  buildExport,
  json,
  methodNotAllowed,
  requireAuth,
  unauthorized,
} from '../_lib.js';

export async function onRequest(context) {
  const { env, request } = context;
  if (request.method !== 'GET') return methodNotAllowed();
  if (!(await requireAuth(request, env))) return unauthorized();

  const payload = await buildExport(env.DB);
  const date = new Date().toISOString().slice(0, 10);
  return json(payload, 200, {
    'Content-Disposition': `attachment; filename="gendler-girls-backup-${date}.json"`,
  });
}
