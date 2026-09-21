// 从 public/index.html 里抽取当前 CONFIG 与字幕，作为后台初始内容
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const html = readFileSync('public/index.html', 'utf8');

// CONFIG 对象：从 "const CONFIG = {" 起，按花括号配平找到结束位置
const start = html.indexOf('const CONFIG = {');
if (start < 0) throw new Error('找不到 CONFIG');
const open = html.indexOf('{', start);
let depth = 0, end = -1, inStr = null;
for (let i = open; i < html.length; i++) {
  const c = html[i], p = html[i - 1];
  if (inStr) { if (c === inStr && p !== '\\') inStr = null; continue; }
  if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
  if (c === '{') depth++;
  else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
}
if (end < 0) throw new Error('CONFIG 花括号不配平');
const CONFIG = new Function('return ' + html.slice(open, end + 1))();

// 字幕：.caption__text 的文本
const captions = [...html.matchAll(/<span class="caption__text">([\s\S]*?)<\/span>/g)].map(m => m[1].trim());

if (captions.length !== CONFIG.beats.length) {
  throw new Error(`字幕数(${captions.length}) 与 beats 数(${CONFIG.beats.length}) 不一致`);
}

// 首屏标题：<h1>内两行
const h1 = html.match(/<h1>([\s\S]*?)<\/h1>/)[1];
const heroTitle = h1.split(/<br\s*\/?>/).map(s => s.trim()).filter(Boolean);
const brand = html.match(/<div class="brand">([\s\S]*?)<\/div>/)[1].trim();

const seed = {
  site: { brand, heroTitle, noteTitle: html.match(/<h2>([\s\S]*?)<\/h2>/)[1].trim() },
  captions: captions.map((text, i) => ({
    id: 'cap' + (i + 1), text, sortOrder: (i + 1) * 10, published: true,
    from: CONFIG.beats[i].from, to: CONFIG.beats[i].to
  })),
  bubbles: CONFIG.bubbles.map((b, i) => ({
    id: 'bub' + (i + 1), name: b.name, lead: b.lead, body: b.body, steps: b.steps,
    sortOrder: (i + 1) * 10, published: true, cx: b.cx, cy: b.cy, r: b.r
  }))
};

mkdirSync('lib', { recursive: true });
writeFileSync('lib/seed.json', JSON.stringify(seed, null, 2) + '\n');
console.log('字幕', seed.captions.length, '泡泡', seed.bubbles.length);
console.log('brand:', seed.site.brand);
console.log('heroTitle:', JSON.stringify(seed.site.heroTitle));
console.log('bubbles:', seed.bubbles.map(b => `${b.name}(${b.cx},${b.cy},r${b.r}) steps=${b.steps.length}`).join(' | '));
