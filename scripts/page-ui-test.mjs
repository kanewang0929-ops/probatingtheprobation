import { chromium } from 'playwright';
const BASE = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1340, height: 1000 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type()==='error' && !/401|400|404|CERT/.test(m.text())) errs.push(m.text()); });

await p.goto(BASE + '/admin/');
await p.fill('.login input', 'test-pw-12345');
await p.click('.login .btn');
await p.waitForTimeout(1500);

// 打开子页面 1
const pg1 = p.locator('.pg').first();
await pg1.locator('summary').click();
await p.waitForTimeout(400);
console.log('未建状态:', await pg1.locator('.empty').textContent());
await pg1.locator('.btn:has-text("建立子页面 1")').click();
await p.waitForTimeout(600);
console.log('建立后标题值:', await pg1.locator('input[type=text]').first().inputValue());

// 填标题、导语
await pg1.locator('input[type=text]').first().fill('把需求拆到不能再拆');
await pg1.locator('textarea').first().fill('这一条的展开说明。');
await p.waitForTimeout(300);

// 上传背景图
await pg1.locator('.up input[type=file]').first().setInputFiles('/tmp/bg.png');
await p.waitForTimeout(1800);
console.log('背景图缩略图:', await pg1.locator('.up__thumb').first()
  .evaluate(n => n.style.backgroundImage.match(/assets\/(\w+)/)?.[1] || '未设置'));

// 正文：填文字块，再加一个图片块并上传
await pg1.locator('.blk--text, .blk').first().locator('textarea').fill('第一段。\n\n第二段，验证分段。');
await p.waitForTimeout(300);
await pg1.locator('.btn:has-text("+ 图片")').click();
await p.waitForTimeout(600);
const imgBlk = pg1.locator('.blk').last();
await imgBlk.locator('input[type=file]').setInputFiles('/tmp/img1.png');
await p.waitForTimeout(1800);
console.log('插图缩略图:', await imgBlk.locator('.up__thumb')
  .evaluate(n => n.style.backgroundImage.match(/assets\/(\w+)/)?.[1] || '未设置'));
await imgBlk.locator('input[type=text]').first().fill('测试插图');
await imgBlk.locator('input[type=text]').nth(1).fill('这是图注');
await p.waitForTimeout(300);

// 发布这一页
await pg1.locator('.toggle').first().click();   // 复选框是隐藏的，点包住它的 label
await p.waitForTimeout(400);
console.log('内容块数:', await pg1.locator('.blk').count());
await p.screenshot({ path: '/tmp/ui-page.png', fullPage: false });

// 发布整站
await p.click('.bar .btn:has-text("发布到正式页面")');
await p.waitForTimeout(400);
await p.click('#mYes');
await p.waitForTimeout(2000);
console.log('发布结果:', await p.locator('.msg.ok').textContent());

// 看正式子页面
const sub = await ctx.newPage();
await sub.goto(BASE + '/p/1');
await sub.waitForTimeout(700);
console.log('>>> /p/1 标题:', await sub.locator('h1').textContent());
console.log('>>> 段落数:', await sub.locator('.blk--text p').count());
console.log('>>> 插图:', await sub.locator('.blk--img img').count(), '图注:', await sub.locator('figcaption').textContent());
console.log('>>> 背景图已设:', await sub.locator('.bg').evaluate(n => n.style.backgroundImage.includes('/assets/')));
console.log('>>> 图片实际加载成功:', await sub.locator('.blk--img img').evaluate(i => i.complete && i.naturalWidth > 0));
await sub.screenshot({ path: '/tmp/subpage.png', fullPage: true });

console.log('JS 错误:', errs.length ? errs : '(none)');
await b.close();
