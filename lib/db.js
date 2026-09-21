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
