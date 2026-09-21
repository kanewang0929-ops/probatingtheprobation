/* Kane Wang 转正汇报 —— 前台 + 内容后台
   前台 HTML 在服务端注入内容，页面脚本同步读取，没有额外请求、没有时序风险。
   数据库不可用时不注入任何内容，页面原样使用内置 CONFIG。*/
import express from 'express';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as db from './lib/db.js';
import { validate, toPublic, toPreview, LIMITS, migrate, listPages, getPage, referencedAssets, CAPTION_FONTS, CAPTION_COLORS } from './lib/content.js';
import { renderSubpage, renderNotFound } from './lib/subpage.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const DEV = process.env.NODE_ENV !== 'production';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_TTL = 12 * 60 * 60 * 1000; // 12 小时

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;   // 单张图 4MB
const MIME_EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif'
};

/* ───────── 会话：HMAC 签名 Cookie，不落库 ───────── */
function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${mac}`;
}
function verify(token) {
  if (!token || typeof token !== 'string') return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const expect = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  const a = Buffer.from(mac), b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
}
function readCookie(req, name) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}
const session = req => verify(readCookie(req, 'kw_admin'));

function requireAuth(req, res, next) {
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: '后台未启用：服务端缺少 ADMIN_PASSWORD' });
  if (!session(req)) return res.status(401).json({ error: '未登录或登录已过期' });
  next();
}

/* 登录限速：同一 IP 连续失败后短暂锁定 */
const attempts = new Map();
function throttle(ip) {
  const rec = attempts.get(ip);
  if (!rec) return 0;
  if (Date.now() > rec.until) { attempts.delete(ip); return 0; }
  return rec.count >= 5 ? Math.ceil((rec.until - Date.now()) / 1000) : 0;
}
function noteFail(ip) {
  const rec = attempts.get(ip) || { count: 0, until: 0 };
  rec.count++;
  rec.until = Date.now() + Math.min(15 * 60_000, 2 ** rec.count * 1000);
  attempts.set(ip, rec);
}

/* ───────── 前台：注入内容后返回 HTML ───────── */
const HTML = readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
const MARKER = '<script>\n(() => {\n';
if (!HTML.includes(MARKER)) {
  console.error('[启动失败] public/index.html 结构与预期不符，找不到主脚本注入点');
  process.exit(1);
}

// 注入时转义 < ，避免内容里出现 </script> 提前闭合标签
const safeJson = obj => JSON.stringify(obj).replace(/</g, '\\u003c');

function renderPage(content) {
  if (!content) return HTML;
  const tag = `<script>window.__CONTENT__=${safeJson(content)};</script>\n`;
  return HTML.replace(MARKER, tag + MARKER);
}

async function servePage(req, res, mode) {
  let content = null;
  try {
    if (mode === 'preview') {
      const d = await db.getDraft();
      content = toPreview(d?.draft);
    } else {
      content = toPublic(await db.getPublished());
    }
  } catch (e) {
    if (DEV) console.error('[内容读取失败]', e.message);
  }
  res.type('html');
  res.set('Cache-Control', mode === 'preview' ? 'no-store' : 'public, max-age=0, must-revalidate');
  res.send(renderPage(content));
}

app.get('/', (req, res) => servePage(req, res, 'public'));
app.get('/index.html', (req, res) => servePage(req, res, 'public'));

// 草稿预览，需登录
app.get('/preview', requireAuth, (req, res) => servePage(req, res, 'preview'));

/* ───────── 子页面 ───────── */
async function serveSub(req, res, mode) {
  const n = Number(req.params.n);
  const preview = mode === 'preview';
  if (!Number.isInteger(n) || n < 1) {
    return res.status(404).type('html').send(renderNotFound(preview));
  }
  let content = null;
  try {
    content = preview ? (await db.getDraft())?.draft : await db.getPublished();
  } catch (e) {
    if (DEV) console.error('[子页面读取失败]', e.message);
  }
  const page = content ? getPage(content, n, { onlyPublished: !preview }) : null;
  res.set('Cache-Control', preview ? 'no-store' : 'public, max-age=0, must-revalidate');
  if (!page) return res.status(404).type('html').send(renderNotFound(preview));
  const brand = content?.site?.brand || '';
  res.type('html').send(renderSubpage(page, { preview, brand }));
}

app.get('/p/:n', (req, res) => serveSub(req, res, 'public'));
app.get('/preview/p/:n', requireAuth, (req, res) => serveSub(req, res, 'preview'));

/* ───────── 图片：id 是内容哈希，可以按 immutable 长缓存 ───────── */
app.get('/assets/:id', async (req, res) => {
  if (!/^[a-f0-9]{32}$/.test(req.params.id)) return res.status(404).end();
  const a = await db.getAsset(req.params.id);
  if (!a) return res.status(404).end();
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.set('X-Content-Type-Options', 'nosniff');
  res.type(a.mime).send(a.bytes);
});

/* 视频等静态资源；index.html 交给上面的路由处理 */
app.use(express.static(path.join(ROOT, 'public'), {
  index: false,
  setHeaders(res, file) {
    if (file.endsWith('.mp4')) res.set('Cache-Control', 'public, max-age=86400');
  }
}));

/* ───────── 后台 API ───────── */
app.post('/api/admin/login', (req, res) => {
  const ip = req.ip || 'unknown';
  const wait = throttle(ip);
  if (wait) return res.status(429).json({ error: `尝试过于频繁，请 ${wait} 秒后再试` });
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: '后台未启用：服务端缺少 ADMIN_PASSWORD' });

  const given = Buffer.from(String(req.body?.password ?? ''));
  const want = Buffer.from(ADMIN_PASSWORD);
  const ok = given.length === want.length && crypto.timingSafeEqual(given, want);
  if (!ok) { noteFail(ip); return res.status(401).json({ error: '密码不正确' }); }

  attempts.delete(ip);
  res.cookie('kw_admin', sign({ exp: Date.now() + SESSION_TTL }), {
    httpOnly: true, sameSite: 'lax', secure: !DEV, maxAge: SESSION_TTL, path: '/'
  });
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('kw_admin', { path: '/' });
  res.json({ ok: true });
});

app.get('/api/admin/session', (req, res) => {
  res.json({
    authed: Boolean(session(req)), enabled: Boolean(ADMIN_PASSWORD), limits: LIMITS,
    captionFonts: CAPTION_FONTS, captionColors: CAPTION_COLORS,
    maxImageBytes: MAX_IMAGE_BYTES, imageTypes: Object.keys(MIME_EXT)
  });
});

app.get('/api/admin/content', requireAuth, async (req, res) => {
  const d = await db.getDraft();
  const s = db.status();
  if (!d) {
    return res.status(503).json({
      error: s.configured ? '数据库暂时不可用' : '尚未连接数据库',
      detail: DEV ? s.error : undefined,
      fallback: db.seed()
    });
  }
  const published = await db.getPublished();
  res.set('Cache-Control', 'no-store');
  const draft = migrate(d.draft);
  res.json({
    draft,
    pages: listPages(draft),   // 每个步骤对应第几个子页面
    updatedAt: d.updatedAt,
    dirty: JSON.stringify(d.draft) !== JSON.stringify(published)
  });
});

app.put('/api/admin/content', requireAuth, async (req, res) => {
  const { errors } = validate(req.body);
  if (errors.length) return res.status(400).json({ error: '内容校验未通过', errors });
  const updatedAt = await db.saveDraft(req.body);
  if (!updatedAt) return res.status(503).json({ error: '保存失败：数据库不可用', detail: DEV ? db.status().error : undefined });
  res.json({ ok: true, updatedAt });
});

app.post('/api/admin/publish', requireAuth, async (req, res) => {
  const d = await db.getDraft();
  if (!d) return res.status(503).json({ error: '发布失败：数据库不可用' });
  const { errors } = validate(d.draft);
  if (errors.length) return res.status(400).json({ error: '草稿未通过校验，无法发布', errors });
  if (!toPublic(d.draft)) {
    return res.status(400).json({ error: '至少需要一条已发布的字幕和一个已发布的泡泡' });
  }
  const row = await db.publishDraft();
  if (!row) return res.status(503).json({ error: '发布失败：数据库不可用' });
  res.json({ ok: true, updatedAt: row.updated_at });
});

app.post('/api/admin/revert', requireAuth, async (req, res) => {
  const draft = await db.revertDraft();
  if (!draft) return res.status(503).json({ error: '放弃草稿失败：数据库不可用' });
  res.json({ ok: true, draft });
});

app.get('/api/admin/seed', requireAuth, (req, res) => res.json(db.seed()));

/* ───────── 图片上传 ─────────
   直接收原始字节（Content-Type 指明格式），不走 multipart，省一个依赖。
   id = 内容 sha256 前 32 位：同图重复上传只存一份。*/
app.post('/api/admin/assets',
  requireAuth,
  express.raw({ type: Object.keys(MIME_EXT), limit: MAX_IMAGE_BYTES }),
  async (req, res) => {
    const mime = (req.headers['content-type'] || '').split(';')[0].trim();
    if (!MIME_EXT[mime]) {
      return res.status(415).json({ error: `不支持的图片格式：${mime || '未知'}。可用：${Object.keys(MIME_EXT).join('、')}` });
    }
    if (!Buffer.isBuffer(req.body) || !req.body.length) {
      return res.status(400).json({ error: '没有收到图片内容' });
    }
    if (req.body.length > MAX_IMAGE_BYTES) {
      return res.status(413).json({ error: `图片超过 ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB` });
    }
    const id = crypto.createHash('sha256').update(req.body).digest('hex').slice(0, 32);
    const ok = await db.putAsset(id, mime, req.body);
    if (!ok) return res.status(503).json({ error: '上传失败：数据库不可用', detail: DEV ? db.status().error : undefined });
    res.json({ id, url: `/assets/${id}`, mime, size: req.body.length });
  }
);

/* 上传体积超限时 express.raw 会抛错，转成能看懂的提示 */
app.use('/api/admin/assets', (err, req, res, _next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: `图片超过 ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB` });
  }
  return res.status(400).json({ error: '图片上传失败', detail: DEV ? err?.message : undefined });
});

/* 清理没有被草稿或已发布内容引用的图片 */
app.post('/api/admin/assets/prune', requireAuth, async (req, res) => {
  const d = await db.getDraft();
  const pub = await db.getPublished();
  if (!d) return res.status(503).json({ error: '数据库不可用' });
  const keep = new Set([...referencedAssets(migrate(d.draft)), ...referencedAssets(migrate(pub))]);
  const removed = await db.pruneAssets(keep);
  res.json({ ok: true, removed });
});

/* ───────── 后台页面 ───────── */
app.use('/admin', express.static(path.join(ROOT, 'admin'), { index: 'index.html' }));

app.get('/healthz', (req, res) => {
  const s = db.status();
  res.json({ ok: true, db: s.configured ? (s.error ? 'error' : 'ok') : 'unconfigured' });
});

app.use((req, res) => res.status(404).type('txt').send('404'));

app.use((err, req, res, _next) => {
  console.error('[服务端错误]', err.message);
  res.status(500).json({ error: '服务端错误', detail: DEV ? err.message : undefined });
});

const ok = await db.init();
console.log(ok ? '[数据库] 已连接' : `[数据库] 未连接：${db.status().error}（页面将使用内置内容）`);
if (!ADMIN_PASSWORD) console.warn('[后台] 未设置 ADMIN_PASSWORD，管理接口已停用');

app.listen(PORT, () => console.log(`listening on ${PORT}`));
