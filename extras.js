// Desktop extras: boot screen, shut down, screensaver, sounds, Display
// Properties, About and the assistant. Loaded by win98.js after the desktop,
// taskbar and window.win98 exist. Each block below stands on its own.
(() => {
  const desktop = document.querySelector(".desktop");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Storage can throw (private mode, blocked cookies): fail silently
  const local = (k, v) => {
    try {
      return v === undefined
        ? localStorage.getItem(k)
        : localStorage.setItem(k, v);
    } catch {
      return null;
    }
  };
  // True the first time per browser session; false if storage is blocked,
  // so a broken sessionStorage never replays the boot on every page
  const firstInSession = (k) => {
    try {
      if (sessionStorage.getItem(k)) return false;
      sessionStorage.setItem(k, "1");
      return true;
    } catch {
      return false;
    }
  };

  // Full-screen layer that any key or click dismisses
  function overlay(cls, html, onDone) {
    const el = document.createElement("div");
    el.className = "x-overlay " + cls;
    el.innerHTML = html;
    const done = () => {
      if (!el.isConnected) return;
      el.remove();
      removeEventListener("keydown", done, true);
      if (onDone) onDone();
    };
    el.done = done;
    el.addEventListener("pointerdown", done);
    addEventListener("keydown", done, true);
    document.body.append(el);
    return el;
  }
  const busy = () => document.querySelector(".x-overlay");

  const FLAG = `<svg viewBox="0 0 48 48" aria-hidden="true">
    <path d="M8 9q8-4 15 0v13q-7-4-15 0z" fill="#f03a17" />
    <path d="M25 10q8 4 15 0v13q-8 4-15 0z" fill="#7fba00" />
    <path d="M8 24q8-4 15 0v13q-7-4-15 0z" fill="#00a4ef" />
    <path d="M25 25q8 4 15 0v13q-8 4-15 0z" fill="#ffb900" />
  </svg>`;

  /* Boot screen: BIOS text, then the splash; 1.5s total */
  if (!reduced && firstInSession("booted")) {
    const o = overlay(
      "x-bios",
      `<pre>BRUNO-PC BIOS v4.51PG, 1998

Main Processor : Pentium II 400MHz
Memory Testing : 65536K OK

Detecting IDE Primary Master ... brunorodriguez.dev
Starting Windows 98...</pre>`,
    );
    setTimeout(() => {
      if (!o.isConnected) return;
      o.className = "x-overlay x-splash";
      o.innerHTML = `<div class="x-logo">${FLAG}<p>Windows<sup>98</sup></p></div>`;
    }, 650);
    setTimeout(o.done, 1500);
  }

  /* Sounds: synthesized, since the real WAVs are copyrighted */
  let ctx;
  let muted = local("muted") === "1";
  function tone(freq, at, dur, type = "triangle") {
    if (muted || !ctx) return;
    try {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const t = ctx.currentTime + at;
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06, t + 0.01); // quiet by default
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + dur + 0.05);
    } catch {}
  }
  // Browsers only allow audio after a user gesture: make the context then
  const unlock = (e) => {
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      ctx.resume();
    } catch {}
    if (!e.target.closest?.(".x-vol") && firstInSession("chimed"))
      [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 1.2, "sine"));
  };
  addEventListener("pointerup", unlock, true);
  addEventListener("keydown", unlock, true);
  document.addEventListener("win98:open", () => tone(880, 0, 0.06));
  document.addEventListener("win98:minimize", () => tone(330, 0, 0.1));
  document.addEventListener("win98:close", () => tone(330, 0, 0.1));

  const tray = document.querySelector(".tray");
  if (tray) {
    tray.insertAdjacentHTML(
      "afterbegin",
      `<button class="x-vol" aria-label="Mute" aria-pressed="${muted}">
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M2 6h3l4-3v10l-4-3H2z" />
          <path class="w" d="M11 5q2 3 0 6M13 3q3.5 5 0 10" fill="none" stroke="#000" />
          <path class="x" d="M11 6l4 4m0-4l-4 4" stroke="red" stroke-width="1.5" />
        </svg>
      </button>`,
    );
    const vol = tray.firstElementChild;
    vol.onclick = () => {
      muted = !muted;
      local("muted", muted ? "1" : "0");
      vol.setAttribute("aria-pressed", muted);
      tone(660, 0, 0.08);
    };
  }

  /* Shut Down: dither, then the orange message; any input comes back */
  function shutdown() {
    [392, 494, 587].forEach((f) => tone(f, 0, 1.5, "sine"));
    const o = overlay("x-dither", "");
    setTimeout(() => {
      if (!o.isConnected) return;
      o.className = "x-overlay x-safe";
      o.innerHTML = "<p>It's now safe to turn off<br />your computer.</p>";
    }, 900);
  }

  /* Screensaver: starfield after 60s idle */
  function saver() {
    if (busy()) return;
    let raf;
    const o = overlay("x-saver", "<canvas></canvas>", () =>
      cancelAnimationFrame(raf),
    );
    // Real mouse moves only: a layout change fires a 0-movement pointermove
    o.onpointermove = (e) =>
      Math.abs(e.movementX) + Math.abs(e.movementY) > 2 && o.done();
    o.onwheel = o.done;
    const c = o.firstChild;
    const g = c.getContext("2d");
    const w = (c.width = innerWidth);
    const h = (c.height = innerHeight);
    const k = Math.max(w, h) / 2;
    const star = () => ({
      x: Math.random() * 2 - 1,
      y: Math.random() * 2 - 1,
      z: Math.random(),
    });
    const stars = Array.from({ length: 200 }, star);
    // ponytail: rAF already stops while document.hidden, so that's the pause
    (function frame() {
      g.fillStyle = "#000";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#fff";
      for (const s of stars) {
        s.z -= 0.004;
        if (s.z < 0.01) Object.assign(s, star(), { z: 1 });
        const r = (1 - s.z) * 3;
        g.fillRect(w / 2 + (s.x / s.z) * k, h / 2 + (s.y / s.z) * k, r, r);
      }
      raf = requestAnimationFrame(frame);
    })();
  }
  if (!reduced) {
    let idle;
    const poke = () => {
      clearTimeout(idle);
      // Background tabs don't count as idle; visibilitychange re-arms
      if (!document.hidden) idle = setTimeout(saver, 300000);
    };
    for (const t of ["pointermove", "pointerdown", "keydown", "wheel", "scroll", "visibilitychange"])
      addEventListener(t, poke, { capture: true, passive: true });
    poke();
  }

  /* Dialog windows, registered with the window manager */
  function dialog(id, title, body) {
    desktop.insertAdjacentHTML(
      "beforeend",
      `<section class="window" id="${id}" data-dialog hidden>
        <div class="title-bar">
          <div class="title-bar-text">${title}</div>
          <div class="title-bar-controls"><button aria-label="Close"></button></div>
        </div>
        <div class="window-body">${body}</div>
      </section>`,
    );
    const el = desktop.lastElementChild;
    win98.register(el);
    return el;
  }

  /* Display Properties: wallpaper, saved and applied via --desktop-bg */
  const WALLS = {
    Teal: "#008080",
    Black: "#000",
    Navy: "#000080",
    Clouds:
      "radial-gradient(30% 9% at 25% 30%, #fff, #fff0), radial-gradient(22% 7% at 72% 18%, #fffd, #fff0), radial-gradient(35% 10% at 62% 64%, #fff, #fff0), linear-gradient(#2c62c9, #9cc2ee)",
    Tiles: "repeating-conic-gradient(#808080 0 25%, #c0c0c0 0 50%) 0 0 / 32px 32px",
  };
  const setWall = (n) =>
    WALLS[n] &&
    document.documentElement.style.setProperty("--desktop-bg", WALLS[n]);
  setWall(local("wallpaper"));

  const display = dialog(
    "display",
    "Display Properties",
    `<form>
      <div class="x-monitor"><div class="x-screen"></div></div>
      <fieldset>
        <legend>Wallpaper</legend>
        ${Object.keys(WALLS)
          .map(
            (n) => `<div class="field-row">
              <input type="radio" name="wallpaper" id="wp-${n}" value="${n}" />
              <label for="wp-${n}">${n}</label>
            </div>`,
          )
          .join("")}
      </fieldset>
      <div class="x-buttons">
        <button type="button" class="ok" data-close>OK</button>
        <button type="button" data-close>Cancel</button>
        <button type="button" class="apply">Apply</button>
      </div>
    </form>`,
  );
  const form = display.querySelector("form");
  const preview = () =>
    (display.querySelector(".x-screen").style.background =
      WALLS[form.wallpaper.value]);
  const apply = () => {
    setWall(form.wallpaper.value);
    local("wallpaper", form.wallpaper.value);
  };
  form.onchange = preview;
  display.querySelector(".ok").addEventListener("click", apply);
  display.querySelector(".apply").addEventListener("click", apply);

  /* About Notepad */
  dialog(
    "about",
    "About Notepad",
    `<div class="x-about">
      ${FLAG}
      <div>
        <p>Bruno Rodríguez's personal site</p>
        <p>Built with vanilla JS and 98.css</p>
        <p><a href="https://github.com/bruno-rose/Bruno-rose.github.io">github.com/bruno-rose/Bruno-rose.github.io</a></p>
      </div>
    </div>
    <div class="x-buttons"><button data-close>OK</button></div>`,
  );

  document.addEventListener("win98:action", (e) => {
    const name = e.detail.name;
    if (name === "shutdown") shutdown();
    if (name === "about") win98.open("about");
    if (name === "display") {
      const saved = local("wallpaper");
      form.wallpaper.value = WALLS[saved] ? saved : "Teal";
      preview();
      win98.open("display");
    }
  });

  /* Assistant: once per visitor, ~20s in, desktop pointers only */
  function assistant() {
    if (local("clippy-seen") || matchMedia("(pointer: coarse)").matches)
      return;
    if (innerWidth < 600 || !document.getElementById("cv")) return;
    if (busy()) return setTimeout(assistant, 5000);
    local("clippy-seen", "1");
    if (!local("clippy-seen")) return;
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div class="x-clippy" role="dialog" aria-label="Assistant">
        <div class="x-bubble">
          <p>It looks like you're hiring. Would you like help?</p>
          <button data-open="cv">Open cv.txt</button>
          <button data-open="resume">Request resume</button>
          <button>Don't show me this again</button>
        </div>
        <svg viewBox="0 0 40 84" width="48" height="100" aria-hidden="true">
          <path d="M14 60V22a6 6 0 0 1 12 0v46a9 9 0 0 1-18 0V14a12 12 0 0 1 24 0v44"
            fill="none" stroke="#6b6b6b" stroke-width="3.5" stroke-linecap="round" />
          <path d="M14 60V22a6 6 0 0 1 12 0v46a9 9 0 0 1-18 0V14a12 12 0 0 1 24 0v44"
            fill="none" stroke="#d8d8d8" stroke-width="1" stroke-linecap="round" />
          <path d="M6 22l7-3M27 19l7 3" stroke="#000" stroke-width="1.5" />
          <circle cx="11" cy="28" r="5" fill="#fff" stroke="#000" />
          <circle cx="29" cy="28" r="5" fill="#fff" stroke="#000" />
          <circle cx="12" cy="29" r="2" />
          <circle cx="30" cy="29" r="2" />
        </svg>
      </div>`,
    );
    const el = document.body.lastElementChild;
    // data-open is handled by win98.js's delegated listener; we just hide
    el.querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => el.remove()),
    );
  }
  setTimeout(assistant, 20000);
})();
