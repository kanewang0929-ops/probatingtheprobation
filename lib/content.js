/* 内容模型：字段定义、校验与兜底合并。
   核心原则：任何一个字段坏掉，都只丢弃该字段并回退到页面内置值，绝不让整页空白。*/

export const LIMITS = {
  brand:      { min: 1, max: 40 },
  heroLine:   { min: 1, max: 30, maxLines: 3 },
  noteTitle:  { min: 1, max: 40 },
  captionText:{ min: 1, max: 80 },
  captions:   { min: 1, max: 6 },
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
  // 节拍秒数范围
  sec: { min: 0, max: 60 }
};

const isStr = v => typeof v === 'string';
const isNum = v => typeof v === 'number' && Number.isFinite(v);

function str(v, { min, max }, errors, label) {
  if (!isStr(v)) { errors.push(`${label} 必须是文本`); return null; }
  const t = v.trim();
  if (t.length < min) { errors.push(`${label} 不能为空`); return null; }
  if (t.length > max) { errors.push(`${label} 超过 ${max} 字`); return null; }
  return t;
}

function num(v, { min, max }, errors, label) {
  if (!isNum(v)) { errors.push(`${label} 必须是数字`); return null; }
  if (v < min || v > max) { errors.push(`${label} 超出范围 ${min}–${max}`); return null; }
  return v;
}

/** 校验一份完整内容。返回 { value, errors }。value 只包含通过校验的部分。 */
export function validate(raw) {
  const errors = [];
  const out = {};
  if (!raw || typeof raw !== 'object') return { value: null, errors: ['内容格式不正确'] };

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

  const noteTitle = str(site.noteTitle, LIMITS.noteTitle, errors, '泡泡区标题');
  if (noteTitle) s.noteTitle = noteTitle;
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
        id: isStr(c.id) && c.id ? c.id : `cap${i + 1}`,
        text, from, to,
        sortOrder: isNum(c.sortOrder) ? c.sortOrder : (i + 1) * 10,
        published: c.published !== false
      });
    });
  } else if (raw.captions !== undefined) errors.push('字幕必须是列表');

  // ── 泡泡 ──
  out.bubbles = [];
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
        const ok = b.steps.map((t, j) => str(t, LIMITS.step, errors, `${label} 步骤 ${j + 1}`));
        if (ok.every(Boolean)) steps = ok;
      }
      if (!name || !lead || !body || !steps || cx === null || cy === null || r === null) return;
      out.bubbles.push({
        id: isStr(b.id) && b.id ? b.id : `bub${i + 1}`,
        name, lead, body, steps, cx, cy, r,
        sortOrder: isNum(b.sortOrder) ? b.sortOrder : (i + 1) * 10,
        published: b.published !== false
      });
    });
  } else if (raw.bubbles !== undefined) errors.push('泡泡必须是列表');

  return { value: out, errors };
}

const bySort = (a, b) => (a.sortOrder - b.sortOrder) || 0;

/** 取出前台要用的「已发布」内容。只保留 published，并按 sortOrder 排序。 */
export function toPublic(content) {
  if (!content) return null;
  const { value } = validate(content);
  if (!value) return null;
  const captions = (value.captions || []).filter(c => c.published).sort(bySort);
  const bubbles  = (value.bubbles  || []).filter(b => b.published).sort(bySort);
  const out = {};
  if (value.site && Object.keys(value.site).length) out.site = value.site;
  // 字幕与泡泡都必须非空才覆盖，否则让页面用内置内容
  if (captions.length) out.captions = captions.map(({ published, sortOrder, ...c }) => c);
  if (bubbles.length)  out.bubbles  = bubbles.map(({ published, sortOrder, ...b }) => b);
  return Object.keys(out).length ? out : null;
}

/** 预览用：忽略发布状态，全部渲染。 */
export function toPreview(content) {
  if (!content) return null;
  const { value } = validate(content);
  if (!value) return null;
  const captions = (value.captions || []).slice().sort(bySort);
  const bubbles  = (value.bubbles  || []).slice().sort(bySort);
  const out = {};
  if (value.site && Object.keys(value.site).length) out.site = value.site;
  if (captions.length) out.captions = captions.map(({ published, sortOrder, ...c }) => c);
  if (bubbles.length)  out.bubbles  = bubbles.map(({ published, sortOrder, ...b }) => b);
  return Object.keys(out).length ? out : null;
}
