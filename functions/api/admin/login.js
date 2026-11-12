// POST /api/admin/login — body { password }.
// Compares SHA-256 hex of the password against ADMIN_PASSWORD_HASH
// (constant-time). On success sets the httpOnly session cookie.
// No auth required (this IS the login route).

import {
  constantTimeEqual,
  json,
  makeSessionCookie,
  methodNotAllowed,
  readJsonBody,
  sha256Hex,
} from '../_lib.js';

export async function onRequest(context) {
  const { env, request } = context;
  if (request.method !== 'POST') return methodNotAllowed();

  if (!env.ADMIN_PASSWORD_HASH || !env.SESSION_SECRET) {
    return json(
      { error: 'Server not configured: admin password / session secret missing' },
      500,
    );
  }

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const { password } = parsed.body || {};
  if (typeof password !== 'string' || password.length === 0) {
    return json({ error: 'Invalid password' }, 401);
  }

  const hash = await sha256Hex(password);
  if (!constantTimeEqual(hash, env.ADMIN_PASSWORD_HASH)) {
    return json({ error: 'Invalid password' }, 401);
  }

  const cookie = await makeSessionCookie(env);
  return json({ ok: true }, 200, { 'Set-Cookie': cookie });
}
