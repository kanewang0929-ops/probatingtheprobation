/* 在 CONFIG 之后插入内容合并逻辑。幂等：已插入则跳过。*/
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'public/index.html';
let html = readFileSync(FILE, 'utf8');

const TAG = '/* ── 后台内容合并 ──';
if (html.includes(TAG)) { console.log('已插入过，跳过'); process.exit(0); }

const ANCHOR = '/* ════════════════ 基础工具 ════════════════ */';
if (!html.includes(ANCHOR)) throw new Error('找不到插入锚点');

const PATCH = String.raw`${TAG}
   window.__CONTENT__ 由服务端注入（仅含已发布内容）。没有注入、字段缺失或格式不对时，
   下面的每一步都会安静跳过，CONFIG 保持页面内置值不变。整段包在 try 里，绝不影响渲染。*/
(function applyContent(){
  var C = window.__CONTENT__;
  if (!C || typeof C !== 'object') return;
  var txt = function (el, s) { if (el && typeof s === 'string' && s) el.textContent = s; };
  try {
    var site = C.site || {};
    txt(document.querySelector('.brand'), site.brand);
    txt(document.querySelector('.note h2'), site.noteTitle);

    // 首屏标题：用 <br> 元素拼，不用 innerHTML
    if (Array.isArray(site.heroTitle) && site.heroTitle.length) {
      var h1 = document.querySelector('.hero h1');
      if (h1 && site.heroTitle.every(function (l) { return typeof l === 'string' && l; })) {
        h1.textContent = '';
        site.heroTitle.forEach(function (line, i) {
          if (i) h1.appendChild(document.createElement('br'));
          h1.appendChild(document.createTextNode(line));
        });
      }
    }

    // 字幕：文案 + 对应的 beats 时间区间。两者必须等长，否则整体放弃。
    if (Array.isArray(C.captions) && C.captions.length) {
      var wrap = document.querySelector('#captions');
      var ok = C.captions.every(function (c) {
        return c && typeof c.text === 'string' && c.text &&
               typeof c.from === 'number' && typeof c.to === 'number' && c.from < c.to;
      });
      if (wrap && ok) {
        wrap.textContent = '';
        C.captions.forEach(function (c) {
          var p = document.createElement('p');
          p.className = 'caption';
          var span = document.createElement('span');
          span.className = 'caption__text';
          span.textContent = c.text;
          p.appendChild(span);
          wrap.appendChild(p);
        });
        CONFIG.beats = C.captions.map(function (c) { return { from: c.from, to: c.to }; });
      }
    }

    // 泡泡：文案与几何。几何越界的条目整条放弃，避免泡泡飘出画面。
    if (Array.isArray(C.bubbles) && C.bubbles.length) {
      var V = CONFIG.video;
      var good = C.bubbles.filter(function (b) {
        return b && typeof b.name === 'string' && b.name &&
               typeof b.lead === 'string' && typeof b.body === 'string' &&
               Array.isArray(b.steps) && b.steps.length &&
               b.steps.every(function (s) { return typeof s === 'string' && s; }) &&
               typeof b.cx === 'number' && b.cx >= 0 && b.cx <= V.w &&
               typeof b.cy === 'number' && b.cy >= 0 && b.cy <= V.h &&
               typeof b.r === 'number' && b.r >= 40 && b.r <= 600;
      });
      if (good.length === C.bubbles.length) {
        CONFIG.bubbles = good.map(function (b) {
          return { name: b.name, lead: b.lead, body: b.body, steps: b.steps.slice(),
                   cx: b.cx, cy: b.cy, r: b.r };
        });
      }
    }
  } catch (e) {
    if (location.hostname === 'localhost' || location.search.indexOf('debug') > -1) {
      console.warn('[内容合并失败，已回退到内置内容]', e);
    }
  }
})();

`;

html = html.replace(ANCHOR, PATCH + ANCHOR);
writeFileSync(FILE, html);
console.log('已插入内容合并逻辑');
