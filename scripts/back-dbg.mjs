import { chromium } from 'playwright';
const B = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
const p = await ctx.newPage();
p.on('pageerror', e => console.log('PAGEERROR:', e.message));

await p.goto(B + '/');
await p.waitForTimeout(2500);
await p.evaluate(() => { const w=document.querySelector('.bubbles'); w.classList.add('is-on'); w.style.pointerEvents='auto'; });
await p.evaluate(() => document.querySelectorAll('.bubble__hit')[0].click());
await p.waitForTimeout(600);
console.log('离开前弹窗开着:', await p.evaluate(() => document.querySelector('.viewer').classList.contains('is-open')));

await p.locator('#dlgSteps a').first().click();
await p.waitForTimeout(900);
console.log('子页面地址:', new URL(p.url()).pathname);
console.log('sessionStorage 里存到的:', await p.evaluate(() => sessionStorage.getItem('kw:return')));
console.log('子页面的 referrer:', await p.evaluate(() => document.referrer));

await p.locator('#back').click();
await p.waitForTimeout(2000);
console.log('\n回到主页后:');
console.log('  referrer:', await p.evaluate(() => document.referrer));
console.log('  sessionStorage 还在吗:', await p.evaluate(() => sessionStorage.getItem('kw:return')));
console.log('  正则是否匹配 referrer 路径:', await p.evaluate(() => {
  try { const r = new URL(document.referrer, location.href);
    return r.origin === location.origin && /^\/(preview\/)?p\/\d+$/.test(r.pathname); } catch(e){ return 'err:'+e.message; }
}));
console.log('  弹窗:', await p.evaluate(() => document.querySelector('.viewer').classList.contains('is-open')));
await b.close();
