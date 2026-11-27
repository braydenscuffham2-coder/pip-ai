// Pip Portal: the office. Loaded by portal.html after sign-in (see loadPart there).
// The office is a set of pre-rendered scenes made from the Higgsfield concept pictures (public/portal-art/sc/), not
// live 3D. Moving around is a zoom and a cross-fade the compositor draws on its own, so it runs at the screen's full
// frame rate on any machine. The only live 3D is Pip, from his original code (portal-pip.js), on one small canvas.
// Teammates are cut-outs, one per seat, in their own colour; a teammate featured in a close-up gets a scene recoloured
// to match. Everything you click is ordinary HTML from portal.html, wired to the same actions as the rest of the Portal.
// Edit positions here in percent of the 16:9 picture.

function threeAddons() { return null; } // the 3D office needed these; the scenes do not

function createOffice(THREE, X, opts) {
  "use strict";
  const ART = "/portal-art/sc/";
  const RM = () => !!(opts.reduce && opts.reduce());
  const PHONE = () => innerWidth < 720 || innerHeight < 560;
  const TEAM = { violet: "#8f7bff", teal: "#2fc4b2", amber: "#e9a534", rose: "#ff7d98", sky: "#5b9dff", green: "#6fc36a" };
  const colorName = (hex) => { hex = String(hex || "").toLowerCase(); for (const [k, v] of Object.entries(TEAM)) if (v === hex) return k; let best = "violet", bd = 1e9; const c = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); const a = /^#[0-9a-f]{6}$/.test(hex) ? c(hex) : [143, 123, 255]; for (const [k, v] of Object.entries(TEAM)) { const b = c(v), d = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2; if (d < bd) { bd = d; best = k; } } return best; };
  const small = () => PHONE() || innerWidth * (devicePixelRatio || 1) < 1500; // smaller pictures where they look the same
  const src = (name) => ART + name + (small() ? "-s" : "") + ".webp";

  // ---------- the scenes, in percent of each picture ----------
  // pip: where Pip floats (x, y of his centre, w = his width). focus: where a glide into this scene aims.
  // screen: the monitor's four corners, for a teammate's screen. seats: where teammates sit on the floor.
  const PIP_K = 1.6; // his canvas is wider than he is: the camera leaves room for a hop and a wave
  const SCENES = {
    home: { plate: "home-empty", pip: [50, 54, 8.2], focus: [50, 50], halos: [[24.5, 14.5, 15], [77.5, 14.5, 15], [34.7, 21.5, 7], [67.8, 21.5, 7], [42, 25.6, 4], [59.5, 25.6, 4]] },
    desk: { plate: (c) => "desk-" + c, pip: [73, 17, 6.5], focus: [46, 42], screen: [[28.4, 24.0], [64.0, 23.8], [63.6, 58.9], [28.2, 59.4]], halos: [[30.5, 12.2, 10], [86.5, 12.2, 10]] },
    deskNeeds: { plate: (c) => "setup-" + c, pip: [40.5, 47.5, 10.5], focus: [60, 40], screen: [[51.7, 21.2], [80.4, 20.6], [79.8, 52.6], [52.0, 53.6]], halos: [[30, 11, 10], [77, 11, 10]] },
    deskCut: { plate: (c) => "cables-" + c, pip: [66, 38, 8], focus: [36, 55], float: [79, 21, 25], halos: [[15, 11, 12], [80, 11, 12]] },
    deskPaused: { plate: (c) => "paused-" + c, pip: [50, 40, 7], focus: [26, 50], float: [50, 76, 23], halos: [[23, 11, 12], [75, 11, 12]] },
    letgo: { plate: (c) => "letgo-" + c, pip: [41, 37, 7.5], focus: [58, 45], halos: [[23, 9, 12], [76, 9, 12]] },
    front: { plate: "front", pip: [47.5, 41, 8], focus: [45, 52], halos: [[28.5, 3, 12], [55, 10, 12]] },
    meter: { plate: "meter-empty", pip: [84, 47, 9.5], focus: [46, 45], halos: [[11.8, 15.1, 15.8], [33.2, 17.4, 10.4]], tube: [43.4, 16.2, 5.6, 45.4] },
    contract: { plate: "contract", pip: [31, 44, 13], focus: [55, 50], halos: [[24, 12, 14], [77, 12, 14]] },
    tools: { plate: "tools", pip: [72, 56, 8], focus: [50, 40], halos: [[16, 11, 12], [84, 11, 12]] },
    comms: { plate: "comms", pip: [36.5, 44, 7], focus: [52, 45], halos: [[25, 9, 13], [75, 9, 13]] },
    exit: { plate: "exit", pip: [50, 57, 6.5], focus: [24, 38], halos: [[13, 6, 10], [60, 3, 18]] },
    founder: { plate: "exit", pip: [50, 57, 6.5], focus: [72, 28], zoom: 1.5, halos: [] },
  };
  // the four seats you can see from the elevator; more teammates sit further down the aisle, in the roster
  const SEATS = [
    { x: 18.6, b: 64.2, h: 23.5, tag: [16, 38], flip: false, fg: [[23.3, 52.6], [33.3, 52.6], [33.5, 61.2], [37.3, 62.6], [37.3, 72.5], [12.5, 72.5], [12.5, 66.5], [14.2, 62.9], [20.4, 62.5], [23.3, 61.6]] },
    { x: 76.6, b: 58.6, h: 16.5, tag: [78, 40], flip: true, fg: [[64.2, 47.1], [71.7, 47.1], [71.7, 55.2], [72.6, 56], [81.2, 58.2], [81.2, 64.5], [62.3, 64.5], [62.3, 58.1], [64.2, 57.1]] },
    { x: 32.6, b: 53.8, h: 12, tag: [33.5, 30], flip: false, fg: [[35.3, 44.6], [41.1, 44.6], [41.2, 51.4], [43, 52.4], [43, 56.4], [29.3, 56.4], [29.3, 53.6], [35.3, 52.1]] },
    { x: 65, b: 48.9, h: 9.6, tag: [65.5, 32], flip: true, fg: [[58.7, 42.1], [63.4, 42.1], [63.4, 47.8], [66.3, 48.8], [66.3, 52.8], [57.8, 52.8], [57.8, 48.6]] },
  ];

  // ---------- the stage ----------
  const css = document.createElement("style"); css.textContent = CSS_TEXT(); document.head.append(css);
  const root = document.createElement("div"); root.className = "sc-root"; opts.host.append(root);
  const back = document.createElement("div"); back.className = "sc-back"; back.setAttribute("aria-hidden", "true"); root.append(back); // the same picture, blurred, behind a phone's narrower window
  const layer = document.createElement("div"); layer.className = "sc-layer fl-css"; // a teammate's screen, mapped onto the monitor
  const doors = document.createElement("div"); doors.className = "sc-doors"; doors.innerHTML = "<i></i><i></i>"; doors.setAttribute("aria-hidden", "true");
  const scenes = new Map();
  let cur = null, mode = "floor", focusId = null, stationId = null, active = true, panel = false, deskVariant = null, deskColor = "violet", letGoOn = false;
  let model = { agents: [] };

  function sceneEl(key, plateName) {
    const id = key + ":" + plateName;
    if (scenes.has(id)) return scenes.get(id);
    const cfg = SCENES[key], el = document.createElement("section"); el.className = "sc off"; el.dataset.key = key;
    const img = new Image(); img.className = "sc-plate"; img.alt = ""; img.decoding = "async"; img.src = src(plateName); el.append(img);
    for (const [x, y, w] of cfg.halos || []) { const i = document.createElement("i"); i.className = "sc-halo"; i.style.cssText = `--x:${x}%;--y:${y}%;--w:${w}%;--d:-${(x % 5).toFixed(1)}s`; el.append(i); }
    if (key === "home" || key === "letgo" || key === "deskPaused") { const d = document.createElement("div"); d.className = "sc-dust"; d.innerHTML = Array.from({ length: PHONE() ? 10 : 22 }, (_, k) => `<i style="--x:${(k * 37) % 92 + 4}%;--y:${(k * 53) % 55 + 22}%;--s:${3 + (k % 4)}px;--t:${8 + (k % 6)}s;--d:-${k * 0.7}s;--dx:${((k * 13) % 50) - 25}px"></i>`).join(""); el.append(d); }
    if (cfg.tube) { const t = document.createElement("div"); t.className = "sc-tube"; t.style.cssText = `--x:${cfg.tube[0]}%;--y:${cfg.tube[1]}%;--w:${cfg.tube[2]}%;--h:${cfg.tube[3]}%`; t.innerHTML = `<b class="sc-liquid"><s></s>${Array.from({ length: 10 }, (_, k) => `<i style="--x:${10 + (k * 23) % 75}%;--s:${4 + (k % 4)}px;--t:${3 + (k % 4)}s;--d:-${k * 0.5}s"></i>`).join("")}</b>`; el.append(t); }
    const seats = document.createElement("div"); seats.className = "sc-seats"; el.append(seats);
    const pins = document.createElement("div"); pins.className = "sc-pins fl-tags"; el.append(pins);
    const pipSlot = document.createElement("div"); pipSlot.className = "sc-pip"; pipSlot.style.cssText = `--x:${cfg.pip[0]}%;--y:${cfg.pip[1]}%;--w:${(cfg.pip[2] * PIP_K).toFixed(2)}%`; el.append(pipSlot);
    const s = { id, key, cfg, el, img, seats, pins, pipSlot, decoded: img.decode().catch(() => null) };
    root.append(el); scenes.set(id, s); return s;
  }
  const plateOf = (key) => { const p = SCENES[key].plate; return typeof p === "function" ? p(deskColor) : p; };

  // ---------- sizing: the picture covers the window on a computer; on a phone it is a wide window at the top ----------
  let box = { w: 0, h: 0, x: 0, y: 0 };
  function measure() {
    const W = innerWidth, H = innerHeight;
    if (PHONE() && W < H) { const h = Math.min(H * 0.56, W * 1.25), w = (h * 16) / 9; box = { w, h, x: (W - w) / 2, y: Math.max(70, H * 0.085) }; }
    else { const w = Math.max(W, (H * 16) / 9), h = (w * 9) / 16; box = { w, h, x: (W - w) / 2, y: (H - h) / 2 }; }
    root.style.setProperty("--bw", box.w + "px"); root.style.setProperty("--bh", box.h + "px"); root.style.setProperty("--bx", box.x + "px"); root.style.setProperty("--by", box.y + "px");
    root.classList.toggle("tall", PHONE() && W < H);
  }
  // where the active scene sits: a phone window slides so the scene's focus is centred; a panel pushes it aside
  function rest(s) {
    const f = s.cfg.focus || [50, 50], zoom = s.cfg.zoom || 1;
    let dx = 0, dy = 0;
    if (root.classList.contains("tall")) { const m = Math.max(0, (box.w - innerWidth) / 2); dx = Math.max(-m, Math.min(m, (0.5 - f[0] / 100) * box.w)); }
    else if (zoom > 1) { dx = (0.5 - f[0] / 100) * box.w * (zoom - 1); dy = (0.5 - f[1] / 100) * box.h * (zoom - 1); }
    if (panel && !PHONE()) dx -= Math.min(600, innerWidth - 28) / 2 - 20;
    return { dx, dy, s: zoom * 1.012 };
  }
  let par = { x: 0, y: 0, tx: 0, ty: 0 };
  function place(s, extra) {
    const r = rest(s), p = RM() || root.classList.contains("tall") ? { x: 0, y: 0 } : par;
    s.el.style.transform = `translate3d(${(r.dx - p.x * 14).toFixed(2)}px,${(r.dy - p.y * 9).toFixed(2)}px,0) scale(${(r.s * (extra || 1)).toFixed(4)})`;
  }

  // ---------- teammates on the floor ----------
  const POSE = { work: "work", type: "work", idle: "work", scratch: "work", build: "work", sleep: "sleep", wave: "wave" };
  function syncSeats(home) {
    const list = model.agents.filter((a) => a.look !== "open").slice(0, SEATS.length);
    const keep = new Set();
    list.forEach((a, i) => {
      const seat = SEATS[i], c = colorName(a.hex); keep.add(a.id);
      let g = home.seats.querySelector(`[data-id="${CSS.escape(a.id)}"]`);
      if (!g) {
        g = document.createElement("div"); g.className = "sc-ag"; g.dataset.id = a.id;
        g.innerHTML = `<i class="sc-glow"></i><img class="sc-body" alt="" decoding="async"><b class="sc-q" aria-hidden="true">?</b><span class="sc-z" aria-hidden="true"><i>z</i><i>z</i><i>z</i></span>`;
        const fg = document.createElement("img"); fg.className = "sc-fg"; fg.alt = ""; fg.decoding = "async"; g._fg = fg;
        g.addEventListener("click", () => opts.onPick && opts.onPick(a.id)); g.addEventListener("pointerenter", () => hover(a.id));
        home.seats.append(g, fg);
      }
      g.style.cssText = `--x:${seat.x}%;--b:${seat.b}%;--h:${seat.h}%;--d:-${(i * 0.9).toFixed(1)}s`;
      g.classList.toggle("flip", seat.flip);
      const pose = g._wave && performance.now() < g._wave ? "wave" : POSE[a.look] || "work";
      const want = ART + "agent-" + pose + "-" + c + ".webp"; const body = g.querySelector(".sc-body"); if (body.getAttribute("src") !== want) body.src = want;
      for (const k of ["needs", "paused", "build", "live", "ready"]) g.classList.toggle("k-" + k, a.kind === k || (k === "needs" && a.light === "needs") || (k === "build" && a.look === "build") || (k === "paused" && a.look === "sleep"));
      g._fg.src = src(home.cfg.plate); g._fg.style.clipPath = "polygon(" + seat.fg.map(([x, y]) => x + "% " + y + "%").join(",") + ")";
      g.style.zIndex = String(10 + Math.round(seat.b));
      g._fg.style.zIndex = String(11 + Math.round(seat.b));
      g._seat = seat;
    });
    for (const g of [...home.seats.querySelectorAll(".sc-ag")]) if (!keep.has(g.dataset.id)) { g._fg.remove(); g.remove(); }
  }
  function hover(id) {
    const home = homeScene(); const g = home && home.seats.querySelector(`[data-id="${CSS.escape(id)}"]`); if (!g || g.classList.contains("k-paused") || g.classList.contains("k-build")) return;
    if (g._wave && performance.now() < g._wave) return;
    g._wave = performance.now() + 1500; syncSeats(home); clearTimeout(g._wt); g._wt = setTimeout(() => syncSeats(home), 1550);
  }
  const homeScene = () => sceneEl("home", SCENES.home.plate);

  // tags: a teammate's tag floats over their head, the stations line up under the ceiling like a directory
  function syncPins(home) {
    home.pins.replaceChildren();
    const list = model.agents.filter((a) => a.look !== "open").slice(0, SEATS.length);
    if (root.classList.contains("tall")) return; // a phone lists the team and the stations under the scene instead
    list.forEach((a, i) => { const el = (model.tags || new Map()).get(a.id); if (!el) return; const s = SEATS[i]; pin(home, el, s.tag[0], s.tag[1], "tag"); });
    const more = model.agents.filter((a) => a.look !== "open").length - list.length;
    if (more > 0) { const m = document.createElement("span"); m.className = "sc-more card"; m.textContent = "+" + more + " more down the aisle"; pin(home, m, 50, 40.5, "tag"); }
    const dir = document.createElement("nav"); dir.className = "sc-dir"; dir.setAttribute("aria-hidden", "true");
    for (const [, el] of model.stationTags || []) dir.append(el);
    const top = opts.safeTop ? opts.safeTop() : 0; // just under the header, whatever the window's shape
    pin(home, dir, 50, Math.max(4, ((top + 12 - box.y) / box.h) * 100), "dir");
    if (model.bubble) pin(home, model.bubble, SCENES.home.pip[0], SCENES.home.pip[1] + SCENES.home.pip[2] * 0.95, "say");
  }
  function pin(s, el, x, y, kind) { el.classList.add("sc-pin", "pin-" + kind); el.style.setProperty("--px", x + "%"); el.style.setProperty("--py", y + "%"); s.pins.append(el); }
  const stack = document.createElement("div"); stack.className = "sc-stack"; root.append(stack); // a phone's cards, under its scene window
  function syncStationPins(s, key) {
    s.pins.replaceChildren(); if (cur === s || !cur) stack.replaceChildren();
    const tall = root.classList.contains("tall");
    for (const p of (model.cards && model.cards[key]) || []) {
      if (tall && p.kind !== "label") { if (cur === s) stack.append(p.el); continue; }
      pin(s, p.el, p.x, p.y, p.kind || "card");
    }
  }

  // ---------- Pip: the original engine, one canvas that moves to whichever scene is showing ----------
  let eng = null, pipCanvas = null, pipT0 = performance.now();
  async function startPip() {
    if (RM() || typeof createPipEngine !== "function") return;
    try {
      pipCanvas = document.createElement("canvas"); pipCanvas.className = "sc-pip-gl"; pipCanvas.setAttribute("aria-hidden", "true");
      eng = createPipEngine(THREE, { canvas: pipCanvas });
    } catch (e) { eng = null; pipCanvas = null; }
  }
  function pipTo(s) {
    if (!pipCanvas) { s.pipSlot.classList.add("still"); return; }
    if (pipCanvas.parentElement !== s.pipSlot) { s.pipSlot.append(pipCanvas); }
    requestAnimationFrame(() => { const r = s.pipSlot.getBoundingClientRect(); if (eng && r.width > 2) eng.resize(r.width, r.height); });
  }

  // ---------- moving between scenes: zoom into the place you picked, cross-fade, settle ----------
  let moving = null, settleAt = 0;
  async function show(key, plateName, how = {}) {
    measure();
    const next = sceneEl(key, plateName || plateOf(key));
    if (key === "home") { syncSeats(next); syncPins(next); } else syncStationPins(next, key);
    if (cur !== next) layer.classList.remove("on");
    if (cur === next) { place(next); pipTo(next); return; }
    await Promise.race([next.decoded, new Promise((r) => setTimeout(r, 900))]);
    const from = cur; cur = next; pipTo(next); stack.replaceChildren(); if (key !== "home") syncStationPins(next, key);
    next.el.classList.remove("off"); root.dataset.scene = key; back.style.backgroundImage = `url("${next.img.currentSrc || next.img.src}")`;
    if (!from || RM()) { if (from) from.el.classList.add("off"); place(next); return; }
    const out = !!how.out, f = (how.at || next.cfg.focus || [50, 50]);
    const r0 = rest(from), r1 = rest(next), dur = how.quick ? 560 : 860;
    from.el.style.transformOrigin = (out ? 50 : f[0]) + "% " + (out ? 50 : f[1]) + "%"; next.el.style.transformOrigin = f[0] + "% " + f[1] + "%";
    const t0 = `translate3d(${r0.dx}px,${r0.dy}px,0) scale(${r0.s})`, t1 = `translate3d(${r0.dx}px,${r0.dy}px,0) scale(${r0.s * (out ? 0.93 : 1.32)})`;
    const n0 = `translate3d(${r1.dx}px,${r1.dy}px,0) scale(${r1.s * (out ? 1.16 : 1.1)})`, n1 = `translate3d(${r1.dx}px,${r1.dy}px,0) scale(${r1.s})`;
    root.classList.add("moving"); moving = true;
    const ease = "cubic-bezier(.16,1,.3,1)";
    const a = from.el.animate([{ transform: t0, opacity: 1 }, { transform: t1, opacity: 0 }], { duration: dur * 0.9, easing: ease, fill: "forwards" });
    const b = next.el.animate([{ transform: n0, opacity: 0 }, { transform: n1, opacity: 1 }], { duration: dur, delay: dur * 0.12, easing: ease, fill: "forwards" });
    await b.finished.catch(() => null);
    from.el.classList.add("off"); a.cancel(); b.cancel(); place(next); from.el.style.transformOrigin = next.el.style.transformOrigin = "";
    root.classList.remove("moving"); moving = false; settleAt = performance.now();
  }

  // ---------- a teammate's screen on the monitor ----------
  let screenEl = null;
  function mountScreen(id, el) {
    if (screenEl && screenEl !== el) screenEl.remove();
    screenEl = el || null;
    if (!el) { layer.classList.remove("on"); return; }
    el.classList.add("on", "settled"); layer.append(el); fitScreen();
  }
  function fitScreen() {
    if (!screenEl || !cur || mode !== "desk") { layer.classList.remove("on"); return; }
    const q = cur.cfg.screen, fl = cur.cfg.float; layer.classList.toggle("on", !!(q || fl)); layer.classList.toggle("flat", !q && !!fl);
    if (!q && !fl) return;
    const r = cur.el.getBoundingClientRect(), W = screenEl.offsetWidth || 1000, H = screenEl.offsetHeight || 600;
    if (!q) { const w = (fl[2] / 100) * r.width, h = (w * H) / W, x = r.left + (fl[0] / 100) * r.width - w / 2, y = r.top + (fl[1] / 100) * r.height - h / 2; screenEl.style.transformOrigin = "0 0"; screenEl.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) scale(${(w / W).toFixed(4)})`; return; }
    const pts = q.map(([x, y]) => [r.left + (x / 100) * r.width, r.top + (y / 100) * r.height]);
    screenEl.style.transformOrigin = "0 0"; screenEl.style.transform = homography(W, H, pts);
  }
  function homography(w, h, [[x0, y0], [x1, y1], [x2, y2], [x3, y3]]) { // maps the screen's rectangle onto the monitor's four corners
    const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    const den = dx1 * dy2 - dx2 * dy1, g = (dx3 * dy2 - dx2 * dy3) / den, hh = (dx1 * dy3 - dx3 * dy1) / den;
    const a = x1 - x0 + g * x1, b = x3 - x0 + hh * x3, c = x0, d = y1 - y0 + g * y1, e = y3 - y0 + hh * y3, f = y0;
    const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, hh / h, 0, 0, 1, 0, c, f, 0, 1];
    return "matrix3d(" + m.map((v) => +v.toFixed(9)).join(",") + ")";
  }

  // ---------- the frame loop: only parallax and Pip; everything else animates itself in CSS ----------
  let raf = 0, held = false;
  addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") { par.tx = e.clientX / innerWidth - 0.5; par.ty = e.clientY / innerHeight - 0.5; kick(); } }, { passive: true });
  function kick() { if (!raf && active) raf = requestAnimationFrame(loop); }
  function loop(t) {
    raf = 0; if (!active || document.hidden) return;
    par.x += (par.tx - par.x) * 0.07; par.y += (par.ty - par.y) * 0.07;
    if (cur && !moving && mode !== "desk") place(cur);
    if (eng && !held) eng.frame(t / 1000);
    if (mode === "desk" && performance.now() - settleAt < 1200) fitScreen();
    raf = requestAnimationFrame(loop);
  }
  document.addEventListener("visibilitychange", kick);
  addEventListener("resize", () => { measure(); if (cur) place(cur); if (cur) pipTo(cur); fitScreen(); if (cur && cur.key === "home") syncPins(cur); });

  // ---------- the arrival: elevator doors part onto your floor, once a day; a short glide otherwise ----------
  function enter(full = true) {
    const home = homeScene();
    show("home", SCENES.home.plate).then(() => {
      if (RM()) { opts.onEntered && opts.onEntered(); return; }
      if (full) {
        root.append(doors); doors.classList.remove("open"); void doors.offsetWidth;
        home.el.animate([{ transform: home.el.style.transform + " scale(1.07)" }, { transform: home.el.style.transform }], { duration: 2100, delay: 350, easing: "cubic-bezier(.16,1,.3,1)", fill: "backwards" });
        setTimeout(() => doors.classList.add("open"), 380);
        setTimeout(() => { doors.remove(); opts.onEntered && opts.onEntered(); }, 2300);
        home.seats.querySelectorAll(".sc-ag").forEach((g, i) => setTimeout(() => hover(g.dataset.id), 1200 + i * 160));
      } else {
        home.el.animate([{ opacity: 0.4, transform: home.el.style.transform + " scale(1.05)" }, { opacity: 1, transform: home.el.style.transform }], { duration: 900, easing: "cubic-bezier(.16,1,.3,1)" });
        setTimeout(() => opts.onEntered && opts.onEntered(), 900);
      }
    });
  }

  // once you're on the floor, fetch the stations' pictures quietly so the first glide to each one is instant
  function warm() {
    const go = () => { for (const k of ["front", "meter", "tools", "comms", "exit"]) { const i = new Image(); i.decoding = "async"; i.src = src(SCENES[k].plate); } };
    (window.requestIdleCallback || ((f) => setTimeout(f, 1200)))(go, { timeout: 4000 });
  }

  // ---------- keeping in step with the Portal ----------
  function sync(m) {
    const st = m.stations || {};
    model = Object.assign({}, m, { tags: new Map(m.tags || []), stationTags: st.tags || [], priced: !!st.priced, cards: m.cards || {} });
    root.classList.toggle("dim", !!m.dim);
    root.style.setProperty("--k", Math.max(0, Math.min(1, (st.meter && st.meter.frac) || 0)).toFixed(3));
    root.classList.toggle("warn", !!(st.meter && st.meter.warn));
    const home = homeScene(); syncSeats(home); if (cur === home) syncPins(home);
    if (cur && cur !== home) syncStationPins(cur, cur.key);
    kick();
  }
  const stationKey = (id) => (id === "meter" && model.priced ? "contract" : id);

  measure();
  const ready = (async () => { await startPip(); const home = homeScene(); await home.decoded; root.classList.add("ready"); kick(); setTimeout(warm, 2600); })();

  const api = {
    ready, layer, sync, enter, mountScreen, hover,
    get mode() { return mode; }, get tier() { return "scenes"; },
    floor() { mode = "floor"; focusId = null; stationId = null; letGoOn = false; panel = false; mountScreen(null, null); return show("home", SCENES.home.plate, { out: true }); },
    station(id) { const key = stationKey(id); if (!SCENES[key]) return Promise.resolve(); if (mode === "station" && stationId === id && cur && cur.key === key) { place(cur); return Promise.resolve(); } mode = "station"; stationId = id; focusId = null; return show(key, null); },
    panel(on) { if (panel === !!on) return; panel = !!on; root.classList.toggle("paneled", panel); if (cur) { cur.el.style.transition = "transform .7s cubic-bezier(.16,1,.3,1)"; place(cur); setTimeout(() => { if (cur) cur.el.style.transition = ""; }, 720); } },
    desk(id, variant) {
      const a = model.agents.find((x) => x.id === id); if (!a) return Promise.resolve();
      deskColor = colorName(a.hex); deskVariant = variant || a.variant || "normal";
      const key = deskVariant === "paused" ? "deskPaused" : deskVariant === "cut" ? "deskCut" : deskVariant === "needs" ? "deskNeeds" : "desk";
      const seat = SEATS[model.agents.filter((x) => x.look !== "open").indexOf(a)];
      mode = "desk"; focusId = id; letGoOn = false;
      return show(key, null, { at: seat ? [seat.x, seat.b - seat.h / 2] : null }).then(() => { settleAt = performance.now(); fitScreen(); });
    },
    letGo(id) { /* the goodbye plays when "Let go" is wired: show the let-go scene, then the floor without them */ const a = model.agents.find((x) => x.id === id); if (!a) return; deskColor = colorName(a.hex); show("letgo", null, { quick: true }); },
    letGoPreview(id, on) { if (on === letGoOn) return; letGoOn = !!on; const a = model.agents.find((x) => x.id === id); if (!a) return; if (on) { deskColor = colorName(a.hex); show("letgo", null, { quick: true }); } else if (focusId) api.desk(focusId, deskVariant); },
    // papers come out of the folders as HTML; the scene only steps back
    folderOut() { return Promise.resolve(); }, folderIn() {}, hoverFolder() {}, swapFolder() {},
    hold(on) { held = !!on; kick(); },
    setActive(on) { active = !!on; root.style.display = on ? "" : "none"; layer.style.display = on ? "" : "none"; if (on) kick(); },
    invalidate: kick, step() {},
    pip: {
      mood(m) { eng && eng.mood(m || "calm"); }, talk(s) { eng && eng.talk(s); }, happy(s) { eng && eng.happy(s); }, nod() { eng && eng.nod(); },
      hop() { eng && eng.hop(); }, wave() { eng && eng.wave(); }, trouble() { eng && eng.mood("concerned"); setTimeout(() => eng && eng.mood("calm"), 2600); }, party() { eng && eng.party(); },
    },
    dispose() { active = false; cancelAnimationFrame(raf); root.remove(); layer.remove(); css.remove(); if (eng) eng.dispose(); },
  };
  return api;
}

function CSS_TEXT() { return `
.sc-root{position:fixed;inset:0;z-index:0;overflow:hidden;background:#ece7f7;contain:strict}
.sc-back{position:absolute;inset:-60px;background:#ece7f7 center/cover no-repeat;filter:blur(30px) saturate(1.15) brightness(1.04);opacity:0;transition:opacity .6s}
.sc-root.tall .sc-back{opacity:.75}
.sc-root.tall .sc{border-radius:0 0 28px 28px;overflow:hidden;box-shadow:0 30px 60px -30px rgba(38,34,90,.35)}
.sc{position:absolute;left:var(--bx);top:var(--by);width:var(--bw);height:var(--bh);will-change:transform,opacity;backface-visibility:hidden}
.sc.off{display:none}
.sc-plate{position:absolute;inset:0;width:100%;height:100%;user-select:none;-webkit-user-drag:none;pointer-events:none}
.sc-root.dim .sc-plate{filter:saturate(.7) brightness(.92)}
.sc-halo{position:absolute;left:var(--x);top:var(--y);width:var(--w);height:calc(var(--w) * .2);transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(closest-side,rgba(255,255,255,0) 60%,rgba(255,255,255,.95) 80%,rgba(255,255,255,0) 100%);mix-blend-mode:screen;animation:sc-breathe 5.5s ease-in-out infinite;animation-delay:var(--d,0s);pointer-events:none}
@keyframes sc-breathe{0%,100%{opacity:.25}50%{opacity:.9}}
.sc-dust{position:absolute;inset:0;pointer-events:none}
.sc-dust i{position:absolute;left:var(--x);top:var(--y);width:var(--s);height:var(--s);border-radius:50%;background:radial-gradient(#fff8e6,rgba(255,248,230,0) 70%);animation:sc-drift var(--t) linear infinite;animation-delay:var(--d);opacity:0}
@keyframes sc-drift{0%{transform:translate(0,0);opacity:0}15%{opacity:.9}85%{opacity:.6}100%{transform:translate(var(--dx),-70px);opacity:0}}
/* the meter's tube: the plate's glass is empty; this is the liquid */
.sc-tube{position:absolute;left:var(--x);top:var(--y);width:var(--w);height:var(--h);border-radius:999px;overflow:hidden;pointer-events:none}
.sc-liquid{position:absolute;left:6%;right:6%;bottom:2%;height:calc(var(--k,0) * 96%);border-radius:40% 40% 999px 999px/12px 12px 999px 999px;background:linear-gradient(180deg,rgba(150,245,228,.92),rgba(64,220,200,.88));box-shadow:inset 0 0 18px rgba(255,255,255,.55),0 0 26px rgba(94,234,217,.55);transition:height 1.4s cubic-bezier(.16,1,.3,1) .2s}
.sc-liquid s{position:absolute;left:0;right:0;top:-3px;height:8px;border-radius:50%;background:rgba(220,255,250,.95)}
.sc-liquid i{position:absolute;bottom:0;left:var(--x);width:var(--s);height:var(--s);border-radius:50%;background:radial-gradient(circle at 35% 35%,#fff,rgba(255,255,255,.25) 60%,transparent 70%);animation:sc-rise var(--t) ease-in infinite;animation-delay:var(--d)}
@keyframes sc-rise{0%{transform:translateY(0);opacity:0}10%{opacity:.95}100%{transform:translateY(-320px);opacity:0}}
.sc-root.warn .sc-tube .sc-liquid{background:linear-gradient(180deg,rgba(255,226,150,.95),rgba(242,176,42,.9));box-shadow:inset 0 0 18px rgba(255,255,255,.55),0 0 26px rgba(242,176,42,.5)}
/* teammates at their seats */
.sc-seats{position:absolute;inset:0}
.sc-ag{position:absolute;left:var(--x);top:var(--b);height:var(--h);aspect-ratio:.86;transform:translate(-50%,-100%);cursor:pointer}
.sc-ag .sc-body{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:50% 100%;transform-origin:50% 100%;animation:sc-bob 3.8s ease-in-out infinite;animation-delay:var(--d)}
.sc-ag.flip .sc-body{transform:scaleX(-1)}
.sc-ag.flip .sc-body{animation-name:sc-bob-f}
@keyframes sc-bob{0%,100%{transform:translateY(0) scale(1,1)}50%{transform:translateY(-2.5%) scale(.993,1.012)}}
@keyframes sc-bob-f{0%,100%{transform:scaleX(-1) translateY(0) scale(1,1)}50%{transform:scaleX(-1) translateY(-2.5%) scale(.993,1.012)}}
.sc-ag.k-paused .sc-body{animation-duration:6s}
.sc-glow{position:absolute;left:50%;bottom:-6%;width:150%;height:40%;transform:translateX(-50%);border-radius:50%;background:radial-gradient(closest-side,rgba(242,176,42,.55),rgba(242,176,42,0));opacity:0;transition:opacity .4s;animation:sc-pulse 2s ease-in-out infinite}
.sc-ag.k-needs .sc-glow{opacity:1}
@keyframes sc-pulse{0%,100%{transform:translateX(-50%) scale(.85);opacity:.55}50%{transform:translateX(-50%) scale(1.08);opacity:1}}
.sc-q{position:absolute;left:58%;top:-12%;font:italic 400 clamp(18px,2.6vw,40px)/1 "Instrument Serif",Georgia,serif;color:#ffb21f;text-shadow:0 2px 10px rgba(255,178,31,.45);opacity:0;animation:sc-q 2.2s ease-in-out infinite}
.sc-ag.k-needs .sc-q{opacity:1}
@keyframes sc-q{0%,100%{transform:translateY(0) rotate(-6deg)}50%{transform:translateY(-14%) rotate(6deg)}}
.sc-z{position:absolute;left:62%;top:2%;opacity:0;pointer-events:none}.sc-ag.k-paused .sc-z{opacity:1}
.sc-z i{position:absolute;left:0;top:0;font:italic 400 clamp(11px,1.3vw,20px)/1 "Instrument Serif",Georgia,serif;color:#9b8ee8;animation:sc-zz 3s ease-in infinite;opacity:0}
.sc-z i:nth-child(2){animation-delay:1s}.sc-z i:nth-child(3){animation-delay:2s}
@keyframes sc-zz{0%{transform:translate(0,0) scale(.6);opacity:0}20%{opacity:1}100%{transform:translate(160%,-220%) scale(1.3);opacity:0}}
.sc-ag.k-build .sc-body{filter:saturate(.2) brightness(1.15) drop-shadow(0 0 8px rgba(155,134,255,.9));opacity:.62;-webkit-mask:repeating-linear-gradient(180deg,#000 0 3px,rgba(0,0,0,.55) 3px 5px);mask:repeating-linear-gradient(180deg,#000 0 3px,rgba(0,0,0,.55) 3px 5px)}
.sc-fg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
/* Pip */
.sc-pip{position:absolute;left:var(--x);top:var(--y);width:var(--w);aspect-ratio:1;transform:translate(-50%,-50%);pointer-events:none;z-index:60}
.sc-pip canvas{position:absolute;inset:0;width:100%;height:100%}
.sc-pip.still{background:url(/portal-art/pip-calm.webp) center/contain no-repeat}
/* pins: tags, cards, Pip's bubble, the directory */
.sc-pins{position:absolute;inset:0;z-index:70;pointer-events:none}
.sc-pin{position:absolute!important;left:var(--px)!important;top:var(--py)!important;pointer-events:auto}
.sc-pins.fl-tags .tag{opacity:1}
.sc-pin.pin-tag{transform:translate(-50%,-100%)!important}
.sc-pin.pin-say{transform:translate(-50%,0)!important;width:min(380px,30%)!important}
.sc-pin.pin-dir{transform:translate(-50%,0)!important;display:flex;gap:10px;flex-wrap:nowrap}
.sc-pin.pin-card{transform:none!important}
.sc-pin.pin-center{transform:translate(-50%,-50%)!important}
.sc-dir .tag.st{position:relative!important;left:auto!important;top:auto!important;transform:none!important;opacity:1!important}
.sc-dir .tag.st::after{display:none}
.sc-more{padding:7px 13px;border-radius:14px;font-size:13px;color:#4b5175;background:rgba(255,255,255,.82)}
.sc-root.moving .sc-pins,.sc-root.moving .sc-pip{opacity:0;transition:opacity .2s}
.sc-pins,.sc-pip{transition:opacity .45s .1s}
/* the elevator doors */
.sc-doors{position:fixed;inset:0;z-index:90;pointer-events:none}
.sc-doors i{position:absolute;top:0;bottom:0;width:50.5%;background:linear-gradient(90deg,#f7f4fd,#ece6f8 60%,#f9f7fe);box-shadow:inset 0 0 60px rgba(160,140,220,.18);transition:transform 1.25s cubic-bezier(.65,0,.25,1)}
.sc-doors i:first-child{left:0;border-right:2px solid rgba(94,234,217,.85);box-shadow:inset -14px 0 40px rgba(94,234,217,.18)}
.sc-doors i:last-child{right:0;border-left:2px solid rgba(94,234,217,.85);box-shadow:inset 14px 0 40px rgba(94,234,217,.18)}
.sc-doors.open i:first-child{transform:translateX(-101%)}.sc-doors.open i:last-child{transform:translateX(101%)}
/* a teammate's screen on the monitor */
.sc-layer{position:fixed;inset:0;z-index:13;pointer-events:none}
.sc-layer>*{position:fixed!important;left:0!important;top:0!important;pointer-events:auto;opacity:0;transition:opacity .5s}
.sc-layer.on>*{opacity:1}
.sc-layer:not(.on)>*{opacity:0;pointer-events:none}
.sc-layer.flat .scr{box-shadow:0 0 0 10px rgba(255,255,255,.9),0 50px 90px -40px rgba(38,34,90,.5)}
@media (prefers-reduced-motion:reduce){.sc *,.sc-doors i{animation:none!important;transition:none!important}}
`; }
