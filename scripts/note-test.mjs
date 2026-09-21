import { chromium } from 'playwright';
const B = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1340, height: 1000 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

await p.goto(B + '/admin/');
await p.fill('.login input', 'test-pw-12345');
await p.click('.login .btn');
await p.waitForTimeout(1500);
console.log('卡片:', await p.locator('.card > header h2').allTextContents());

const card = p.locator('.card').filter({ has: p.locator('header h2:text-is("结尾框")') });
console.log('字段:', await card.locator('.field > label').allTextContents());
const pv = () => card.locator('.notepv').innerText();
console.log('预览初始:', JSON.stringify(await pv()));

// 改按钮文字，预览要跟着变，且光标不能丢
const cue = card.locator('input[type=text]').last();
await cue.click();
await cue.fill('');
await cue.type('看最后一段影像', { delay: 40 });
await p.waitForTimeout(300);
console.log('输入后预览:', JSON.stringify(await pv()));
console.log('光标仍在输入框:', await p.evaluate(() => document.activeElement?.tagName + '/' + document.activeElement?.type));

// 改标题与正文
await card.locator('input[type=text]').first().fill('拆开，跑快，收紧，回头看。');
await card.locator('textarea').fill('四个动作，四段回头看。');
await p.waitForTimeout(400);
console.log('全部改完预览:', JSON.stringify(await pv()));
await card.screenshot({ path: '/tmp/note-card.png' });

// 超长校验
await card.locator('input[type=text]').last().fill('这是一段非常长的按钮文字超过二十个字的限制了应该报错');
await p.waitForTimeout(300);
await p.click('.bar .btn:has-text("保存草稿")');
await p.waitForTimeout(1000);
console.log('超长校验:', await p.locator('.msg.err').textContent());

// 改回正常并发布
await card.locator('input[type=text]').last().fill('点我，看最后一段');
await p.waitForTimeout(1400);
await p.click('.bar .btn:has-text("发布到正式页面")');
await p.waitForTimeout(400); await p.click('#mYes'); await p.waitForTimeout(1800);

// 前台核对
const site = await ctx.newPage();
await site.goto(B + '/');
await site.waitForTimeout(2200);
console.log('>>> 前台结尾框:', JSON.stringify(await site.evaluate(() => ({
  标题: document.querySelector('.note h2').textContent,
  正文: document.querySelector('.note p').textContent,
  按钮: document.querySelector('.note__cue').textContent
}))));
console.log('JS 错误:', errs.length ? errs : '(none)');
await b.close();
