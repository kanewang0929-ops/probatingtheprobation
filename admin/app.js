/* 内容后台。原生 JS，无构建步骤。所有 DOM 都用 createElement + textContent 构造，不用 innerHTML。*/
(() => {
'use strict';

const app = document.getElementById('app');
const modal = document.getElementById('modal');
const L = {  // 与服务端 lib/content.js 的 LIMITS 保持一致，登录后会用服务端值覆盖
  brand:{max:40}, heroLine:{max:30,maxLines:3}, noteTitle:{max:40},
  captionText:{max:80}, captions:{max:6},
  bubbleName:{max:8}, bubbleLead:{max:60}, bubbleBody:{max:300},
  step:{max:60}, steps:{min:1,max:6}, bubbles:{max:6},
  cx:{min:0,max:2560}, cy:{min:0,max:1440}, r:{min:40,max:600}, sec:{min:0,max:60},
  pos:{min:0,max:100}, size:{min:60,max:220},
  pageTitle:{max:60}, pageLead:{max:160}, blockText:{max:2000},
  blockCaption:{max:120}, alt:{max:120}, blocks:{max:40}
};
let MAX_IMAGE_BYTES = 4 * 1024 * 1024;
let IMAGE_TYPES = ['image/jpeg','image/png','image/webp','image/gif','image/avif'];
const FONT_LABEL  = { brush: '毛笔', serif: '宋体' };
const COLOR_LABEL = { white: '白字', black: '黑字' };

let state = { authed:false, enabled:true, draft:null, pages:[], dirty:false, updatedAt:null, saving:false, msg:null };

/* ───────── 工具 ───────── */
const el = (tag, attrs = {}, kids = []) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') n.value = v;
    else if (v === true) n.setAttribute(k, '');
    else n.setAttribute(k, v);
  }
  for (const c of [].concat(kids)) if (c) n.appendChild(c);
  return n;
};
const clear = n => { while (n.firstChild) n.removeChild(n.firstChild); };
const uid = p => p + Math.random().toString(36).slice(2, 8);
const openPages = new Set();   // 记住哪些子页面是展开的，render 后保持原样
let selectedCap = null;        // 画布上被选中的字幕，避免几条重叠时抓不到想要的那条

async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    ...opts
  });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const e = new Error(data?.error || `请求失败（HTTP ${res.status}）`);
    e.errors = data?.errors; e.status = res.status;
    throw e;
  }
  return data;
}

function confirmAsk(title, body, yesLabel = '确认') {
  return new Promise(resolve => {
    document.getElementById('mTitle').textContent = title;
    document.getElementById('mBody').textContent = body;
    const yes = document.getElementById('mYes'), no = document.getElementById('mNo');
    yes.textContent = yesLabel;
    const done = v => { modal.hidden = true; yes.onclick = null; no.onclick = null; document.onkeydown = null; resolve(v); };
    yes.onclick = () => done(true);
    no.onclick = () => done(false);
    document.onkeydown = e => { if (e.key === 'Escape') done(false); };
    modal.hidden = false;
    yes.focus();
  });
}

const markDirty = () => {
  state.dirty = true;
  state.msg = null;
  const badge = document.querySelector('.top .badge');
  if (badge) { badge.className = 'badge dirty'; badge.textContent = '有未保存的改动'; }
  const msg = document.querySelector('.wrap > .msg');
  if (msg) msg.remove();
  renderBar();
};

/* ───────── 字段构件 ───────── */
function textField({ label, value, max, required, multiline, rows = 3, onInput }) {
  const counter = el('span', { class: 'count' });
  const input = multiline
    ? el('textarea', { rows, value: value ?? '' })
    : el('input', { type: 'text', value: value ?? '' });
  const sync = () => {
    const n = input.value.trim().length;
    counter.textContent = `${n}/${max}`;
    counter.classList.toggle('over', n > max);
    input.classList.toggle('bad', n > max || (required && n === 0));
  };
  input.addEventListener('input', () => { sync(); onInput(input.value); markDirty(); });
  sync();
  const lab = el('label', {}, [counter, document.createTextNode(label)]);
  if (required) lab.appendChild(el('span', { class: 'req', text: '*' }));
  return el('div', { class: 'field' }, [lab, input]);
}

function numField({ label, value, min, max, onInput }) {
  const input = el('input', { type: 'number', value: String(value ?? ''), min: String(min), max: String(max), step: 'any' });
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    const bad = !Number.isFinite(v) || v < min || v > max;
    input.classList.toggle('bad', bad);
    onInput(Number.isFinite(v) ? v : null);
    markDirty();
  });
  return el('div', { class: 'field' }, [el('label', { text: `${label}（${min}–${max}）` }), input]);
}

/** 分段选择器（字体、配色这类少量互斥选项）。 */
function segField({ label, value, options, onChange, previewClass }) {
  const seg = el('div', { class: 'seg' });
  options.forEach(o => {
    const b = el('button', {
      type: 'button', class: (o.value === value ? 'on' : '') + (previewClass && o.value === previewClass ? ' brush-preview' : ''),
      text: o.label,
      onClick: () => { onChange(o.value); markDirty(); render(); }
    });
    seg.appendChild(b);
  });
  return el('div', { class: 'field' }, [el('label', { text: label }), seg]);
}

/** 滑块 + 数值回显。 */
function rangeField({ label, value, min, max, step = 1, suffix = '', onInput }) {
  const out = el('span', { class: 'val', text: value + suffix });
  const r = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) });
  r.addEventListener('input', () => {
    const v = Number(r.value);
    out.textContent = v + suffix;
    onInput(v);
    markDirty();
  });
  return el('div', { class: 'field' }, [
    el('label', { text: label }),
    el('div', { class: 'row' }, [r, out])
  ]);
}

/** 图片上传：进度、缩略图、格式与大小校验、替换与删除。 */
function imageField({ label, assetId, onChange, hint }) {
  const thumb = el('div', { class: 'up__thumb' });
  const setThumb = id => {
    if (id) { thumb.style.backgroundImage = `url('/assets/${id}')`; thumb.textContent = ''; }
    else { thumb.style.backgroundImage = ''; thumb.textContent = '无图'; }
  };
  setThumb(assetId);

  const bar = el('i');
  const barWrap = el('div', { class: 'up__bar' }, [bar]);
  barWrap.style.display = 'none';
  const meta = el('div', { class: 'up__meta', text: hint || (assetId ? '已设置' : '尚未上传') });

  const file = el('input', { type: 'file', accept: IMAGE_TYPES.join(',') });
  const choose = el('button', { class: 'btn sm', text: assetId ? '更换图片' : '上传图片',
    onClick: () => file.click() });
  const clear = el('button', { class: 'btn sm danger', text: '移除', disabled: !assetId,
    onClick: async () => {
      if (!await confirmAsk('移除图片', '这一处会变回没有图片的状态。图片本身仍留在图库里，可以再次选用。', '移除')) return;
      onChange(null); markDirty(); render();
    } });

  file.addEventListener('change', () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    if (!IMAGE_TYPES.includes(f.type)) {
      meta.className = 'up__meta err';
      meta.textContent = `不支持的格式：${f.type || '未知'}。可用 JPG / PNG / WebP / GIF / AVIF`;
      return;
    }
    if (f.size > MAX_IMAGE_BYTES) {
      meta.className = 'up__meta err';
      meta.textContent = `图片 ${(f.size / 1024 / 1024).toFixed(1)}MB，超过上限 ${(MAX_IMAGE_BYTES / 1024 / 1024).toFixed(0)}MB`;
      return;
    }
    meta.className = 'up__meta';
    meta.textContent = '上传中…';
    barWrap.style.display = '';
    bar.style.width = '0%';
    choose.disabled = true;

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/admin/assets');
    xhr.setRequestHeader('Content-Type', f.type);
    xhr.withCredentials = true;
    xhr.upload.addEventListener('progress', e => {
      if (e.lengthComputable) bar.style.width = Math.round((e.loaded / e.total) * 100) + '%';
    });
    xhr.addEventListener('load', () => {
      choose.disabled = false;
      barWrap.style.display = 'none';
      let r = null;
      try { r = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && r?.id) {
        onChange(r.id);
        setThumb(r.id);
        meta.className = 'up__meta';
        meta.textContent = `已上传 · ${(r.size / 1024).toFixed(0)}KB`;
        markDirty();
        render();
      } else {
        meta.className = 'up__meta err';
        meta.textContent = r?.error || `上传失败（HTTP ${xhr.status}）`;
      }
    });
    xhr.addEventListener('error', () => {
      choose.disabled = false;
      barWrap.style.display = 'none';
      meta.className = 'up__meta err';
      meta.textContent = '上传失败：网络错误';
    });
    xhr.send(f);
  });

  return el('div', { class: 'field' }, [
    el('label', { text: label }),
    el('div', { class: 'up' }, [
      thumb,
      el('div', { class: 'up__side' }, [
        el('div', { class: 'row' }, [choose, clear, file]),
        barWrap, meta
      ])
    ])
  ]);
}

function toggle(checked, onChange) {
  const input = el('input', { type: 'checkbox' });
  input.checked = checked;
  input.addEventListener('change', () => { onChange(input.checked); markDirty(); });
  return el('label', { class: 'toggle' }, [input, el('span', { class: 'dot' }), el('span', { text: '发布' })]);
}

/* ───────── 列表排序 ───────── */
function move(list, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  list.forEach((x, k) => { x.sortOrder = (k + 1) * 10; });
  markDirty();
  render();
}

function itemHead({ list, i, title, onDup, canDelete = true, label }) {
  const item = list[i];
  const ops = el('div', { class: 'ops' }, [
    el('button', { class: 'btn sm ghost', text: '↑', title: '上移', disabled: i === 0,
      onClick: () => move(list, i, -1) }),
    el('button', { class: 'btn sm ghost', text: '↓', title: '下移', disabled: i === list.length - 1,
      onClick: () => move(list, i, 1) }),
    onDup && el('button', { class: 'btn sm ghost', text: '复制', onClick: onDup }),
    el('button', {
      class: 'btn sm danger', text: '删除', disabled: !canDelete,
      onClick: async () => {
        if (await confirmAsk(`删除${label}`, `确定删除「${title}」？此操作不可撤销，但在点击「发布」之前不会影响正式页面。`, '删除')) {
          list.splice(i, 1);
          list.forEach((x, k) => { x.sortOrder = (k + 1) * 10; });
          markDirty(); render();
        }
      }
    })
  ].filter(Boolean));

  return el('div', { class: 'head' }, [
    el('span', { class: 'idx', text: String(i + 1) }),
    el('span', { class: 'name', text: title }),
    toggle(item.published !== false, v => { item.published = v; render(); }),
    ops
  ]);
}

/* ───────── 各区块 ───────── */
function siteCard(d) {
  const s = d.site;
  const lines = Array.isArray(s.heroTitle) ? s.heroTitle : [''];
  const heroFields = lines.map((line, i) => textField({
    label: `首屏标题 第 ${i + 1} 行`, value: line, max: L.heroLine.max, required: true,
    onInput: v => { s.heroTitle[i] = v; }
  }));

  const addLine = el('button', {
    class: 'btn sm ghost', text: '+ 加一行',
    disabled: lines.length >= L.heroLine.maxLines,
    onClick: () => { s.heroTitle.push(''); markDirty(); render(); }
  });
  const delLine = el('button', {
    class: 'btn sm ghost', text: '− 删末行', disabled: lines.length <= 1,
    onClick: () => { s.heroTitle.pop(); markDirty(); render(); }
  });

  return el('section', { class: 'card' }, [
    el('header', {}, [el('h2', { text: '站点信息' }), el('span', { class: 'hint', text: '页面顶部与首屏文案' })]),
    el('div', { class: 'body' }, [
      textField({ label: '站名（页面左上角）', value: s.brand, max: L.brand.max, required: true,
        onInput: v => { s.brand = v; } }),
      ...heroFields,
      el('div', { class: 'row', style: 'margin:-6px 0 15px' }, [addLine, delLine]),
      textField({ label: '泡泡区标题', value: s.noteTitle, max: L.noteTitle.max, required: true,
        onInput: v => { s.noteTitle = v; } })
    ])
  ]);
}

/* ───────── 字幕：可视化定位 ───────── */
const clamp01 = v => Math.min(100, Math.max(0, v));
const round1 = v => Math.round(v * 10) / 10;

/** 16:9 画布，按视口百分比摆放每条字幕，可直接拖动。 */
function captionStage(list, refs) {
  const stage = el('div', { class: 'stage' }, [
    el('div', { class: 'stage__safe' }),
    el('div', { class: 'stage__hint', text: '拖动字幕调整位置 · 越靠边文字可用的宽度越窄、会折更多行，尽量放在虚线内' })
  ]);

  list.forEach((c, i) => {
    const chip = el('div', {
      class: 'chip'
        + (c.published === false ? ' off' : '')
        + (c.color === 'black' ? ' black' : '')
        + (c.font === 'brush' ? ' brush' : ''),
      title: '拖动调整位置'
    }, [
      el('span', { class: 'chip__n', text: String(i + 1) }),
      el('span', { text: c.text || '（空字幕）' })
    ]);
    chip.style.left = clamp01(c.x) + '%';
    chip.style.top = clamp01(c.y) + '%';
    // 时间上错开的字幕在正式页面是一条条出现的，但画布上会全部叠在一起。
    // 用层级 + 选中态保证每一条都抓得到。
    chip.style.zIndex = String(selectedCap === c.id ? 20 : i + 1);
    if (selectedCap === c.id) chip.classList.add('sel');

    chip.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (selectedCap !== c.id) {
        selectedCap = c.id;
        stage.querySelectorAll('.chip').forEach(n => n.classList.remove('sel'));
        chip.classList.add('sel');
        chip.style.zIndex = '20';
      }
      chip.setPointerCapture(e.pointerId);
      chip.classList.add('dragging');
      const box = stage.getBoundingClientRect();
      const onMove = ev => {
        c.x = round1(clamp01(((ev.clientX - box.left) / box.width) * 100));
        c.y = round1(clamp01(((ev.clientY - box.top) / box.height) * 100));
        chip.style.left = c.x + '%';
        chip.style.top = c.y + '%';
        // 同步下面的数字输入框，避免拖完还要整页重绘
        const ref = refs[c.id];
        if (ref) { ref.x.value = String(c.x); ref.y.value = String(c.y); }
      };
      const onUp = () => {
        chip.classList.remove('dragging');
        chip.removeEventListener('pointermove', onMove);
        chip.removeEventListener('pointerup', onUp);
        chip.removeEventListener('pointercancel', onUp);
        markDirty();
      };
      chip.addEventListener('pointermove', onMove);
      chip.addEventListener('pointerup', onUp);
      chip.addEventListener('pointercancel', onUp);
    });

    stage.appendChild(chip);
  });

  return stage;
}

function captionItem(c, list, i, refs) {
  const xIn = el('input', { type: 'number', value: String(c.x), min: '0', max: '100', step: '0.5' });
  const yIn = el('input', { type: 'number', value: String(c.y), min: '0', max: '100', step: '0.5' });
  refs[c.id] = { x: xIn, y: yIn };
  const bindPos = (input, key) => input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    const bad = !Number.isFinite(v) || v < 0 || v > 100;
    input.classList.toggle('bad', bad);
    if (!bad) { c[key] = v; markDirty(); render(); }
  });
  bindPos(xIn, 'x'); bindPos(yIn, 'y');

  return el('div', { class: 'item' + (c.published === false ? ' off' : '') }, [
    itemHead({ list, i, title: c.text || '（空字幕）', label: '字幕',
      canDelete: list.length > 1,
      onDup: list.length < L.captions.max
        ? () => { list.splice(i + 1, 0, { ...c, id: uid('cap'), y: clamp01(c.y + 6) }); markDirty(); render(); }
        : null }),
    el('div', { class: 'body' }, [
      el('button', { class: 'btn sm' + (selectedCap === c.id ? ' primary' : ''),
        text: selectedCap === c.id ? '已在画布上选中' : '在画布上选中这条',
        style: 'margin-bottom:13px',
        title: '几条字幕位置重叠时，先选中再拖',
        onClick: () => { selectedCap = c.id; render();
          document.querySelector('.stage')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }),
      textField({ label: '字幕文案', value: c.text, max: L.captionText.max, required: true, multiline: true, rows: 2,
        onInput: v => { c.text = v; } }),

      el('div', { class: 'row' }, [
        segField({ label: '字体', value: c.font, previewClass: 'brush',
          options: [{ value: 'brush', label: '毛笔' }, { value: 'serif', label: '宋体' }],
          onChange: v => { c.font = v; } }),
        segField({ label: '颜色', value: c.color,
          options: [{ value: 'white', label: '白字' }, { value: 'black', label: '黑字' }],
          onChange: v => { c.color = v; } })
      ]),
      el('p', { class: 'up__meta', text: c.color === 'black' ? '黑字会配浅色底板' : '白字会配深色底板',
        style: 'margin:-8px 0 14px' }),

      rangeField({ label: '字号', value: c.size, min: L.size.min, max: L.size.max, step: 5, suffix: '%',
        onInput: v => { c.size = v; } }),

      el('div', { class: 'field' }, [
        el('label', { text: '位置（也可以直接拖上面的画布）' }),
        el('div', { class: 'row' }, [
          el('div', {}, [el('label', { text: '左右 %', style: 'font-size:11.5px' }), xIn]),
          el('div', {}, [el('label', { text: '上下 %', style: 'font-size:11.5px' }), yIn])
        ])
      ]),

      el('div', { class: 'field' }, [
        el('label', { text: '出现与消失（主视频的秒数，决定这句停留多久）' }),
        el('div', { class: 'row' }, [
          numField({ label: '出现', value: c.from, min: L.sec.min, max: L.sec.max, onInput: v => { c.from = v; } }),
          numField({ label: '消失', value: c.to, min: L.sec.min, max: L.sec.max, onInput: v => { c.to = v; } })
        ]),
        el('p', { class: 'up__meta', text: '这两个数字对应主视频 main.mp4 的进度。拉长区间＝这句停留更久；两条区间重叠就会同时出现。' })
      ])
    ])
  ]);
}

function captionsCard(d) {
  const list = d.captions;
  const refs = {};
  const items = list.map((c, i) => captionItem(c, list, i, refs));
  const stage = captionStage(list, refs);

  return el('section', { class: 'card' }, [
    el('header', {}, [
      el('h2', { text: '节奏字幕' }),
      el('span', { class: 'hint', text: `滚动过程中依次出现 · ${list.length}/${L.captions.max}` })
    ]),
    el('div', { class: 'body' }, [
      stage,
      ...(items.length ? items : [el('div', { class: 'empty', text: '还没有字幕' })]),
      el('button', {
        class: 'btn sm', text: '+ 新增字幕', disabled: list.length >= L.captions.max,
        onClick: () => {
          const last = list[list.length - 1];
          const from = last ? Math.min(L.sec.max - 1, last.to + 0.2) : 0;
          list.push({ id: uid('cap'), text: '', from, to: Math.min(L.sec.max, from + 2),
            x: 50, y: 62, size: 100, color: 'white', font: 'serif',
            sortOrder: (list.length + 1) * 10, published: false });
          markDirty(); render();
        }
      })
    ])
  ]);
}

function bubbleBody(b) {
  const nums = pageNumbers(state.draft);
  const stepsWrap = el('div', {});
  b.steps.forEach((st, j) => {
    const input = el('input', { type: 'text', value: st.text });
    input.addEventListener('input', () => {
      st.text = input.value;
      input.classList.toggle('bad', input.value.trim().length > L.step.max || !input.value.trim());
      markDirty();
    });
    const n = nums.get(st.id);
    stepsWrap.appendChild(el('div', { class: 'step' }, [
      el('span', { class: 'n', text: String(j + 1) }),
      input,
      n ? el('span', { class: 'pg__from', text: '→ 子页面 ' + n, title: '这一条点开后跳到 /p/' + n }) : null,
      el('button', {
        class: 'btn sm danger', text: '×', title: '删除这条（对应的子页面内容也会一起删掉）',
        disabled: b.steps.length <= L.steps.min,
        onClick: async () => {
          const hasPage = state.draft.pages?.[st.id];
          if (hasPage && !await confirmAsk('删除这一条',
              `「${st.text || '这一条'}」对应的子页面「${hasPage.title || '未命名'}」也会一并删除，且后面所有子页面的编号会往前移。`, '删除')) return;
          if (hasPage) delete state.draft.pages[st.id];
          b.steps.splice(j, 1); markDirty(); render();
        }
      })
    ].filter(Boolean)));
  });

  return el('div', { class: 'body' }, [
    textField({ label: '名称', value: b.name, max: L.bubbleName.max, required: true, onInput: v => { b.name = v; } }),
    textField({ label: '一句话', value: b.lead, max: L.bubbleLead.max, required: true, onInput: v => { b.lead = v; } }),
    textField({ label: '正文', value: b.body, max: L.bubbleBody.max, required: true, multiline: true, rows: 4, onInput: v => { b.body = v; } }),
    el('div', { class: 'field' }, [
      el('label', {}, [document.createTextNode(`步骤（${b.steps.length}/${L.steps.max}）`), el('span', { class: 'req', text: '*' })]),
      stepsWrap,
      el('button', {
        class: 'btn sm ghost', text: '+ 加一条', disabled: b.steps.length >= L.steps.max,
        onClick: () => { b.steps.push({ id: uid('st'), text: '' }); markDirty(); render(); }
      })
    ]),
    el('details', { class: 'adv' }, [
      el('summary', { text: '高级：与视频对齐的位置与大小' }),
      el('div', { class: 'inner' }, [
        el('div', { class: 'warn', text: '这三个数字是按视频画面 2560×1440 量出来的圆心与半径，决定泡泡贴在画面的哪个位置。除非更换了视频，否则不要修改——改错会让泡泡飘出画面或盖住人物。' }),
        el('div', { class: 'row' }, [
          numField({ label: '圆心 X', value: b.cx, min: L.cx.min, max: L.cx.max, onInput: v => { b.cx = v; } }),
          numField({ label: '圆心 Y', value: b.cy, min: L.cy.min, max: L.cy.max, onInput: v => { b.cy = v; } }),
          numField({ label: '半径', value: b.r, min: L.r.min, max: L.r.max, onInput: v => { b.r = v; } })
        ])
      ])
    ])
  ]);
}

function bubblesCard(d) {
  const list = d.bubbles;
  const items = list.map((b, i) => el('div', { class: 'item' + (b.published === false ? ' off' : '') }, [
    itemHead({ list, i, title: b.name || '（未命名）', label: '泡泡',
      canDelete: list.length > 1,
      onDup: list.length < L.bubbles.max
        ? () => {
            list.splice(i + 1, 0, { ...b, id: uid('bub'),
              name: (b.name + '副本').slice(0, L.bubbleName.max),
              // 步骤换新 id，否则副本会和原泡泡共用同一批子页面
              steps: b.steps.map(st => ({ id: uid('st'), text: st.text })),
              published: false });
            markDirty(); render();
          }
        : null }),
    bubbleBody(b)
  ]));

  return el('section', { class: 'card' }, [
    el('header', {}, [
      el('h2', { text: '泡泡' }),
      el('span', { class: 'hint', text: `点开后弹出的四段内容 · ${list.length}/${L.bubbles.max}` })
    ]),
    el('div', { class: 'body' }, [
      ...(items.length ? items : [el('div', { class: 'empty', text: '还没有泡泡' })]),
      el('button', {
        class: 'btn sm', text: '+ 新增泡泡', disabled: list.length >= L.bubbles.max,
        onClick: () => {
          list.push({ id: uid('bub'), name: '', lead: '', body: '', steps: [{ id: uid('st'), text: '' }],
            cx: 1280, cy: 720, r: 240, sortOrder: (list.length + 1) * 10, published: false });
          markDirty(); render();
        }
      })
    ])
  ]);
}

/* ───────── 子页面 ───────── */

/** 子页面编号：按泡泡顺序、再按步骤顺序，全局从 1 连续。与服务端算法保持一致。 */
function pageNumbers(d) {
  const map = new Map();
  let n = 0;
  (d?.bubbles || []).slice().sort((a, b) => (a.sortOrder - b.sortOrder) || 0)
    .forEach(b => (b.steps || []).forEach(st => { if (st?.id) map.set(st.id, ++n); }));
  return map;
}

const blankPage = stepText => ({
  title: (stepText || '').slice(0, L.pageTitle.max) || '新页面',
  lead: '', background: null, published: false,
  blocks: [{ type: 'text', id: uid('bl'), text: '' }]
});

function blockEditor(page, bl, j) {
  const move = dir => {
    const k = j + dir;
    if (k < 0 || k >= page.blocks.length) return;
    [page.blocks[j], page.blocks[k]] = [page.blocks[k], page.blocks[j]];
    markDirty(); render();
  };
  const head = el('div', { class: 'blk__head' }, [
    el('span', { class: 'blk__kind', text: bl.type === 'text' ? `第 ${j + 1} 块 · 文字` : `第 ${j + 1} 块 · 图片` }),
    el('button', { class: 'btn sm ghost', text: '↑', disabled: j === 0, onClick: () => move(-1) }),
    el('button', { class: 'btn sm ghost', text: '↓', disabled: j === page.blocks.length - 1, onClick: () => move(1) }),
    el('button', { class: 'btn sm danger', text: '删除', onClick: async () => {
      if (!await confirmAsk('删除这一块', '这一块内容会从子页面上移除。', '删除')) return;
      page.blocks.splice(j, 1); markDirty(); render();
    } })
  ]);

  const body = bl.type === 'text'
    ? el('div', { class: 'blk__body' }, [
        textField({ label: '正文（空一行分段）', value: bl.text, max: L.blockText.max,
          required: true, multiline: true, rows: 6, onInput: v => { bl.text = v; } })
      ])
    : el('div', { class: 'blk__body' }, [
        imageField({ label: '图片', assetId: bl.assetId, onChange: id => { bl.assetId = id; } }),
        textField({ label: '替代文本（读屏与加载失败时显示）', value: bl.alt || '', max: L.alt.max,
          onInput: v => { bl.alt = v; } }),
        textField({ label: '图注（可留空）', value: bl.caption || '', max: L.blockCaption.max,
          onInput: v => { bl.caption = v; } })
      ]);

  return el('div', { class: 'blk' }, [head, body]);
}

function pageEditor(entry, page) {
  const d = state.draft;
  const add = type => {
    page.blocks.push(type === 'text'
      ? { type: 'text', id: uid('bl'), text: '' }
      : { type: 'image', id: uid('bl'), assetId: null, alt: '', caption: '' });
    markDirty(); render();
  };

  return el('div', { class: 'pg__body' }, [
    el('div', { class: 'row', style: 'margin:13px 0' }, [
      toggle(page.published !== false, v => { page.published = v; render(); }),
      el('a', { class: 'btn sm ghost', href: '/preview/p/' + entry.n, target: '_blank', rel: 'noopener',
        text: '预览这一页' }),
      el('span', { class: 'spacer', style: 'flex:1' }),
      el('button', { class: 'btn sm danger', text: '删除整页', onClick: async () => {
        if (!await confirmAsk('删除整页', `子页面 ${entry.n}「${page.title}」的全部内容会被删除。对应的那一条步骤会变回不可点击。`, '删除')) return;
        delete d.pages[entry.stepId]; markDirty(); render();
      } })
    ]),
    textField({ label: '页面标题', value: page.title, max: L.pageTitle.max, required: true,
      onInput: v => { page.title = v; } }),
    textField({ label: '导语（可留空）', value: page.lead || '', max: L.pageLead.max, multiline: true, rows: 2,
      onInput: v => { page.lead = v; } }),
    imageField({ label: '背景图', assetId: page.background,
      hint: page.background ? '整页固定背景，上面会压一层暗罩' : '不设则用纯深色背景',
      onChange: id => { page.background = id; } }),
    el('div', { class: 'field' }, [
      el('label', { text: `正文内容（${page.blocks.length}/${L.blocks.max} 块 · 文字和图片可以交替排列）` }),
      ...(page.blocks.length
        ? page.blocks.map((bl, j) => blockEditor(page, bl, j))
        : [el('div', { class: 'empty', text: '还没有内容，加一块文字或图片' })]),
      el('div', { class: 'row' }, [
        el('button', { class: 'btn sm', text: '+ 文字', disabled: page.blocks.length >= L.blocks.max,
          onClick: () => add('text') }),
        el('button', { class: 'btn sm', text: '+ 图片', disabled: page.blocks.length >= L.blocks.max,
          onClick: () => add('image') })
      ])
    ])
  ]);
}

function pagesCard(d) {
  const nums = pageNumbers(d);
  const entries = [];
  d.bubbles.slice().sort((a, b) => (a.sortOrder - b.sortOrder) || 0).forEach(b => {
    (b.steps || []).forEach(st => {
      entries.push({ n: nums.get(st.id), stepId: st.id, bubbleName: b.name, stepText: st.text,
                     bubblePublished: b.published !== false });
    });
  });
  entries.sort((a, b) => a.n - b.n);

  if (!d.pages) d.pages = {};

  const rows = entries.map(entry => {
    const page = d.pages[entry.stepId];
    const kids = [
      el('span', { class: 'pg__n', text: String(entry.n) }),
      el('span', { class: 'pg__ttl', text: page ? page.title : (entry.stepText || '（空）') }),
      el('span', { class: 'pg__from', text: entry.bubbleName })
    ];
    if (!page) kids.push(el('span', { class: 'pg__empty', text: '未建' }));
    else if (page.published === false) kids.push(el('span', { class: 'pg__empty', text: '未发布' }));
    else if (!entry.bubblePublished) kids.push(el('span', { class: 'pg__empty', text: '所属泡泡未发布' }));

    const det = el('details', { class: 'pg' + (page && page.published === false ? ' off' : '') }, [
      el('summary', {}, kids)
    ]);
    if (openPages.has(entry.stepId)) det.open = true;
    det.addEventListener('toggle', () => {
      if (det.open) openPages.add(entry.stepId); else openPages.delete(entry.stepId);
    });

    det.appendChild(page
      ? pageEditor(entry, page)
      : el('div', { class: 'pg__body' }, [
          el('div', { class: 'empty', text: '这一条还没有子页面，建了之后它在正式页面上就可以点进来。' }),
          el('button', { class: 'btn sm primary', text: '建立子页面 ' + entry.n, onClick: () => {
            d.pages[entry.stepId] = blankPage(entry.stepText);
            openPages.add(entry.stepId);
            markDirty(); render();
          } })
        ]));
    return det;
  });

  const built = entries.filter(e => d.pages[e.stepId]).length;
  return el('section', { class: 'card' }, [
    el('header', {}, [
      el('h2', { text: '子页面' }),
      el('span', { class: 'hint', text: `泡泡里的每一条都可以点开成一页 · 已建 ${built}/${entries.length}` })
    ]),
    el('div', { class: 'body' }, [
      el('p', { class: 'up__meta', style: 'margin:0 0 14px',
        text: '编号按泡泡顺序、再按条目顺序从 1 连续排下来，地址就是 /p/编号。调整泡泡或条目的顺序会让编号跟着变，背景图和内容始终跟着页面走，不会错位。' }),
      ...(rows.length ? rows : [el('div', { class: 'empty', text: '先在上面的泡泡里加条目' })])
    ])
  ]);
}

/* ───────── 底部操作条 ───────── */
function renderBar() {
  const old = document.querySelector('.bar');
  if (old) old.remove();
  if (!state.authed || !state.draft) return;

  const saved = state.updatedAt
    ? `上次保存 ${new Date(state.updatedAt).toLocaleString('zh-CN', { hour12: false })}`
    : '尚未保存';

  const bar = el('div', { class: 'bar' }, [el('div', { class: 'inner' }, [
    el('span', { class: 'saved', text: saved }),
    el('span', { class: 'spacer' }),
    el('button', { class: 'btn ghost', text: '放弃草稿改动', disabled: state.saving,
      onClick: async () => {
        if (!await confirmAsk('放弃草稿改动', '草稿将恢复为当前正式页面上的内容，未发布的修改会丢失。', '放弃改动')) return;
        await run(async () => {
          const r = await api('/api/admin/revert', { method: 'POST' });
          state.draft = r.draft; state.dirty = false;
          state.msg = { type: 'ok', text: '已恢复为正式页面的内容' };
        });
      } }),
    el('button', { class: 'btn', text: '预览草稿', disabled: state.saving,
      title: '在新标签页查看效果；有未保存的改动会先自动保存',
      onClick: () => openPreview() }),
    el('button', { class: 'btn', text: state.saving ? '保存中…' : '保存草稿', disabled: state.saving,
      onClick: () => run(async () => {
        await saveDraft();
        state.msg = { type: 'ok', text: '草稿已保存。正式页面尚未改变，点「发布到正式页面」才会生效。' };
      }) }),
    el('button', { class: 'btn primary', text: '发布到正式页面', disabled: state.saving,
      onClick: async () => {
        const note = state.dirty
          ? '当前的改动会先自动保存，然后发布到正式页面。访问者刷新后即可看到。'
          : '草稿将立即出现在正式页面上，访问者刷新后即可看到。';
        if (!await confirmAsk('发布到正式页面', note, '发布')) return;
        await run(async () => {
          if (state.dirty) await saveDraft();
          const r = await api('/api/admin/publish', { method: 'POST' });
          state.updatedAt = r.updatedAt;
          state.msg = { type: 'ok', text: '已发布。正式页面刷新后即为最新内容。' };
        });
      } })
  ])]);
  document.body.appendChild(bar);
}

/** 保存草稿。发布与预览都会先调用它，避免改动停留在浏览器里。 */
async function saveDraft() {
  const r = await api('/api/admin/content', { method: 'PUT', body: JSON.stringify(state.draft) });
  state.updatedAt = r.updatedAt;
  state.dirty = false;
  return r;
}

/** 打开草稿预览。有未保存改动时先自动保存，保证预览的就是眼前的内容。
    新标签页必须同步打开，否则会被浏览器的弹窗拦截挡掉。*/
async function openPreview() {
  const win = window.open('', '_blank');
  if (state.dirty) {
    let ok = false;
    await run(async () => {
      await saveDraft();
      ok = true;
      state.msg = { type: 'ok', text: '已自动保存草稿，并在新标签页打开预览。' };
    });
    if (!ok) { if (win) win.close(); return; }
  }
  if (win) win.location.href = '/preview';
  else window.open('/preview', '_blank', 'noopener');   // 被拦截时退而求其次
}

async function run(fn) {
  state.saving = true; state.msg = null; render();
  try { await fn(); }
  catch (e) {
    if (e.status === 401 && state.authed) {
      state.authed = false;
      state.msg = { type: 'err', text: '登录已过期，请重新登录' };
    } else {
      state.msg = { type: 'err', text: e.message, errors: e.errors };
    }
  }
  finally { state.saving = false; render(); }
}

/* ───────── 渲染 ───────── */
function msgNode() {
  if (!state.msg) return null;
  const n = el('div', { class: 'msg ' + (state.msg.type === 'ok' ? 'ok' : 'err') }, [
    el('div', { text: state.msg.text })
  ]);
  if (state.msg.errors?.length) {
    n.appendChild(el('ul', {}, state.msg.errors.map(t => el('li', { text: t }))));
  }
  return n;
}

function renderLogin() {
  const input = el('input', { type: 'password', placeholder: '后台密码', autofocus: true });
  const submit = () => run(async () => {
    await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: input.value }) });
    state.authed = true; state.msg = null;
    await load();
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });

  clear(app);
  app.appendChild(el('div', { class: 'login' }, [
    el('h1', { text: '内容后台' }),
    el('p', { text: 'Kane Wang转正汇报' }),
    msgNode(),
    state.enabled ? input : null,
    state.enabled
      ? el('button', { class: 'btn primary', text: state.saving ? '登录中…' : '登录', disabled: state.saving, onClick: submit })
      : el('div', { class: 'msg err', text: '后台未启用：服务端尚未设置 ADMIN_PASSWORD 环境变量。' })
  ].filter(Boolean)));
}

function render() {
  if (!state.authed) { renderBar(); return renderLogin(); }
  if (!state.draft) {
    clear(app);
    app.appendChild(el('div', { class: 'wrap' }, [msgNode() || el('div', { class: 'loading', text: '载入中…' })]));
    renderBar();
    return;
  }

  const d = state.draft;
  clear(app);
  app.appendChild(el('div', { class: 'top' }, [
    el('h1', { text: '内容后台' }),
    el('span', { class: 'badge ' + (state.dirty ? 'dirty' : 'clean'),
      text: state.dirty ? '有未保存的改动' : '草稿已保存' }),
    el('span', { class: 'spacer' }),
    el('button', { class: 'btn sm', text: '预览草稿', disabled: state.saving,
      title: '在新标签页查看效果；有未保存的改动会先自动保存',
      onClick: () => openPreview() }),
    el('a', { class: 'btn sm ghost', href: '/', target: '_blank', rel: 'noopener', text: '看正式页面' }),
    el('button', { class: 'btn sm ghost', text: '退出',
      onClick: async () => {
        if (state.dirty && !await confirmAsk('还有未保存的改动', '退出后未保存的修改会丢失。', '退出')) return;
        await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
        state = { ...state, authed: false, draft: null, dirty: false, msg: null };
        render();
      } })
  ]));
  app.appendChild(el('div', { class: 'wrap' }, [
    msgNode(), siteCard(d), captionsCard(d), bubblesCard(d), pagesCard(d)
  ].filter(Boolean)));
  renderBar();
}

/* ───────── 启动 ───────── */
async function load() {
  try {
    const r = await api('/api/admin/content');
    state.draft = r.draft; state.updatedAt = r.updatedAt; state.dirty = false;
    if (r.dirty) state.msg = { type: 'ok', text: '草稿与正式页面内容不同，点「发布到正式页面」让改动生效。' };
  } catch (e) {
    state.msg = { type: 'err', text: e.message };
    if (e.status === 401) state.authed = false;
  }
  render();
}

(async () => {
  try {
    const s = await api('/api/admin/session');
    state.authed = s.authed; state.enabled = s.enabled;
    if (s.limits) Object.assign(L, s.limits);
    if (typeof s.maxImageBytes === 'number') MAX_IMAGE_BYTES = s.maxImageBytes;
    if (Array.isArray(s.imageTypes) && s.imageTypes.length) IMAGE_TYPES = s.imageTypes;
    if (s.authed) return load();
  } catch (e) {
    state.msg = { type: 'err', text: '无法连接服务端：' + e.message };
  }
  render();
})();
})();
