import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:3115';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

await page.goto(BASE, { waitUntil: 'load' });
await page.waitForTimeout(2500);

const got = await page.evaluate(() => ({
  brand: document.querySelector('.brand')?.textContent,
  hero: document.querySelector('.hero h1')?.innerText,
  heroBrTags: document.querySelectorAll('.hero h1 br').length,
  noteTitle: document.querySelector('.note h2')?.textContent,
  captions: [...document.querySelectorAll('.caption__text')].map(n => n.textContent),
  bubbleCount: document.querySelectorAll('.bubble').length,
  bubbleImgs: [...document.querySelectorAll('.bubble__img')].map(i => i.src.slice(0, 30)),
  scrollHeight: document.documentElement.scrollHeight,
  videos: [...document.querySelectorAll('video')].map(v => ({ id: v.id, src: v.src.slice(0, 40), ready: v.readyState })),
  // 确认泡泡确实被定位（有内联 transform/尺寸），说明布局脚本跑过
  bubbleStyled: [...document.querySelectorAll('.bubble')].map(b => b.style.cssText.length > 0)
}));

console.log(JSON.stringify(got, null, 2));

// 滚动到中段，确认滚动驱动还在工作
await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.5));
await page.waitForTimeout(1200);
const mid = await page.evaluate(() => ({
  mainCurrentTime: document.querySelector('#v-main')?.currentTime,
  railFill: getComputedStyle(document.querySelector('.rail__fill')).height,
  visibleCaption: [...document.querySelectorAll('.caption')].findIndex(c => getComputedStyle(c).opacity !== '0')
}));
console.log('中段滚动:', JSON.stringify(mid));

await page.screenshot({ path: '/tmp/shot-top.png' });
await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
await page.waitForTimeout(2000);
await page.screenshot({ path: '/tmp/shot-end.png' });

console.log('console errors:', errors.length ? errors : '(none)');
await browser.close();
