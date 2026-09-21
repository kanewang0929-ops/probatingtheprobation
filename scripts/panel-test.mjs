import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto(process.argv[2] + '/');
await p.waitForTimeout(2200);
await p.addStyleTag({ content: '.caption{opacity:1!important}.caption .caption__text{transform:none!important}' });
await p.waitForTimeout(400);
console.log(JSON.stringify(await p.evaluate(() =>
  [...document.querySelectorAll('.caption')].map(c => {
    const t = c.querySelector('.caption__text');
    const bf = getComputedStyle(t, '::before');
    return {
      cls: c.className.replace('caption','').trim(),
      底板: bf.content === 'none' ? '无' : bf.backgroundColor,
      斜切: bf.clipPath === 'none' ? '—' : bf.clipPath.slice(0, 28) + '…',
      文字色: getComputedStyle(t).color,
      字符朝向: getComputedStyle(t).textOrientation,
      排版: getComputedStyle(t).writingMode,
      内边距: getComputedStyle(t).padding
    };
  })), null, 1));
await b.close();
