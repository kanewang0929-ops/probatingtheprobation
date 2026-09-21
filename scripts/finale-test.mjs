import { chromium } from 'playwright';
const B = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type()==='error' && !/MediaError|无法播放|CERT|favicon/.test(m.text())) errs.push(m.text()); });

await p.goto(B + '/');
await p.waitForTimeout(2200);
// 泡泡区平时 visibility:hidden，而且每帧都会被 updateOverlays 重置，
// 所以直接用 JS 派发 click —— 合成事件照样触发 openBubble。
// 注意：note 的 is-on 还依赖 end（要 mainReady + 滚到底），这个环境放不了 H.264，
// 所以下面只断言 is-clickable / tabIndex 这些与视频无关的部分。
const noteState = () => p.evaluate(() => {
  const n = document.querySelector('.note');
  return { is_on: n.classList.contains('is-on'), clickable: n.classList.contains('is-clickable'),
           tabIndex: n.tabIndex, cue: getComputedStyle(document.querySelector('.note__cue')).display };
});

console.log('一个都没点:', JSON.stringify(await noteState()));
for (let i = 0; i < 4; i++) {
  await p.evaluate(n => document.querySelectorAll('.bubble__hit')[n].click(), i);
  await p.waitForTimeout(450);
  const opened = await p.evaluate(() => document.querySelector('.viewer').classList.contains('is-open'));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(650);
  console.log(`点完第 ${i+1} 个 (弹窗确实打开=${opened}):`, JSON.stringify(await noteState()));
}

console.log('\n结尾影像是否已开始预载:', await p.evaluate(() => {
  const v = document.querySelector('#v-finale');
  return { src: v.getAttribute('src'), preload: v.preload };
}));

// 点结尾框
await p.evaluate(() => document.querySelector('.note').click());
await p.waitForTimeout(900);
console.log('点击后:', JSON.stringify(await p.evaluate(() => ({
  遮罩显示: document.querySelector('.finale').classList.contains('is-on'),
  aria: document.querySelector('.finale').getAttribute('aria-hidden'),
  滚动被锁: document.documentElement.classList.contains('is-viewing'),
  静音: document.querySelector('#v-finale').muted,
  提示: document.querySelector('#finaleMsg').textContent
}))));

// Esc 退出
await p.keyboard.press('Escape');
await p.waitForTimeout(800);
console.log('Esc 之后:', JSON.stringify(await p.evaluate(() => ({
  遮罩显示: document.querySelector('.finale').classList.contains('is-on'),
  滚动已解锁: !document.documentElement.classList.contains('is-viewing'),
  结尾框还在: document.querySelector('.note').classList.contains('is-on')
}))));

// 键盘可达：直接在结尾框上派发 keydown 验证处理函数。
// 不走真实焦点是因为这个环境里 note 一直 visibility:hidden（is-on 依赖 end，
// end 又依赖 mainReady，没有 H.264 解码器就永远为假），隐藏元素拿不到焦点。
for (const key of ['Enter', ' ']) {
  const fired = await p.evaluate(k => {
    const n = document.querySelector('.note');
    n.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    return document.querySelector('.finale').classList.contains('is-on');
  }, key);
  console.log(`${key === ' ' ? 'Space' : key} 触发:`, fired);
  await p.evaluate(() => document.querySelector('#finaleClose').click());
  await p.waitForTimeout(500);
}
// 未集齐时不应被键盘触发
const guarded = await p.evaluate(() => {
  const n = document.querySelector('.note');
  n.classList.remove('is-clickable');
  n.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  const on = document.querySelector('.finale').classList.contains('is-on');
  n.classList.add('is-clickable');
  return !on;
});
console.log('未集齐时键盘不触发:', guarded);
await p.evaluate(() => document.querySelector('.note').click());
await p.waitForTimeout(500);
await p.evaluate(() => document.querySelector('#finaleClose').click());
await p.waitForTimeout(700);
console.log('关闭按钮:', await p.evaluate(() => !document.querySelector('.finale').classList.contains('is-on')));

console.log('JS 错误:', errs.length ? errs : '(none)');
await b.close();
