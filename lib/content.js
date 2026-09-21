/* 内容模型：字段定义、校验、迁移与兜底合并。
   核心原则：任何一个字段坏掉，都只丢弃该字段并回退到页面内置值，绝不让整页空白。*/

export const CAPTION_FONTS = ['brush', 'dry', 'serif'];   // 粗毛笔 / 干笔 / 宋体
export const CAPTION_COLORS = ['white', 'black'];  // 白字深底 / 黑字浅底
export const CAPTION_ORIENTS = ['horizontal', 'vertical'];  // 横排 / 竖排

/* 结尾框正文是后加的必填字段。老草稿里没有这一项，
   不在这里补默认值的话，存量内容会直接卡在校验上，连保存都保存不了。*/
const DEFAULT_NOTE_BODY = '四个泡泡，是我做每个项目都会回到的四个动作。点开一个，看看我怎么想。';
const DEFAULT_NOTE_CUE = '点我，看最后一段';

export const LIMITS = {
  brand:      { min: 1, max: 40 },
  heroLine:   { min: 1, max: 30, maxLines: 3 },
  noteTitle:  { min: 1, max: 40 },
  noteBody:   { min: 1, max: 120 },
  noteCue:    { min: 1, max: 20 },
  captionText:{ min: 1, max: 80 },
  captions:   { min: 1, max: 8 },
  bubbleName: { min: 1, max: 8 },
  bubbleLead: { min: 1, max: 60 },
  bubbleBody: { min: 1, max: 300 },
  step:       { min: 1, max: 60 },
  steps:      { min: 1, max: 6 },
  bubbles:    { min: 1, max: 6 },
  // 与视频画面锁定的几何范围（视频坐标系 2560×1440）
  cx: { min: 0, max: 2560 },
  cy: { min: 0, max: 1440 },
  r:  { min: 40, max: 600 },
  sec: { min: 0, max: 60 },
  // 字幕自由定位：相对视口的百分比
  pos:  { min: 0, max: 100 },
  size: { min: 60, max: 220 },   // 字号缩放百分比
  // 子页面
  pageTitle: { min: 1, max: 60 },
  pageLead:  { min: 0, max: 160 },
  blockText: { min: 1, max: 2000 },
  blockCaption: { min: 0, max: 120 },
  blocks:    { min: 0, max: 40 },
  alt:       { min: 0, max: 120 }
};

const isStr = v => typeof v === 'string';
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const isAssetId = v => isStr(v) && /^[a-f0-9]{32}$/.test(v);

function str(v, { min, max }, errors, label) {
  if (!isStr(v)) { errors.push(`${label} 必须是文本`); return null; }
  const t = v.trim();
  if (t.length < min) { errors.push(`${label} 不能为空`); return null; }
  if (t.length > max) { errors.push(`${label} 超过 ${max} 字`); return null; }
  return t;
}

/** 可以为空的文本。空串返回 ''，不算错误。 */
function optStr(v, { max }, errors, label) {
  if (v === undefined || v === null || v === '') return '';
  if (!isStr(v)) { errors.push(`${label} 必须是文本`); return ''; }
  const t = v.trim();
  if (t.length > max) { errors.push(`${label} 超过 ${max} 字`); return null; }
  return t;
}

function num(v, { min, max }, errors, label) {
  if (!isNum(v)) { errors.push(`${label} 必须是数字`); return null; }
  if (v < min || v > max) { errors.push(`${label} 超出范围 ${min}–${max}`); return null; }
  return v;
}

/** 落在范围内就用，否则安静地取默认值——用于纯展示类字段，不打断保存。 */
function softNum(v, { min, max }, dflt) {
  return isNum(v) && v >= min && v <= max ? v : dflt;
}
const pick = (v, allowed, dflt) => (allowed.includes(v) ? v : dflt);

let seq = 0;
const newId = p => `${p}${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/* ───────── 迁移：把旧结构补齐成新结构 ─────────
   旧版 steps 是字符串数组，新版是 { id, text } —— id 用来绑定子页面，必须稳定。*/
export function migrate(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const c = structuredClone(raw);

  if (!c.site || typeof c.site !== 'object') c.site = {};
  if (!isStr(c.site.noteBody) || !c.site.noteBody.trim()) c.site.noteBody = DEFAULT_NOTE_BODY;
  if (!isStr(c.site.noteCue) || !c.site.noteCue.trim()) c.site.noteCue = DEFAULT_NOTE_CUE;

  if (Array.isArray(c.captions)) {
    c.captions.forEach(cap => {
      if (!cap || typeof cap !== 'object') return;
      if (!isStr(cap.id) || !cap.id) cap.id = newId('cap');
      cap.x     = softNum(cap.x, LIMITS.pos, 50);
      cap.y     = softNum(cap.y, LIMITS.pos, 82);
      cap.size  = softNum(cap.size, LIMITS.size, 100);
      cap.color = pick(cap.color, CAPTION_COLORS, 'white');
      cap.font  = pick(cap.font, CAPTION_FONTS, 'serif');
      cap.orient = pick(cap.orient, CAPTION_ORIENTS, 'horizontal');
      cap.panel = cap.panel === true;
    });
  }

  if (Array.isArray(c.bubbles)) {
    c.bubbles.forEach(b => {
      if (!b || typeof b !== 'object') return;
      if (!isStr(b.id) || !b.id) b.id = newId('bub');
      if (Array.isArray(b.steps)) {
        b.steps = b.steps.map(s =>
          isStr(s) ? { id: newId('st'), text: s }
                   : { id: (s && isStr(s.id) && s.id) ? s.id : newId('st'),
                       text: (s && isStr(s.text)) ? s.text : '' }
        );
      }
    });
  }

  if (!c.pages || typeof c.pages !== 'object' || Array.isArray(c.pages)) c.pages = {};
  return c;
}

/* ───────── 子页面编号：按泡泡顺序、再按步骤顺序，全局从 1 连续编号 ───────── */
const bySort = (a, b) => (a.sortOrder - b.sortOrder) || 0;

/**
 * 列出全部子页面，带全局序号。
 * 编号始终覆盖所有泡泡（不看发布状态），这样把某个泡泡下线不会让后面的页码整体位移，
 * 后台显示的编号和线上地址永远一致。是否可访问由 getPage 单独判断。
 */
export function listPages(content) {
  const out = [];
  const bubbles = (content?.bubbles || []).slice().sort(bySort);
  let n = 0;
  for (const b of bubbles) {
    for (const s of (b.steps || [])) {
      if (!s?.id) continue;
      n++;
      out.push({ n, stepId: s.id, bubbleId: b.id, bubbleName: b.name, stepText: s.text,
                 bubblePublished: b.published !== false });
    }
  }
  return out;
}

/* ───────── 校验 ───────── */
function validatePage(raw, errors, label) {
  if (!raw || typeof raw !== 'object') return null;
  const title = str(raw.title, LIMITS.pageTitle, errors, `${label} 标题`);
  const lead = optStr(raw.lead, LIMITS.pageLead, errors, `${label} 导语`);
  if (title === null || lead === null) return null;

  const blocks = [];
  if (Array.isArray(raw.blocks)) {
    if (raw.blocks.length > LIMITS.blocks.max) errors.push(`${label} 内容块最多 ${LIMITS.blocks.max} 个`);
    raw.blocks.slice(0, LIMITS.blocks.max).forEach((bl, i) => {
      const bl_ = `${label} 第 ${i + 1} 块`;
      if (bl?.type === 'text') {
        const t = str(bl.text, LIMITS.blockText, errors, `${bl_} 正文`);
        if (t !== null) blocks.push({ type: 'text', id: isStr(bl.id) && bl.id ? bl.id : newId('bl'), text: t });
      } else if (bl?.type === 'image') {
        if (!isAssetId(bl.assetId)) { errors.push(`${bl_} 图片缺失或无效`); return; }
        const alt = optStr(bl.alt, LIMITS.alt, errors, `${bl_} 替代文本`);
        const cap = optStr(bl.caption, LIMITS.blockCaption, errors, `${bl_} 图注`);
        if (alt === null || cap === null) return;
        blocks.push({ type: 'image', id: isStr(bl.id) && bl.id ? bl.id : newId('bl'),
                      assetId: bl.assetId, alt, caption: cap });
      } else {
        errors.push(`${bl_} 类型无法识别`);
      }
    });
  }

  return {
    title, lead, blocks,
    background: isAssetId(raw.background) ? raw.background : null,
    published: raw.published !== false
  };
}

/** 校验一份完整内容。返回 { value, errors }。value 只包含通过校验的部分。 */
export function validate(input) {
  const errors = [];
  const out = {};
  if (!input || typeof input !== 'object') return { value: null, errors: ['内容格式不正确'] };
  const raw = migrate(input);

  // ── 站点全局 ──
  const site = raw.site && typeof raw.site === 'object' ? raw.site : {};
  const s = {};
  const brand = str(site.brand, LIMITS.brand, errors, '站名');
  if (brand) s.brand = brand;

  if (Array.isArray(site.heroTitle)) {
    if (site.heroTitle.length > LIMITS.heroLine.maxLines) {
      errors.push(`首屏标题最多 ${LIMITS.heroLine.maxLines} 行`);
    } else {
      const lines = site.heroTitle
        .map((l, i) => str(l, LIMITS.heroLine, errors, `首屏标题第 ${i + 1} 行`))
        .filter(Boolean);
      if (lines.length === site.heroTitle.length && lines.length) s.heroTitle = lines;
    }
  } else if (site.heroTitle !== undefined) {
    errors.push('首屏标题必须是多行文本');
  }

  const noteTitle = str(site.noteTitle, LIMITS.noteTitle, errors, '结尾框标题');
  if (noteTitle) s.noteTitle = noteTitle;
  const noteBody = str(site.noteBody, LIMITS.noteBody, errors, '结尾框正文');
  if (noteBody) s.noteBody = noteBody;
  const noteCue = str(site.noteCue, LIMITS.noteCue, errors, '结尾框按钮文字');
  if (noteCue) s.noteCue = noteCue;
  out.site = s;

  // ── 字幕 ──
  out.captions = [];
  if (Array.isArray(raw.captions)) {
    if (raw.captions.length > LIMITS.captions.max) errors.push(`字幕最多 ${LIMITS.captions.max} 条`);
    raw.captions.slice(0, LIMITS.captions.max).forEach((c, i) => {
      const label = `字幕 ${i + 1}`;
      const text = str(c?.text, LIMITS.captionText, errors, `${label} 文案`);
      const from = num(c?.from, LIMITS.sec, errors, `${label} 起始秒`);
      const to   = num(c?.to,   LIMITS.sec, errors, `${label} 结束秒`);
      if (from !== null && to !== null && from >= to) errors.push(`${label} 起始秒必须小于结束秒`);
      if (text === null || from === null || to === null || from >= to) return;
      out.captions.push({
        id: isStr(c.id) && c.id ? c.id : newId('cap'),
        text, from, to,
        x: softNum(c.x, LIMITS.pos, 50),
        y: softNum(c.y, LIMITS.pos, 82),
        size: softNum(c.size, LIMITS.size, 100),
        color: pick(c.color, CAPTION_COLORS, 'white'),
        font: pick(c.font, CAPTION_FONTS, 'serif'),
        orient: pick(c.orient, CAPTION_ORIENTS, 'horizontal'),
        panel: c.panel === true,
        sortOrder: isNum(c.sortOrder) ? c.sortOrder : (i + 1) * 10,
        published: c.published !== false
      });
    });
  } else if (raw.captions !== undefined) errors.push('字幕必须是列表');

  // ── 泡泡 ──
  out.bubbles = [];
  const stepIds = new Set();
  if (Array.isArray(raw.bubbles)) {
    if (raw.bubbles.length > LIMITS.bubbles.max) errors.push(`泡泡最多 ${LIMITS.bubbles.max} 个`);
    raw.bubbles.slice(0, LIMITS.bubbles.max).forEach((b, i) => {
      const label = `泡泡 ${i + 1}`;
      const name = str(b?.name, LIMITS.bubbleName, errors, `${label} 名称`);
      const lead = str(b?.lead, LIMITS.bubbleLead, errors, `${label} 一句话`);
      const body = str(b?.body, LIMITS.bubbleBody, errors, `${label} 正文`);
      const cx = num(b?.cx, LIMITS.cx, errors, `${label} 圆心 X`);
      const cy = num(b?.cy, LIMITS.cy, errors, `${label} 圆心 Y`);
      const r  = num(b?.r,  LIMITS.r,  errors, `${label} 半径`);
      let steps = null;
      if (!Array.isArray(b?.steps)) errors.push(`${label} 步骤必须是列表`);
      else if (b.steps.length < LIMITS.steps.min || b.steps.length > LIMITS.steps.max) {
        errors.push(`${label} 步骤需 ${LIMITS.steps.min}–${LIMITS.steps.max} 条`);
      } else {
        const ok = b.steps.map((st, j) => {
          const t = str(st?.text, LIMITS.step, errors, `${label} 步骤 ${j + 1}`);
          if (t === null) return null;
          let id = isStr(st.id) && st.id ? st.id : newId('st');
          if (stepIds.has(id)) id = newId('st');   // 复制泡泡时可能撞 id
          stepIds.add(id);
          return { id, text: t };
        });
        if (ok.every(Boolean)) steps = ok;
      }
      if (!name || !lead || !body || !steps || cx === null || cy === null || r === null) return;
      out.bubbles.push({
        id: isStr(b.id) && b.id ? b.id : newId('bub'),
        name, lead, body, steps, cx, cy, r,
        sortOrder: isNum(b.sortOrder) ? b.sortOrder : (i + 1) * 10,
        published: b.published !== false
      });
    });
  } else if (raw.bubbles !== undefined) errors.push('泡泡必须是列表');

  // ── 子页面：按 stepId 存，孤儿条目（步骤已删）自动丢弃 ──
  out.pages = {};
  const live = new Set();
  out.bubbles.forEach(b => b.steps.forEach(s => live.add(s.id)));
  for (const [stepId, page] of Object.entries(raw.pages || {})) {
    if (!live.has(stepId)) continue;
    const v = validatePage(page, errors, `子页面「${page?.title || stepId}」`);
    if (v) out.pages[stepId] = v;
  }

  return { value: out, errors };
}

/** 收集内容里引用到的全部图片 id，用于清理无人引用的资源。 */
export function referencedAssets(content) {
  const ids = new Set();
  for (const page of Object.values(content?.pages || {})) {
    if (page?.background) ids.add(page.background);
    for (const b of page?.blocks || []) if (b?.type === 'image' && b.assetId) ids.add(b.assetId);
  }
  return ids;
}

function shape(value, { onlyPublished }) {
  const captions = (value.captions || [])
    .filter(c => (onlyPublished ? c.published : true)).slice().sort(bySort);
  const bubbles = (value.bubbles || [])
    .filter(b => (onlyPublished ? b.published : true)).slice().sort(bySort);
  const out = {};
  if (value.site && Object.keys(value.site).length) out.site = value.site;
  // 字幕与泡泡都必须非空才覆盖，否则让页面用内置内容
  if (captions.length) out.captions = captions.map(({ published, sortOrder, ...c }) => c);
  if (bubbles.length) {
    // 前台需要知道每个步骤对应第几个子页面，以及那一页是否可进入。
    // 编号按全部泡泡算，和 listPages 一致，不受发布状态影响。
    const numOf = new Map(listPages(value).map(p => [p.stepId, p.n]));
    out.bubbles = bubbles.map(({ published, sortOrder, ...b }) => ({
      ...b,
      steps: b.steps.map(s => {
        const page = value.pages?.[s.id];
        const open = Boolean(page && (onlyPublished ? page.published : true));
        return { text: s.text, page: open ? numOf.get(s.id) : null };
      })
    }));
  }
  return Object.keys(out).length ? out : null;
}

/** 取出前台要用的「已发布」内容。 */
export function toPublic(content) {
  if (!content) return null;
  const { value } = validate(content);
  if (!value) return null;
  return shape(value, { onlyPublished: true });
}

/** 预览用：忽略发布状态，全部渲染。 */
export function toPreview(content) {
  if (!content) return null;
  const { value } = validate(content);
  if (!value) return null;
  return shape(value, { onlyPublished: false });
}

/** 取第 n 个子页面的完整内容（含正文块），供服务端渲染。 */
export function getPage(content, n, { onlyPublished }) {
  const { value } = validate(content);
  if (!value) return null;
  const pages = listPages(value);
  const entry = pages.find(p => p.n === n);
  if (!entry) return null;
  const page = value.pages?.[entry.stepId];
  if (!page) return null;
  // 正式页面要求：所属泡泡已发布，且这一页自身也已发布
  if (onlyPublished && (!entry.bubblePublished || !page.published)) return null;
  return { ...page, n, total: pages.length, bubbleName: entry.bubbleName, stepText: entry.stepText };
}
