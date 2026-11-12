// GET /api/admin/me — returns whether the request carries a valid
// admin session cookie. No auth required (it reports the auth state).

import { json, methodNotAllowed, verifySession } from '../_lib.js';

export async function onRequest(context) {
  const { env, request } = context;
  if (request.method !== 'GET') return methodNotAllowed();
  return json({ authenticated: await verifySession(request, env) });
}
