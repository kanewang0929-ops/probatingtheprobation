/* 只建 4、7、12 三页，验证上一篇/下一篇跳的是真实存在的页，而不是 n±1 */
import { readFileSync } from 'node:fs';

const B = process.argv[2];
const login = async () => {
  const r = await fetch(B + '/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'test-pw-12345' })
  });
  return r.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
};
const cookie = await login();
const api = (path, opts = {}) => fetch(B + path, { ...opts, headers: { cookie, ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...opts.headers } });

const draft = (await (await api('/api/admin/content')).json()).draft;
const steps = draft.bubbles.flatMap(b => b.steps);
console.log('步骤总数（= 子页面编号上限）:', steps.length);

// 建 4、7、12；再建一个 9 但不发布，验证未发布的不参与串联
draft.pages = {};
for (const n of [4, 7, 12]) {
  draft.pages[steps[n - 1].id] = { title: '第 ' + n + ' 页', lead: '', background: null,
    published: true, blocks: [{ type: 'text', text: '正文' }] };
}
draft.pages[steps[8].id] = { title: '第 9 页（未发布）', lead: '', background: null,
  published: false, blocks: [{ type: 'text', text: '正文' }] };

await api('/api/admin/content', { method: 'PUT', body: JSON.stringify(draft) });
console.log('发布:', (await (await api('/api/admin/publish', { method: 'POST' })).json()).ok ? 'ok' : '失败');

const navOf = async (path) => {
  const r = await fetch(B + path);
  if (r.status !== 200) return { status: r.status };
  const html = await r.text();
  const links = [...html.matchAll(/<a class="nav__link" href="([^"]+)">([^<]+)<\/a>/g)].map(m => m[2].trim() + ' → ' + m[1]);
  return { status: 200, 有导航条: /<div class="nav">/.test(html), 链接: links.length ? links : '（无）' };
};

console.log('\n正式页面（只有 4、7、12 是发布的）:');
for (const n of [4, 7, 12, 3, 9]) {
  console.log(`  /p/${n}:`, JSON.stringify(await navOf('/p/' + n)));
}

console.log('\n草稿预览（9 也算进来，共 4、7、9、12）:');
for (const n of [4, 7, 9, 12]) {
  const r = await fetch(B + '/preview/p/' + n, { headers: { cookie } });
  const html = r.status === 200 ? await r.text() : '';
  const links = [...html.matchAll(/<a class="nav__link" href="([^"]+)">([^<]+)<\/a>/g)].map(m => m[2].trim() + ' → ' + m[1]);
  console.log(`  /preview/p/${n}:`, r.status, JSON.stringify(links.length ? links : '（无）'));
}

// 只留一页时，整条导航都不该出
draft.pages = {};
draft.pages[steps[5].id] = { title: '唯一一页', lead: '', background: null, published: true,
  blocks: [{ type: 'text', text: '正文' }] };
await api('/api/admin/content', { method: 'PUT', body: JSON.stringify(draft) });
await api('/api/admin/publish', { method: 'POST' });
console.log('\n只剩一页时 /p/6:', JSON.stringify(await navOf('/p/6')));
