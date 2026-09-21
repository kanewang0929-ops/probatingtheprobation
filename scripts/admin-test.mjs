import { chromium } from 'playwright';
const BASE = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/CERT|404/.test(m.text())) errs.push(m.text()); });

await p.goto(BASE + '/admin/', { waitUntil: 'load' });
await p.waitForTimeout(800);
console.log('登录页:', await p.locator('.login h1').textContent());

// 错误密码
await p.fill('.login input', 'wrong');
await p.click('.login .btn');
await p.waitForTimeout(600);
console.log('错误密码提示:', await p.locator('.msg.err').textContent());

// 正确密码
await p.fill('.login input', 'test-pw-12345');
await p.click('.login .btn');
await p.waitForTimeout(1200);

console.log('顶栏:', await p.locator('.top h1').textContent(), '|', await p.locator('.badge').textContent());
console.log('区块:', await p.locator('.card > header h2').allTextContents());
console.log('泡泡数:', await p.locator('.card').nth(2).locator('.item').count());
console.log('字幕数:', await p.locator('.card').nth(1).locator('.item').count());
console.log('高级分组默认折叠:', await p.locator('details.adv').first().evaluate(d => !d.open));
console.log('高级警告文案:', (await p.locator('details.adv .warn').first().textContent()).slice(0, 34) + '…');
await p.screenshot({ path: '/tmp/admin-1.png', fullPage: false });

// 改一个泡泡名称 → 应出现「有未保存的改动」
const nameInput = p.locator('.card').nth(2).locator('.item').first().locator('input[type=text]').first();
await nameInput.fill('测试改名');
await p.waitForTimeout(400);
console.log('改动后徽章:', await p.locator('.badge').textContent());

// 保存
await p.click('.bar .btn:has-text("保存草稿")');
await p.waitForTimeout(1000);
console.log('保存后徽章:', await p.locator('.badge').textContent());
console.log('保存提示:', await p.locator('.msg.ok').textContent());

// 超长输入 → 计数器标红 + 保存报错
await nameInput.fill('这是一个非常长的泡泡名称超过限制了');
await p.waitForTimeout(300);
console.log('超长计数器标红:', await p.locator('.card').nth(2).locator('.item').first().locator('.count').first().evaluate(n => n.classList.contains('over')));
await p.click('.bar .btn:has-text("保存草稿")');
await p.waitForTimeout(900);
console.log('校验错误:', await p.locator('.msg.err').textContent());
await p.screenshot({ path: '/tmp/admin-2.png' });

// 删除确认弹层
await p.locator('.card').nth(2).locator('.item').first().locator('.btn.danger:has-text("删除")').click();
await p.waitForTimeout(400);
console.log('确认弹层:', await p.locator('#mTitle').textContent(), '/', (await p.locator('#mBody').textContent()).slice(0, 30) + '…');
await p.click('#mNo');
await p.waitForTimeout(300);
console.log('取消后泡泡数:', await p.locator('.card').nth(2).locator('.item').count());

// 平板尺寸
await p.setViewportSize({ width: 820, height: 1180 });
await p.waitForTimeout(400);
console.log('平板下横向溢出:', await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth));
await p.screenshot({ path: '/tmp/admin-3.png' });

console.log('JS 错误:', errs.length ? errs : '(none)');
await b.close();
