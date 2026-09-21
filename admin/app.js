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
  cx:{min:0,max:2560}, cy:{min:0,max:1440}, r:{min:40,max:600}, sec:{min:0,max:60}
};

let state = { authed:false, enabled:true, draft:null, dirty:false, updatedAt:null, saving:false, msg:null };

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

function captionsCard(d) {
  const list = d.captions;
  const items = list.map((c, i) => el('div', { class: 'item' + (c.published === false ? ' off' : '') }, [
    itemHead({ list, i, title: c.text || '（空字幕）', label: '字幕',
      canDelete: list.length > 1,
      onDup: list.length < L.captions.max
        ? () => { list.splice(i + 1, 0, { ...c, id: uid('cap') }); markDirty(); render(); }
        : null }),
    el('div', { class: 'body' }, [
      textField({ label: '字幕文案', value: c.text, max: L.captionText.max, required: true, multiline: true, rows: 2,
        onInput: v => { c.text = v; } }),
      el('details', { class: 'adv' }, [
        el('summary', { text: '高级：与视频对齐的时间区间' }),
        el('div', { class: 'inner' }, [
          el('div', { class: 'warn', text: '这两个数字对应主视频 main.mp4 的秒数，决定这句字幕何时出现和消失。除非更换了视频，否则不要修改——改错会让字幕和画面不同步。' }),
          el('div', { class: 'row' }, [
            numField({ label: '起始秒', value: c.from, min: L.sec.min, max: L.sec.max, onInput: v => { c.from = v; } }),
            numField({ label: '结束秒', value: c.to, min: L.sec.min, max: L.sec.max, onInput: v => { c.to = v; } })
          ])
        ])
      ])
    ])
  ]));

  return el('section', { class: 'card' }, [
    el('header', {}, [
      el('h2', { text: '节奏字幕' }),
      el('span', { class: 'hint', text: `滚动过程中依次出现 · ${list.length}/${L.captions.max}` })
    ]),
    el('div', { class: 'body' }, [
      ...(items.length ? items : [el('div', { class: 'empty', text: '还没有字幕' })]),
      el('button', {
        class: 'btn sm', text: '+ 新增字幕', disabled: list.length >= L.captions.max,
        onClick: () => {
          const last = list[list.length - 1];
          const from = last ? Math.min(L.sec.max - 1, last.to + 0.2) : 0;
          list.push({ id: uid('cap'), text: '', from, to: Math.min(L.sec.max, from + 2), sortOrder: (list.length + 1) * 10, published: false });
          markDirty(); render();
        }
      })
    ])
  ]);
}

function bubbleBody(b) {
  const stepsWrap = el('div', {});
  b.steps.forEach((s, j) => {
    const input = el('input', { type: 'text', value: s });
    input.addEventListener('input', () => {
      b.steps[j] = input.value;
      input.classList.toggle('bad', input.value.trim().length > L.step.max || !input.value.trim());
      markDirty();
    });
    stepsWrap.appendChild(el('div', { class: 'step' }, [
      el('span', { class: 'n', text: String(j + 1) }),
      input,
      el('button', {
        class: 'btn sm danger', text: '×', title: '删除这条', disabled: b.steps.length <= L.steps.min,
        onClick: () => { b.steps.splice(j, 1); markDirty(); render(); }
      })
    ]));
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
        onClick: () => { b.steps.push(''); markDirty(); render(); }
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
            list.splice(i + 1, 0, { ...b, id: uid('bub'), name: (b.name + '副本').slice(0, L.bubbleName.max), steps: b.steps.slice(), published: false });
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
          list.push({ id: uid('bub'), name: '', lead: '', body: '', steps: [''],
            cx: 1280, cy: 720, r: 240, sortOrder: (list.length + 1) * 10, published: false });
          markDirty(); render();
        }
      })
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
    el('button', { class: 'btn', text: '预览草稿', disabled: state.saving || state.dirty,
      title: state.dirty ? '请先保存草稿再预览' : '在新标签页查看草稿效果',
      onClick: () => window.open('/preview', '_blank', 'noopener') }),
    el('button', { class: 'btn', text: state.saving ? '保存中…' : '保存草稿', disabled: state.saving,
      onClick: () => run(async () => {
        const r = await api('/api/admin/content', { method: 'PUT', body: JSON.stringify(state.draft) });
        state.updatedAt = r.updatedAt; state.dirty = false;
        state.msg = { type: 'ok', text: '草稿已保存。正式页面尚未改变，点「发布」才会生效。' };
      }) }),
    el('button', { class: 'btn primary', text: '发布到正式页面', disabled: state.saving,
      onClick: async () => {
        if (state.dirty && !await confirmAsk('还有未保存的改动', '当前有未保存的修改，发布只会发布已保存的草稿。要继续吗？', '继续发布')) return;
        if (!await confirmAsk('发布到正式页面', '已保存的草稿将立即出现在正式页面上，访问者刷新后即可看到。', '发布')) return;
        await run(async () => {
          const r = await api('/api/admin/publish', { method: 'POST' });
          state.updatedAt = r.updatedAt;
          state.msg = { type: 'ok', text: '已发布，正式页面刷新后即为最新内容。' };
        });
      } })
  ])]);
  document.body.appendChild(bar);
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
    msgNode(), siteCard(d), captionsCard(d), bubblesCard(d)
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
    if (s.authed) return load();
  } catch (e) {
    state.msg = { type: 'err', text: '无法连接服务端：' + e.message };
  }
  render();
})();
})();
