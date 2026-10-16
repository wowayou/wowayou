#!/usr/bin/env node
/**
 * smoke.mjs — 作品集的浏览器验收（零依赖：Node >= 18 + 本机 Chromium）。
 *
 * 用途：baseline.mjs 管静态规则，本脚本管真实浏览器里的行为与视觉回归。
 * 运行：node tools/smoke.mjs
 *
 * 环境变量：
 *   SMOKE_CHROME   指定 Chromium/Chrome 可执行文件（也接受 CHROME_PATH）
 *   SMOKE_SHOTS    截图输出目录；设置后才截图，默认不产生文件
 *   SMOKE_TIMEOUT  整体超时毫秒数（默认 240000）
 *
 * 退出码：0 全部通过；1 有断言失败；2 环境不满足（未找到浏览器 / 浏览器未启动）。
 *
 * 维护约定：断言里的中英文界面文案就是产品文案契约。改动 docs/ 里的可见文案后，
 * 同步更新本文件的断言；改动交互规则后，同步更新 DESIGN.md。
 *
 * 检查范围（细节见 DESIGN.md）：
 *   - 主题：auto 跟随系统、显式切换、刷新保留、theme-color 同步、localStorage 被拒时的降级。
 *   - 终端：中英文全部命令、用法与错误提示、HTML 输入只作文本、Tab 补全、清屏、
 *     历史、快捷命令回焦策略（触屏不回焦）。
 *   - 交互：筛选计数与 aria-pressed、单复数播报、语言切换链接、上翻阅读时不抢滚动。
 *   - 布局：320–1440px 无水平溢出；移动端触控目标 >= 40px。
 *   - 偏好：减少动态效果、打印样式、禁用 JavaScript 时的可读性与主题。
 *   - 网络与控制台：无第三方请求、无资源失败、无控制台错误或未捕获异常。
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = join(root, "docs");
const SHOTS = process.env.SMOKE_SHOTS ? resolve(process.env.SMOKE_SHOTS) : null;
const TIMEOUT = Number(process.env.SMOKE_TIMEOUT ?? 240_000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- browser discovery ---------- */
const CHROME_SUFFIXES = [
  "chrome-linux64/chrome",
  "chrome-linux/chrome",
  "chrome-headless-shell-linux64/chrome-headless-shell",
  "chrome-linux/headless_shell",
  "chrome/headless_shell",
];
const versionOf = (name) => Number(name.match(/[-_](\d+)$/)?.[1] ?? 0);

function findChrome() {
  const explicit = process.env.SMOKE_CHROME ?? process.env.CHROME_PATH;
  if (explicit) {
    return existsSync(explicit)
      ? { path: explicit, source: "SMOKE_CHROME / CHROME_PATH" }
      : { path: null, reason: `指定的浏览器不存在：${explicit}` };
  }
  for (const name of ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable", "chrome"]) {
    const found = spawnSync("which", [name], { encoding: "utf8" });
    if (found.status === 0 && found.stdout.trim()) return { path: found.stdout.trim(), source: `PATH 中的 ${name}` };
  }
  for (const base of [join(homedir(), ".cache", "ms-playwright"), join(homedir(), ".cache", "puppeteer", "chrome")]) {
    if (!existsSync(base)) continue;
    const dirs = readdirSync(base).filter((d) => d.startsWith("chromium") || d.startsWith("chrome") || d.startsWith("google-chrome")).sort((a, b) => versionOf(b) - versionOf(a));
    for (const dir of dirs) {
      for (const suffix of CHROME_SUFFIXES) {
        const candidate = join(base, dir, suffix);
        if (existsSync(candidate)) return { path: candidate, source: `${base}/${dir}` };
      }
    }
  }
  return { path: null, reason: "未找到 Chromium / Chrome（可用 SMOKE_CHROME 指定路径）" };
}

const freePort = () =>
  new Promise((res, rej) => {
    const s = createTcpServer();
    s.on("error", rej);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });

/* ---------- static server (no python dependency) ---------- */
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function startServer(port) {
  const server = createHttpServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
    const file = join(DOCS, pathname.endsWith("/") ? `${pathname}index.html` : pathname);
    // Serve only from docs/, and only files.
    if (!file.startsWith(DOCS) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("not found");
      return;
    }
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  return new Promise((res) => server.listen(port, "127.0.0.1", () => res(server)));
}

/* ---------- run ---------- */
const chromeInfo = findChrome();
if (!chromeInfo.path) {
  console.error(`⚠ 跳过浏览器验收：${chromeInfo.reason}`);
  process.exit(2);
}

let pass = 0;
let fail = 0;
const failed = [];
const ok = (cond, label, detail = "") => {
  console.log(`${cond ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (cond) pass += 1;
  else {
    fail += 1;
    failed.push(label + (detail ? ` (${detail})` : ""));
  }
};

const httpPort = await freePort();
let debugPort = await freePort();
// 两个端口都来自同一段临时端口，需避免重复占用。
while (debugPort === httpPort) debugPort = await freePort();
const BASE = `http://127.0.0.1:${httpPort}`;
const server = await startServer(httpPort);
const profile = mkdtempSync(join(tmpdir(), "portfolio-smoke-"));
const chrome = spawn(
  chromeInfo.path,
  ["--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--hide-scrollbars", "--no-first-run", "--remote-allow-origins=*", `--user-data-dir=${profile}`, `--remote-debugging-port=${debugPort}`, "about:blank"],
  // 独立进程组：退出时整组结束，避免 crashpad 等子进程残留。
  { stdio: "ignore", detached: true },
);
const watchdog = setTimeout(() => {
  console.error("✗ 超时：浏览器验收未在限定时间内完成");
  cleanup();
  process.exit(1);
}, TIMEOUT);

let ws;
function cleanup() {
  try { ws?.close(); } catch {}
  try {
    process.kill(-chrome.pid, "SIGKILL");
  } catch {
    chrome.kill("SIGKILL");
  }
  server.close();
  rmSync(profile, { recursive: true, force: true });
}

async function waitFor(url, label) {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return r;
    } catch {}
    await sleep(150);
  }
  throw new Error(`环境不满足：${label} 未就绪（${url}）`);
}

try {
  console.log(`浏览器：${chromeInfo.path}（来源：${chromeInfo.source}）`);
  await waitFor(`${BASE}/`, "本地静态服务器");
  const version = await (await waitFor(`http://127.0.0.1:${debugPort}/json/version`, "CDP 调试端口")).json();
  console.log(`版本：${version.Browser}\n`);

  const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: "PUT" })).json();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  const consoleErrors = [];
  const exceptions = [];
  const external = [];
  const failedRequests = [];

  ws.onmessage = async (msg) => {
    const data = typeof msg.data === "string" ? msg.data : await msg.data.text();
    const m = JSON.parse(data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      return;
    }
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
      consoleErrors.push(m.params.args.map((a) => a.value ?? a.description).join(" "));
    }
    if (m.method === "Runtime.exceptionThrown") {
      exceptions.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    }
    if (m.method === "Log.entryAdded" && m.params.entry.level === "error") consoleErrors.push(m.params.entry.text);
    if (m.method === "Network.requestWillBeSent") {
      const url = m.params.request.url;
      if (/^https?:/.test(url) && !url.startsWith(BASE)) external.push(url);
    }
    if (m.method === "Network.loadingFailed") failedRequests.push(m.params.errorText);
    (listeners.get(m.method) ?? []).splice(0).forEach((fn) => fn(m.params));
  };

  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const i = ++id;
      pending.set(i, { res, rej });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const once = (method) => new Promise((res) => {
    if (!listeners.has(method)) listeners.set(method, []);
    listeners.get(method).push(res);
  });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`表达式异常：${expression.slice(0, 80)} → ${r.exceptionDetails.exception?.description}`);
    return r.result.value;
  };
  const load = async (path) => {
    const loaded = once("Page.loadEventFired");
    await send("Page.navigate", { url: BASE + path });
    await loaded;
    await sleep(120);
  };
  const reload = async () => {
    const loaded = once("Page.loadEventFired");
    await send("Page.reload", { ignoreCache: true });
    await loaded;
    await sleep(120);
  };
  const viewport = (width, height, mobile = false) =>
    send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
  const scheme = (value) => send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value }] });
  const fresh = async (path) => {
    await load(path);
    await evaluate("localStorage.clear()");
    await reload();
  };
  const term = (cmd) =>
    evaluate(`(() => {
      const i = document.querySelector('#terminal-input');
      i.value = ${JSON.stringify(cmd)};
      document.querySelector('#terminal-form').requestSubmit();
      const e = [...document.querySelectorAll('#terminal-output .terminal-entry')].at(-1);
      return e ? e.textContent : '';
    })()`);
  const lastEntry = "[...document.querySelectorAll('#terminal-output .terminal-entry')].at(-1)";
  const bg = () => evaluate("getComputedStyle(document.body).backgroundColor");
  const DARK_BG = "rgb(17, 19, 16)";
  const LIGHT_BG = "rgb(245, 244, 237)";

  await Promise.all(["Page.enable", "Runtime.enable", "Network.enable", "Log.enable"].map((m) => send(m)));

  /* ---------- zh：主题跟随系统与显式选择 ---------- */
  await viewport(1440, 900);
  await scheme("dark");
  await fresh("/");
  ok(await evaluate("document.documentElement.dataset.theme") === "auto", "[zh] 默认 data-theme=auto");
  ok(await bg() === DARK_BG, "[zh] 系统深色 → 深色背景");
  ok(await evaluate("document.querySelector('.theme-toggle').getAttribute('aria-label')") === "切换到浅色主题", "[zh] 深色时按钮标签为『切换到浅色主题』");
  await scheme("light");
  await sleep(120);
  ok(await bg() === LIGHT_BG, "[zh] 系统切到浅色 → 页面实时跟随");
  ok(await evaluate("document.querySelector('.theme-toggle').getAttribute('aria-label')") === "切换到深色主题", "[zh] 系统切换后按钮标签同步");
  await evaluate("document.querySelector('.theme-toggle').click()");
  ok(await evaluate("document.documentElement.dataset.theme") === "dark" && (await bg()) === DARK_BG, "[zh] 点击切换 → 显式深色");
  ok(await evaluate("localStorage.getItem('wowayou.portfolio.theme')") === "dark", "[zh] 显式选择写入 localStorage");
  ok(await evaluate("[...document.querySelectorAll('meta[name=theme-color]')].every((m) => m.content === '#111310')"), "[zh] 显式主题同步 theme-color");
  await reload();
  ok(await evaluate("document.documentElement.dataset.theme") === "dark" && (await bg()) === DARK_BG, "[zh] 刷新后保留显式深色（系统仍为浅色）");
  await evaluate("localStorage.clear()");
  await reload();
  ok(await evaluate("document.documentElement.dataset.theme") === "auto" && (await bg()) === LIGHT_BG, "[zh] 清除偏好后回到 auto");

  /* ---------- zh：静态内容与终端 ---------- */
  ok(await evaluate("(() => { const p = document.querySelector('.welcome .command-echo'); return p.getBoundingClientRect().height < parseFloat(getComputedStyle(p).lineHeight) * 1.5; })()"), "[zh] 欢迎区命令行单行显示（源码缩进不泄漏）");
  ok(await evaluate("(() => { const o = document.querySelector('#terminal-output'); return o.scrollHeight <= o.clientHeight; })()"), "[zh] 开屏欢迎内容不溢出终端");
  ok((await term("help")).includes("whoami          关于我"), "[zh] help 输出中文");
  ok(await evaluate(`${lastEntry}.textContent.includes('Tab 补全')`), "[zh] help 附带快捷键说明");
  await term("projects");
  ok(await evaluate(`${lastEntry}.querySelectorAll('a').length`) === 6, "[zh] projects 列出 6 个项目");
  const openOut = await term("open city-lights");
  ok(openOut.includes("万家灯火") && openOut.includes("打开项目") && openOut.includes("查看源码"), "[zh] open city-lights 显示标题与双链接");
  ok((await term("open nope")).includes("找不到项目：nope"), "[zh] open 未知项目");
  ok((await term("open")).includes("用法：open <项目名>"), "[zh] open 缺参数 → 用法提示");
  ok((await term("whoami extra")).includes("用法：whoami"), "[zh] 多余参数 → 用法提示");
  ok((await term("foo")).includes("找不到命令：foo"), "[zh] 未知命令");
  const escaped = await term("<img src=x onerror=alert(1)>");
  ok(escaped.includes("<img") && (await evaluate("document.querySelectorAll('#terminal-output img').length")) === 0, "[zh] HTML 输入只作为文本");
  ok((await term("theme")).includes("已切换到深色主题。"), "[zh] theme 命令切换并播报");
  await evaluate("localStorage.clear()");
  ok((await term("history")).includes("help"), "[zh] history 列出历史");

  ok(await evaluate("(() => { const i = document.querySelector('#terminal-input'); i.value = 'pro'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })); return i.value; })()") === "projects", "[zh] Tab 唯一匹配补全 pro → projects");
  ok(await evaluate("(() => { const i = document.querySelector('#terminal-input'); i.value = 'open ci'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })); return i.value; })()") === "open city-lights", "[zh] Tab 补全项目名");
  ok(await evaluate("(() => { const i = document.querySelector('#terminal-input'); i.value = 'h'; const e = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }); i.dispatchEvent(e); return !e.defaultPrevented && i.value === 'h'; })()"), "[zh] 歧义前缀不吞 Tab（保留键盘导航）");
  ok(await evaluate("(() => { const i = document.querySelector('#terminal-input'); i.value = 'clear'; document.querySelector('#terminal-form').requestSubmit(); return document.querySelector('#terminal-output').children.length === 0 && document.querySelector('#terminal-status').textContent === '终端已清空。'; })()"), "[zh] clear 清屏并播报");
  await term("help");
  ok(await evaluate("(() => { const i = document.querySelector('#terminal-input'); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', ctrlKey: true, bubbles: true, cancelable: true })); return document.querySelector('#terminal-output').children.length; })()") === 0, "[zh] Ctrl+L 清屏");

  /* ---------- zh：滚动策略 ---------- */
  for (let i = 0; i < 5; i++) await term("projects");
  const kept = await evaluate("(() => { const o = document.querySelector('#terminal-output'); o.scrollTop = 0; const i = document.querySelector('#terminal-input'); i.value = 'whoami'; document.querySelector('#terminal-form').requestSubmit(); return o.scrollTop; })()");
  ok(kept === 0, "[zh] 用户上翻阅读时新输出不抢滚动", `scrollTop=${kept}`);
  const gap = await evaluate("(() => { const o = document.querySelector('#terminal-output'); o.scrollTop = o.scrollHeight; const i = document.querySelector('#terminal-input'); i.value = 'links'; document.querySelector('#terminal-form').requestSubmit(); return o.scrollHeight - o.scrollTop - o.clientHeight; })()");
  ok(gap < 2, "[zh] 位于底部时跟随新输出", `距底 ${gap}px`);

  /* ---------- zh：快捷命令回焦策略 ---------- */
  ok(await evaluate("(() => { document.activeElement.blur(); document.querySelector('[data-command=whoami]').click(); return document.activeElement.id; })()") === "terminal-input", "[zh] 非触屏：快捷命令后回焦输入框");
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await reload();
  ok(await evaluate("matchMedia('(pointer: coarse)').matches"), "触屏模拟生效（pointer: coarse）");
  ok(await evaluate("(() => { document.activeElement.blur(); document.querySelector('[data-command=whoami]').click(); return document.activeElement.id !== 'terminal-input'; })()"), "[zh] 触屏：快捷命令不弹出软键盘");
  await send("Emulation.setTouchEmulationEnabled", { enabled: false });

  /* ---------- zh：筛选与语言切换 ---------- */
  await scheme("light");
  await reload();
  ok(await evaluate("(() => { document.querySelector('[data-filter=play]').click(); return document.querySelectorAll('.project-card:not([hidden])').length; })()") === 1, "[zh] 筛选『好玩的』→ 1 个");
  ok(await evaluate("document.querySelector('#filter-status').textContent") === "显示 1 个项目。", "[zh] 筛选播报");
  ok(await evaluate("document.querySelector('[data-filter=play]').getAttribute('aria-pressed')") === "true", "[zh] aria-pressed 同步");
  ok(await evaluate("(() => { document.querySelector('[data-filter=tool]').click(); return document.querySelectorAll('.project-card:not([hidden])').length; })()") === 3, "[zh] 筛选『日常工具』→ 3 个（与按钮计数一致）");
  ok(await evaluate("(() => { document.querySelector('[data-filter=all]').click(); return document.querySelectorAll('.project-card:not([hidden])').length; })()") === 6, "[zh] 恢复全部 → 6 个");
  ok(await evaluate("document.querySelector('a[hreflang=en]').href") === `${BASE}/en/`, "[zh] 语言切换链接指向 /en/");

  /* ---------- en ---------- */
  await fresh("/en/");
  ok(await evaluate("document.documentElement.lang") === "en", "[en] html lang=en");
  ok(await evaluate("(() => { const p = document.querySelector('.welcome .command-echo'); return p.getBoundingClientRect().height < parseFloat(getComputedStyle(p).lineHeight) * 1.5; })()"), "[en] 欢迎区命令行单行显示");
  ok(await evaluate("document.querySelector('.theme-toggle').getAttribute('aria-label')") === "Switch to dark theme", "[en] 主题按钮英文标签（浅色系统）");
  ok((await term("help")).includes("whoami          About me"), "[en] help 英文");
  const enOpen = await term("open time-logger");
  ok(enOpen.includes("Eigentime") && enOpen.includes("Open project") && enOpen.includes("View source"), "[en] open 使用英文卡片数据与文案");
  ok((await term("foo")).includes("Unknown command: foo"), "[en] 未知命令英文");
  ok((await term("open")).includes("Usage: open <project>"), "[en] 用法提示英文");
  ok((await term("theme")).includes("Switched to the dark theme."), "[en] theme 播报英文");
  ok(await evaluate("(() => { document.querySelector('[data-filter=tool]').click(); return document.querySelector('#filter-status').textContent; })()") === "Showing 3 projects.", "[en] 筛选播报复数");
  ok(await evaluate("(() => { document.querySelector('[data-filter=play]').click(); return document.querySelector('#filter-status').textContent; })()") === "Showing 1 project.", "[en] 筛选播报单数");
  ok(await evaluate("document.querySelector('a[hreflang=zh-CN]').href") === `${BASE}/`, "[en] 语言切换链接指向中文版");
  ok(await evaluate("[...document.querySelectorAll('link[rel=stylesheet],script[src],link[rel=icon]')].every((e) => (e.href || e.src).startsWith(location.origin + '/') && !(e.href || e.src).includes('/en/'))"), "[en] 共享资源从根目录加载");
  await evaluate("localStorage.clear()");

  /* ---------- 布局：溢出与触控目标 ---------- */
  for (const path of ["/", "/en/"]) {
    const overflow = [];
    for (const width of [320, 390, 568, 768, 1024, 1440]) {
      await viewport(width, 800, width < 700);
      await load(path);
      const scrollWidth = await evaluate("document.documentElement.scrollWidth");
      if (scrollWidth > width) overflow.push(`${width}px→${scrollWidth}`);
    }
    ok(overflow.length === 0, `[${path}] 320–1440px 无水平溢出`, overflow.join(", "));
    await viewport(390, 844, true);
    await load(path);
    const minTarget = await evaluate("Math.min(...[...document.querySelectorAll('.site-header nav a, .theme-toggle, .project-filters button, .terminal-sidebar button')].filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect().height))");
    ok(minTarget >= 40, `[${path}] 移动端触控目标 ≥ 40px`, `最小 ${minTarget.toFixed(1)}px`);
  }

  /* ---------- 偏好：减少动态效果与打印 ---------- */
  await viewport(1440, 900);
  await load("/");
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  ok(await evaluate("getComputedStyle(document.querySelector('.project-card')).transitionDuration.split(',').every((d) => parseFloat(d) === 0)"), "减少动态效果：关闭过渡");
  await send("Emulation.setEmulatedMedia", { media: "print" });
  ok(await evaluate("getComputedStyle(document.querySelector('.terminal')).display") === "none", "打印：隐藏终端等交互区");
  await send("Emulation.setEmulatedMedia", { media: "" });

  /* ---------- 拒绝 localStorage ---------- */
  const { identifier } = await send("Page.addScriptToEvaluateOnNewDocument", { source: "Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } });" });
  const exceptionsBeforeDenied = exceptions.length;
  await reload();
  ok(await evaluate("document.documentElement.classList.contains('js') && document.documentElement.dataset.theme === 'auto'"), "拒绝 localStorage：仍初始化并跟随系统");
  ok(await evaluate("(() => { document.querySelector('.theme-toggle').click(); return document.documentElement.dataset.theme; })()") === "dark", "拒绝 localStorage：当前页仍可切换主题");
  ok(exceptions.slice(exceptionsBeforeDenied).length === 0, "拒绝 localStorage：无未捕获异常", exceptions.slice(exceptionsBeforeDenied).join(" | "));
  await send("Page.removeScriptToEvaluateOnNewDocument", { identifier });

  /* ---------- 禁用 JavaScript ---------- */
  await send("Emulation.setScriptExecutionDisabled", { value: true });
  await viewport(320, 800, true);
  await load("/en/");
  ok((await evaluate("document.querySelectorAll('.project-card').length")) === 6 && (await evaluate("getComputedStyle(document.querySelector('.terminal')).display")) === "none", "无 JS：6 个项目可读，终端隐藏");
  ok((await bg()) === LIGHT_BG, "无 JS：主题仍跟随系统（浅色）");
  await send("Emulation.setScriptExecutionDisabled", { value: false });

  /* ---------- 可选截图 ---------- */
  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true });
    for (const [name, path, width, mobile, mode] of [
      ["zh-desktop-dark", "/", 1440, false, "dark"],
      ["zh-desktop-light", "/", 1440, false, "light"],
      ["en-mobile-light", "/en/", 390, true, "light"],
      ["zh-mobile-dark", "/", 390, true, "dark"],
    ]) {
      await viewport(width, 900, mobile);
      await scheme(mode);
      await fresh(path);
      const height = Math.min(await evaluate("document.documentElement.scrollHeight"), 4200);
      await viewport(width, height, mobile);
      await sleep(150);
      const { data } = await send("Page.captureScreenshot", { format: "png" });
      writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(data, "base64"));
    }
    console.log(`\n截图已写入 ${SHOTS}`);
  } else {
    console.log("\n（未截图；设置 SMOKE_SHOTS=<目录> 可生成桌面/手机的明暗截图）");
  }

  /* ---------- 网络与控制台 ---------- */
  ok(external.length === 0, "无自动第三方请求", external.slice(0, 3).join(", "));
  ok(failedRequests.length === 0, "无资源加载失败", failedRequests.slice(0, 3).join(", "));
  ok(consoleErrors.length === 0 && exceptions.length === 0, "无控制台错误或未捕获异常", [...consoleErrors, ...exceptions].slice(0, 3).join(" | "));
} catch (error) {
  fail += 1;
  failed.push(error.message);
  console.error(`✗ 中断：${error.message}`);
} finally {
  clearTimeout(watchdog);
  console.log(`\n通过 ${pass}，失败 ${fail}`);
  if (failed.length) {
    console.log("失败项：");
    failed.forEach((label) => console.log(`  - ${label}`));
  }
  cleanup();
  // 浏览器未启动属于环境问题，单独用退出码 2 表示。
  const environmentFailure = failed.some((label) => label.startsWith("环境不满足"));
  process.exitCode = fail === 0 ? 0 : environmentFailure ? 2 : 1;
}
