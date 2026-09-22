import { chromium } from 'playwright';
const B = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
await p.goto(B + '/'); await p.waitForTimeout(2300);
await p.evaluate(() => { const w=document.querySelector('.bubbles'); w.classList.add('is-on'); w.style.pointerEvents='auto'; });
await p.evaluate(() => document.querySelectorAll('.bubble__hit')[0].click());
await p.waitForTimeout(800);

console.log(JSON.stringify(await p.evaluate(() => {
  const a = document.querySelector('#dlgSteps a');
  if (!a) return { err: '没有可点的步骤链接' };
  const cs = getComputedStyle(a), af = getComputedStyle(a, '::after');
  return {
    'text-decoration': cs.textDecorationLine,
    'background-image': cs.backgroundImage,
    'border-bottom': cs.borderBottomWidth,
    '箭头内容': af.content,
    '箭头静止透明度': af.opacity
  };
}), null, 1));
await p.locator('#dlgSteps a').first().hover();
await p.waitForTimeout(400);
console.log('悬停后箭头透明度:', await p.evaluate(() => getComputedStyle(document.querySelector('#dlgSteps a'), '::after').opacity));
await p.locator('#dlgScroll').screenshot({ path: '/tmp/steps.png' });
console.log('JS 错误:', errs.length ? errs : '(none)');
await b.close();
