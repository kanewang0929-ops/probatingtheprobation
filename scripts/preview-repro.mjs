import { chromium } from 'playwright';
const B = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
p.on('pageerror', e => console.log('PAGEERROR:', e.message));
await p.goto(B + '/admin/');
await p.fill('.login input', 'test-pw-12345');
await p.click('.login .btn');
await p.waitForTimeout(1500);

for (const [label, dirty] of [['无改动时', false], ['有未保存改动时', true]]) {
  if (dirty) {
    await p.locator('.card').first().locator('input[type=text]').first().fill('改一下 ' + Date.now());
    await p.waitForTimeout(300);
  }
  const before = ctx.pages().length;
  let opened = null;
  try {
    const [pg] = await Promise.all([
      ctx.waitForEvent('page', { timeout: 6000 }),
      p.click('.top .btn:has-text("预览草稿")')
    ]);
    opened = pg;
  } catch { /* 没开出新页 */ }
  if (!opened) { console.log(label + ': ❌ 没有打开新标签页（标签数 ' + before + '→' + ctx.pages().length + '）'); continue; }
  await opened.waitForLoadState('domcontentloaded').catch(()=>{});
  await opened.waitForTimeout(1500);
  console.log(label + ': 新页 URL =', opened.url(), '| 标题 =', await opened.title().catch(()=>'(读不到)'));
  await opened.close();
  await p.waitForTimeout(400);
}
await b.close();
