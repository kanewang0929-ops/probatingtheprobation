# Kane Wang 转正汇报 · 页面与内容后台

滚动驱动的影像叙事页，外加一套用来维护页面文案的轻量后台。

```
/          转正汇报页面
/admin     内容后台（需密码登录）
/preview   草稿预览（需登录）
/healthz   健康检查
```

## 能改什么

| 区块 | 字段 |
|---|---|
| 站点信息 | 站名、首屏标题（最多 3 行）、泡泡区标题 |
| 节奏字幕 | 文案、顺序、发布状态；高级项：与视频对齐的起止秒数 |
| 泡泡 | 名称、一句话、正文、步骤（1–6 条）、顺序、发布状态；高级项：圆心 X/Y、半径 |

视频文件与泡泡放大图仍在 `public/` 里，需要换素材时直接替换文件并提交。

## 设计取舍：为什么内容在服务端注入

页面脚本在**顶层同步**构建泡泡元素（`public/index.html` 的 `const bubbleEls = CONFIG.bubbles.map(...)`），
所以内容必须在主脚本执行前就位。如果改成前端 `fetch`，就会出现「先渲染旧内容、再跳变」或时序竞争。

因此服务端在返回 HTML 时，把已发布内容作为一行 `window.__CONTENT__` 注入到主脚本之前，
页面脚本同步读取并合并进 `CONFIG`。好处是：没有额外请求、没有闪烁、没有时序风险。

**兜底是硬要求**：数据库不可用、内容为空或校验不通过时，服务端不注入任何东西，
返回的 HTML 与 `public/index.html` **逐字节相同**，页面原样使用脚本内置的 `CONFIG`。

## 与视频锁定的字段

`cx / cy / r` 是按视频画面 2560×1440 量出来的圆心与半径；字幕的 `from / to` 对应 `main.mp4` 的秒数。
这些值和视频帧是对齐的，改错会让泡泡飘出画面或字幕与画面不同步。所以它们：

- 收在后台默认折叠的「高级」分组里，并带黄色警告说明
- 前后端都做范围校验（X 0–2560，Y 0–1440，半径 40–600，秒数 0–60，且起始 < 结束）
- 页面合并时再校验一次，越界的条目整条丢弃，回退到内置值

## 后台使用

1. 打开 `/admin`，输入密码登录（密码是服务端的 `ADMIN_PASSWORD`）
2. 改完点 **保存草稿** —— 此时正式页面还没变
3. 点 **预览草稿** 在新标签页确认效果（预览会显示未发布的条目）
4. 确认无误点 **发布到正式页面** —— 访问者刷新后即为新内容

其他操作：

- 每个条目右上角的开关控制**是否发布**。关掉的条目在预览里能看到，正式页面上不显示
- `↑ ↓` 调整顺序，**复制** 基于当前条目新建一份（默认未发布）
- **删除** 有二次确认；在点「发布」之前不会影响正式页面
- **放弃草稿改动** 把草稿恢复成正式页面上的内容
- 字数超限时计数器变红，保存会被拒绝并列出具体哪一条不合格
- 至少要保留一条已发布字幕和一个已发布泡泡，否则不允许发布

## 部署

服务已在 Render 上运行，推送到 `claude/focused-franklin-kg99y5` 分支会自动部署。

环境变量：

| 变量 | 说明 |
|---|---|
| `DATABASE_URL` | Postgres 连接串。缺失时后台停用，前台照常工作 |
| `ADMIN_PASSWORD` | 后台密码。**留空则整个后台停用**，前台不受影响 |
| `SESSION_SECRET` | 登录态签名密钥。变更后所有人需重新登录 |
| `NODE_ENV` | 生产环境设为 `production`：隐藏详细错误，并要求 Cookie 走 HTTPS |

本地开发：

```bash
npm install
cp .env.example .env     # 填好后 source 或用 dotenv 之类加载
node server.js           # 默认 3000 端口
```

不设任何环境变量也能直接 `node server.js`：后台停用，前台使用内置内容。

## 安全

- 密码比对用 `crypto.timingSafeEqual`，避免计时侧信道
- 登录态是 HMAC 签名的 httpOnly Cookie，12 小时过期，不落库
- 同一 IP 连续登录失败会指数退避锁定，最长 15 分钟
- 所有来自后台的文案一律用 `textContent` 注入，不用 `innerHTML`；首屏标题的换行用 `<br>` 元素拼
- 注入 HTML 前把 `<` 转义成 `<`，内容里出现 `</script>` 也无法提前闭合标签
- 生产环境不返回数据库错误详情

## 维护脚本

```bash
npm run check    # 全部 JS 语法检查
npm run seed     # 从 public/index.html 重新抽取内容作为种子（换了页面文案后用）
```

`scripts/browser-test.mjs` 和 `scripts/admin-test.mjs` 是端到端检查，需要先装 Playwright：

```bash
npm install --no-save playwright
node scripts/browser-test.mjs http://localhost:3000
node scripts/admin-test.mjs   http://localhost:3000
```

`scripts/patch-page.mjs` 幂等地把内容合并逻辑插进 `public/index.html`，已经插过就跳过。

## 备用站点

`kane-wang-report.onrender.com` 是纯静态版本，没有后台、内容固定，作为这个服务出问题时的备份。
