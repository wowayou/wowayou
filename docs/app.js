"use strict";

(() => {
  const root = document.documentElement;
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

  function setTheme(theme) {
    root.dataset.theme = theme;
    themeButton.setAttribute(
      "aria-label",
      `切换到${theme === "dark" ? "浅" : "深"}色主题`,
    );
    document.querySelector('meta[name="theme-color"]').content =
      theme === "dark" ? "#111310" : "#f5f4ed";
    try {
      localStorage.setItem("wowayou.portfolio.theme", theme);
    } catch {
      /* Theme still works for this visit. */
    }
  }

  try {
    const saved = localStorage.getItem("wowayou.portfolio.theme");
    if (saved === "light" || saved === "dark") setTheme(saved);
  } catch {
    /* Storage is optional; default to the authored dark theme. */
  }

  const toggleTheme = () =>
    setTheme(root.dataset.theme === "dark" ? "light" : "dark");
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
    const usage = (text) => line(entry, `用法：${text}`, "terminal-muted");

    switch (command) {
      case "help":
        if (args.length) {
          usage("help");
          break;
        }
        line(
          entry,
          "whoami          关于我\nprojects        列出精选作品\nlinks           博客、GitHub 与邮箱\nopen <项目名>   显示项目入口，例如 open time-logger\ntheme           切换深色 / 浅色\nclear           清空终端\nhistory         查看本次访问的命令历史",
        );
        line(
          entry,
          "Tab 补全命令或项目名；↑ ↓ 翻历史；Ctrl / ⌘ + L 清屏。\n这是网页里的模拟终端，只支持上面的命令。",
          "terminal-muted",
        );
        break;
      case "whoami":
        if (args.length) {
          usage("whoami");
          break;
        }
        line(
          entry,
          "CG / wowayou\nB2B SEO、英文网站交付与 AI Agent 工作流。\n构建本地优先的 Web 工具，把重复的工作变成可以复用的流程。",
        );
        link(entry, "文章与项目笔记 · eigentime.org", "https://eigentime.org");
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
        link(entry, "博客 · eigentime.org", "https://eigentime.org");
        link(entry, "GitHub · wowayou", "https://github.com/wowayou");
        link(
          entry,
          "邮箱 · contact@eigentime.org",
          "mailto:contact@eigentime.org",
        );
        break;
      case "open": {
        if (args.length !== 1) {
          usage("open <项目名>，如 open city-lights；projects 可查看项目名");
          break;
        }
        const project = projects.find((item) => item.slug === args[0]);
        if (!project) {
          line(
            entry,
            `找不到项目：${args[0]}。输入 projects 查看目录。`,
            "terminal-muted",
          );
          break;
        }
        line(entry, `${project.title} — ${project.summary}`);
        link(entry, "打开项目", project.url);
        link(entry, "查看源码", project.source);
        break;
      }
      case "theme":
        if (args.length) {
          usage("theme");
          break;
        }
        toggleTheme();
        line(
          entry,
          `已切换到${root.dataset.theme === "dark" ? "深" : "浅"}色主题。`,
        );
        break;
      case "clear":
        if (args.length) {
          usage("clear");
          break;
        }
        output.replaceChildren();
        status.textContent = "终端已清空。";
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
        line(
          entry,
          `找不到命令：${command}。输入 help 查看支持的命令。`,
          "terminal-muted",
        );
    }
    output.append(entry);
    while (output.children.length > 30) output.firstElementChild.remove();
    output.scrollTop = output.scrollHeight;
    status.textContent = entry.textContent;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    run(input.value);
  });
  document.querySelectorAll("[data-command]").forEach((button) => {
    button.addEventListener("click", () => {
      run(button.dataset.command);
      input.focus({ preventScroll: true });
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
      document.querySelector("#filter-status").textContent =
        `显示 ${cards.filter((card) => !card.hidden).length} 个项目。`;
    });
  });

  // Enhance only after initialization succeeds. Static content remains available without JavaScript.
  root.classList.add("js");
})();
