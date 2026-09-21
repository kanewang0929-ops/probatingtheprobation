import { chromium } from 'playwright';
const BASE = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

await p.goto(BASE + '/');
await p.waitForTimeout(2000);

const caps = await p.evaluate(() =>
  [...document.querySelectorAll('.caption')].map(c => {
    const t = c.querySelector('.caption__text');
    const cs = getComputedStyle(t);
    return {
      cls: c.className.replace('caption', '').trim() || '(默认)',
      left: c.style.left || '(默认)',
      top: c.style.top || '(默认)',
      font: cs.fontFamily.split(',')[0].replace(/"/g, ''),
      color: cs.color,
      panel: getComputedStyle(t, '::before').backgroundColor
    };
  }));
console.log('字幕 DOM:', JSON.stringify(caps, null, 1));

// 泡泡区默认 visibility:hidden，要滚到结尾才出现。这里直接打开它来验证步骤链接。
await p.evaluate(() => {
  const w = document.querySelector('.bubbles');
  w.classList.add('is-on');
  w.style.pointerEvents = 'auto';
  document.querySelectorAll('.bubble, .bubble__hit').forEach(b => { b.style.pointerEvents = 'auto'; });
});
await p.waitForTimeout(300);
await p.locator('.bubble__hit').first().click({ force: true });
await p.waitForTimeout(700);
const steps = await p.evaluate(() => [...document.querySelectorAll('#dlgSteps li')].map(li => {
  const a = li.querySelector('a');
  return { text: li.textContent.trim().slice(0, 12), link: a ? a.getAttribute('href') : null };
}));
console.log('对话框步骤:', JSON.stringify(steps));

const link = p.locator('#dlgSteps a').first();
if (await link.count()) {
  await link.click();
  await p.waitForTimeout(900);
  console.log('>>> 点击后跳转到:', new URL(p.url()).pathname);
  console.log('>>> 落地页标题:', await p.locator('h1').textContent());
} else {
  console.log('!! 没有可点的步骤链接');
}
console.log('JS 错误:', errs.filter(e => !/MediaError|无法播放/.test(e)));
await b.close();
