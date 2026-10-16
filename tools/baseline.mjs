#!/usr/bin/env node
/**
 * baseline.mjs — 作品集静态站点的基准检查（零依赖，Node >= 18）。
 *
 * 用途：把 DESIGN.md 里的硬性规则变成可重复执行的验收门禁。
 * 运行：node tools/baseline.mjs
 *
 * 检查项：
 *   1. 必需文件存在；app.js 与两个工具的语法（node --check）。
 *   2. 每个语言页面的 head 基线：lang、title、description、CSP、双 theme-color、
 *      canonical、hreflang（zh-CN / en / x-default）。
 *   3. 本地资源（src/href 相对路径）存在；页内锚点有对应 id。
 *   4. 项目卡片：slug 唯一；筛选按钮计数与卡片实际分类一致；两个语言版本的
 *      slug 与分类完全对等；终端快捷命令属于 app.js 命令集。
 *   5. styles.css：light 主题 token 与 auto（系统浅色）token 完全一致；最小字号 ≥ 8px。
 *   6. WCAG 对比度：正文类文本配对 >= 4.5:1（dim/raised 无实际使用，仅报告）。
 *   7. 无自动加载的第三方资源（script/img/link[rel=stylesheet|icon]、CSS url()）。
 *   8. 体积预算：单语言首屏 html+css+js+icon 总量 <= 160 KB（未压缩）。
 *
 * 退出码：0 全部通过；1 存在失败项。
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const docsDir = join(root, "docs");
const PAGES = [
  { locale: "zh-CN", file: join(docsDir, "index.html"), canon: "https://wowayou.github.io/wowayou/" },
  { locale: "en", file: join(docsDir, "en", "index.html"), canon: "https://wowayou.github.io/wowayou/en/" },
];
const SIZE_BUDGET = 160 * 1024;

let failures = 0;
const ok = (cond, label, detail = "") => {
  console.log(`${cond ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures += 1;
};
const note = (text) => console.log(`  · ${text}`);

/* ---------- 1. files & syntax ---------- */
const required = [
  "docs/index.html",
  "docs/en/index.html",
  "docs/styles.css",
  "docs/app.js",
  "docs/icon.svg",
  "docs/.nojekyll",
];
for (const rel of required) ok(existsSync(join(root, rel)), `文件存在 ${rel}`);
for (const rel of ["docs/app.js", "tools/baseline.mjs", "tools/smoke.mjs"]) {
  try {
    execFileSync(process.execPath, ["--check", join(root, rel)]);
    ok(true, `语法检查 ${rel}`);
  } catch {
    ok(false, `语法检查 ${rel}`);
  }
}

const css = readFileSync(join(docsDir, "styles.css"), "utf8");

/* ---------- helpers ---------- */
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : null;
};
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/* ---------- 2-4. per-page checks ---------- */
const pageData = [];
for (const page of PAGES) {
  const html = readFileSync(page.file, "utf8");
  const label = `[${page.locale}]`;

  const htmlTag = html.match(/<html[^>]*>/)?.[0] ?? "";
  ok(attr(htmlTag, "lang") === page.locale, `${label} html lang=${page.locale}`);
  ok(attr(htmlTag, "data-theme") === "auto", `${label} 主题默认 auto（跟随系统）`);
  ok(/<title>[^<]+<\/title>/.test(html), `${label} 有 title`);
  ok(/name="description"/.test(html), `${label} 有 meta description`);
  ok(/http-equiv="Content-Security-Policy"/.test(html), `${label} 有 CSP meta`);
  ok(
    (html.match(/name="theme-color"/g) ?? []).length === 2,
    `${label} 双 theme-color（明暗 media）`,
  );
  ok(html.includes(`rel="canonical" href="${page.canon}"`), `${label} canonical 正确`);
  for (const hl of ["zh-CN", "en", "x-default"]) {
    ok(html.includes(`hreflang="${hl}"`), `${label} hreflang ${hl}`);
  }

  // local resources
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  let refFail = 0;
  for (const m of html.matchAll(/\s(?:src|href)="([^"]+)"/g)) {
    const ref = m[1];
    if (/^(https?:|mailto:|tel:)/.test(ref)) continue;
    if (ref.startsWith("#")) {
      if (!ids.has(ref.slice(1))) {
        note(`${label} 锚点无目标: ${ref}`);
        refFail += 1;
      }
      continue;
    }
    const path = resolve(dirname(page.file), ref.split(/[#?]/)[0]);
    if (!existsSync(path)) {
      note(`${label} 本地资源缺失: ${ref}`);
      refFail += 1;
    }
  }
  ok(refFail === 0, `${label} 本地资源与锚点`);

  // project cards
  const cards = [...html.matchAll(/<article\b[^>]*>/g)].map((m) => ({
    slug: attr(m[0], "data-slug"),
    category: attr(m[0], "data-category"),
  }));
  const slugs = cards.map((c) => c.slug);
  ok(new Set(slugs).size === slugs.length, `${label} 项目 slug 唯一`);

  // filter buttons and counts
  const filters = [...html.matchAll(/<button\b[^>]*data-filter="([^"]+)"[^>]*>([\s\S]*?)<\/button\s*>/g)]
    .map((m) => ({ filter: m[1], count: m[2].match(/<span>(\d+)<\/span>/)?.[1] ?? null }));
  let filterFail = 0;
  for (const f of filters) {
    const expected =
      f.filter === "all"
        ? cards.length
        : cards.filter((c) => c.category === f.filter).length;
    if (Number(f.count) !== expected) {
      note(`${label} 筛选 "${f.filter}" 计数 ${f.count} ≠ 实际 ${expected}`);
      filterFail += 1;
    }
  }
  ok(filterFail === 0 && filters.length === 4, `${label} 筛选计数与实际一致`);

  const quick = [...html.matchAll(/data-command="([^"]+)"/g)].map((m) => m[1]);
  pageData.push({ locale: page.locale, slugs, categories: cards.map((c) => c.category), quick, html });
}

/* locale parity */
const [zh, en] = pageData;
ok(
  JSON.stringify(zh.slugs) === JSON.stringify(en.slugs) &&
    JSON.stringify(zh.categories) === JSON.stringify(en.categories),
  "双语项目 slug / 分类对等",
  zh.slugs.join(","),
);
ok(
  JSON.stringify([...zh.quick].sort()) === JSON.stringify([...en.quick].sort()),
  "双语快捷命令对等",
);
const jsSource = readFileSync(join(docsDir, "app.js"), "utf8");
const commandSet = new Set(
  [...jsSource.matchAll(/^\s{4}"([a-z]+)",$/gm)].map((m) => m[1]),
);
ok(
  zh.quick.every((c) => commandSet.has(c)),
  "快捷命令均在 app.js 命令集内",
  [...commandSet].join(","),
);
ok(
  /zh:\s*\{/.test(jsSource) && /en:\s*\{/.test(jsSource),
  "app.js 含 zh / en 双语言字典",
);

/* ---------- 5. theme token parity ---------- */
const tokenMap = (block) =>
  Object.fromEntries(
    [...block.matchAll(/--([a-z-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
  );
const darkTokens = tokenMap(css.match(/^:root\s*\{([^}]+)\}/m)?.[1] ?? "");
const lightTokens = tokenMap(css.match(/:root\[data-theme="light"\]\s*\{([^}]+)\}/)?.[1] ?? "");
const autoTokens = tokenMap(
  css.match(/@media \(prefers-color-scheme: light\)\s*\{\s*:root\[data-theme="auto"\]\s*\{([^}]+)\}\s*\}/)?.[1] ?? "",
);
ok(
  JSON.stringify(lightTokens) === JSON.stringify(autoTokens),
  "light 与 auto（系统浅色）token 一致",
);

/* ---------- 5b. minimum font size ---------- */
const tinyFonts = [...css.matchAll(/font(?:-size)?:\s*(?:\d{3}\s+)?(\d+(?:\.\d+)?)px/g)]
  .map((m) => Number(m[1]))
  .filter((px) => px < 8);
ok(tinyFonts.length === 0, "最小字号 ≥ 8px", tinyFonts.length ? `发现 ${tinyFonts.join(",")}px` : "");

/* ---------- 6. contrast ---------- */
// dim/raised 与 border/* 没有真实使用场景（tag 文字是 muted on raised，卡片编号是
// dim on surface，边框为装饰性），只做报告不进门禁；其余文本配对按 WCAG AA 4.5:1。
const TEXT_PAIRS = [
  ["text", "bg"], ["muted", "bg"], ["dim", "bg"], ["accent", "bg"], ["green", "bg"],
  ["text", "surface"], ["muted", "surface"], ["dim", "surface"],
  ["green", "terminal"], ["muted", "terminal"], ["dim", "terminal"],
  ["muted", "raised"], ["bg", "accent"],
];
const REPORT_ONLY = [["dim", "raised"]];
for (const [name, tokens] of [["dark", darkTokens], ["light", lightTokens]]) {
  const missing = [...new Set(TEXT_PAIRS.flat())].filter((k) => !tokens[k]);
  ok(missing.length === 0, `${name} 主题 token 齐全`, missing.join(",") || "全部定义");
  let worst = Infinity;
  let worstPair = "";
  let fail = 0;
  for (const [a, b] of TEXT_PAIRS) {
    if (!tokens[a] || !tokens[b]) continue;
    const r = contrast(tokens[a], tokens[b]);
    if (r < worst) [worst, worstPair] = [r, `${a}/${b}`];
    if (r < 4.5) {
      note(`${name} ${a}/${b} = ${r.toFixed(2)} < 4.5`);
      fail += 1;
    }
  }
  ok(
    fail === 0,
    `${name} 主题文本对比度全部 ≥ 4.5:1`,
    `最低 ${worstPair} ${worst === Infinity ? "-" : worst.toFixed(2)}`,
  );
}
note("dim/raised 与 border/* 为装饰性或无实际使用，仅报告不门禁（见 DESIGN.md）。");
for (const [a, b] of REPORT_ONLY) {
  for (const [name, tokens] of [["dark", darkTokens], ["light", lightTokens]]) {
    note(`${name} ${a}/${b} = ${contrast(tokens[a], tokens[b]).toFixed(2)}（报告项）`);
  }
}

/* ---------- 7. no auto-loaded third-party resources ---------- */
let extFail = 0;
for (const { locale, html } of pageData) {
  for (const m of html.matchAll(/<(script|img|link)\b[^>]*>/g)) {
    const tag = m[0];
    const ref = attr(tag, "src") ?? attr(tag, "href") ?? "";
    if (!/^https?:/.test(ref)) continue;
    if (tag.startsWith("<link") && !/rel="(stylesheet|icon)"/.test(tag)) continue;
    note(`[${locale}] 第三方自动加载: ${tag.slice(0, 80)}`);
    extFail += 1;
  }
}
if (/url\(\s*['"]?https?:/i.test(css)) {
  note("styles.css 含外部 url()");
  extFail += 1;
}
ok(extFail === 0, "无自动加载的第三方资源");

/* ---------- 8. size budget ---------- */
for (const page of PAGES) {
  const total =
    statSync(page.file).size +
    ["styles.css", "app.js", "icon.svg"].reduce((s, f) => s + statSync(join(docsDir, f)).size, 0);
  ok(
    total <= SIZE_BUDGET,
    `[${page.locale}] 首屏体积 ${(total / 1024).toFixed(1)} KB ≤ ${SIZE_BUDGET / 1024} KB（未压缩）`,
  );
}

/* ---------- summary ---------- */
console.log("");
if (failures) {
  console.error(`基准检查失败：${failures} 项未通过。`);
  process.exit(1);
}
console.log("基准检查全部通过。");
