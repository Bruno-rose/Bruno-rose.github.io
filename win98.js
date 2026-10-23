// Shared Win98 desktop: icons, Start menu, taskbar, Run dialog and window
// manager. Pages only declare their .window sections inside <main class="desktop">.
(() => {
  const ROOT = new URL(".", document.currentScript.src).href;
  const APPS = [
    { label: "bruno.txt", icon: "note", open: "notepad" },
    { label: "cv.txt", icon: "note", open: "cv" },
    { label: "Blog", icon: "web", href: ROOT + "blog/index.html" },
    { label: "Request resume", icon: "disk", open: "resume" },
    { label: "Contact", icon: "mail", open: "contact" },
    { label: "Recycle Bin", icon: "bin", open: "recycle" },
  ];
  const QUICK = ["Blog", "Contact"];
  const LINKS = {
    linkedin: "https://www.linkedin.com/in/bruno-rodriguez-sepulveda",
    github: "https://github.com/bruno-rose",
    mail: "mailto:contact@brunorodriguez.dev",
    email: "mailto:contact@brunorodriguez.dev",
  };
  const DIRS = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

  const appAttrs = (a) =>
    a.open ? `data-open="${a.open}"` : `data-href="${a.href}"`;
  const ico = (name, size = 16) =>
    `<svg width="${size}" height="${size}" aria-hidden="true"><use href="#ico-${name}" /></svg>`;
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  const load = (k) => {
    try {
      return JSON.parse(localStorage.getItem(k));
    } catch {
      return null;
    }
  };
  const store = (k, v) => {
    try {
      if (v == null) localStorage.removeItem(k);
      else localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  };
  const emit = (type, id) =>
    document.dispatchEvent(new CustomEvent(type, { detail: { id } }));

  const phone = matchMedia("(max-width: 600px)");
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  const touch = matchMedia("(pointer: coarse)").matches;
  const desktop = document.querySelector(".desktop");

  document.body.insertAdjacentHTML(
    "afterbegin",
    `<svg width="0" height="0" style="position: absolute" aria-hidden="true">
    <symbol id="ico-note" viewBox="0 0 32 32">
      <path d="M6 2h15l5 5v23H6z" fill="#fff" stroke="#000" />
      <path d="M21 2v5h5" fill="silver" stroke="#000" />
      <path d="M9 12h14M9 16h14M9 20h14M9 24h9" stroke="#000080" />
    </symbol>
    <symbol id="ico-mail" viewBox="0 0 32 32">
      <rect x="3" y="8" width="26" height="17" fill="#fff" stroke="#000" />
      <path d="M3 8l13 10 13-10" fill="none" stroke="#000" />
    </symbol>
    <symbol id="ico-bin" viewBox="0 0 32 32">
      <path d="M7 9h18l-2 20H9z" fill="#dfdfdf" stroke="#000" />
      <path d="M12 12l1 14M16 12v14M20 12l-1 14" stroke="grey" />
      <path d="M5 6h22v3H5zM13 3h6v3h-6z" fill="silver" stroke="#000" />
    </symbol>
    <symbol id="ico-web" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="12" fill="#3a8be0" stroke="#000080" />
      <path d="M4 16h24M6 10h20M6 22h20M16 4c-6 6-6 18 0 24M16 4c6 6 6 18 0 24" fill="none" stroke="#cfe6ff" />
    </symbol>
    <symbol id="ico-disk" viewBox="0 0 32 32">
      <path d="M4 4h21l3 3v21H4z" fill="#000080" stroke="#000" />
      <path d="M9 4h13v9H9z" fill="silver" />
      <path d="M18 5h3v7h-3z" fill="#000080" />
      <path d="M8 17h16v11H8z" fill="#fff" />
    </symbol>
    <symbol id="ico-run" viewBox="0 0 32 32">
      <rect x="3" y="6" width="24" height="20" fill="#fff" stroke="#000" />
      <path d="M3.5 6.5h23v4h-23z" fill="#000080" />
      <path d="M10 23l11-10M14 13h7v7" fill="none" stroke="#000" stroke-width="2" />
    </symbol>
    <symbol id="ico-shut" viewBox="0 0 32 32">
      <rect x="4" y="4" width="24" height="18" fill="silver" stroke="#000" />
      <rect x="7" y="7" width="18" height="12" fill="#008080" />
      <path d="M10 25h12v4H10z" fill="silver" stroke="#000" />
    </symbol>
    <symbol id="ico-win" viewBox="0 0 16 16">
      <rect x="1" y="1" width="6" height="6" fill="#f03a17" />
      <rect x="9" y="1" width="6" height="6" fill="#7fba00" />
      <rect x="1" y="9" width="6" height="6" fill="#00a4ef" />
      <rect x="9" y="9" width="6" height="6" fill="#ffb900" />
    </symbol>
  </svg>`,
  );

  desktop.insertAdjacentHTML(
    "afterbegin",
    `<nav class="icons" aria-label="Desktop">${APPS.map(
      (a) => `<button class="icon" ${appAttrs(a)}>
      ${ico(a.icon, 32)}<span>${a.label}</span>
    </button>`,
    ).join("")}</nav>`,
  );

  // Run dialog: lives on every page, so it is built here instead of in HTML
  desktop.insertAdjacentHTML(
    "beforeend",
    `<section class="window" id="run" data-dialog data-icon="run" hidden>
    <div class="title-bar">
      <div class="title-bar-text">Run</div>
      <div class="title-bar-controls"><button aria-label="Close"></button></div>
    </div>
    <div class="window-body">
      <form class="run">
        <div class="run-row">${ico("run", 32)}
          <p>Type the name of a program, folder, document, or Internet resource, and Windows will open it for you.</p>
        </div>
        <div class="field-row">
          <label for="run-cmd">Open:</label>
          <input id="run-cmd" name="cmd" list="run-list" autocomplete="off" autocapitalize="off" spellcheck="false" />
          <datalist id="run-list">${["cv", "contact", "resume", "blog", "linkedin", "github", "mail"]
            .map((c) => `<option value="${c}"></option>`)
            .join("")}</datalist>
        </div>
        <p class="run-err" role="alert" hidden></p>
        <div class="run-btns">
          <button type="submit">OK</button>
          <button type="button" data-close>Cancel</button>
        </div>
      </form>
    </div>
  </section>`,
  );

  document.body.insertAdjacentHTML(
    "beforeend",
    `<footer class="taskbar">
    <details class="menu start">
      <summary>${ico("win")}Start</summary>
      <ul class="dropdown">
        <li class="banner" aria-hidden="true"><b>Windows</b>98</li>
        ${APPS.map(
          (a) => `<li><button ${appAttrs(a)}>${ico(a.icon)}${a.label}</button></li>`,
        ).join("")}
        <li><hr /></li>
        <li><button data-action="run">${ico("run")}Run...</button></li>
        <li><hr /></li>
        <li><button data-action="shutdown">${ico("shut")}Shut Down...</button></li>
      </ul>
    </details>
    <div class="quick">${APPS.filter((a) => QUICK.includes(a.label))
      .map(
        (a) =>
          `<button ${appAttrs(a)} title="${a.label}" aria-label="${a.label}">${ico(a.icon)}</button>`,
      )
      .join("")}</div>
    <div class="tasks"></div>
    <div class="tray"><time id="clock"></time></div>
  </footer>
  <ul class="dropdown ctx" hidden>
    <li><button data-action="arrange">Arrange Icons</button></li>
    <li><button data-action="refresh">Refresh</button></li>
    <li><hr /></li>
    <li><button data-action="display">Properties</button></li>
  </ul>`,
  );

  const icons = desktop.querySelector(".icons");
  const tasks = document.querySelector(".tasks");
  const ctx = document.querySelector(".ctx");
  const runForm = document.querySelector("#run form");
  const runErr = runForm.querySelector(".run-err");
  const wins = {};
  let z = 1;
  let focused = null;
  let dragged = false; // swallows the click that ends an icon drag

  const isDialog = (el) => el.hasAttribute("data-dialog");

  function setFocus(w) {
    focused = w;
    for (const { el, bar, task } of Object.values(wins)) {
      bar.classList.toggle("inactive", el !== w);
      task.classList.toggle("on", el === w);
    }
  }

  function raise(el) {
    el.style.zIndex = ++z;
    setFocus(el);
  }

  // The dotted outline that flies between a window and its task button
  function zoom(from, to) {
    if (still.matches || !from.width || !to.width) return;
    const box = document.createElement("div");
    box.className = "zoom";
    document.body.append(box);
    const rect = (r) => ({
      left: r.left + "px",
      top: r.top + "px",
      width: r.width + "px",
      height: r.height + "px",
    });
    box.animate([rect(from), rect(to)], { duration: 220, easing: "ease-in" })
      .onfinish = () => box.remove();
  }

  // quiet: opened by the page itself on load (no focus move, hash or event)
  function open(id, quiet) {
    if (!wins[id]) return;
    const { el, task } = wins[id];
    const restoring = el.hidden && task.isConnected;
    if (!task.isConnected) tasks.append(task);
    el.hidden = false;
    if (restoring) zoom(task.getBoundingClientRect(), el.getBoundingClientRect());
    raise(el);
    if (quiet) return;
    if (!el.contains(document.activeElement)) wins[id].opener = document.activeElement;
    // Not the textarea: focusing it pops the keyboard on phones
    // Text windows focus their content, not the first link at the bottom
    const first =
      el.querySelector(".window-body .notepad[tabindex]") ||
      el.querySelector(
        ".window-body :is(input:not([type=hidden]), select, button, a[href])",
      );
    (first || el).focus({ preventScroll: true });
    if (wins[id].share)
      history.replaceState(null, "", location.pathname + location.search + "#" + id);
    emit("win98:open", id);
  }

  function minimize(id) {
    const { el, task } = wins[id];
    zoom(el.getBoundingClientRect(), task.getBoundingClientRect());
    el.hidden = true;
    setFocus(null);
    refocus(id);
    emit("win98:minimize", id);
  }

  // A window with data-close-href is the whole page (blog): closing it goes up
  function close(id) {
    const { el, task } = wins[id];
    if (el.dataset.closeHref) return (location.href = el.dataset.closeHref);
    el.hidden = true;
    task.remove();
    setFocus(null);
    refocus(id);
    if (location.hash === "#" + id)
      history.replaceState(null, "", location.pathname + location.search);
    emit("win98:close", id);
  }

  const refocus = (id) => wins[id].opener?.isConnected && wins[id].opener.focus();

  function toggleMax(id) {
    const { el, maxBtn } = wins[id];
    if (!maxBtn) return;
    const max = el.classList.toggle("max");
    maxBtn.setAttribute("aria-label", max ? "Restore" : "Maximize");
  }

  // A window id that isn't on this page lives on the home page: go there
  function launch(target) {
    if (wins[target]) open(target);
    else if (/^[\w-]+$/.test(target)) location.href = ROOT + "index.html#" + target;
    else if (/^https?:/.test(target) && !target.startsWith(location.origin))
      window.open(target, "_blank", "noopener");
    else location.href = target;
  }

  function act(t) {
    if (t.dataset.open) launch(t.dataset.open);
    else if (t.dataset.href) launch(t.dataset.href);
    else
      document.dispatchEvent(
        new CustomEvent("win98:action", { detail: { name: t.dataset.action } }),
      );
  }

  function register(el) {
    const id = el.id;
    const bar = el.querySelector(".title-bar");
    const title = bar.querySelector(".title-bar-text");
    title.id ||= id + "-title";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "false");
    el.setAttribute("aria-labelledby", title.id);
    el.tabIndex = -1;

    const icon =
      el.dataset.icon ||
      APPS.find((a) => a.open === id)?.icon ||
      (el.dataset.closeHref ? "web" : "win");
    const task = document.createElement("button");
    task.className = "task";
    task.innerHTML = ico(icon) + "<span></span>";
    task.lastChild.textContent = title.textContent;
    task.onclick = () => (focused === el ? minimize(id) : open(id));
    // Only page windows get a #hash: late ones (extras.js) don't exist yet on load
    const share = !window.win98 && !el.dataset.closeHref && id !== "run";
    wins[id] = { el, bar, task, share, maxBtn: bar.querySelector('[aria-label="Maximize"]') };

    if (!isDialog(el))
      el.insertAdjacentHTML(
        "beforeend",
        DIRS.map((d) => `<div class="rs" data-dir="${d}"></div>`).join(""),
      );
    // Skip a saved spot that a smaller screen would put out of reach
    const g = !phone.matches && load("win98:win:" + id);
    if (g && !(parseFloat(g.left) > innerWidth - 60 || parseFloat(g.top) > innerHeight - 60 || parseFloat(g.width) > innerWidth))
      Object.assign(el.style, g);
  }

  function saveGeometry(el) {
    if (el.classList.contains("max") || phone.matches) return;
    const { left, top, width, height } = el.style;
    store("win98:win:" + el.id, { left, top, width, height });
  }

  // Pointer-captured drag; move gets the offset from where it started
  function drag(e, target, move, up) {
    const x0 = e.clientX;
    const y0 = e.clientY;
    target.setPointerCapture(e.pointerId);
    target.onpointermove = (e) => move(e.clientX - x0, e.clientY - y0);
    target.onpointerup = target.onpointercancel = () => {
      target.onpointermove = target.onpointerup = target.onpointercancel = null;
      up?.();
    };
  }

  // Title bar moves the window, .rs edges and corners resize it
  function track(e, el, dir) {
    e.preventDefault();
    const l = el.offsetLeft;
    const t = el.offsetTop;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const cs = getComputedStyle(el);
    const minW = parseFloat(cs.minWidth) || 0;
    const minH = parseFloat(cs.minHeight) || 0;
    const s = el.style;
    drag(
      e,
      e.target,
      (dx, dy) => {
        if (dir === "move") {
          // keep enough of the bar on screen to grab
          s.left = clamp(l + dx, 60 - w, innerWidth - 60) + "px";
          s.top = clamp(t + dy, 0, desktop.clientHeight - 20) + "px";
          return;
        }
        if (dir.includes("e")) s.width = Math.max(minW, w + dx) + "px";
        if (dir.includes("s")) s.height = Math.max(minH, h + dy) + "px";
        if (dir.includes("w")) {
          const nw = Math.max(minW, w - dx);
          s.width = nw + "px";
          s.left = l + w - nw + "px";
        }
        if (dir.includes("n")) {
          const nh = Math.max(minH, h - Math.max(dy, -t));
          s.height = nh + "px";
          s.top = t + h - nh + "px";
        }
      },
      () => saveGeometry(el),
    );
  }

  document.querySelectorAll(".desktop .window").forEach(register);
  for (const id in wins) if (!wins[id].el.hidden) open(id, true);
  const openHash = () => wins[location.hash.slice(1)] && open(location.hash.slice(1));
  openHash();
  addEventListener("hashchange", openHash);

  document.addEventListener("pointerdown", (e) => {
    const el = e.target.closest(".window");
    if (!el || !wins[el.id]) {
      if (desktop.contains(e.target)) setFocus(null);
      return;
    }
    raise(el);
    if (e.button || phone.matches || el.classList.contains("max")) return;
    const rs = e.target.closest(".rs");
    if (rs) track(e, el, rs.dataset.dir);
    else if (e.target.closest(".title-bar") && !e.target.closest("button"))
      track(e, el, "move");
  });

  // One delegated listener for every action on the page
  document.addEventListener("click", (e) => {
    if (dragged) return;
    for (const m of document.querySelectorAll("details.menu[open]")) {
      if (!m.contains(e.target) || e.target.closest(".dropdown")) m.open = false;
    }
    ctx.hidden = true;
    const t = e.target.closest(
      "[data-open], [data-href], [data-action], [data-close], .title-bar-controls button",
    );
    if (!t) return;
    const win = t.closest(".window");
    if (win && !wins[win.id]) return; // not registered yet
    if (t.matches(".title-bar-controls button")) {
      const label = t.getAttribute("aria-label");
      if (label === "Close") close(win.id);
      else if (label === "Minimize") minimize(win.id);
      else toggleMax(win.id);
    } else if (t.matches("[data-close]")) {
      if (win) close(win.id);
    } else if (t.classList.contains("icon") && !touch) select(t);
    else act(t);
  });

  document.addEventListener("dblclick", (e) => {
    const icon = e.target.closest(".icon");
    if (icon) return act(icon);
    const bar = e.target.closest(".title-bar");
    const win = bar?.closest(".window");
    if (win && wins[win.id] && !e.target.closest("button") && !phone.matches)
      toggleMax(win.id);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const menus = document.querySelectorAll("details.menu[open]");
      if (menus.length || !ctx.hidden) {
        menus.forEach((m) => {
          m.open = false;
          m.querySelector("summary").focus();
        });
        ctx.hidden = true;
      } else if (focused && isDialog(focused)) close(focused.id);
    } else if (e.key === "Enter" && e.target.classList?.contains("icon")) {
      e.preventDefault();
      act(e.target);
    } else if (e.altKey && e.code === "Backquote") {
      // Alt+` cycles windows: browsers keep Alt+Tab for themselves
      e.preventDefault();
      const ids = Object.keys(wins).filter((id) => wins[id].task.isConnected);
      if (ids.length) open(ids[(ids.indexOf(focused?.id) + 1) % ids.length]);
    }
  });

  // Desktop icons: click selects, drag moves (mouse/pen), Arrange resets
  function select(icon) {
    icons.querySelectorAll(".sel").forEach((i) => i.classList.remove("sel"));
    icon?.classList.add("sel");
  }

  // Swap the flex flow for absolute spots, measured where icons sit now
  function freeze() {
    if (icons.classList.contains("free")) return;
    const spots = [...icons.children].map((i) => [i.offsetLeft, i.offsetTop]);
    icons.classList.add("free");
    [...icons.children].forEach((i, n) => {
      i.style.left = spots[n][0] + "px";
      i.style.top = spots[n][1] + "px";
    });
  }

  // ponytail: saved spots aren't re-clamped on resize; Arrange Icons recovers
  const saved = !phone.matches && load("win98:icons");
  if (saved) {
    freeze();
    for (const i of icons.children) {
      const p = saved[i.textContent.trim()];
      if (p) [i.style.left, i.style.top] = p.map((v) => v + "px");
    }
  }

  icons.addEventListener("pointerdown", (e) => {
    const icon = e.target.closest(".icon");
    if (!icon || e.pointerType === "touch" || e.button) return;
    if (!icon.classList.contains("sel")) select(icon);
    const group = [...icons.querySelectorAll(".sel")];
    let start = null;
    drag(
      e,
      icon,
      (dx, dy) => {
        if (!start) {
          if (Math.hypot(dx, dy) < 4) return;
          freeze();
          start = group.map((i) => [i.offsetLeft, i.offsetTop]);
        }
        group.forEach((i, n) => {
          i.style.left = clamp(start[n][0] + dx, 0, icons.clientWidth - i.offsetWidth) + "px";
          i.style.top = clamp(start[n][1] + dy, 0, icons.clientHeight - i.offsetHeight) + "px";
        });
      },
      () => {
        if (!start) return;
        dragged = true;
        setTimeout(() => (dragged = false));
        store(
          "win98:icons",
          Object.fromEntries(
            [...icons.children].map((i) => [i.textContent.trim(), [i.offsetLeft, i.offsetTop]]),
          ),
        );
      },
    );
  });

  // Rubber-band selection on the empty desktop
  desktop.addEventListener("pointerdown", (e) => {
    if (e.target !== desktop && e.target !== icons) return;
    select(null);
    if (e.pointerType === "touch" || e.button) return;
    const band = document.createElement("div");
    band.className = "band";
    document.body.append(band);
    const x0 = e.clientX;
    const y0 = e.clientY;
    drag(
      e,
      e.target,
      (dx, dy) => {
        const l = Math.min(x0, x0 + dx);
        const t = Math.min(y0, y0 + dy);
        const r = l + Math.abs(dx);
        const b = t + Math.abs(dy);
        Object.assign(band.style, {
          left: l + "px",
          top: t + "px",
          width: r - l + "px",
          height: b - t + "px",
        });
        for (const i of icons.children) {
          const o = i.getBoundingClientRect();
          i.classList.toggle("sel", o.left < r && o.right > l && o.top < b && o.bottom > t);
        }
      },
      () => band.remove(),
    );
  });

  desktop.addEventListener("contextmenu", (e) => {
    if (e.target.closest(".window, .icon")) return;
    e.preventDefault();
    ctx.hidden = false;
    ctx.style.left = Math.min(e.clientX, innerWidth - ctx.offsetWidth) + "px";
    ctx.style.top = Math.min(e.clientY, innerHeight - ctx.offsetHeight) + "px";
    ctx.querySelector("button").focus();
  });

  const ACTIONS = {
    run() {
      runForm.reset();
      runErr.hidden = true;
      open("run");
    },
    arrange() {
      store("win98:icons", null);
      icons.classList.remove("free");
      for (const i of icons.children) i.style.left = i.style.top = "";
    },
    refresh: () => location.reload(),
  };
  document.addEventListener("win98:action", (e) => ACTIONS[e.detail.name]?.());

  runForm.onsubmit = (e) => {
    e.preventDefault();
    const cmd = runForm.cmd.value.trim();
    const q = cmd.toLowerCase();
    if (!q) return;
    const app = APPS.find((a) => q === a.open || q === a.label.toLowerCase());
    const target = LINKS[q] || (q === "bruno" ? "notepad" : app && (app.open || app.href));
    if (!target) {
      runErr.textContent = `Cannot find '${cmd}'. Make sure you typed the name correctly, and then try again.`;
      runErr.hidden = false;
      return runForm.cmd.select();
    }
    close("run");
    launch(target);
  };

  document
    .querySelectorAll(".address input")
    .forEach((i) => (i.value = location.href));

  const clock = document.getElementById("clock");
  const tick = () => {
    const d = new Date();
    clock.textContent = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    clock.title = d.toLocaleDateString([], { dateStyle: "full" });
    clock.dateTime = d.toISOString();
  };
  tick();
  setInterval(tick, 10000);

  window.win98 = { open, close, launch, register };

  // Optional add-ons (sounds, wallpaper, shut down...) load last, on top of this
  document.head.insertAdjacentHTML(
    "beforeend",
    `<link rel="stylesheet" href="${ROOT}extras.css" />`,
  );
  const extras = document.createElement("script");
  extras.src = ROOT + "extras.js";
  document.body.append(extras);
})();
