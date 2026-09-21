import { chromium } from 'playwright';
const BASE = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

await p.goto(BASE + '/admin/');
await p.fill('.login input', 'test-pw-12345');
await p.click('.login .btn');
await p.waitForTimeout(1200);

// 改站名，然后【不点保存】直接点发布
await p.locator('.card').first().locator('input[type=text]').first().fill('直接发布测试');
await p.waitForTimeout(300);
console.log('改动后徽章:', await p.locator('.badge').textContent());
console.log('预览按钮是否可点(顶栏):', await p.locator('.top .btn:has-text("预览草稿")').isEnabled());
console.log('预览按钮是否可点(底栏):', await p.locator('.bar .btn:has-text("预览草稿")').isEnabled());

await p.click('.bar .btn:has-text("发布到正式页面")');
await p.waitForTimeout(400);
console.log('确认弹层文案:', await p.locator('#mBody').textContent());
await p.click('#mYes');
await p.waitForTimeout(1500);
console.log('发布后提示:', await p.locator('.msg.ok').textContent());
console.log('发布后徽章:', await p.locator('.badge').textContent());

// 正式页面是否真的变了
const live = await ctx.newPage();
await live.goto(BASE + '/');
await live.waitForTimeout(600);
console.log('>>> 正式页面站名:', await live.locator('.brand').textContent());

// 预览：再改一次，不保存，直接预览
await p.locator('.card').first().locator('input[type=text]').first().fill('预览未保存测试');
await p.waitForTimeout(300);
const [pv] = await Promise.all([ ctx.waitForEvent('page'), p.click('.top .btn:has-text("预览草稿")') ]);
await pv.waitForLoadState('load');
await pv.waitForTimeout(800);
console.log('>>> 预览页站名:', await pv.locator('.brand').textContent());
console.log('预览后主页面徽章:', await p.locator('.badge').textContent());
const live2 = await ctx.newPage(); await live2.goto(BASE + '/'); await live2.waitForTimeout(500);
console.log('>>> 预览不应影响正式页面，当前站名:', await live2.locator('.brand').textContent());

console.log('JS 错误:', errs.length ? errs : '(none)');
await b.close();
