/* 老数据形状回归：新增必填字段时，存量草稿必须仍能通过校验。
   这类 bug 的症状是线上突然保存不了，而本地用新种子测永远发现不了。*/
import { validate } from '../lib/content.js';
import { readFileSync } from 'node:fs';
const seed = JSON.parse(readFileSync(new URL('../lib/seed.json', import.meta.url),'utf8'));
const cases = {
  // 下面两条预期就会报错：brand 与 noteTitle 一直是必填，且从不自动补。
  // 留在这里是为了盯住「必填清单有没有意外变长」。
  '完全没有 site（预期报错）': d => { delete d.site; },
  'site 是空对象（预期报错）': d => { d.site = {}; },
  'noteBody 是空串': d => { d.site.noteBody = '   '; },
  '字幕缺 panel': d => { d.captions.forEach(c => delete c.panel); },
  '字幕缺 orient/font/x/y': d => { d.captions.forEach(c => { delete c.orient; delete c.font; delete c.x; delete c.y; delete c.size; delete c.color; }); },
  '步骤还是旧的字符串数组': d => { d.bubbles.forEach(b => { b.steps = b.steps.map(s => typeof s === 'string' ? s : s.text); }); },
  '完全没有 pages': d => { delete d.pages; }
};
for (const [name, mut] of Object.entries(cases)) {
  const d = structuredClone(seed); mut(d);
  const { errors } = validate(d);
  console.log((errors.length ? '❌ ' : '✅ ') + name + (errors.length ? ' → ' + errors.join(' / ') : ''));
}

// 有任何一条老形状挂掉就以非零码退出，方便接进 npm run check
const seed2 = JSON.parse(readFileSync(new URL('../lib/seed.json', import.meta.url),'utf8'));
let bad = 0;
for (const [name, mut] of Object.entries(cases)) {
  const d = structuredClone(seed2); mut(d);
  if (validate(d).errors.length && !name.includes('预期报错')) bad++;
}
process.exit(bad ? 1 : 0);
