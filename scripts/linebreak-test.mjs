import { chromium } from 'playwright';
const B = process.argv[2];
const card = (p, title) => p.locator('.card').filter({ has: p.locator(`header h2:text-is("${title}")`) });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1340, height: 1000 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

await p.goto(B + '/admin/');
await p.fill('.login input', 'test-pw-12345');
await p.click('.login .btn');
await p.waitForTimeout(1500);

const BODY = '从单点执行，走向整个系统的owner\n\n从信息传递，走向信息降噪与决策支持\n\n从结果汇报，走向过程控制与预测管理';
const c = card(p, '结尾框');
await c.locator('input[type=text]').first().fill('My Core');
await c.locator('textarea').fill(BODY);
await c.locator('input[type=text]').last().fill('Thank You for Coming');
await p.waitForTimeout(500);

console.log('存进去的正文含换行:', JSON.stringify(await c.locator('textarea').inputValue()).includes('\\n'));
console.log('后台预览行数:', await c.locator('.notepv__p').evaluate(n => {
  const r = document.createRange(); r.selectNodeContents(n); return r.getClientRects().length;
}));
console.log('后台预览 white-space:', await c.locator('.notepv__p').evaluate(n => getComputedStyle(n).whiteSpace));
await c.screenshot({ path: '/tmp/lb-admin.png' });

await p.waitForTimeout(1400);
await p.click('.bar .btn:has-text("发布到正式页面")');
await p.waitForTimeout(400); await p.click('#mYes'); await p.waitForTimeout(1800);

const site = await ctx.newPage();
await site.goto(B + '/');
await site.waitForTimeout(2200);
const r = await site.evaluate(() => {
  const el = document.querySelector('.note p');
  return {
    whiteSpace: getComputedStyle(el).whiteSpace,
    文本含换行: el.textContent.includes('\n'),
    渲染行数: (() => { const r = document.createRange(); r.selectNodeContents(el); return r.getClientRects().length; })(),
    高度: Math.round(el.getBoundingClientRect().height)
  };
});
console.log('>>> 前台:', JSON.stringify(r));
await site.addStyleTag({ content: '.note{opacity:1!important;visibility:visible!important}' });
await site.waitForTimeout(400);
await site.locator('.note').screenshot({ path: '/tmp/lb-site.png' });
console.log('JS 错误:', errs.length ? errs : '(none)');
await b.close();
