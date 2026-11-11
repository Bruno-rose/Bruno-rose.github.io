// Site language, English or Spanish. The taskbar toggle's choice wins, then
// the browser's first English or Spanish preference, then English.
// Text comes in pairs, <span lang="en">…</span><span lang="es">…</span>, and
// the style below shows one, so switching is instant and needs no re-render.
// Loaded in <head> of every page, before anything paints.
(() => {
  const root = document.documentElement;
  const LANGS = ["en", "es"];
  const pick = () => {
    try {
      const s = localStorage.getItem("lang");
      if (LANGS.includes(s)) return s;
    } catch {}
    for (const l of navigator.languages || [navigator.language || ""]) {
      const b = l.slice(0, 2).toLowerCase();
      if (LANGS.includes(b)) return b;
    }
    return "en";
  };

  document.head.insertAdjacentHTML(
    "beforeend",
    `<style>:root[data-ui="en"] [lang="es"], :root[data-ui="es"] [lang="en"] { display: none !important; }</style>`,
  );

  const titleEl = document.querySelector("title");
  const enTitle = titleEl?.text;

  // Re-apply: also for markup added after load (taskbar, extras.js dialogs)
  function refresh() {
    const l = root.dataset.ui;
    root.lang = l;
    if (titleEl) document.title = (l === "es" && titleEl.dataset.es) || enTitle;
    // data-label="English|Español": aria-label, and title when it has one
    for (const el of document.querySelectorAll("[data-label]")) {
      const s = el.dataset.label.split("|")[l === "es" ? 1 : 0];
      el.setAttribute("aria-label", s);
      if (el.hasAttribute("title")) el.title = s;
    }
  }

  function apply(l) {
    root.dataset.ui = l;
    refresh();
    document.dispatchEvent(new CustomEvent("langchange"));
  }

  window.i18n = {
    get lang() {
      return root.dataset.ui;
    },
    // Plain string, for text set at one moment (errors, DOS output)
    t: (en, es) => (root.dataset.ui === "es" ? es : en),
    // Both, as markup that follows later switches
    h: (en, es) => `<span lang="en">${en}</span><span lang="es">${es}</span>`,
    set(l) {
      try {
        localStorage.setItem("lang", l);
        // JS Paint (in /paint, same origin) reads this key: keep it in step
        localStorage["jspaint language"] = l;
      } catch {}
      apply(l);
    },
    refresh,
  };

  root.dataset.ui = pick();
  refresh();
  document.addEventListener("DOMContentLoaded", refresh);
  // A switch in another tab, or in the desktop around this blog iframe
  addEventListener("storage", (e) => e.key === "lang" && apply(pick()));
})();
