// GET /uploads/* — serves family-uploaded photos from R2 by key.
// Public (uploaded photos are part of the public memorial site).
// Long-lived immutable cache headers; 404 when the object is missing.
//
// The URL path after /uploads/ IS the full R2 key (e.g. an entity with
// image_key "uploads/2026-11-12/<uuid>-photo.jpg" is served at
// /uploads/uploads/2026-11-12/<uuid>-photo.jpg). Do NOT prepend anything
// here — the frontend builds the URL as '/uploads/' + image_key, and the
// upload endpoint stores keys already prefixed with "uploads/".

export async function onRequest(context) {
  const { env, request, params } = context;
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const segments = params.path;
  const key = Array.isArray(segments)
    ? segments.join('/')
    : segments || '';
  if (!segments || segments.length === 0 || !key) {
    return new Response('Not found', { status: 404 });
  }

  if (!env.R2) {
    return new Response('Server not configured: R2 bucket not bound', {
      status: 500,
    });
  }

  const object = await env.R2.get(key);
  if (!object) {
    return new Response('Not found', { status: 404 });
  }

  const headers = new Headers();
  headers.set(
    'Content-Type',
    (object.httpMetadata && object.httpMetadata.contentType) ||
      'application/octet-stream',
  );
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  if (object.httpEtag) headers.set('ETag', object.httpEtag);

  return new Response(object.body, { headers });
}
