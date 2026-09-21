/* Postgres 访问层。数据库不可用时全部降级为 null，调用方回退到页面内置内容。*/
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SEED = JSON.parse(readFileSync(fileURLToPath(new URL('./seed.json', import.meta.url)), 'utf8'));

let pool = null;
let ready = null;
let lastError = null;

export function seed() {
  return structuredClone(SEED);
}

export function status() {
  return { configured: Boolean(process.env.DATABASE_URL), error: lastError };
}

function getPool() {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  pool = new pg.Pool({
    connectionString: url,
    // Render 托管的 Postgres 走 TLS，但证书由内部 CA 签发
    ssl: url.includes('localhost') ? false : { rejectUnauthorized: false },
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000
  });
  pool.on('error', e => { lastError = e.message; });
  return pool;
}

/** 建表并写入初始内容（只在表为空时写种子）。 */
export async function init() {
  if (ready) return ready;
  ready = (async () => {
    const p = getPool();
    if (!p) { lastError = '未配置 DATABASE_URL'; return false; }
    try {
      await p.query(`
        CREATE TABLE IF NOT EXISTS asset (
          id         text PRIMARY KEY,
          mime       text NOT NULL,
          bytes      bytea NOT NULL,
          size       int NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await p.query(`
        CREATE TABLE IF NOT EXISTS content (
          id         int PRIMARY KEY DEFAULT 1,
          draft      jsonb NOT NULL,
          published  jsonb,
          updated_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT content_singleton CHECK (id = 1)
        )
      `);
      await p.query(
        `INSERT INTO content (id, draft, published) VALUES (1, $1, $1)
         ON CONFLICT (id) DO NOTHING`,
        [JSON.stringify(SEED)]
      );
      lastError = null;
      return true;
    } catch (e) {
      lastError = e.message;
      return false;
    }
  })();
  return ready;
}

async function query(sql, params) {
  const p = getPool();
  if (!p) { lastError = '未配置 DATABASE_URL'; return null; }
  try {
    const r = await p.query(sql, params);
    lastError = null;
    return r;
  } catch (e) {
    lastError = e.message;
    return null;
  }
}

export async function getPublished() {
  const r = await query('SELECT published FROM content WHERE id = 1');
  return r?.rows?.[0]?.published ?? null;
}

export async function getDraft() {
  const r = await query('SELECT draft, updated_at FROM content WHERE id = 1');
  if (!r?.rows?.[0]) return null;
  return { draft: r.rows[0].draft, updatedAt: r.rows[0].updated_at };
}

export async function saveDraft(content) {
  const r = await query(
    `INSERT INTO content (id, draft) VALUES (1, $1)
     ON CONFLICT (id) DO UPDATE SET draft = $1, updated_at = now()
     RETURNING updated_at`,
    [JSON.stringify(content)]
  );
  return r?.rows?.[0]?.updated_at ?? null;
}

export async function publishDraft() {
  const r = await query(
    `UPDATE content SET published = draft, updated_at = now() WHERE id = 1
     RETURNING published, updated_at`
  );
  return r?.rows?.[0] ?? null;
}

/** 把已发布内容回灌为草稿，用于「放弃草稿改动」。 */
export async function revertDraft() {
  const r = await query(
    `UPDATE content SET draft = COALESCE(published, draft), updated_at = now() WHERE id = 1
     RETURNING draft`
  );
  return r?.rows?.[0]?.draft ?? null;
}

export async function close() {
  if (pool) { await pool.end().catch(() => {}); pool = null; ready = null; }
}

/* ───────── 图片资源 ─────────
   id 是内容的 sha256 前 32 位：同一张图重复上传只存一份，且可以按 immutable 长缓存。*/

export async function putAsset(id, mime, buf) {
  const r = await query(
    `INSERT INTO asset (id, mime, bytes, size) VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [id, mime, buf, buf.length]
  );
  return r ? id : null;   // 已存在时 rows 为空，但也算成功
}

export async function getAsset(id) {
  const r = await query('SELECT mime, bytes FROM asset WHERE id = $1', [id]);
  return r?.rows?.[0] ?? null;
}

export async function listAssets() {
  const r = await query('SELECT id, mime, size, created_at FROM asset ORDER BY created_at DESC');
  return r?.rows ?? [];
}

/** 删除没有被草稿或已发布内容引用的图片，返回删除数量。 */
export async function pruneAssets(keepIds) {
  const keep = [...keepIds];
  const r = keep.length
    ? await query('DELETE FROM asset WHERE NOT (id = ANY($1::text[]))', [keep])
    : await query('DELETE FROM asset');
  return r?.rowCount ?? 0;
}
