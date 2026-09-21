import { chromium } from 'playwright';
const B = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

await p.goto(B + '/admin/');
await p.fill('.login input', 'test-pw-12345');
await p.click('.login .btn');
await p.waitForTimeout(1500);

// ── 自动保存 ──
await p.locator('.card').first().locator('input[type=text]').first().fill('自动保存验证');
console.log('刚改完:', await p.locator('.bar .saved').textContent());
await p.waitForTimeout(1600);
console.log('等待后:', await p.locator('.bar .saved').textContent());

// ── 预览是真链接，不是 window.open ──
const pv = p.locator('.top a:has-text("预览草稿"), .bar a:has-text("预览草稿")').first();
console.log('预览是 <a> 标签:', await pv.evaluate(n => n.tagName), '| target:', await pv.getAttribute('target'), '| href:', await pv.getAttribute('href'));
const [tab] = await Promise.all([ctx.waitForEvent('page'), pv.click()]);
await tab.waitForLoadState('domcontentloaded');
await tab.waitForTimeout(1200);
console.log('>>> 预览打开:', new URL(tab.url()).pathname, '| 站名:', await tab.locator('.brand').textContent());
await tab.close();

// ── 三条字幕分别设成：贴最左横排粗毛笔 / 贴最右竖排干笔 / 居中黑字 ──
const caps = p.locator('.card').nth(1).locator('.item');
async function setCap(i, { x, y, font, color, orient }) {
  const it = caps.nth(i);
  await it.locator(`.seg button:has-text("${font}")`).click();  await p.waitForTimeout(250);
  await it.locator(`.seg button:has-text("${color}")`).click(); await p.waitForTimeout(250);
  await it.locator(`.seg button:has-text("${orient}")`).click(); await p.waitForTimeout(250);
  await it.locator('input[type=number]').first().fill(String(x)); await p.waitForTimeout(250);
  await it.locator('input[type=number]').nth(1).fill(String(y)); await p.waitForTimeout(250);
}
await setCap(0, { x: 0,   y: 50, font: '粗毛笔', color: '白字', orient: '横排' });
await setCap(1, { x: 100, y: 50, font: '干笔',   color: '白字', orient: '竖排' });
await setCap(2, { x: 50,  y: 95, font: '宋体',   color: '黑字', orient: '横排' });
await p.waitForTimeout(1800);
console.log('自动保存状态:', await p.locator('.bar .saved').textContent());
await p.screenshot({ path: '/tmp/cap2-admin.png' });

// 发布
await p.click('.bar .btn:has-text("发布到正式页面")');
await p.waitForTimeout(400); await p.click('#mYes'); await p.waitForTimeout(2000);
console.log('发布:', await p.locator('.msg.ok').textContent());

// ── 前台实测：能否贴到最左最右、竖排是否生效、有没有溢出 ──
const site = await ctx.newPage();
await site.goto(B + '/');
await site.waitForTimeout(2500);
await site.addStyleTag({ content: '.caption{opacity:1 !important}.caption .caption__text{transform:none !important}' });
await site.waitForTimeout(800);
console.log('\n>>> 前台字幕实测:');
console.log(JSON.stringify(await site.evaluate(() => {
  const V = innerWidth, H = innerHeight;
  return [...document.querySelectorAll('.caption')].map(c => {
    const r = c.getBoundingClientRect();
    const t = c.querySelector('.caption__text');
    return {
      cls: c.className.replace('caption', '').trim(),
      字体: getComputedStyle(t).fontFamily.split(',')[0].replace(/"/g, ''),
      排版: getComputedStyle(t).writingMode,
      左: Math.round(r.left), 右: Math.round(r.right), 上: Math.round(r.top), 下: Math.round(r.bottom),
      溢出: r.left < -1 || r.right > V + 1 || r.top < -1 || r.bottom > H + 1
    };
  });
}), null, 1));
await site.screenshot({ path: '/tmp/cap2-front.png' });
console.log('JS 错误:', errs.length ? errs : '(none)');
await b.close();
