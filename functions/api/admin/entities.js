// /api/admin/entities — admin CRUD list + create. Session required.
// GET  — list all entities (deleted included by default; ?include_deleted=0
//        to exclude them; ?type= to filter by type), ordered by position.
// POST — create an entity. Writes a version row (action "create", snapshot
//        is the new entity JSON) in the same batch as the insert.

import {
  getEntity,
  json,
  methodNotAllowed,
  nowIso,
  publicEntity,
  readJsonBody,
  requireAuth,
  snapshotOf,
  unauthorized,
  writeVersion,
} from '../_lib.js';

export async function onRequest(context) {
  const { env, request } = context;
  if (!(await requireAuth(request, env))) return unauthorized();

  if (request.method === 'GET') return handleList(env, request);
  if (request.method === 'POST') return handleCreate(env, request);
  return methodNotAllowed();
}

async function handleList(env, request) {
  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  // Admin default: include deleted. Pass ?include_deleted=0 to exclude.
  const includeDeleted = url.searchParams.get('include_deleted') !== '0';

  const conditions = [];
  const params = [];
  if (type) {
    conditions.push('type = ?');
    params.push(type);
  }
  if (!includeDeleted) conditions.push('deleted_at IS NULL');

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const stmt = env.DB.prepare(
    `SELECT * FROM entities ${where} ORDER BY position ASC, id ASC`,
  );
  const { results } = await stmt.bind(...params).all();
  return json({ entities: results.map(publicEntity) });
}

async function handleCreate(env, request) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body || {};

  if (typeof body.type !== 'string' || body.type.length === 0) {
    return json({ error: 'type is required' }, 400);
  }

  const id =
    typeof body.id === 'string' && body.id.length > 0
      ? body.id
      : crypto.randomUUID();
  if (await getEntity(env.DB, id)) {
    return json({ error: `Entity with id "${id}" already exists` }, 409);
  }

  const now = nowIso();
  let position = body.position;
  if (position == null) {
    const row = await env.DB.prepare(
      'SELECT COALESCE(MAX(position), -1) AS maxPos FROM entities',
    ).first();
    position = (row ? row.maxPos : -1) + 1;
  }

  const dataText =
    typeof body.data === 'string'
      ? body.data
      : JSON.stringify(body.data ?? {});
  const entity = {
    id,
    type: body.type,
    slug: body.slug ?? null,
    title: body.title ?? null,
    data: dataText,
    position,
    visible: body.visible === false || body.visible === 0 ? 0 : 1,
    album: body.album ?? null,
    image_key: body.image_key ?? null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };

  // Version row (snapshot = the new entity) + insert, atomically.
  await env.DB.batch([
    writeVersion(env.DB, id, 'create', snapshotOf(entity)),
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
