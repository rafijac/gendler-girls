// POST /api/admin/upload — multipart image upload to R2 + photo entity.
// Session required. Form fields: "file" (required), "caption", "album",
// "section". Validates image MIME types only, max 10 MB.
// R2 key: uploads/<YYYY-MM-DD>/<uuid>-<sanitized-filename>.
// Creates a photo entity (image_key = the R2 key) with a version row
// (action "create") in the same batch as the insert.

import {
  json,
  methodNotAllowed,
  nowIso,
  publicEntity,
  requireAuth,
  snapshotOf,
  unauthorized,
  writeVersion,
} from '../_lib.js';

const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function sanitizeFilename(name) {
  const cleaned = String(name || 'upload')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return cleaned || 'upload';
}

export async function onRequest(context) {
  const { env, request } = context;
  if (request.method !== 'POST') return methodNotAllowed();
  if (!(await requireAuth(request, env))) return unauthorized();
  if (!env.R2) {
    return json({ error: 'Server not configured: R2 bucket not bound' }, 500);
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'Expected a multipart form body' }, 400);
  }

  const file = form.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') {
    return json({ error: 'No file uploaded (field "file" is required)' }, 400);
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return json(
      { error: `Unsupported file type "${file.type}": only images are allowed` },
      400,
    );
  }
  if (file.size > MAX_BYTES) {
    return json({ error: 'File is too large: maximum 10 MB' }, 400);
  }

  const caption = form.get('caption') || '';
  const album = form.get('album') || null;
  const section = form.get('section') || null;

  const date = new Date().toISOString().slice(0, 10);
  const key = `uploads/${date}/${crypto.randomUUID()}-${sanitizeFilename(file.name)}`;

  await env.R2.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });

  const now = nowIso();
  const maxRow = await env.DB.prepare(
    'SELECT COALESCE(MAX(position), -1) AS maxPos FROM entities',
  ).first();
  const entity = {
    id: crypto.randomUUID(),
    type: 'photo',
    slug: null,
    title: caption || file.name,
    data: JSON.stringify({
      caption,
      alt: caption,
      section,
    }),
    position: (maxRow ? maxRow.maxPos : -1) + 1,
    visible: 1,
    album,
    image_key: key,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };

  await env.DB.batch([
    writeVersion(env.DB, entity.id, 'create', snapshotOf(entity)),
    env.DB.prepare(
      'INSERT INTO entities (id, type, slug, title, data, position, visible, album, image_key, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      entity.id,
      entity.type,
      entity.slug,
      entity.title,
      entity.data,
      entity.position,
      entity.visible,
      entity.album,
      entity.image_key,
      entity.created_at,
      entity.updated_at,
      entity.deleted_at,
    ),
  ]);

  return json({ entity: publicEntity(entity) }, 201);
}
