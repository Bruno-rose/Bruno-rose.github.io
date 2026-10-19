// Shared Win98 desktop: icons, taskbar and window manager. Pages only declare
// their .window sections inside <main class="desktop">.
(() => {
  const ROOT = new URL(".", document.currentScript.src).href;
  const APPS = [
    { label: "bruno.txt", icon: "note", open: "notepad" },
    { label: "cv.txt", icon: "note", open: "cv" },
    { label: "Blog", icon: "folder", href: ROOT + "blog/index.html" },
    { label: "Request resume", icon: "mail", open: "resume" },
  ];
  const appAttrs = (a) =>
    a.open ? `data-open="${a.open}"` : `data-href="${a.href}"`;

  const desktop = document.querySelector(".desktop");

  document.body.insertAdjacentHTML(
    "afterbegin",
    `<svg width="0" height="0" style="position: absolute" aria-hidden="true">
    <symbol id="ico-note" viewBox="0 0 32 32">
      <path d="M6 2h15l5 5v23H6z" fill="#fff" stroke="#000" />
      <path d="M21 2v5h5" fill="silver" stroke="#000" />
      <path d="M9 12h14M9 16h14M9 20h14M9 24h9" stroke="#000080" />
    </symbol>
    <symbol id="ico-folder" viewBox="0 0 32 32">
      <path d="M2 7h10l3 3h15v18H2z" fill="#ffd862" stroke="#000" />
      <path d="M2.5 13h27" stroke="#b8901e" />
    </symbol>
    <symbol id="ico-mail" viewBox="0 0 32 32">
      <rect x="3" y="8" width="26" height="17" fill="#fff" stroke="#000" />
      <path d="M3 8l13 10 13-10" fill="none" stroke="#000" />
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
      <svg><use href="#ico-${a.icon}" /></svg><span>${a.label}</span>
    </button>`,
    ).join("")}</nav>`,
  );

  document.body.insertAdjacentHTML(
    "beforeend",
    `<footer class="taskbar">
    <details class="menu start">
      <summary><svg width="16" height="16"><use href="#ico-win" /></svg>Start</summary>
      <ul class="dropdown">${APPS.map(
        (a) => `<li><button ${appAttrs(a)}>${a.label}</button></li>`,
      ).join("")}</ul>
    </details>
    <div class="tasks"></div>
    <div class="tray"><time id="clock"></time></div>
  </footer>`,
  );

  const tasks = document.querySelector(".tasks");
  const wins = {};
  let z = 1;
  let focused = null;

  function setFocus(w) {
    focused = w;
    for (const { el, bar, task } of Object.values(wins)) {
      bar.classList.toggle("inactive", el !== w);
      task.classList.toggle("on", el === w);
    }
  }

  function open(id) {
    const { el, task } = wins[id];
    if (!task.isConnected) tasks.append(task);
    el.hidden = false;
    el.style.zIndex = ++z;
    setFocus(el);
  }

  function minimize(id) {
    wins[id].el.hidden = true;
    setFocus(null);
  }

  // A window with data-close-href is the whole page (blog): closing it goes up
  function close(id) {
    const { el, task } = wins[id];
    if (el.dataset.closeHref) return (location.href = el.dataset.closeHref);
    el.hidden = true;
    task.remove();
    setFocus(null);
  }

  function toggleMax(id) {
    const { el, maxBtn } = wins[id];
    const max = el.classList.toggle("max");
    maxBtn.setAttribute("aria-label", max ? "Restore" : "Maximize");
  }

  // Windows on another page live on the home page: go there and open them
  function launch(btn) {
    const id = btn.dataset.open;
    if (!id) location.href = btn.dataset.href;
    else if (wins[id]) open(id);
    else location.href = ROOT + "index.html#" + id;
  }

  for (const el of document.querySelectorAll(".window")) {
    const id = el.id;
    const bar = el.querySelector(".title-bar");
    const [minBtn, maxBtn, closeBtn] = bar.querySelectorAll("button");
    const task = document.createElement("button");
    task.className = "task";
    task.textContent = bar.querySelector(".title-bar-text").textContent;
    task.onclick = () => (focused === el ? minimize(id) : open(id));
    wins[id] = { el, bar, task, maxBtn };

    minBtn.onclick = () => minimize(id);
    maxBtn.onclick = () => toggleMax(id);
    closeBtn.onclick = () => close(id);
    el.querySelectorAll("[data-close]").forEach(
      (b) => (b.onclick = () => close(id)),
    );
    el.addEventListener("pointerdown", () => open(id));
    bar.ondblclick = (e) => e.target.closest("button") || toggleMax(id);

    // Drag by the title bar; keep enough of the bar on screen to grab
    bar.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button") || el.classList.contains("max")) return;
      const dx = e.clientX - el.offsetLeft;
      const dy = e.clientY - el.offsetTop;
      bar.setPointerCapture(e.pointerId);
      bar.onpointermove = (e) => {
        const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
        el.style.left =
          clamp(e.clientX - dx, 60 - el.offsetWidth, innerWidth - 60) + "px";
        el.style.top =
          clamp(e.clientY - dy, 0, desktop.clientHeight - 20) + "px";
      };
      bar.onpointerup = () => (bar.onpointermove = null);
    });
  }
  for (const id in wins) if (!wins[id].el.hidden) open(id);
  const hashed = location.hash.slice(1);
  if (wins[hashed]) open(hashed);

  document
    .querySelectorAll(".dropdown [data-open], .dropdown [data-href]")
    .forEach((b) => (b.onclick = () => launch(b)));

  const touch = matchMedia("(pointer: coarse)").matches;
  document.querySelectorAll(".icon").forEach((icon) => {
    icon.ondblclick = () => launch(icon);
    icon.onclick = () => touch && launch(icon);
    icon.onkeydown = (e) => e.key === "Enter" && launch(icon);
  });

  // One menu open at a time; clicking anywhere else (or an item) closes it
  document.addEventListener("click", (e) => {
    for (const m of document.querySelectorAll("details.menu[open]")) {
      if (!m.contains(e.target) || e.target.closest(".dropdown"))
        m.open = false;
    }
  });

  document
    .querySelectorAll(".address input")
    .forEach((i) => (i.value = location.href));

  const clock = document.getElementById("clock");
  const tick = () =>
    (clock.textContent = new Date().toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    }));
  tick();
  setInterval(tick, 10000);
})();
