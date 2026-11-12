// POST /api/admin/logout — clears the session cookie. No auth required
// (clearing a cookie is always safe).

import { clearSessionCookie, json, methodNotAllowed } from '../_lib.js';

export async function onRequest(context) {
  const { request } = context;
  if (request.method !== 'POST') return methodNotAllowed();
  return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
}
