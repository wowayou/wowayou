"use strict";

(() => {
  // UI strings live here, keyed by locale; project content is read from the
  // localized project cards in each page, so there is no second data copy.
  const STRINGS = {
    zh: {
      usage: (text) => `用法：${text}`,
      help: "whoami          关于我\nprojects        列出精选作品\nlinks           博客、GitHub 与邮箱\nopen <项目名>   显示项目入口，例如 open city-lights\ntheme           切换深色 / 浅色\nclear           清空终端\nhistory         查看本次访问的命令历史",
      helpMeta:
        "Tab 补全命令或项目名；↑ ↓ 翻历史；Ctrl / ⌘ + L 清屏。\n这是网页里的模拟终端，只支持上面的命令。",
      whoami:
        "CG / wowayou\nB2B SEO、英文网站交付与 AI Agent 工作流。\n构建本地优先的 Web 工具，把重复的工作变成可以复用的流程。",
      whoamiLink: "文章与项目笔记 · eigentime.org",
      linksList: [
        ["博客 · eigentime.org", "https://eigentime.org"],
        ["GitHub · wowayou", "https://github.com/wowayou"],
        ["邮箱 · contact@eigentime.org", "mailto:contact@eigentime.org"],
      ],
      openUsage: "open <项目名>，如 open city-lights；projects 可查看项目名",
      openProject: "打开项目",
      viewSource: "查看源码",
      projectNotFound: (name) =>
        `找不到项目：${name}。输入 projects 查看目录。`,
      themeSwitched: (theme) => `已切换到${theme === "dark" ? "深" : "浅"}色主题。`,
      themeLabel: (theme) => `切换到${theme === "dark" ? "浅" : "深"}色主题`,
      cleared: "终端已清空。",
      unknown: (command) =>
        `找不到命令：${command}。输入 help 查看支持的命令。`,
      filterStatus: (count) => `显示 ${count} 个项目。`,
    },
    en: {
      usage: (text) => `Usage: ${text}`,
      help: "whoami          About me\nprojects        List selected projects\nlinks           Blog, GitHub and email\nopen <project>  Show project links, e.g. open city-lights\ntheme           Toggle dark / light\nclear           Clear the terminal\nhistory         Command history for this visit",
      helpMeta:
        "Tab completes commands and project names; ↑ ↓ browses history; Ctrl / ⌘ + L clears.\nThis is a simulated web terminal — only the commands above exist.",
      whoami:
        "CG / wowayou\nB2B SEO, web delivery and AI agent workflows.\nBuilding local-first web tools that turn repetitive work into reusable flows.",
      whoamiLink: "Notes and project write-ups · eigentime.org",
      linksList: [
        ["Blog · eigentime.org", "https://eigentime.org"],
        ["GitHub · wowayou", "https://github.com/wowayou"],
        ["Email · contact@eigentime.org", "mailto:contact@eigentime.org"],
      ],
      openUsage:
        "open <project>, e.g. open city-lights; run projects to list names",
      openProject: "Open project",
      viewSource: "View source",
      projectNotFound: (name) =>
        `Project not found: ${name}. Run projects to see the list.`,
      themeSwitched: (theme) => `Switched to the ${theme} theme.`,
      themeLabel: (theme) =>
        `Switch to ${theme === "dark" ? "light" : "dark"} theme`,
      cleared: "Terminal cleared.",
      unknown: (command) =>
        `Unknown command: ${command}. Type help for supported commands.`,
      filterStatus: (count) =>
        `Showing ${count} project${count === 1 ? "" : "s"}.`,
    },
  };

  const root = document.documentElement;
  const locale = root.lang.toLowerCase().startsWith("zh") ? "zh" : "en";
  const T = STRINGS[locale];
  const output = document.querySelector("#terminal-output");
  const input = document.querySelector("#terminal-input");
  const form = document.querySelector("#terminal-form");
  const status = document.querySelector("#terminal-status");
  const themeButton = document.querySelector(".theme-toggle");
  const cards = [...document.querySelectorAll(".project-card")];
  // Cards are the content source for both the static page and the terminal.
  const projects = cards.map((card) => ({
    slug: card.dataset.slug,
    title: card.dataset.title,
    summary: card.dataset.summary,
    url: card.querySelector("[data-live]").href,
    source: card.querySelector("[data-source]").href,
  }));
  const commands = [
    "help",
    "whoami",
    "projects",
    "links",
    "open",
    "theme",
    "clear",
    "history",
  ];
  const history = [];
  let historyIndex = 0;
  let draft = "";

  // Theme: data-theme="auto" in the markup follows the system via CSS alone
  // (no flash, works without JS). An explicit choice overrides and persists.
  const THEME_KEY = "wowayou.portfolio.theme";
  const THEME_COLORS = { dark: "#111310", light: "#f5f4ed" };
  const themeMetas = [...document.querySelectorAll('meta[name="theme-color"]')];
  const systemDark = matchMedia("(prefers-color-scheme: dark)");
  const coarsePointer = matchMedia("(pointer: coarse)");

  const effectiveTheme = () =>
    root.dataset.theme === "auto"
      ? systemDark.matches
        ? "dark"
        : "light"
      : root.dataset.theme;

  function paintThemeButton() {
    themeButton.setAttribute("aria-label", T.themeLabel(effectiveTheme()));
  }

  function setTheme(theme) {
    root.dataset.theme = theme;
    themeMetas.forEach((meta) => {
      meta.content = THEME_COLORS[theme];
    });
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* Theme still works for this visit. */
    }
    paintThemeButton();
  }

  function setAutoTheme() {
    root.dataset.theme = "auto";
    // In auto mode the media attributes on the meta tags do the work;
    // rewriting content here only covers browsers that ignore them.
    themeMetas.forEach((meta) => {
      meta.content = meta.media.includes("light")
        ? THEME_COLORS.light
        : THEME_COLORS.dark;
    });
    paintThemeButton();
  }

  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") setTheme(saved);
    else setAutoTheme();
  } catch {
    /* Storage is optional; the system preference still applies. */
    setAutoTheme();
  }
  systemDark.addEventListener("change", () => {
    if (root.dataset.theme === "auto") paintThemeButton();
  });

  const toggleTheme = () =>
    setTheme(effectiveTheme() === "dark" ? "light" : "dark");
  themeButton.addEventListener("click", toggleTheme);

  function line(parent, text, className) {
    const p = document.createElement("p");
    p.textContent = text;
    if (className) p.className = className;
    parent.append(p);
    return p;
  }

  function link(parent, label, url) {
    const p = document.createElement("p");
    const a = document.createElement("a");
    a.textContent = `${label} ↗`;
    a.href = url;
    p.append(a);
    parent.append(p);
  }

  function run(raw) {
    const commandLine = raw.trim();
    if (!commandLine) return;
    history.push(commandLine);
    if (history.length > 60) history.shift();
    historyIndex = history.length;
    draft = "";
    input.value = "";
    const [command, ...args] = commandLine.split(/\s+/);
    const entry = document.createElement("div");
    entry.className = "terminal-entry";
    line(entry, `visitor@wowayou ~ $ ${commandLine}`, "command-echo");
    const usage = (text) => line(entry, T.usage(text), "terminal-muted");

    switch (command) {
      case "help":
        if (args.length) {
          usage("help");
          break;
        }
        line(entry, T.help);
        line(entry, T.helpMeta, "terminal-muted");
        break;
      case "whoami":
        if (args.length) {
          usage("whoami");
          break;
        }
        line(entry, T.whoami);
        link(entry, T.whoamiLink, "https://eigentime.org");
        break;
      case "projects":
        if (args.length) {
          usage("projects");
          break;
        }
        projects.forEach((project) => {
          link(entry, `${project.slug} · ${project.title}`, project.url);
          line(entry, project.summary, "terminal-muted");
        });
        break;
      case "links":
        if (args.length) {
          usage("links");
          break;
        }
        T.linksList.forEach(([label, url]) => link(entry, label, url));
        break;
      case "open": {
        if (args.length !== 1) {
          usage(T.openUsage);
          break;
        }
        const project = projects.find((item) => item.slug === args[0]);
        if (!project) {
          line(entry, T.projectNotFound(args[0]), "terminal-muted");
          break;
        }
        line(entry, `${project.title} — ${project.summary}`);
        link(entry, T.openProject, project.url);
        link(entry, T.viewSource, project.source);
        break;
      }
      case "theme":
        if (args.length) {
          usage("theme");
          break;
        }
        toggleTheme();
        line(entry, T.themeSwitched(effectiveTheme()));
        break;
      case "clear":
        if (args.length) {
          usage("clear");
          break;
        }
        output.replaceChildren();
        status.textContent = T.cleared;
        return;
      case "history":
        if (args.length) {
          usage("history");
          break;
        }
        line(
          entry,
          history
            .map(
              (item, index) => `${String(index + 1).padStart(2, " ")}  ${item}`,
            )
            .join("\n"),
        );
        break;
      default:
        line(entry, T.unknown(command), "terminal-muted");
    }
    // Follow new output only when the visitor is already near the bottom, so
    // reading earlier output is never interrupted.
    const nearBottom =
      output.scrollHeight - output.scrollTop - output.clientHeight < 80;
    output.append(entry);
    while (output.children.length > 30) output.firstElementChild.remove();
    if (nearBottom) output.scrollTop = output.scrollHeight;
    status.textContent = entry.textContent;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    run(input.value);
  });
  document.querySelectorAll("[data-command]").forEach((button) => {
    button.addEventListener("click", () => {
      run(button.dataset.command);
      // Refocus the input unless the primary pointer is touch: there it would
      // pop the on-screen keyboard over the output. Mouse and keyboard-only
      // (pointer: none) setups keep typing flow.
      if (!coarsePointer.matches) input.focus({ preventScroll: true });
    });
  });

  input.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "l") {
      event.preventDefault();
      run("clear");
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (historyIndex === history.length) draft = input.value;
      historyIndex = Math.max(0, historyIndex - 1);
      input.value = history[historyIndex] ?? draft;
      input.setSelectionRange(input.value.length, input.value.length);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      historyIndex = Math.min(history.length, historyIndex + 1);
      input.value = history[historyIndex] ?? draft;
      input.setSelectionRange(input.value.length, input.value.length);
    } else if (
      event.key === "Tab" &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      const value = input.value.trimStart();
      const isOpen = value.startsWith("open ");
      const prefix = isOpen ? value.slice(5) : value;
      const candidates = isOpen
        ? projects.map((project) => project.slug)
        : commands;
      const matches = candidates.filter((item) => item.startsWith(prefix));
      // Only consume Tab when it completes an unambiguous value; otherwise keep normal keyboard navigation.
      if (matches.length === 1 && matches[0] !== prefix) {
        event.preventDefault();
        input.value = `${isOpen ? "open " : ""}${matches[0]}${!isOpen && matches[0] === "open" ? " " : ""}`;
      }
    }
  });

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const category = button.dataset.filter;
      document
        .querySelectorAll("[data-filter]")
        .forEach((item) =>
          item.setAttribute("aria-pressed", String(item === button)),
        );
      cards.forEach((card) => {
        card.hidden = category !== "all" && card.dataset.category !== category;
      });
      document.querySelector("#filter-status").textContent = T.filterStatus(
        cards.filter((card) => !card.hidden).length,
      );
    });
  });

  // Enhance only after initialization succeeds. Static content remains available without JavaScript.
  root.classList.add("js");
})();
