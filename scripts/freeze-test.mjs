import { chromium } from 'playwright';
const B = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

await p.goto(B + '/');
await p.waitForTimeout(2200);
for (let i = 0; i < 4; i++) {
  await p.evaluate(n => document.querySelectorAll('.bubble__hit')[n].click(), i);
  await p.waitForTimeout(350);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(500);
}
await p.evaluate(() => document.querySelector('.note').click());
await p.waitForTimeout(700);

const state = () => p.evaluate(() => {
  const f = document.querySelector('.finale'), v = document.querySelector('#v-finale');
  return {
    遮罩: f.classList.contains('is-on'),
    定格态: f.classList.contains('is-ended'),
    滚动锁: document.documentElement.classList.contains('is-viewing'),
    视频暂停: v.paused,
    提示可见: getComputedStyle(document.querySelector('.finale__hint')).opacity
  };
});
console.log('刚点开:', JSON.stringify(await state()));

// 这个环境解不了 H.264，直接派发 ended 验证「播完」这条路径
await p.evaluate(() => document.querySelector('#v-finale').dispatchEvent(new Event('ended')));
await p.waitForTimeout(600);
console.log('播完之后:', JSON.stringify(await state()), '← 遮罩应仍为 true（定格，不自动退出）');

// 定格状态下 Esc 仍能退出
await p.keyboard.press('Escape');
await p.waitForTimeout(700);
console.log('Esc 退出后:', JSON.stringify(await state()));

// 重播时定格态要清掉
await p.evaluate(() => document.querySelector('.note').click());
await p.waitForTimeout(700);
console.log('再次点开:', JSON.stringify(await state()), '← 定格态应已清掉');

// 定格后用关闭按钮退出
await p.evaluate(() => document.querySelector('#v-finale').dispatchEvent(new Event('ended')));
await p.waitForTimeout(400);
await p.evaluate(() => document.querySelector('#finaleClose').click());
await p.waitForTimeout(700);
console.log('关闭按钮退出:', JSON.stringify(await state()));

console.log('JS 错误:', errs.length ? errs : '(none)');
await b.close();
