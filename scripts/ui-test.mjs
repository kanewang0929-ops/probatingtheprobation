import { chromium } from 'playwright';
const BASE = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1340, height: 980 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/401|400|404|CERT/.test(m.text())) errs.push(m.text()); });

await p.goto(BASE + '/admin/');
await p.fill('.login input', 'test-pw-12345');
await p.click('.login .btn');
await p.waitForTimeout(1500);

console.log('卡片:', await p.locator('.card > header h2').allTextContents());
console.log('画布上的字幕数:', await p.locator('.stage .chip').count());
console.log('子页面条目数:', await p.locator('.pg').count());
console.log('子页面编号:', (await p.locator('.pg__n').allTextContents()).join(','));

// 三条字幕默认位置相同会叠在一起，先选中第一条再拖
const cap1 = p.locator('.card').nth(1).locator('.item').first();
await cap1.locator('.btn:has-text("在画布上选中这条")').click();
await p.waitForTimeout(400);
const xIn = () => cap1.locator('input[type=number]').first().inputValue();
const yIn = () => cap1.locator('input[type=number]').nth(1).inputValue();
console.log('拖动前 X/Y:', await xIn(), '/', await yIn());

const stage = p.locator('.stage');
const chip = p.locator('.stage .chip.sel');
const sb = await stage.boundingBox(), cb = await chip.boundingBox();
await p.mouse.move(cb.x + cb.width/2, cb.y + cb.height/2);
await p.mouse.down();
await p.mouse.move(sb.x + sb.width*0.22, sb.y + sb.height*0.3, { steps: 12 });
await p.mouse.up();
await p.waitForTimeout(400);
console.log('拖动后 X/Y:', await xIn(), '/', await yIn(), '（期望接近 22 / 30）');
console.log('拖动后徽章:', await p.locator('.badge').textContent());

// 切成毛笔 + 黑字
await p.locator('.card').nth(1).locator('.item').first().locator('.seg button:has-text("毛笔")').click();
await p.waitForTimeout(300);
await p.locator('.card').nth(1).locator('.item').first().locator('.seg button:has-text("黑字")').click();
await p.waitForTimeout(400);
console.log('画布首个 chip class:', await p.locator('.stage .chip').first().getAttribute('class'));

await p.screenshot({ path: '/tmp/ui-caption.png' });
console.log('JS 错误:', errs.length ? errs : '(none)');
await b.close();
