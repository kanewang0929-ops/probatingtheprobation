/* 子页面的服务端渲染。
   内容全部来自后台，所以每一处插值都必须转义——这里是唯一一个拼 HTML 字符串的地方。*/

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ESC[c]);

/** 正文按空行分段，段内换行保留。 */
function paragraphs(text) {
  return String(text).split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
    .map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
}

function block(b) {
  if (b.type === 'text') return `<div class="blk blk--text">${paragraphs(b.text)}</div>`;
  if (b.type === 'image') {
    const cap = b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : '';
    return `<figure class="blk blk--img">`
      + `<img src="/assets/${esc(b.assetId)}" alt="${esc(b.alt)}" loading="lazy" decoding="async">`
      + cap + `</figure>`;
  }
  return '';
}

/**
 * @param page   getPage() 的返回值
 * @param opts   { preview: 是否草稿预览, brand: 站名 }
 */
export function renderSubpage(page, opts = {}) {
  const { preview = false, brand = '' } = opts;
  const bg = page.background
    ? `<div class="bg" style="background-image:url('/assets/${esc(page.background)}')"></div>`
    : '';
  // 只在真的有上／下一篇时才给按钮；两边都没有就整条导航都不出
  const base = preview ? '/preview' : '';
  const prev = page.prevN ? `<a class="nav__link" href="${base}/p/${page.prevN}">← 上一篇</a>` : '<span></span>';
  const next = page.nextN ? `<a class="nav__link" href="${base}/p/${page.nextN}">下一篇 →</a>` : '<span></span>';
  const nav = (page.prevN || page.nextN) ? `<div class="nav">${prev}${next}</div>` : '';

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(page.title)}｜${esc(brand || page.bubbleName)}</title>
<meta name="description" content="${esc(page.lead || page.stepText)}">
<meta name="theme-color" content="#07080b">
${preview ? '<meta name="robots" content="noindex,nofollow">' : ''}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&family=Noto+Sans+SC:wght@400;500;700&family=Noto+Serif+SC:wght@700;900&display=swap" rel="stylesheet">
<style>
:root{
  --ink:#07080b; --paper:#f3f5fb; --rim:#e2387f; --graphite:#2a2d38;
  --serif:"Noto Serif SC","Source Han Serif SC","Songti SC","STSong","SimSun",serif;
  --sans:"Noto Sans SC","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
  --brush:"Ma Shan Zheng","Noto Serif SC","Songti SC",cursive;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--ink);color:var(--paper);font-family:var(--sans);
  font-size:16px;line-height:1.9;-webkit-font-smoothing:antialiased}

/* 背景图：整页固定，压一层暗罩保证正文可读 */
.bg{position:fixed;inset:0;z-index:0;background-size:cover;background-position:center;
  background-attachment:fixed}
.bg::after{content:"";position:absolute;inset:0;
  background:linear-gradient(180deg,rgba(7,8,11,.82),rgba(7,8,11,.93) 55%,rgba(7,8,11,.97))}
@media (prefers-reduced-motion:reduce){.bg{background-attachment:scroll}}

.wrap{position:relative;z-index:1;max-width:760px;margin:0 auto;padding:clamp(28px,7vw,88px) 20px 100px}

.top{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:clamp(26px,5vw,46px);
  font-size:13px;color:#8b93a7}
.top a{color:#8b93a7;text-decoration:none;border-bottom:1px solid #3a4052;padding-bottom:1px}
.top a:hover{color:var(--rim);border-color:var(--rim)}

h1{margin:0 0 .5em;font:900 clamp(28px,5.2vw,52px)/1.28 var(--serif);letter-spacing:.02em;text-wrap:balance}
.lead{margin:0 0 clamp(26px,4vw,44px);font-size:clamp(16px,1.7vw,19px);line-height:1.85;color:#c3cadb;
  padding-left:16px;border-left:3px solid var(--rim);text-wrap:pretty}

.blk{margin:0 0 clamp(20px,3vw,32px)}
.blk--text p{margin:0 0 1.15em;text-wrap:pretty}
.blk--text p:last-child{margin-bottom:0}
.blk--img{margin-left:0;margin-right:0}
.blk--img img{display:block;width:100%;height:auto;border-radius:10px;background:#12141b}
.blk--img figcaption{margin-top:.7em;font-size:13.5px;color:#8b93a7;text-align:center}

.nav{display:flex;justify-content:space-between;gap:14px;margin-top:clamp(40px,7vw,76px);
  padding-top:24px;border-top:1px solid #262a36;font-size:14px}
.nav__link{color:var(--paper);text-decoration:none}
.nav__link:hover{color:var(--rim)}

.draft{position:sticky;top:0;z-index:5;margin:-20px -20px clamp(22px,4vw,34px);padding:9px 20px;
  background:#4a3c15;color:#e3b341;font-size:13px;text-align:center}
@media (max-width:640px){body{font-size:15.5px}}
</style>
</head>
<body>
${bg}
<div class="wrap">
${preview ? '<div class="draft">草稿预览 · 这一页尚未发布或仅你可见</div>' : ''}
  <div class="top">
    <a href="${preview ? '/preview' : '/'}" id="back">← 回到${esc(brand || '首页')}</a>
    <span>${esc(page.bubbleName)}</span>
  </div>
  <script>
  /* 从站内点进来的，返回就走浏览器历史——回到你离开时那一屏（泡泡弹窗、滚动位置都还在），
     而不是把首页从顶端重新加载一遍。直接打开这一页的（外部链接、收藏夹）才退回首页。
     脚本紧跟在链接后面同步执行，改文案不会闪。*/
  (function () {
    var a = document.getElementById('back');
    if (!a || !document.referrer) return;
    try {
      if (new URL(document.referrer, location.href).origin !== location.origin) return;
    } catch (e) { return; }
    if (history.length <= 1) return;
    a.textContent = '← 返回';
    a.addEventListener('click', function (e) { e.preventDefault(); history.back(); });
  })();
  </script>
  <h1>${esc(page.title)}</h1>
  ${page.lead ? `<p class="lead">${esc(page.lead)}</p>` : ''}
  ${page.blocks.map(block).join('\n  ')}
  ${nav}
</div>
</body>
</html>`;
}

export function renderNotFound(preview) {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>这一页还没有内容</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#07080b;color:#f3f5fb;
  font-family:"Noto Sans SC","PingFang SC",system-ui,sans-serif;text-align:center;padding:24px}
p{color:#8b93a7;margin:.6em 0 1.6em}
a{color:#e2387f}
</style></head>
<body><div>
<h1>这一页还没有内容</h1>
<p>${preview ? '这一条还没有建对应的子页面，去后台补上即可。' : '它可能还没发布，或者已经被移除了。'}</p>
<a href="${preview ? '/preview' : '/'}">← 回首页</a>
</div></body></html>`;
}
