import { chromium } from 'playwright';
const B = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

// ── 1. 直接打开子页面（无 referrer）：应保留「回到<站名>」且指向首页 ──
await p.goto(B + '/p/1');
await p.waitForTimeout(600);
console.log('直接打开 /p/1:');
console.log('  链接文案:', JSON.stringify(await p.locator('#back').textContent()));
console.log('  href:', await p.locator('#back').getAttribute('href'));

// ── 2. 从主页点进来：应变成「返回」并走 history ──
await p.goto(B + '/');
await p.waitForTimeout(2500);
// 先滚到接近结尾，模拟真实路径（泡泡本来就是滚到底才出现的）
await p.evaluate(() => {
  const max = document.documentElement.scrollHeight - innerHeight;
  scrollTo(0, Math.round(max * 0.93));
});
await p.waitForTimeout(700);
const before = await p.evaluate(() => ({ y: Math.round(scrollY), max: document.documentElement.scrollHeight }));
console.log('  离开前滚动位置:', before.y, '/ 总高', before.max);
await p.evaluate(() => {
  const w = document.querySelector('.bubbles');
  w.classList.add('is-on'); w.style.pointerEvents = 'auto';
});
await p.evaluate(() => document.querySelectorAll('.bubble__hit')[0].click());
await p.waitForTimeout(700);
const link = p.locator('#dlgSteps a').first();
if (!await link.count()) { console.log('!! 第 1 个泡泡没有可点的步骤，先去后台建子页面'); await b.close(); process.exit(0); }
await link.click();
await p.waitForTimeout(900);
console.log('\n从主页点进来:');
console.log('  当前地址:', new URL(p.url()).pathname);
console.log('  链接文案:', JSON.stringify(await p.locator('#back').textContent()));

// 点返回
await p.locator('#back').click();
await p.waitForTimeout(2500);
console.log('\n点「返回」之后:');
console.log('  地址:', new URL(p.url()).pathname);
console.log(JSON.stringify(await p.evaluate(() => ({
  滚动位置: Math.round(scrollY),
  页面总高: document.documentElement.scrollHeight,
  泡泡弹窗是否打开: document.querySelector('.viewer').classList.contains('is-open'),
  弹窗标题: document.querySelector('#dlgTitle').textContent
})), null, 1));
console.log('  （离开前是', before.y, '，第 1 个泡泡）');
console.log('JS 错误:', errs.length ? errs : '(none)');
await b.close();
