const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

// Set canvas size
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();

// Physics constants
let G = 400;
let backgroundColor = "#05070d";
let particleColor = { r: 232, g: 236, b: 245 };
let particleAttractionEnabled = false;
let connectionDistance = 100;

// Physics runs in "frames" of 1/60 s regardless of the display's refresh
// rate; long frames are split into substeps so fast bodies stay stable
const FRAME_MS = 1000 / 60;
const MAX_FRAME_STEP = 3;
let lastTime = performance.now();
let paused = false;

// Text acts as an impenetrable obstacle: particles bounce off it elastically
let textObstacles = [];

// Text blocks: every element in .content with text of its own, outermost
// only (a link inside a paragraph moves with the paragraph). Computed once,
// before any letter splitting touches the DOM.
const TEXT_BLOCKS = (() => {
  const withText = Array.from(document.querySelectorAll(".content *")).filter(
    (el) =>
      Array.from(el.childNodes).some(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim(),
      ),
  );
  const set = new Set(withText);
  return withText.filter((el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      if (set.has(p)) return false;
    }
    return true;
  });
})();

// block element -> { letters, html } once a block is split into letters
const splitBlocks = new Map();

// Only blocks on (or near) screen matter for collisions and splitting.
// Until the observer's first report, treat every block as visible.
const TEXT_MARGIN = 400; // covers TEXT_SPLIT_RANGE
const visibleBlocks = new Set();
let visibilityKnown = false;
const blockObserver = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting) visibleBlocks.add(e.target);
      else visibleBlocks.delete(e.target);
    }
    visibilityKnown = true;
  },
  { rootMargin: `${TEXT_MARGIN}px` },
);
TEXT_BLOCKS.forEach((el) => blockObserver.observe(el));

function activeBlocks() {
  return visibilityKnown ? visibleBlocks : TEXT_BLOCKS;
}

function updateTextObstacles() {
  textObstacles = [];
  for (const el of activeBlocks()) {
    const split = splitBlocks.get(el);
    if (!split) {
      if (!el.dataset.eaten) textObstacles.push(el.getBoundingClientRect());
      continue;
    }
    // ponytail: box around letters still in place; flying letters don't
    // collide (per-letter rects would be letters x particles checks)
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const l of split.letters) {
      if (l.gone || Math.abs(l.ox) + Math.abs(l.oy) > 2) continue;
      left = Math.min(left, l.bx - scrollX);
      top = Math.min(top, l.by - scrollY);
      right = Math.max(right, l.bx - scrollX + l.w);
      bottom = Math.max(bottom, l.by - scrollY + l.h);
    }
    if (left < right) textObstacles.push({ left, top, right, bottom });
  }
}

// ---------------------------------------------------------------------------
// Black holes
//
// Holes live in page coordinates (they scroll with the text); particles live
// in viewport coordinates (the dust stays on screen). Gravity is purely
// radial: bodies swirl only because they pick up the disk's rotation when they
// enter it, and drag bleeds that off so they spiral in.
// ---------------------------------------------------------------------------
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let holesEnabled = !reduceMotion;
let restoring = false; // big bang in progress: letters flying home
let eaten = 0;

let mergeCount = 6; // particles that must bunch up to collapse into a hole
const MERGE_RADIUS = 15;
const MAX_BLACK_HOLES = 5; // spontaneous ones
const MAX_MANUAL_HOLES = 10; // including the ones you click into existence
const SPAWN_MASS = 40;
const BH_G = 40; // attraction per unit of mass
// Dust feels a hole (and joins its disk) within its range, which grows with
// mass: tiny holes can barely feed, so Hawking radiation gets to finish them
const BH_RANGE = 200;
const BH_RANGE_BASE = 60;
const BH_RANGE_PER_MASS = 5;
// Schwarzschild radius grows linearly with mass; capped so it fits on screen
const BH_MIN_RADIUS = 2;
const BH_RADIUS_PER_MASS = 0.35;
const BH_MAX_RADIUS = 45;
const ISCO = 3; // innermost stable circular orbit, in horizon radii
const ISCO_BLEED = 0.85; // tangential speed kept per frame inside the ISCO
const PHOTON_RING = 1.5; // photon sphere, in horizon radii
const ORBIT_KICK = 0.8; // fraction of circular speed picked up entering a disk
const ORBIT_DAMPING = 0.97; // lighter than free dust so the spiral shows
const MIN_TIME_RATE = 0.2; // time dilation floor, so things still fall in
const REDSHIFT_FROM = 0.9; // time rate below which redshift becomes visible
const PARTICLE_MAX_ACCEL = 0.8;
// Hole motion: dynamical friction slowly bleeds speed; merging holes get a
// gravitational-wave recoil kick in a random direction
const BH_DRAG = 0.995;
const BH_MAX_ACCEL = 0.3;
const BH_KICK = 2.5;
const BH_MAX_THROW = 20;
// Hawking radiation: dM/dt = -k/M^2. Unfed, a 6-mass hole lasts ~6 s (time
// to find dust and grow) and a 20-mass one ~4 min
const HAWKING = 0.2;
const HAWKING_SPEED = 12;
// Past this mass a hole also drags the text toward itself, letter by letter
const TEXT_PULL_MASS = 30;
const TEXT_PULL_SCALE = 0.3; // text is heavier than dust
const TEXT_SPLIT_RANGE = 350;
const TEXT_MAX_ACCEL = 0.5;
const MAX_STRETCH = 3; // spaghettification cap
// Scaled text is re-rasterized per distinct scale, so stretch only kicks in
// close to the horizon and snaps to a few values (keeps glyph caches warm)
const STRETCH_FROM = 0.15;
const STRETCH_STEP = 0.25;
const STRETCH_ANGLE_STEP = Math.PI / 12;
const RESTORE_K = 0.02; // big bang spring pulling letters home
const RESTORE_DAMPING = 0.88;
// Gravitational lensing (Einstein ring radius and reach, in horizon radii)
const LENS_EINSTEIN = 2.2;
const LENS_RANGE = 10;
// Merger ripples
const WAVE_SPEED = 6;
const WAVE_LIFE = 60;
const WAVE_WIDTH = 20;

const HOT = { r: 255, g: 140, b: 40 }; // inner accretion disk
const REDSHIFT = { r: 179, g: 38, b: 30 }; // light climbing out near the horizon

let blackHoles = [];
let waves = [];

function blackHoleRadius(mass) {
  return Math.min(BH_MIN_RADIUS + mass * BH_RADIUS_PER_MASS, BH_MAX_RADIUS);
}

function holeRange(hole) {
  return Math.min(BH_RANGE, BH_RANGE_BASE + hole.mass * BH_RANGE_PER_MASS);
}

function makeHole(x, y, mass, vx = 0, vy = 0) {
  return {
    x,
    y,
    vx,
    vy,
    mass,
    spin: Math.random() < 0.5 ? -1 : 1,
    radius: blackHoleRadius(mass),
    evaporated: 0,
  };
}

// Radial pull toward (hx, hy) on a body at (x, y), capped
function pull(hx, hy, mass, x, y, strength, cap) {
  const dx = hx - x;
  const dy = hy - y;
  const dist = Math.hypot(dx, dy) || 0.001;
  return {
    dist,
    nx: dx / dist,
    ny: dy / dist,
    a: Math.min((strength * mass) / (dist * dist), cap),
  };
}

// Gravitational time dilation seen from far away: sqrt(1 - r_s / r)
function timeRate(hole, dist) {
  return Math.sqrt(Math.max(0, 1 - hole.radius / dist));
}

// 0..1 visible redshift for a time rate. The real effect has a long tail;
// only show the part close to the horizon so distant text isn't tinted.
function redshiftAmount(rate) {
  return Math.max(0, REDSHIFT_FROM - rate) / REDSHIFT_FROM;
}

// One step of disk dynamics for a body inside a hole's range
function orbitalStep(body, hole, p, h) {
  body.vx += p.nx * p.a * h;
  body.vy += p.ny * p.a * h;
  const tx = -p.ny * hole.spin;
  const ty = p.nx * hole.spin;
  if (body.orbit !== hole) {
    // Joining the disk: pick up its rotation
    body.orbit = hole;
    const vc = Math.sqrt(p.a * p.dist);
    body.vx += tx * vc * ORBIT_KICK;
    body.vy += ty * vc * ORBIT_KICK;
  }
  if (p.dist < ISCO * hole.radius) {
    // No stable orbits inside the ISCO: angular momentum drains, it plunges
    const vt = body.vx * tx + body.vy * ty;
    const bleed = vt * (1 - Math.pow(ISCO_BLEED, h));
    body.vx -= tx * bleed;
    body.vy -= ty * bleed;
  }
}

// Swallow a body: mass adds up and momentum is conserved, so the hole
// drifts in the direction of what it eats
function feed(hole, mass, vx, vy) {
  const total = hole.mass + mass;
  hole.vx = (hole.vx * hole.mass + vx * mass) / total;
  hole.vy = (hole.vy * hole.mass + vy * mass) / total;
  hole.mass = total;
  hole.radius = blackHoleRadius(total);
}

function addWave(x, y, strength) {
  waves.push({ x, y, age: 0, strength });
}

// Random spot outside any text block. Spawning inside one would get the
// particle shoved onto its edge, and those edge pile-ups instantly form holes.
function freePosition() {
  for (let tries = 0; tries < 20; tries++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const inside = textObstacles.some(
      (r) => x > r.left - 2 && x < r.right + 2 && y > r.top - 2 && y < r.bottom + 2,
    );
    if (!inside) return { x, y };
  }
  return { x: Math.random() * canvas.width, y: -5 }; // ponytail: text-packed screen, drop in from the top
}

function respawn(p) {
  const pos = freePosition();
  p.x = pos.x;
  p.y = pos.y;
  p.vx = 0;
  p.vy = 0;
  p.orbit = null;
}

function absorb(hole, p) {
  feed(hole, p.mass, p.vx, p.vy);
  respawn(p);
}

// ponytail: O(n^2) scan, same cost as the connection lines; grid if n grows
function formBlackHoles() {
  if (!holesEnabled || restoring || blackHoles.length >= MAX_BLACK_HOLES) return;
  const r2 = MERGE_RADIUS * MERGE_RADIUS;
  for (let i = 0; i < particles.length; i++) {
    const a = particles[i];
    // Infalling dust bunches up; don't let that spawn holes next to a hole
    if (
      blackHoles.some(
        (h) => Math.hypot(h.x - scrollX - a.x, h.y - scrollY - a.y) < BH_RANGE,
      )
    ) continue;
    const cluster = [a];
    for (let j = 0; j < particles.length; j++) {
      if (i === j) continue;
      const b = particles[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      if (dx * dx + dy * dy < r2) cluster.push(b);
    }
    if (cluster.length >= mergeCount) {
      let x = 0, y = 0, vx = 0, vy = 0;
      for (const p of cluster) {
        x += p.x;
        y += p.y;
        vx += p.vx;
        vy += p.vy;
      }
      const mass = cluster.length;
      blackHoles.push(
        makeHole(x / mass + scrollX, y / mass + scrollY, mass, vx / mass, vy / mass),
      );
      // Keep n constant: swallowed particles reappear elsewhere
      cluster.forEach(respawn);
      return;
    }
  }
}

// Hawking radiation: each unit of mass lost leaves as a fast particle
function emitHawking(hole) {
  const p = particles[Math.floor(Math.random() * particles.length)];
  if (!p) return;
  const angle = Math.random() * Math.PI * 2;
  const r = hole.radius * ISCO;
  p.x = hole.x - scrollX + Math.cos(angle) * r;
  p.y = hole.y - scrollY + Math.sin(angle) * r;
  p.vx = Math.cos(angle) * HAWKING_SPEED;
  p.vy = Math.sin(angle) * HAWKING_SPEED;
  p.orbit = hole; // no disk kick on the way out
}

// ponytail: O(holes^2), holes are capped at MAX_MANUAL_HOLES
function updateBlackHoles(h) {
  for (const a of blackHoles) {
    for (const b of blackHoles) {
      if (a === b) continue;
      const p = pull(b.x, b.y, b.mass, a.x, a.y, BH_G, BH_MAX_ACCEL);
      a.vx += p.nx * p.a * h;
      a.vy += p.ny * p.a * h;
    }
  }

  // Merge touching holes: the remnant rings down and gets a recoil kick
  for (let i = 0; i < blackHoles.length; i++) {
    for (let j = blackHoles.length - 1; j > i; j--) {
      const a = blackHoles[i];
      const b = blackHoles[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) > a.radius + b.radius) continue;
      const total = a.mass + b.mass;
      a.x = (a.x * a.mass + b.x * b.mass) / total;
      a.y = (a.y * a.mass + b.y * b.mass) / total;
      if (b.mass > a.mass) a.spin = b.spin;
      feed(a, b.mass, b.vx, b.vy);
      const angle = Math.random() * Math.PI * 2;
      const kick = BH_KICK * (0.5 + Math.random());
      a.vx += Math.cos(angle) * kick;
      a.vy += Math.sin(angle) * kick;
      addWave(a.x, a.y, Math.min(3, Math.sqrt(Math.min(a.mass, b.mass)) / 3));
      if (grab && grab.hole === b) grab.hole = a;
      blackHoles.splice(j, 1);
    }
  }

  const docW = document.documentElement.scrollWidth;
  const docH = document.documentElement.scrollHeight;
  for (let i = blackHoles.length - 1; i >= 0; i--) {
    const hole = blackHoles[i];

    const loss = (HAWKING / (hole.mass * hole.mass)) * h;
    hole.mass -= loss;
    hole.evaporated += loss;
    while (hole.evaporated >= 1) {
      hole.evaporated -= 1;
      emitHawking(hole);
    }
    if (hole.mass < 1) {
      addWave(hole.x, hole.y, 1);
      blackHoles.splice(i, 1);
      continue;
    }
    hole.radius = blackHoleRadius(hole.mass);

    if (grab && grab.hole === hole) continue; // the pointer moves it
    const drag = Math.pow(BH_DRAG, h);
    hole.vx *= drag;
    hole.vy *= drag;
    hole.x += hole.vx * h;
    hole.y += hole.vy * h;
    // Page edges are elastic walls so holes never wander off
    const r = hole.radius;
    if (hole.x < r) { hole.x = r; hole.vx = Math.abs(hole.vx); }
    if (hole.x > docW - r) { hole.x = docW - r; hole.vx = -Math.abs(hole.vx); }
    if (hole.y < r) { hole.y = r; hole.vy = Math.abs(hole.vy); }
    if (hole.y > docH - r) { hole.y = docH - r; hole.vy = -Math.abs(hole.vy); }
  }
}

// Gravitational-wave ripples push dust outward as they pass
function updateWaves(h) {
  for (const w of waves) {
    w.age += h;
    const radius = w.age * WAVE_SPEED;
    const fade = 1 - w.age / WAVE_LIFE;
    const wx = w.x - scrollX;
    const wy = w.y - scrollY;
    for (const p of particles) {
      const dx = p.x - wx;
      const dy = p.y - wy;
      const d = Math.hypot(dx, dy) || 1;
      if (Math.abs(d - radius) < WAVE_WIDTH) {
        const push = w.strength * fade * 0.3 * h;
        p.vx += (dx / d) * push;
        p.vy += (dy / d) * push;
      }
    }
  }
  waves = waves.filter((w) => w.age < WAVE_LIFE);
}

// ---------------------------------------------------------------------------
// Letters
//
// Blocks near a heavy hole are split into one element per letter and each
// letter is pulled on its own (1/d^2), so the letters closest to the hole
// fall in first. Positions live in page coordinates, so no layout reads per
// letter per frame.
// ---------------------------------------------------------------------------
function splitBlock(el) {
  const html = el.innerHTML;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  const spans = [];
  for (const node of nodes) {
    const frag = document.createDocumentFragment();
    for (const part of node.textContent.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s/.test(part)) {
        frag.append(part); // keep whitespace as text so lines wrap the same
        continue;
      }
      // Letters are inline-block so they can move with transform (no layout
      // per frame); the nowrap word keeps lines from breaking mid-word.
      // Custom tags so page CSS like `.tags span` doesn't style them.
      const word = document.createElement("bh-word");
      word.style.whiteSpace = "nowrap";
      for (const ch of part) {
        const span = document.createElement("bh-letter");
        span.textContent = ch;
        span.style.display = "inline-block";
        span.style.transition = "opacity 0.3s";
        word.append(span);
        spans.push(span);
      }
      frag.append(word);
    }
    node.replaceWith(frag);
  }
  // All writes done: read every letter's position in a single layout pass
  const letters = spans.map((span) => {
    const r = span.getBoundingClientRect();
    return {
      span,
      bx: r.left + scrollX,
      by: r.top + scrollY,
      w: r.width,
      h: r.height,
      ox: 0,
      oy: 0,
      vx: 0,
      vy: 0,
      orbit: null,
      gone: false,
      hidden: false,
      hole: null, // the hole that ate it, so the big bang can spit it back out
      stretch: 1,
      angle: 0,
      rate: 1,
      shade: 0,
    };
  });
  splitBlocks.set(el, { letters, html });
}

function heavyHoles() {
  return blackHoles.filter((h) => h.mass >= TEXT_PULL_MASS);
}

function splitNearbyBlocks() {
  const heavy = heavyHoles();
  if (heavy.length === 0) return;
  for (const el of activeBlocks()) {
    if (splitBlocks.has(el) || el.dataset.eaten) continue;
    const r = el.getBoundingClientRect();
    const near = heavy.some(
      (h) =>
        Math.hypot(
          Math.max(r.left - (h.x - scrollX), 0, h.x - scrollX - r.right),
          Math.max(r.top - (h.y - scrollY), 0, h.y - scrollY - r.bottom),
        ) < TEXT_SPLIT_RANGE,
    );
    if (near) splitBlock(el);
  }
}

function stepLetters(h) {
  const heavy = heavyHoles();
  if (heavy.length === 0 && !restoring) return;

  let settled = true;
  for (const { letters } of splitBlocks.values()) {
    for (const l of letters) {
      if (l.gone) continue;

      if (restoring) {
        // Big bang: spring back to the original spot
        l.vx -= l.ox * RESTORE_K * h;
        l.vy -= l.oy * RESTORE_K * h;
        const damping = Math.pow(RESTORE_DAMPING, h);
        l.vx *= damping;
        l.vy *= damping;
        l.ox += l.vx * h;
        l.oy += l.vy * h;
        l.stretch = 1;
        l.rate = 1;
        if (Math.abs(l.ox) + Math.abs(l.oy) > 0.5 || Math.abs(l.vx) + Math.abs(l.vy) > 0.1) {
          settled = false;
        }
        continue;
      }

      const cx = l.bx + l.ox + l.w / 2;
      const cy = l.by + l.oy + l.h / 2;

      // Time runs slower near a horizon, and tides stretch the letter
      let rate = 1;
      let tide = 0;
      let angle = 0;
      for (const hole of heavy) {
        const d = Math.hypot(hole.x - cx, hole.y - cy);
        rate = Math.min(rate, timeRate(hole, d));
        const t = Math.pow(hole.radius / d, 3) * 3;
        if (t > tide) {
          tide = t;
          angle = Math.atan2(hole.y - cy, hole.x - cx);
        }
      }
      l.rate = rate;
      l.stretch = tide < STRETCH_FROM
        ? 1
        : 1 + Math.round(Math.min(tide, MAX_STRETCH - 1) / STRETCH_STEP) * STRETCH_STEP;
      l.angle = Math.round(angle / STRETCH_ANGLE_STEP) * STRETCH_ANGLE_STEP;
      const hl = h * Math.max(rate, MIN_TIME_RATE);

      let near = false;
      for (const hole of heavy) {
        const p = pull(hole.x, hole.y, hole.mass, cx, cy, BH_G * TEXT_PULL_SCALE, TEXT_MAX_ACCEL);
        if (p.dist < hole.radius) {
          // Swallowed: each letter adds one unit of mass
          l.gone = true;
          l.hole = hole;
          feed(hole, 1, l.vx, l.vy);
          eaten++;
          break;
        }
        if (p.dist < BH_RANGE) {
          near = true;
          orbitalStep(l, hole, p, hl);
        } else {
          l.vx += p.nx * p.a * hl;
          l.vy += p.ny * p.a * hl;
        }
      }
      if (l.gone) continue;
      const damping = Math.pow(near ? ORBIT_DAMPING : 0.95, hl);
      l.vx *= damping;
      l.vy *= damping;
      l.ox += l.vx * hl;
      l.oy += l.vy * hl;
    }
  }
  if (restoring && settled) finishRestore();
}

// Write letter state to the DOM once per frame (transform and opacity only,
// so no layout)
function renderLetters() {
  for (const [el, { letters }] of splitBlocks) {
    let alive = 0;
    for (const l of letters) {
      const s = l.span.style;
      if (l.gone) {
        if (!l.hidden) {
          s.opacity = "0";
          l.hidden = true;
        }
        continue;
      }
      alive++;
      if (l.hidden) {
        s.opacity = "";
        l.hidden = false;
      }
      let t = `translate(${l.ox}px, ${l.oy}px)`;
      if (l.stretch > 1) {
        // Spaghettification: long along the line to the hole, thin across it
        const deg = (l.angle * 180) / Math.PI;
        t += ` rotate(${deg}deg) scale(${l.stretch}, ${1 / Math.sqrt(l.stretch)}) rotate(${-deg}deg)`;
      }
      s.transform = t;
      // Gravitational redshift: dimmer and redder close to the horizon.
      // Quantized so letters far from any hole never get rewritten.
      const shade = Math.round(redshiftAmount(l.rate) * 10);
      if (shade !== l.shade) {
        l.shade = shade;
        s.color = shade ? `color-mix(in srgb, currentColor, rgb(${REDSHIFT.r} ${REDSHIFT.g} ${REDSHIFT.b}) ${shade * 10}%)` : "";
        s.opacity = shade ? String(Math.max(1 - shade * 0.07, 0.3)) : "";
      }
    }
    // Fully eaten: fade what's left (tag chip backgrounds, icons, bullets)
    // and stop it from catching clicks
    if (alive === 0 && !el.dataset.eaten) {
      el.dataset.eaten = "1";
      el.style.transition = "opacity 0.5s";
      el.style.opacity = "0";
      el.style.pointerEvents = "none";
    }
  }
}

// Layout changes on resize: re-read each letter's resting position
function rebaseLetters() {
  for (const { letters } of splitBlocks.values()) {
    for (const l of letters) {
      const r = l.span.getBoundingClientRect();
      l.bx = r.left + scrollX - l.ox;
      l.by = r.top + scrollY - l.oy;
    }
  }
}

// Explode every hole and send the text home
function bigBang() {
  for (const hole of blackHoles) {
    addWave(hole.x, hole.y, 4);
    const hx = hole.x - scrollX;
    const hy = hole.y - scrollY;
    for (const p of particles) {
      const dx = p.x - hx;
      const dy = p.y - hy;
      const d = Math.hypot(dx, dy) || 1;
      if (d < 400) {
        const push = 10 * (1 - d / 400);
        p.vx += (dx / d) * push;
        p.vy += (dy / d) * push;
      }
      p.orbit = null;
    }
  }
  for (const [el, { letters }] of splitBlocks) {
    for (const l of letters) {
      if (l.gone) {
        // Reappear where the hole was and fly back
        const hole = l.hole;
        l.ox = hole.x - l.bx - l.w / 2;
        l.oy = hole.y - l.by - l.h / 2;
        const angle = Math.random() * Math.PI * 2;
        const speed = 6 + Math.random() * 8;
        l.vx = Math.cos(angle) * speed;
        l.vy = Math.sin(angle) * speed;
        l.gone = false;
      }
      l.orbit = null;
    }
    delete el.dataset.eaten;
    el.style.opacity = "";
    el.style.pointerEvents = "";
  }
  for (const el of TEXT_BLOCKS) {
    delete el.dataset.eaten;
    el.style.opacity = "";
    el.style.pointerEvents = "";
  }
  blackHoles = [];
  grab = null;
  eaten = 0;
  restoring = splitBlocks.size > 0;
}

// Letters are home: put the original markup back (restores exact layout)
function finishRestore() {
  for (const [el, { html }] of splitBlocks) {
    el.innerHTML = html;
  }
  splitBlocks.clear();
  restoring = false;
}

function clearHoles() {
  for (const hole of blackHoles) addWave(hole.x, hole.y, 1);
  blackHoles = [];
  grab = null;
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------
let bgIsDark = true;
// Batched drawing: lines and plain dust share a few alpha levels
const LINE_ALPHA_LEVELS = 8;
const DOT_ALPHA_STEP = 0.05;
const DOT_ALPHA_LEVELS = 12;

function hexToRgb(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function setBackground(hex) {
  backgroundColor = hex;
  const { r, g, b } = hexToRgb(hex);
  bgIsDark = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
}

function mix(a, b, t) {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

function rgba({ r, g, b }, alpha) {
  return `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${alpha})`;
}

// Where dust appears once light bends around the holes (primary image of a
// point lens: theta = (beta + sqrt(beta^2 + 4 thetaE^2)) / 2), faded out
// toward the edge of the lens so there's no visible seam. Lenses are
// prepared once per frame and results go into reused arrays.
let seenX = new Float64Array(0);
let seenY = new Float64Array(0);

function computeSeen() {
  const n = particles.length;
  if (seenX.length < n) {
    seenX = new Float64Array(n * 2);
    seenY = new Float64Array(n * 2);
  }
  const lenses = [];
  for (const hole of blackHoles) {
    const range = hole.radius * LENS_RANGE;
    if (!onScreen(hole, range)) continue;
    const e = hole.radius * LENS_EINSTEIN;
    lenses.push({ x: hole.x - scrollX, y: hole.y - scrollY, range, range2: range * range, e4: 4 * e * e });
  }
  for (let i = 0; i < n; i++) {
    let x = particles[i].x;
    let y = particles[i].y;
    for (const L of lenses) {
      const dx = x - L.x;
      const dy = y - L.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > L.range2 || d2 < 0.25) continue;
      const d = Math.sqrt(d2);
      const image = (d + Math.sqrt(d2 + L.e4)) / 2;
      const fade = (1 - d / L.range) ** 2;
      const scale = 1 + ((image - d) * fade) / d;
      x = L.x + dx * scale;
      y = L.y + dy * scale;
    }
    seenX[i] = x;
    seenY[i] = y;
  }
}

function onScreen(hole, margin) {
  const x = hole.x - scrollX;
  const y = hole.y - scrollY;
  return x > -margin && y > -margin && x < canvas.width + margin && y < canvas.height + margin;
}

function drawWaves() {
  const base = bgIsDark ? { r: 255, g: 255, b: 255 } : particleColor;
  ctx.lineWidth = 1.5;
  for (const w of waves) {
    const alpha = 0.3 * (1 - w.age / WAVE_LIFE) * Math.min(1, w.strength);
    ctx.strokeStyle = rgba(base, alpha);
    ctx.beginPath();
    ctx.arc(w.x - scrollX, w.y - scrollY, w.age * WAVE_SPEED, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// Shadow, hot glow, Doppler-beamed disk side, photon ring, mass label
function drawBlackHoles() {
  const rim = bgIsDark ? { r: 235, g: 235, b: 235 } : particleColor;
  for (const hole of blackHoles) {
    const R = hole.radius;
    if (!onScreen(hole, R * 4)) continue;
    const x = hole.x - scrollX;
    const y = hole.y - scrollY;

    const glow = ctx.createRadialGradient(x, y, R, x, y, R * 4);
    glow.addColorStop(0, rgba(HOT, 0.35));
    glow.addColorStop(0.4, rgba(particleColor, 0.12));
    glow.addColorStop(1, rgba(particleColor, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, R * 4, 0, Math.PI * 2);
    ctx.fill();

    // The viewer sits "below" the disk: the side rotating toward the bottom
    // of the screen is approaching and gets beamed brighter
    const beamed = hole.spin > 0 ? Math.PI : 0;
    ctx.strokeStyle = rgba(HOT, 0.35);
    ctx.lineWidth = Math.max(1, R * 0.12);
    ctx.beginPath();
    ctx.arc(x, y, R * 1.9, beamed - Math.PI / 2, beamed + Math.PI / 2);
    ctx.stroke();

    ctx.strokeStyle = rgba(rim, 0.6);
    ctx.lineWidth = Math.max(1, R * 0.08);
    ctx.beginPath();
    ctx.arc(x, y, R * PHOTON_RING, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.fill();
    if (bgIsDark) {
      // A black disk vanishes on a dark page; outline the horizon
      ctx.strokeStyle = rgba(rim, 0.5);
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.font = "10px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = rgba(rim, 0.7);
    ctx.fillText(`m=${Math.round(hole.mass)}`, x, y + R * PHOTON_RING + 14);
  }
}

function drawHud() {
  if (!blackHoles.length && !eaten && !paused) return;
  const total = blackHoles.reduce((sum, h) => sum + h.mass, 0);
  const parts = [
    `holes ${blackHoles.length}`,
    `mass ${Math.round(total)}`,
    `eaten ${eaten} letters`,
  ];
  if (paused) parts.push("paused");
  ctx.font = "10px 'Courier New', monospace";
  ctx.textAlign = "left";
  ctx.fillStyle = bgIsDark ? "rgba(235, 235, 235, 0.7)" : "rgba(60, 60, 60, 0.7)";
  ctx.fillText(parts.join(" · ").toUpperCase(), 20, canvas.height - 26);
}

// Cursor position
let mouse = {
  x: canvas.width / 2,
  y: canvas.height / 2,
};

// Particle class
class Particle {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.mass = 1;
    this.radius = 1.2;
    // Random slow drift like dust
    this.driftX = (Math.random() - 0.5) * 0.1;
    this.driftY = (Math.random() - 0.5) * 0.1;
    this.time = Math.random() * 1000;
    this.baseAlpha = 0.25 + Math.random() * 0.2;
    this.orbit = null;
    // Render state from the last step
    this.rate = 1; // time dilation
    this.heat = 0; // inner disk temperature, 0..1
    this.beam = 1; // Doppler beaming
  }

  applyForce(fx, fy) {
    this.vx += fx / this.mass;
    this.vy += fy / this.mass;
  }

  update(h) {
    // Time runs slower near a horizon; everything below uses local time
    let rate = 1;
    for (const hole of blackHoles) {
      const d = Math.hypot(hole.x - scrollX - this.x, hole.y - scrollY - this.y);
      if (d < holeRange(hole)) rate = Math.min(rate, timeRate(hole, d));
    }
    this.rate = rate;
    h *= Math.max(rate, MIN_TIME_RATE);

    this.time += 0.01 * h;

    // Calculate distance to mouse
    const dx = mouse.x - this.x;
    const dy = mouse.y - this.y;
    const distSq = dx * dx + dy * dy;
    const dist = Math.sqrt(distSq);

    // Only apply gravitational force if mouse is close enough
    const interactionRadius = 200;
    if (dist < interactionRadius && dist > 1) {
      const force = (G / distSq) * h;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      this.applyForce(fx, fy);
    }

    // Black holes: disk dynamics inside their range, swallowed at the horizon
    let near = false;
    this.heat = 0;
    this.beam = 1;
    for (const hole of blackHoles) {
      const p = pull(
        hole.x - scrollX, hole.y - scrollY, hole.mass,
        this.x, this.y, BH_G, PARTICLE_MAX_ACCEL,
      );
      if (p.dist < hole.radius) {
        absorb(hole, this);
        return;
      }
      if (p.dist < holeRange(hole)) {
        near = true;
        orbitalStep(this, hole, p, h);
        // Disk temperature falls off as r^-3/4
        const heat = Math.min(1, Math.pow((hole.radius * PHOTON_RING) / p.dist, 0.75));
        if (heat > this.heat) {
          this.heat = heat;
          this.beam = 1 + Math.max(-0.6, Math.min(0.6, (this.vy - hole.vy) / 6));
        }
      }
    }

    // Particle-to-particle attraction
    if (particleAttractionEnabled) {
      particles.forEach((other) => {
        if (other === this) return;

        const dx2 = other.x - this.x;
        const dy2 = other.y - this.y;
        const distSq2 = dx2 * dx2 + dy2 * dy2;
        const dist2 = Math.sqrt(distSq2);

        // Apply weaker force for particle-to-particle (to avoid clustering too much)
        if (dist2 > 5 && dist2 < 150) {
          const force = ((G * 0.02) / distSq2) * h; // Much weaker than cursor attraction
          const fx2 = (dx2 / dist2) * force;
          const fy2 = (dy2 / dist2) * force;

          this.applyForce(fx2, fy2);
        }
      });
    }

    // Apply slow drift (like dust floating)
    this.vx += (this.driftX + Math.sin(this.time) * 0.01) * h;
    this.vy += (this.driftY + Math.cos(this.time * 0.7) * 0.01) * h;

    // Apply strong damping to return to slow drift
    const damping = Math.pow(near ? ORBIT_DAMPING : 0.95, h);
    this.vx *= damping;
    this.vy *= damping;

    // Update position
    this.x += this.vx * h;
    this.y += this.vy * h;

    // Elastic collision with text: mirror the position across the nearest
    // face and flip the normal velocity component (speed is preserved).
    // Drift flips too, or it would keep pinning the particle to the text.
    for (let i = 0; i < textObstacles.length; i++) {
      const rect = textObstacles[i];
      const margin = 2;
      const left = rect.left - margin;
      const right = rect.right + margin;
      const top = rect.top - margin;
      const bottom = rect.bottom + margin;
      if (this.x > left && this.x < right && this.y > top && this.y < bottom) {
        const pushLeft = this.x - left;
        const pushRight = right - this.x;
        const pushUp = this.y - top;
        const pushDown = bottom - this.y;
        const minPush = Math.min(pushLeft, pushRight, pushUp, pushDown);
        if (minPush === pushLeft) {
          this.x = left - pushLeft;
          this.vx = -Math.abs(this.vx);
          this.driftX = -Math.abs(this.driftX);
        } else if (minPush === pushRight) {
          this.x = right + pushRight;
          this.vx = Math.abs(this.vx);
          this.driftX = Math.abs(this.driftX);
        } else if (minPush === pushUp) {
          this.y = top - pushUp;
          this.vy = -Math.abs(this.vy);
          this.driftY = -Math.abs(this.driftY);
        } else {
          this.y = bottom + pushDown;
          this.vy = Math.abs(this.vy);
          this.driftY = Math.abs(this.driftY);
        }
      }
    }

    // Wrap around edges
    if (this.x < -10) this.x = canvas.width + 10;
    if (this.x > canvas.width + 10) this.x = -10;
    if (this.y < -10) this.y = canvas.height + 10;
    if (this.y > canvas.height + 10) this.y = -10;
  }

  // Subtle pulsing alpha like dust catching light
  alpha() {
    return this.baseAlpha + Math.sin(this.time * 0.5) * 0.05;
  }

  // Plain dust is drawn in batches; only dust near a hole is drawn alone
  isPlain() {
    return this.heat === 0 && this.rate >= REDSHIFT_FROM;
  }

  draw(x, y) {
    const pulse = Math.sin(this.time * 0.5) * 0.05;
    // Hot inner disk glows (brighter on the approaching side), and light
    // from near the horizon comes out dimmer and redder
    const heat = Math.min(1, this.heat * this.beam);
    const redshift = redshiftAmount(this.rate);
    const color = mix(mix(particleColor, HOT, heat), REDSHIFT, redshift);
    const alpha = (this.baseAlpha + pulse + heat * 0.4) * Math.max(this.rate, 0.3);

    ctx.fillStyle = rgba(color, alpha);

    ctx.beginPath();
    ctx.arc(x, y, this.radius * (1 + heat * 0.5), 0, Math.PI * 2);
    ctx.fill();
  }
}

// Create particles
let particles = [];

function createParticles(count) {
  updateTextObstacles();
  for (let i = 0; i < count; i++) {
    const pos = freePosition();
    particles.push(new Particle(pos.x, pos.y));
  }
}

// Initialize particles
createParticles(200);

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
// Mouse tracking
window.addEventListener("mousemove", (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
});

// Touch support for mobile. Passive so the page still scrolls; only a hole
// drag blocks scrolling (see touchmove below).
window.addEventListener(
  "touchstart",
  (e) => {
    mouse.x = e.touches[0].clientX;
    mouse.y = e.touches[0].clientY;
  },
  { passive: true },
);
window.addEventListener(
  "touchmove",
  (e) => {
    mouse.x = e.touches[0].clientX;
    mouse.y = e.touches[0].clientY;
    if (grab) e.preventDefault();
  },
  { passive: false },
);

// Grab a hole to drag and throw it; click empty space to spawn one
let grab = null;
let suppressClick = false;

function isInteractive(target) {
  return target.closest(
    "a, button, input, label, select, textarea, .controls, .config-toggle",
  );
}

function holeAt(x, y) {
  return blackHoles.find(
    (h) => Math.hypot(h.x - x, h.y - y) < Math.max(h.radius * PHOTON_RING, 14),
  );
}

window.addEventListener("pointerdown", (e) => {
  if (!holesEnabled || e.button !== 0 || isInteractive(e.target)) return;
  const hole = holeAt(e.pageX, e.pageY);
  if (!hole) return;
  grab = { hole, x: e.pageX, y: e.pageY, t: performance.now(), moved: false };
  hole.vx = 0;
  hole.vy = 0;
  e.preventDefault(); // no text selection while dragging
});

window.addEventListener("pointermove", (e) => {
  if (!grab) return;
  const now = performance.now();
  const frames = Math.max((now - grab.t) / FRAME_MS, 0.1);
  const hole = grab.hole;
  // Smoothed pointer velocity becomes the throw velocity on release
  hole.vx = hole.vx * 0.5 + ((e.pageX - grab.x) / frames) * 0.5;
  hole.vy = hole.vy * 0.5 + ((e.pageY - grab.y) / frames) * 0.5;
  hole.x = e.pageX;
  hole.y = e.pageY;
  grab.x = e.pageX;
  grab.y = e.pageY;
  grab.t = now;
  grab.moved = true;
});

function releaseGrab() {
  if (!grab) return;
  const hole = grab.hole;
  const speed = Math.hypot(hole.vx, hole.vy);
  if (speed > BH_MAX_THROW) {
    hole.vx *= BH_MAX_THROW / speed;
    hole.vy *= BH_MAX_THROW / speed;
  }
  suppressClick = true; // the click that follows a grab shouldn't spawn
  grab = null;
}
window.addEventListener("pointerup", releaseGrab);
window.addEventListener("pointercancel", releaseGrab);

window.addEventListener("click", (e) => {
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  if (!holesEnabled || restoring || isInteractive(e.target)) return;
  // Clicking on text is for selecting it, not for making black holes
  if (TEXT_BLOCKS.some((el) => el.contains(e.target))) return;
  if (blackHoles.length >= MAX_MANUAL_HOLES) return;
  blackHoles.push(makeHole(e.pageX, e.pageY, SPAWN_MASS));
  addWave(e.pageX, e.pageY, 0.5);
});

// Control panel event listeners
document.getElementById("bgColor").addEventListener("input", (e) => {
  setBackground(e.target.value);
  document.body.style.background = backgroundColor;
});

document.getElementById("particleColor").addEventListener("input", (e) => {
  particleColor = hexToRgb(e.target.value);
});

document.getElementById("gravity").addEventListener("input", (e) => {
  G = parseInt(e.target.value);
  document.getElementById("gravityValue").textContent = G;
});

document.getElementById("mergeCount").addEventListener("input", (e) => {
  mergeCount = parseInt(e.target.value);
  document.getElementById("mergeValue").textContent = mergeCount;
});

document.getElementById("particleCount").addEventListener("input", (e) => {
  const newCount = parseInt(e.target.value);
  document.getElementById("countValue").textContent = newCount;

  // Adjust particle count
  if (newCount > particles.length) {
    createParticles(newCount - particles.length);
  } else if (newCount < particles.length) {
    particles = particles.slice(0, newCount);
  }
});

document
  .getElementById("particleAttraction")
  .addEventListener("change", (e) => {
    particleAttractionEnabled = e.target.checked;
  });

document.getElementById("connectDistance").addEventListener("input", (e) => {
  connectionDistance = parseInt(e.target.value);
  document.getElementById("connectValue").textContent = connectionDistance;
});

const holesToggle = document.getElementById("blackHolesEnabled");
holesToggle.checked = holesEnabled;
holesToggle.addEventListener("change", (e) => {
  holesEnabled = e.target.checked;
  if (!holesEnabled) bigBang();
});

document.getElementById("bigBang").addEventListener("click", bigBang);
document.getElementById("clearHoles").addEventListener("click", clearHoles);

const pauseButton = document.getElementById("pauseSim");
pauseButton.addEventListener("click", () => {
  paused = !paused;
  pauseButton.textContent = paused ? "resume" : "pause";
});

// Config toggle button
document.getElementById("configToggle").addEventListener("click", () => {
  document.getElementById("controls").classList.toggle("open");
});

// Animation loop
function animate(now) {
  const dt = Math.min((now - lastTime) / FRAME_MS, MAX_FRAME_STEP);
  lastTime = now;

  updateTextObstacles();
  if (!paused && dt > 0) {
    splitNearbyBlocks();
    formBlackHoles();
    const steps = Math.ceil(dt);
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      updateBlackHoles(h);
      stepLetters(h);
      updateWaves(h);
      particles.forEach((particle) => particle.update(h));
    }
  }
  renderLetters();

  // Clear canvas completely for clean dust effect
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Light bends around the holes: draw everything at its lensed position
  computeSeen();
  const n = particles.length;

  // Connections, batched into a few alpha levels: one stroke per level
  // instead of one per line
  if (connectionDistance > 0) {
    ctx.lineWidth = 0.5;
    const paths = Array.from({ length: LINE_ALPHA_LEVELS }, () => new Path2D());
    const used = new Array(LINE_ALPHA_LEVELS).fill(false);
    const maxD2 = connectionDistance * connectionDistance;

    for (let i = 0; i < n; i++) {
      const a = particles[i];
      for (let j = i + 1; j < n; j++) {
        const b = particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= maxD2) continue;
        // Fade the line based on distance
        const fade = 1 - Math.sqrt(d2) / connectionDistance;
        const level = Math.min(LINE_ALPHA_LEVELS - 1, (fade * LINE_ALPHA_LEVELS) | 0);
        paths[level].moveTo(seenX[i], seenY[i]);
        paths[level].lineTo(seenX[j], seenY[j]);
        used[level] = true;
      }
    }
    for (let k = 0; k < LINE_ALPHA_LEVELS; k++) {
      if (!used[k]) continue;
      ctx.strokeStyle = rgba(particleColor, ((k + 0.5) / LINE_ALPHA_LEVELS) * 0.3);
      ctx.stroke(paths[k]);
    }
  }

  // Dust: plain particles batched by alpha level, hot/redshifted ones alone
  const dots = Array.from({ length: DOT_ALPHA_LEVELS }, () => new Path2D());
  const dotUsed = new Array(DOT_ALPHA_LEVELS).fill(false);
  for (let i = 0; i < n; i++) {
    const p = particles[i];
    if (!p.isPlain()) {
      p.draw(seenX[i], seenY[i]);
      continue;
    }
    const level = Math.max(0, Math.min(DOT_ALPHA_LEVELS - 1, Math.round(p.alpha() / DOT_ALPHA_STEP)));
    dots[level].moveTo(seenX[i] + p.radius, seenY[i]);
    dots[level].arc(seenX[i], seenY[i], p.radius, 0, Math.PI * 2);
    dotUsed[level] = true;
  }
  for (let k = 0; k < DOT_ALPHA_LEVELS; k++) {
    if (!dotUsed[k]) continue;
    ctx.fillStyle = rgba(particleColor, k * DOT_ALPHA_STEP);
    ctx.fill(dots[k]);
  }

  drawWaves();
  drawBlackHoles();
  drawHud();

  requestAnimationFrame(animate);
}

// Handle window resize
window.addEventListener("resize", () => {
  resizeCanvas();
  rebaseLetters();
});

// Start animation
requestAnimationFrame(animate);
