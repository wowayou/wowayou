# 终端风格作品集

作品集源码位于 `docs/`，与根目录的 GitHub Profile README 分开维护。纯 HTML、CSS、JavaScript，无构建、无运行时依赖、无第三方字体和统计脚本。页面不请求 GitHub API；项目内容是人工精选的公开资料快照。

双语站点：中文 `docs/index.html`（默认，`/wowayou/`），英文 `docs/en/index.html`（`/wowayou/en/`）。两版共享 `styles.css`、`app.js`、`icon.svg`；终端文案在 `app.js` 的 `STRINGS` 字典里按页面 `lang` 选择。设计规则见 [DESIGN.md](DESIGN.md)。

## 本地预览

```sh
cd /home/forbackup/projects/wowayou
python3 -m http.server 4173 --bind 127.0.0.1 --directory docs
```

打开 <http://127.0.0.1:4173/>（英文版 <http://127.0.0.1:4173/en/>）。直接打开 `docs/index.html` 也可浏览；验收以 HTTP 预览为准。

## 修改内容

- `docs/index.html`（中文）与 `docs/en/index.html`（英文）：简介、项目卡片、项目链接、邮箱和页面元信息。两版必须同步修改。
- 每个 `.project-card` 的 `data-slug` 是终端中的项目名，`data-title` 和 `data-summary` 是终端介绍，`data-category` 对应筛选分类。`data-live` / `data-source` 标记项目入口和源码链接。终端从这些卡片读取内容，不另存一份项目列表。
- 新增或删除项目后，同步修改双语页面的卡片、作品标题数量（`/ 06`）和每个筛选按钮的数量；`slug` 与分类两版保持一致。
- `docs/styles.css`：布局、响应式规则、主题颜色和减少动态效果的适配。颜色只用 DESIGN.md 里的 token；浅色 token 有两份（显式 light 与 auto 跟随系统），必须逐字一致。
- `docs/app.js`：终端命令、补全、历史、筛选和主题。UI 文案在顶部 `STRINGS`（zh / en）。使用 `textContent` 显示输入，不执行用户代码。
- `docs/icon.svg`：站点图标。

命令：`help`、`whoami`、`projects`、`links`、`open <项目名>`、`theme`、`clear`、`history`。`open` 显示可点击入口，由访客选择打开。支持 Tab 唯一匹配补全、上下键历史、Ctrl / Command + L 清屏。历史仅在当前页面内存中保存，最多 60 条；输出最多 30 组。主题默认跟随系统（`auto`），显式切换后偏好保存在本机 `localStorage`；存储不可用时仍可在当前页面切换。输入区不自动抢焦点，Tab 无可补全内容时正常移出。

禁用 JavaScript 时，简介、六个项目与联系链接仍可直接浏览，交互控件隐藏，主题仍跟随系统。终端只模拟本页的有限命令，不连接服务器、不执行 shell。

## GitHub Pages 发布

当前版本已上线：<https://wowayou.github.io/wowayou/>。GitHub Pages 从 `feat/terminal-portfolio` 分支的 `/docs` 目录发布，个人主页仍由默认分支 `main` 的 README 提供。

当前线上配置：

- 地址：<https://wowayou.github.io/wowayou/>（英文 <https://wowayou.github.io/wowayou/en/>）
- 发布分支：`feat/terminal-portfolio`
- 发布目录：`/docs`

后续更新作品集时，提交到 `feat/terminal-portfolio` 分支，GitHub Pages 会自动重新构建。个人主页使用 `main` 分支的 README；是否把作品集链接加入主页，由你单独决定。若要在仓库设置中重新配置，选择 **Deploy from a branch**，分支选择 `feat/terminal-portfolio`，目录选择 `/docs`。

GitHub 用户根站点 `https://wowayou.github.io/` 需要名为 `wowayou.github.io` 的仓库；本仓库名为 `wowayou`，默认是上述带 `/wowayou/` 的项目站点。不要为了作品集覆盖已有博客或迁移其他仓库。

## 基准检查

每次修改 `docs/` 后运行：

```sh
node tools/baseline.mjs
```

零依赖（Node ≥ 18）。覆盖文件完整性、JS 语法、双语 head 基线（lang / CSP / canonical / hreflang）、本地资源与锚点、双语项目对等、筛选计数、浅色 token 一致性、WCAG AA 对比度、第三方资源扫描和体积预算（单语言 ≤ 160 KB）。失败时退出码为 1。规则说明见 [DESIGN.md](DESIGN.md)。

## 本次验证

2026-10-16：双语、主题跟随系统与设计规范改造。

- `node tools/baseline.mjs` 全部通过；另在临时副本中注入计数错误、slug 不对等、token 漂移、小于 8px 字号和第三方脚本，均被拦截（退出码 1）。
- Chromium（CDP）自动化验收 65 项通过：auto 主题实时跟随系统、显式切换与刷新保留、theme-color 同步；中英文全部命令、用法与错误提示、HTML 输入、Tab 补全、清屏；筛选计数与单复数播报；语言切换链接；上翻阅读时不抢滚动；触屏模拟下快捷命令不回焦。
- 双语 320 / 390 / 568 / 768 / 1024 / 1440px 无水平溢出；390px 触控目标最小 40px。
- 减少动态效果、打印样式、拒绝 localStorage、禁用 JavaScript（内容可读且主题仍跟随系统）；无控制台错误、资源失败或自动第三方请求。
- 人工查看中文桌面深 / 浅色、中文手机深色、英文手机浅色截图；发现并修复欢迎区源码缩进被 `pre-wrap` 显示的旧问题。

仍未覆盖：手机真机、Safari / Firefox、屏幕阅读器实测；英文文案建议你再过一遍语气。

2026-10-15：本地 HTTP 预览下完成 Chromium 自动化验收，并查看桌面深色、桌面浅色和手机宽度截图。

- 320、390、568（横屏）、768、1024、1440px 无水平溢出。
- 三类筛选与恢复全部；全部命令、参数错误、未知项目与 HTML 输入；项目链接、输出与历史数量上限。
- 历史草稿恢复、Tab 唯一匹配补全、Tab / Shift+Tab 离开输入、命令与快捷键清屏。
- 主题切换与刷新保存；禁用 JavaScript 的 320px 浏览；拒绝 localStorage 时的主题与命令。
- 减少动态效果设置；无控制台错误、资源失败或自动第三方请求。
- JavaScript 语法检查、HTML 标识 / 片段链接 / 本地资源审计、`git diff --check` 通过。
- 博客、时间尺、SEO Operator Lab、万家灯火的公开入口均返回 HTTP 200；仅检查入口可达性，不代表完成各应用的功能验收。

这是桌面 Chromium 的自动化及视口模拟结果；尚未覆盖手机真机、Safari / Firefox 或上线后的 HTTPS / Pages 发布。

## 验收要点

- 桌面、手机与 320px 窄屏无水平溢出，浅色和深色主题均可读。
- 项目筛选、全部命令、未知命令 / 参数错误、Tab 补全、历史草稿恢复和清屏可用。
- 禁用脚本或本地存储时，公开内容仍可读；输入 HTML 只显示文本。
- 键盘可操作导航、筛选、命令按钮、终端输入和输出区，无焦点陷阱。
- 本地资源无 404，无脚本错误，不自动请求第三方资源。
- 上线后人工检查外部项目链接；项目可用性和外部站点变化不由作品集保证。
