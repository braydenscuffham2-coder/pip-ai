// Pip Portal: the office. Loaded by portal.html after sign-in (see loadPart there).
// A bright white studio made in Blender (tools/hall/studio.py) with its light baked into the colours, so the browser only
// paints it. Pip and every teammate are real 3D from Pip's own code (portal-pip.js, createPipEngine with kit: true), lit
// exactly like the Marketplace's Pip: the same environment, the same key and fill, carried with the camera so they always
// read the same way. Teammates are Pip's model in their colour with their accessory, each at a desk the page places:
// two rows, each desk turned toward you as you walk in, one per teammate plus one open desk.
// The camera never cuts. Pip leads, it follows. At a desk it glides over the teammate's shoulder into their monitor and
// hands over to the real, sharp interface. Everything you click is HTML from portal.html or a part of the room wired to it.

function threeAddons() { return null; }

function createOffice(THREE, X, opts) {
  "use strict";
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const RM = () => !!(opts.reduce && opts.reduce());
  const PHONE = () => innerWidth < 720, TALL = () => innerWidth / innerHeight < 0.8;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const easeSine = (x) => -(Math.cos(Math.PI * x) - 1) / 2;
  const TEAM = { violet: "#8f7bff", teal: "#2fc4b2", amber: "#e9a534", rose: "#ff7d98", sky: "#5b9dff", green: "#6fc36a" };
  const B = (x, y, z) => V(x, z, -y); // Blender's axes (z up, y into the room) to the page's (y up, -z into the room)

  // ---------- the stage ----------
  const css = document.createElement("style"); css.textContent = CSS_TEXT(); document.head.append(css);
  const root = document.createElement("div"); root.className = "hl-root"; opts.host.append(root);
  const canvas = document.createElement("canvas"); canvas.className = "hl-gl"; canvas.setAttribute("aria-hidden", "true"); root.append(canvas);
  const pins = document.createElement("div"); pins.className = "hl-pins fl-tags"; root.append(pins);
  const stack = document.createElement("div"); stack.className = "hl-cards"; root.append(stack);
  const layer = document.createElement("div"); layer.className = "hl-layer fl-css";
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog("#f2f3f6", 24, 70);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 160); scene.add(camera);
  let dpr = Math.min(devicePixelRatio || 1, 1.75);

  // the Marketplace's light for everything drawn live, carried with the camera so Pip and the team always look like Pip
  const kit = createPipEngine(THREE, { kit: true });
  const pmrem = new THREE.PMREMGenerator(renderer), env = pmrem.fromScene(kit.room(), 0.04).texture; pmrem.dispose();
  scene.add(new THREE.HemisphereLight("#ffffff", "#d9dce8", 0.7));
  const keyT = new THREE.Object3D(); keyT.position.set(0, 0, -6); camera.add(keyT);
  const key = new THREE.DirectionalLight("#ffffff", 2); key.position.set(-4, 7, 5); key.target = keyT; camera.add(key);
  const fill = new THREE.DirectionalLight("#dfe8ff", 1); fill.position.set(5, 3, -4); fill.target = keyT; camera.add(fill);

  // ---------- the office file: a .glb read directly (no loader to download) ----------
  const marks = {}, parts = {}, hits = [];
  async function loadRoom(url) {
    const buf = await (await fetch(url)).arrayBuffer(), dv = new DataView(buf);
    let off = 12, json = null, bin = null;
    while (off < buf.byteLength) {
      const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
      if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, off + 8, len))); else if (type === 0x004e4942) bin = buf.slice(off + 8, off + 8 + len);
      off += 8 + len;
    }
    const TY = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }, N = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
    const attr = (i) => { const a = json.accessors[i], bv = json.bufferViews[a.bufferView], T = TY[a.componentType], n = N[a.type];
      return new THREE.BufferAttribute(new T(bin, (bv.byteOffset || 0) + (a.byteOffset || 0), a.count * n), n, !!a.normalized); };
    const mats = (json.materials || []).map((m) => { const p = m.pbrMetallicRoughness || {}, e = m.emissiveFactor || [0, 0, 0], k = (m.extensions && m.extensions.KHR_materials_emissive_strength && m.extensions.KHR_materials_emissive_strength.emissiveStrength) || 1;
      return { name: m.name, base: p.baseColorFactor || [1, 1, 1, 1], emit: e.map((v) => v * k) }; });
    const walk = (ni, parent) => {
      const nd = json.nodes[ni], m = new THREE.Matrix4();
      if (nd.matrix) m.fromArray(nd.matrix); else m.compose(V(...(nd.translation || [0, 0, 0])), new THREE.Quaternion(...(nd.rotation || [0, 0, 0, 1])), V(...(nd.scale || [1, 1, 1])));
      const w = parent.clone().multiply(m), name = nd.name.replace(/\.\d+$/, "");
      if (nd.mesh != null) for (const pr of json.meshes[nd.mesh].primitives) {
        const g = new THREE.BufferGeometry();
        for (const [k, i] of Object.entries(pr.attributes)) { const nm = { POSITION: "position", NORMAL: "normal", COLOR_0: "color", TEXCOORD_0: "uv" }[k]; if (nm) g.setAttribute(nm, attr(i)); }
        if (pr.indices != null) g.setIndex(attr(pr.indices));
        g.applyMatrix4(w); g.computeBoundingSphere(); g.computeBoundingBox();
        parts[name] = { g, mt: mats[pr.material] || { base: [1, 1, 1, 1], emit: [0, 0, 0] } };
      } else if (!nd.children) marks[name] = V().setFromMatrixPosition(w);
      for (const c of nd.children || []) walk(c, w);
    };
    for (const ni of json.scenes[json.scene || 0].nodes) walk(ni, new THREE.Matrix4());
  }
  const lin = (c) => new THREE.Color().setRGB(c[0], c[1], c[2], THREE.LinearSRGBColorSpace);
  const BAKE = 4 * 0.97; // the bake is stored at a quarter; this brings it back, a touch brighter for the Marketplace's airy white
  const baked = () => new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(BAKE, BAKE, BAKE) });
  const glowMat = (hex, k = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: false });
  function mesh(name, mat, parent = scene) { const p = parts[name]; if (!p) return null; const m = new THREE.Mesh(p.g, mat); m.name = name; parent.add(m); return m; }

  // ---------- soft shapes the bake can't hold: a contact shadow under each desk, glows ----------
  function cvs(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
  function texOf(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
  const shadowTex = (() => { const c = cvs(256, 256), g = c.getContext("2d"), gr = g.createRadialGradient(128, 128, 10, 128, 128, 128);
    gr.addColorStop(0, "rgba(40,44,60,.55)"); gr.addColorStop(0.55, "rgba(40,44,60,.22)"); gr.addColorStop(1, "rgba(40,44,60,0)"); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); return texOf(c); })();
  function contact(parent, x, z, sx, sz, o = 0.5) {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: o, toneMapped: false }));
    q.rotation.x = -Math.PI / 2; q.position.set(x, 0.004, z); q.renderOrder = 1; parent.add(q); return q;
  }

  // ---------- canvases: a teammate's monitor (their work, typed live), a sticky note, a tool's face, the meter ----------
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function lines(g, text, maxW) { const words = String(text || "").split(/\s+/), out = []; let line = "";
    for (const w of words) { const t = line ? line + " " + w : w; if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; } if (line) out.push(line); return out; }
  const FONT = '"Geist", "Inter", system-ui, sans-serif', SERIF = '"Instrument Serif", Georgia, serif', MONO = '"Geist Mono", ui-monospace, monospace';
  function paintScreen(s, a, typed, t) {
    const c = s.cv, g = c.getContext("2d"), W = c.width, H = c.height, hex = a.hex || "#8f7bff";
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, W, H);
    g.fillStyle = "#f4f5f8"; g.fillRect(0, 0, W, 64); g.fillStyle = "#e7e9ef"; g.fillRect(0, 64, W, 2);
    ["#ff8a7a", "#ffc65c", "#5fd6a0"].forEach((col, i) => { g.fillStyle = col; g.beginPath(); g.arc(30 + i * 24, 32, 7, 0, 7); g.fill(); });
    g.fillStyle = "#1b1e2b"; g.font = "600 24px " + FONT; g.fillText(a.name || "", 116, 40);
    const chip = a.kind === "needs" ? ["Needs you", "#fff1cc", "#7a4e00"] : a.kind === "paused" ? ["Paused", "#eef0f4", "#6b6f8a"] : a.kind === "build" ? ["Being built", "#eef0ff", "#4b48c9"] : a.kind === "ready" ? ["Ready", "#eef0f4", "#4b5175"] : ["Working", "#dcf7f1", "#0c6b5d"];
    g.font = "600 19px " + FONT; const cw = g.measureText(chip[0]).width + 34;
    g.fillStyle = chip[1]; rr(g, W - cw - 22, 17, cw, 30, 15); g.fill(); g.fillStyle = chip[2]; g.fillText(chip[0], W - cw - 5, 38);
    g.fillStyle = hex; g.fillRect(40, 104, 4, 26);
    g.fillStyle = "#6b6f8a"; g.font = "500 17px " + MONO; g.fillText((a.kind === "live" ? "WORKING ON" : a.kind === "needs" ? "WAITING ON YOU" : "RIGHT NOW").split("").join(String.fromCharCode(8202)), 58, 124);
    g.fillStyle = "#1b1e2b"; g.font = "400 46px " + SERIF;
    const txt = typed == null ? (a.line || "") : typed, ls = lines(g, txt, W - 96).slice(0, 4);
    ls.forEach((l, i) => g.fillText(l, 40, 196 + i * 52));
    if (typed != null && Math.floor(t * 2.2) % 2 === 0) { const last = ls[ls.length - 1] || ""; g.fillStyle = hex; g.fillRect(40 + g.measureText(last).width + 4, 196 + (ls.length - 1) * 52 - 36, 3, 42); }
    // a quiet activity strip along the bottom
    g.fillStyle = "#f4f5f8"; rr(g, 40, H - 92, W - 80, 56, 14); g.fill();
    g.fillStyle = "#6b6f8a"; g.font = "500 18px " + FONT; g.fillText(a.role || "", 62, H - 57, W - 300);
    for (let i = 0; i < 12; i++) { const hgt = 6 + ((Math.sin(i * 1.7 + (a.ph || 0)) + 1) * 10); g.fillStyle = i === 11 ? hex : "#d6d9e2"; g.fillRect(W - 220 + i * 14, H - 46 - hgt, 8, hgt); }
    s.tex.needsUpdate = true;
  }
  function paintNote(t, text) {
    const c = t.image, g = c.getContext("2d"), W = c.width, H = c.height;
    g.clearRect(0, 0, W, H); g.fillStyle = "#ffe08a"; rr(g, 6, 6, W - 12, H - 12, 12); g.fill();
    g.fillStyle = "#7a4e00"; g.font = "700 30px " + FONT; g.fillText("Needs you", 24, 52);
    g.font = "500 24px " + FONT; lines(g, text, W - 48).slice(0, 3).forEach((l, i) => g.fillText(l, 24, 92 + i * 30)); t.needsUpdate = true;
  }
  function paintFace(t, tool) {
    const c = t.image, g = c.getContext("2d"), W = c.width, H = c.height; g.clearRect(0, 0, W, H);
    g.fillStyle = tool ? "#ffffff" : "#f6f7f9"; rr(g, 0, 0, W, H, 26); g.fill();
    if (!tool) { g.fillStyle = "#b8bcc8"; g.font = "500 30px " + FONT; g.fillText("Open slot", 36, 110); }
    if (tool) {
      g.fillStyle = "#1b1e2b"; g.font = "600 46px " + FONT; g.fillText(tool.short, 36, 84, W - 72);
      const st = tool.state === "ok" ? ["Connected", "#0c6b5d"] : tool.state === "pip" ? ["Pip is on it", "#4b48c9"] : ["Needs you", "#8a5a00"];
      g.fillStyle = st[1]; g.font = "500 28px " + FONT; g.fillText(st[0], 36, 132);
    }
    t.needsUpdate = true;
  }
  function paintMeter(t, m) {
    const c = t.image, g = c.getContext("2d"), W = c.width; g.clearRect(0, 0, W, W);
    g.fillStyle = "#ffffff"; g.beginPath(); g.arc(W / 2, W / 2, W / 2, 0, 7); g.fill();
    const k = m && m.k != null ? clamp(m.k) : 0, a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    g.lineCap = "round"; g.lineWidth = 26; g.strokeStyle = "#eceef3"; g.beginPath(); g.arc(W / 2, W / 2, W * 0.36, a0, a1); g.stroke();
    g.strokeStyle = k >= 1 ? "#ef8a5b" : "#2fc4b2"; g.beginPath(); g.arc(W / 2, W / 2, W * 0.36, a0, a0 + (a1 - a0) * Math.max(0.02, k)); g.stroke();
    g.fillStyle = "#1b1e2b"; g.textAlign = "center"; g.font = "400 92px " + SERIF; g.fillText(m && m.big ? m.big : "–", W / 2, W / 2 + 20);
    g.fillStyle = "#6b6f8a"; g.font = "500 24px " + MONO; g.fillText("USAGE", W / 2, W / 2 + 70); g.textAlign = "left";
    t.needsUpdate = true;
  }

  // ---------- the cast ----------
  const SCALE_PIP = 0.33, SCALE_MATE = 0.27, PIP_BASE = 3.4;
  function cast(look, scale, base) {
    const a = new THREE.Group(); a.scale.setScalar(scale); scene.add(a);
    const rig = kit.buildPip(env, look);
    a.add(rig.root, rig.shadow, rig.floorGlow, ...rig.handShadows);
    const actor = kit.makeActor(rig, camera, { base, core: look.core, local: (v) => a.worldToLocal(v), world: (v) => a.localToWorld(v) });
    return { a, rig, actor };
  }
  const shade = (hex, k) => "#" + new THREE.Color(hex).lerp(new THREE.Color("#ffffff"), k).getHexString();
  const pip = cast({}, SCALE_PIP, PIP_BASE);
  const mates = new Map();
  const desks = []; // { g, side, screen, tex, cv, note, lamp, seat, monC, monN, hit, mate }

  // ---------- the team's floor: two rows of desks, each turned toward you, one per teammate plus an open desk ----------
  const ROWS = [10.0, 13.6, 17.2], ROW_X = 2.5, TURN = THREE.MathUtils.degToRad(65);
  const tpl = {};
  function deskAt(i) {
    const row = Math.floor(i / 2), side = i % 2 ? 1 : -1, g = new THREE.Group();
    g.position.copy(B(side * ROW_X, ROWS[row] || ROWS[ROWS.length - 1] + 3.6 * (row - ROWS.length + 1), 0));
    g.rotation.y = side < 0 ? TURN : -TURN; if (side > 0) g.scale.x = -1; // the right-hand row is the left one in a mirror
    scene.add(g);
    mesh("desk", tpl.desk, g);
    const cv = cvs(1024, 600), tex = texOf(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(side > 0 ? 1 : -1, -1); // the glass is laid in upside down
    const screen = mesh("desk_screen", new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide }), g);
    const lamp = mesh("lamp_glow", glowMat("#ffe2b0", 0.6), g);
    contact(g, 0, 0.1, 2.4, 1.5, 0.55); contact(g, 0, -0.68, 1.0, 1.0, 0.45);
    const nc = cvs(320, 220), note = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.14), new THREE.MeshBasicMaterial({ map: texOf(nc), transparent: true, toneMapped: false }));
    g.updateMatrixWorld(true);
    // the screen's centre and facing, in the room
    const sg = parts.desk_screen.g, sc = sg.boundingBox.getCenter(V()), seatL = B(-0.04, 0.62, 1.12);
    const monC = g.localToWorld(sc.clone()), seat = g.localToWorld(seatL.clone());
    const nrm = V().fromBufferAttribute(sg.attributes.normal, 0).applyMatrix3(new THREE.Matrix3().getNormalMatrix(g.matrixWorld)).normalize();
    const monN = nrm.dot(seat.clone().sub(monC)) < 0 ? nrm.negate() : nrm; // the way the glass faces: towards the seat
    note.position.copy(monC).add(monN.clone().multiplyScalar(0.02)).add(V(0, 0.16, 0)); note.lookAt(note.position.clone().add(monN)); note.visible = false; scene.add(note);
    const d = { i, g, side, screen, tex, cv, lamp, note, seat, monC, monN, mate: null, typed: 0, wi: 0, lastPaint: 0 };
    hits.push({ obj: g, kind: "desk", d });
    return d;
  }
  function layoutDesks(n) {
    while (desks.length < n) desks.push(deskAt(desks.length));
    desks.forEach((d, i) => { d.g.visible = i < n; d.note.visible = d.note.visible && i < n; });
  }

  // ---------- the tool wall: a white device in a slot for each tool, its light showing how it is ----------
  const devices = [];
  function buildDevices() {
    for (let i = 0; i < 12; i++) {
      const at = marks["slot_" + i]; if (!at) break;
      const g = new THREE.Group(); g.position.copy(at); g.scale.setScalar(1.45); scene.add(g);
      mesh("device", tpl.device, g);
      const led = mesh("dev_led", new THREE.MeshBasicMaterial({ color: "#5fd6c8", toneMapped: false }), g);
      const fc = cvs(512, 192), ft = texOf(fc), face = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.233), new THREE.MeshBasicMaterial({ map: ft, transparent: true, toneMapped: false }));
      face.position.set(0, 0.29, 0.248); g.add(face);
      contact(g, 0, 0, 1.2, 0.8, 0.35);
      devices.push({ i, g, led, ft, tool: null, lift: 0 }); hits.push({ obj: g, kind: "device", i });
    }
  }

  // ---------- places in the room and how the camera frames them ----------
  const EYE = 1.62;
  const STOPS = {
    arrive: () => ({ pos: B(0, -1.5, EYE), look: B(0, 6, 1.5) }),
    floor: () => (TALL() ? { pos: B(0, 1.2, 2.05), look: B(0, 20, 1.05) } : { pos: B(0, 4.1, EYE), look: B(0, 20, 1.36) }),
    tools: () => (TALL() ? { pos: B(0, 15.2, 1.8), look: B(0, 24.4, 1.55) } : { pos: B(0, 18.4, 1.62), look: B(0, 24.4, 1.58) }),
    front: () => ({ pos: B(1.4, 7.6, 1.66), look: B(4.6, 3.4, 1.05) }),
    meter: () => ({ pos: B(4.4, 9.2, 1.75), look: B(8, 8.2, 2.0) }),
    comms: () => ({ pos: B(4.2, 13.2, 1.7), look: B(7.8, 15.4, 1.2) }),
    exit: () => ({ pos: B(0, 4.6, 1.66), look: B(0, 0, 1.5) }),
  };
  const PLACE = { tools: B(0, 24, 1.6), front: B(4.6, 3.4, 1.0), meter: B(7.9, 8.2, 2.1), comms: B(7.6, 15, 1.2), exit: B(0, 0, 1.5) };
  function deskStops(d) {
    // over the teammate's shoulder (the side away from the monitor), then into the monitor until it fills the frame
    // in the desk's own frame: the teammate faces +z, their monitor stands to their left (+x); we come round the other end
    const shoulder = { pos: d.g.localToWorld(V(-0.72, 1.55, -1.5)), look: d.monC.clone() }, corner = d.g.localToWorld(V(-1.95, 1.9, 0.5)), side = d.g.localToWorld(V(-1.5, 1.78, -1.25));
    const w = 0.62, h = 0.36, tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const fill = PHONE() ? 0.96 : 0.86, dist = Math.max(h / (fill * 2 * tanH), w / (fill * 2 * tanH * camera.aspect));
    const near = { pos: d.monC.clone().add(d.monN.clone().multiplyScalar(dist)), look: d.monC.clone() };
    return { shoulder, near, corner, side };
  }

  // ---------- the camera: a path, eased, and a soft spring that follows it so moves start gently and settle ----------
  const cur = { pos: V(), look: V() }, view = { pos: V(), look: V(), v: V(), lv: V() };
  let travel = null, mode = "floor", focusId = null, stationId = null, panel = false;
  function go(to, opt = {}) {
    const from = { pos: cur.pos.clone(), look: cur.look.clone() }, pts = [from.pos.clone(), ...(opt.before || []).map((p) => p.clone())];
    const a = pts[pts.length - 1], b = (opt.after && opt.after[0]) || to.pos, dz = b.z - a.z;
    if (Math.abs(dz) > 2.2 && !opt.direct) { // down the aisle, never through a desk
      const s = Math.sign(dz);
      pts.push(V(a.x * 0.3, EYE, a.z + s * Math.min(1.2, Math.abs(dz) * 0.3)));
      pts.push(V(b.x * 0.3, EYE, b.z - s * Math.min(1.6, Math.abs(dz) * 0.35)));
    }
    for (const p of opt.after || []) pts.push(p.clone());
    pts.push(to.pos.clone());
    const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
    const len = curve.getLength(), dur = RM() ? 1 : opt.ms || clamp(1100 + len * 120, 1300, 3000);
    travel = { curve, from, to, t0: performance.now() + (opt.delay ?? 140), dur, looks: opt.looks || null };
    return new Promise((res) => (travel.done = res));
  }
  function stepCamera(now, dt) {
    if (travel) {
      const k = clamp((now - travel.t0) / travel.dur), e = easeSine(ease(k) * 0.65 + k * 0.35);
      cur.pos.copy(travel.curve.getPointAt(e));
      if (travel.looks) { const L = travel.looks, n = L.length - 1, f = e * n, i = Math.min(n - 1, Math.floor(f)); cur.look.copy(L[i]).lerp(L[i + 1], ease(f - i)); }
      else {
        const ahead = travel.curve.getPointAt(clamp(e + 0.18)).add(V(0, -0.15, 0));
        const settle = ease(clamp((k - 0.45) / 0.55)), lead = Math.sin(Math.min(1, k * 2.2) * Math.PI / 2) * (1 - settle);
        cur.look.copy(travel.from.look).lerp(ahead, lead * 0.6).lerp(travel.to.look, settle);
      }
      if (k >= 1) { const d = travel.done; travel = null; d && d(); }
    }
    // critically damped spring: no hard starts, a soft settle
    const w = RM() ? 60 : 20, s = Math.min(0.1, dt / 1000); // a light touch: rounds off starts and stops, never cuts a corner
    for (const [p, v, t] of [[view.pos, view.v, cur.pos], [view.look, view.lv, cur.look]]) { // exact, so it is steady at any frame rate
      const x = p.clone().sub(t), e = Math.exp(-w * s), tmp = v.clone().add(x.clone().multiplyScalar(w)).multiplyScalar(s);
      v.sub(tmp.clone().multiplyScalar(w)).multiplyScalar(e); p.copy(t).add(x.add(tmp).multiplyScalar(e));
    }
    const t = now / 1000, idle = mode === "desk" ? 0.25 : 1, px = RM() ? 0 : par.x * idle, py = RM() ? 0 : par.y * idle;
    camera.position.copy(view.pos).add(V(Math.sin(t * 0.21) * 0.025 * idle + px * 0.12, Math.sin(t * 0.17 + 1) * 0.015 * idle - py * 0.05, 0));
    camera.lookAt(view.look.clone().add(V(px * 0.16, -py * 0.08, 0)));
    if (panel && !PHONE() && mode !== "desk") camera.setViewOffset(innerWidth, innerHeight, Math.min(620, innerWidth * 0.42) / 2, 0, innerWidth, innerHeight); else camera.clearViewOffset();
  }
  // resolves once the soft follow has caught up, so nothing is glued on while the view is still moving
  function settled() { return new Promise((res) => { const t = () => (view.pos.distanceTo(cur.pos) < 0.012 && view.v.length() < 0.05 ? res() : requestAnimationFrame(t)); t(); }); }
  function snap(stop) { cur.pos.copy(stop.pos); cur.look.copy(stop.look); view.pos.copy(stop.pos); view.look.copy(stop.look); view.v.set(0, 0, 0); view.lv.set(0, 0, 0); }

  // ---------- Pip leads: he moves first, drifts in an arc, and turns back to check you're following ----------
  let pipTo = V(), pipTravel = null, pipSide = -1;
  function pipSpot(stop, side = pipSide, dist = 3.0) { // left or right third, a couple of metres ahead of where the camera will stand
    const f = stop.look.clone().sub(stop.pos).setY(0).normalize(), r = V(-f.z, 0, f.x);
    return stop.pos.clone().add(f.multiplyScalar(dist)).add(r.multiplyScalar(side * (PHONE() ? 0.38 : 1.02))).setY(0);
  }
  function pipGo(to, dur) {
    pipTravel = { start: pip.a.position.clone(), end: to.clone(), t0: performance.now(), dur: RM() ? 1 : dur };
    pipTo = to.clone();
  }
  const lerpAngle = (a, b, k) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * k; };
  function stepPip(now) {
    const toCam = (p) => Math.atan2(camera.position.x - p.x, camera.position.z - p.z);
    if (pipTravel) {
      const k = clamp((now - pipTravel.t0) / pipTravel.dur), e = ease(k), d = pipTravel.end.clone().sub(pipTravel.start);
      const side = V(-d.z, 0, d.x).normalize().multiplyScalar(Math.min(0.5, d.length() * 0.08) * Math.sin(e * Math.PI));
      const p = pipTravel.start.clone().lerp(pipTravel.end, e).add(side); p.y = Math.sin(e * Math.PI) * 0.1 * Math.min(1, d.length() / 4);
      pip.a.position.copy(p);
      const heading = d.lengthSq() > 0.01 ? Math.atan2(d.x, d.z) : toCam(p);
      const turnBack = ease(clamp((k - 0.55) / 0.45)) + (k > 0.25 && k < 0.45 ? Math.sin((k - 0.25) / 0.2 * Math.PI) * 0.6 : 0); // a glance back mid-way
      pip.a.rotation.y = lerpAngle(lerpAngle(pip.a.rotation.y, heading, 0.14), toCam(p), clamp(turnBack));
      pip.a.rotation.z = -Math.sin(e * Math.PI) * clamp(d.x * 0.04, -0.14, 0.14);
      if (k >= 1) { pipTravel = null; pip.a.rotation.z = 0; }
    } else pip.a.rotation.y = lerpAngle(pip.a.rotation.y, toCam(pip.a.position), 0.06);
  }
  // he looks where you point: at a teammate, a device, or just towards the cursor
  let gazeAt = 0;
  function gaze(cx, cy) {
    if (!pip.actor.acts.awake()) return;
    const now = performance.now(); if (now - gazeAt < 90) return; gazeAt = now;
    ndc.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
    pip.actor.acts.lookAt(ray.ray.at(5, V()), 0.9);
  }

  // ---------- arrival: inside the elevator, the doors part, Pip wakes, waves, and leads you in ----------
  let doorsT0 = -1e9, doorsTo = 0;
  const doorMeshes = [];
  function stepDoors(now) {
    const k = clamp((now - doorsT0) / 1700), o = doorsTo ? ease(k) : 1 - ease(k);
    for (const [m, s] of doorMeshes) { m.position.x = s * o * 1.44; m.visible = o < 0.985; } // open, they're in the wall's pockets
  }
  let entering = false;
  async function enter(full = true) {
    await ready;
    mode = "floor"; entering = full && !RM();
    requestAnimationFrame(() => root.classList.add("ready")); // the room fades in only once we know where you're standing
    const home = STOPS.floor();
    if (full && !RM()) {
      snap(STOPS.arrive()); doorsTo = 0; doorsT0 = -1e9;
      pip.a.position.copy(B(-0.55, 2.4, 0)); pip.a.rotation.y = 0; pipTo = pip.a.position.clone();
      pip.actor.acts.wake();
      setTimeout(() => { doorsTo = 1; doorsT0 = performance.now(); }, 1200);
      setTimeout(() => { pip.actor.acts.wave(); }, 2800);
      setTimeout(() => {
        if (mode !== "floor") { entering = false; return; }
        pipGo(pipSpot(home), 2300);
        go(home, { ms: 2900, delay: 260 }).then(() => { entering = false; greet(); opts.onEntered && opts.onEntered(); });
      }, 3500);
    } else {
      doorsTo = 1; doorsT0 = -1e9;
      if (!travel) { snap({ pos: home.pos.clone().add(V(0, 0.05, 1.2)), look: home.look }); pip.a.position.copy(pipSpot(home)); go(home, { ms: 1000, delay: 0 }); }
      opts.onEntered && opts.onEntered();
    }
  }
  function greet() { // the team looks up as you arrive, one after another
    let k = 0;
    for (const m of mates.values()) { if (m.data.kind === "paused") continue; const j = k++; setTimeout(() => { m.actor.acts.lookAt(camera.position.clone(), 1.8); if (j < 3) m.actor.acts.wave(); }, 400 + j * 420); }
  }

  // ---------- keeping the cast and the room in step with the Portal ----------
  let model = { agents: [] };
  const colorName = (hex) => { hex = String(hex || "").toLowerCase(); for (const [k, v] of Object.entries(TEAM)) if (v === hex) return k; return "violet"; };
  const lookOf = (a) => { const base = TEAM[colorName(a.hex)];
    return { name: a.id, lite: true, core: base, flank: shade(base, 0.62), belly: shade(base, 0.34), stalk: shade(base, 0.1), acc: a.acc || null }; };
  function syncCast() {
    const list = model.agents.filter((a) => a.look !== "open").slice(0, 11), keep = new Set();
    layoutDesks(list.length + 1);
    list.forEach((a, i) => {
      keep.add(a.id); const d = desks[i], lk = lookOf(a), k = JSON.stringify(lk);
      let m = mates.get(a.id);
      if (!m || m.key !== k) {
        if (m) { scene.remove(m.a); const j = hits.findIndex((h) => h.id === a.id); if (j >= 0) hits.splice(j, 1); }
        m = Object.assign(cast(lk, SCALE_MATE, 1.12 / SCALE_MATE), { key: k, id: a.id }); mates.set(a.id, m);
        hits.push({ obj: m.rig.body, kind: "mate", id: a.id });
      }
      m.desk = d; d.mate = m; m.data = a;
      m.a.position.copy(d.seat).setY(0); m.a.rotation.y = Math.atan2(d.monC.x - d.seat.x, d.monC.z - d.seat.z); // turned to their monitor
      m.actor.A.task = a.kind === "paused" ? "sleep" : a.kind === "needs" ? "needs" : a.kind === "live" || a.kind === "build" ? "type" : null;
      m.actor.acts.mood(a.kind === "needs" ? "concerned" : "calm");
      m.rig.skin.transparent = a.kind === "build"; m.rig.skin.opacity = a.kind === "build" ? 0.55 : 1;
      d.note.visible = a.kind === "needs"; if (a.kind === "needs") paintNote(d.note.material.map, a.sticky || a.line || "");
      d.lamp.material.color.set(a.kind === "paused" ? "#d9dbe0" : a.kind === "needs" ? "#ffb84d" : "#ffe2b0").multiplyScalar(a.kind === "paused" ? 0.9 : 1.1);
      const wk = (a.work && a.work.length ? a.work : [a.line]).filter(Boolean), sig = a.kind + "|" + a.name + "|" + wk.join("|");
      d.data = a; if (d.sig !== sig) { d.sig = sig; d.work = wk; d.typed = 0; d.wi = 0; d.doneAt = 0; paintScreen(d, a, a.kind === "live" ? "" : null, 0); }
    });
    for (const [id, m] of mates) if (!keep.has(id)) { scene.remove(m.a); mates.delete(id); const j = hits.findIndex((h) => h.id === id); if (j >= 0) hits.splice(j, 1); }
    const open = desks[list.length]; if (open) { open.mate = null; open.data = null; open.note.visible = false; open.lamp.material.color.set("#fff6e8");
      paintScreen(open, { name: "Open desk", role: "Room for one more", line: "A new teammate can sit here.", kind: "ready", hex: "#2fc4b2" }, null, 0); }
    const tools = (model.stations && model.stations.tools) || [];
    devices.forEach((v, i) => { const tool = tools[i] || null; v.tool = tool; paintFace(v.ft, tool); });
    if (meterTex) paintMeter(meterTex, meterOf(model.stations));
    if (mode === "floor" && !travel && !pipTravel) { const to = pipSpot(STOPS.floor()); if (to.distanceTo(pip.a.position) > 0.05) pipGo(to, 900); }
  }
  function meterOf(st) { const m = st && st.meter; if (!m) return null; return { k: m.frac || 0, big: Math.round((m.frac || 0) * 100) + "%" }; }

  // a teammate at work: their screen writes the actual work, line by line, while their hands type
  function stepWork(now) {
    const t = now / 1000;
    for (const d of desks) {
      if (!d.mate || !d.data || d.data.kind !== "live" || !d.g.visible) continue;
      if (now - d.lastPaint < 70) continue; d.lastPaint = now;
      const line = d.work[d.wi % d.work.length] || "";
      if (d.typed < line.length) { d.typed = Math.min(line.length, d.typed + 1 + (Math.random() < 0.3 ? 1 : 0)); d.mate.actor.A.task = "type"; }
      else if (!d.doneAt) { d.doneAt = now; d.mate.actor.A.task = null; if (Math.random() < 0.5) d.mate.actor.acts.nod(); }
      else if (now - d.doneAt > 2600) { d.doneAt = 0; d.typed = 0; d.wi++; }
      paintScreen(d, d.data, line.slice(0, d.typed), t);
    }
  }

  // ---------- name pills, and Pip's words with the button he carries ----------
  const Pp = V();
  function place(world, el, dx = 0, dy = 0) {
    Pp.copy(world).project(camera);
    const vis = Pp.z < 1 && Math.abs(Pp.x) < 1.08 && Math.abs(Pp.y) < 1.1;
    el.style.transform = `translate3d(${Math.round((Pp.x * 0.5 + 0.5) * innerWidth + dx)}px,${Math.round((-Pp.y * 0.5 + 0.5) * innerHeight + dy)}px,0)`;
    return vis;
  }
  let orb = null;
  function syncPins() {
    pins.replaceChildren(); orb = null;
    const b = model.bubble;
    if (b && !PHONE()) {
      b.classList.add("hl-pin", "hl-say"); pins.append(b);
      const btn = b.querySelector(".btn.pri"); if (btn) { btn.classList.add("hl-pin", "hl-orb"); pins.append(btn); orb = btn; }
    }
    for (const [id, el] of model.tags || []) if (mates.has(id)) { el.classList.add("hl-pin", "hl-tag"); pins.append(el); }
    pins.classList.toggle("hl-wait", !root.classList.contains("ready"));
    stack.replaceChildren();
    for (const c of (mode === "station" && model.cards && model.cards[stationId]) || []) if (c.kind !== "label" && c.kind !== "hot") stack.append(c.el);
  }
  function stepPins() {
    const b = model.bubble, still = mode === "floor" && !travel && !pipTravel && !entering;
    if (b && b.parentElement === pins) {
      const head = pip.a.position.clone().add(V(0, PIP_BASE * SCALE_PIP + 0.42, 0)), vis = place(head, b, pipSide < 0 ? 64 : -64, -6);
      b.classList.toggle("hl-hide", !vis || !still); b.classList.toggle("hl-l", pipSide > 0);
    }
    if (orb && orb.parentElement === pins) {
      const hand = pip.rig.hands[1].getWorldPosition(V()), vis = place(hand, orb, 0, 0);
      orb.classList.toggle("hl-hide", !vis || !still);
    }
    for (const [id, el] of model.tags || []) { const m = mates.get(id); if (!m || el.parentElement !== pins) continue;
      const vis = place(m.desk.seat.clone().add(V(0, 0.36, 0)), el, 0, 0); el.classList.toggle("hl-hide", !vis || mode !== "floor" || !!travel); }
  }

  // ---------- a teammate's screen: the real HTML, glued to their monitor, sharp at any size ----------
  let screenEl = null, camSlot = null, camCtx = null;
  function mountScreen(id, el) {
    if (screenEl && screenEl !== el) screenEl.remove();
    screenEl = el || null; camSlot = null;
    if (el) {
      el.classList.add("on", "settled"); layer.append(el);
      // the monitor's camera: a small live picture of the teammate at work, top right of their screen
      camSlot = el.querySelector(".hl-cam") || Object.assign(document.createElement("div"), { className: "hl-cam" });
      if (!camSlot.firstChild) { const c = document.createElement("canvas"); c.width = 360; c.height = 240; camSlot.append(c); }
      camSlot.setAttribute("aria-hidden", "true"); el.append(camSlot); camCtx = camSlot.firstChild.getContext("2d");
    }
  }
  let screenK = 0;
  function stepScreen(dt) {
    const m = mates.get(focusId), d = m && m.desk;
    const want = !!(screenEl && mode === "desk" && d && zoomed && !held);
    screenK = clamp(screenK + (want ? 1 : -1) * dt / 380);
    layer.classList.toggle("on", screenK > 0); layer.style.setProperty("--k", screenK.toFixed(3));
    if (!screenEl || !d || screenK <= 0) return;
    // the four corners of the monitor's glass, on screen
    const g = parts.desk_screen.g, p = g.attributes.position, uv = g.attributes.uv, c = {};
    for (let i = 0; i < p.count; i++) { const u = Math.round(uv.getX(i)), v = Math.round(uv.getY(i)); c[u + "" + v] = d.g.localToWorld(V(p.getX(i), p.getY(i), p.getZ(i))); }
    let q = [c["01"], c["11"], c["10"], c["00"]].map((v) => { const s = v.clone().project(camera); return [(s.x * 0.5 + 0.5) * innerWidth, (-s.y * 0.5 + 0.5) * innerHeight]; });
    if (q[0][0] > q[1][0]) q = [q[1], q[0], q[3], q[2]];
    if (q[0][1] > q[3][1]) q = [q[3], q[2], q[1], q[0]];
    const W = screenEl.offsetWidth || 1100, H = screenEl.offsetHeight || 640;
    screenEl.style.transformOrigin = "0 0"; screenEl.style.transform = homography(W, H, q);
  }
  function homography(w, h, [[x0, y0], [x1, y1], [x2, y2], [x3, y3]]) {
    const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    const den = dx1 * dy2 - dx2 * dy1, g = (dx3 * dy2 - dx2 * dy3) / den, hh = (dx1 * dy3 - dx3 * dy1) / den;
    const a = x1 - x0 + g * x1, b = x3 - x0 + hh * x3, c = x0, d = y1 - y0 + g * y1, e = y3 - y0 + hh * y3, f = y0;
    return "matrix3d(" + [a / w, d / w, 0, g / w, b / h, e / h, 0, hh / h, 0, 0, 1, 0, c, f, 0, 1].map((v) => +v.toFixed(9)).join(",") + ")";
  }
  // the little webcam picture: drawn in a corner of the big canvas the screen covers, then copied into the screen
  const webcam = new THREE.PerspectiveCamera(34, 1.5, 0.05, 30); let camAt = 0;
  function stepWebcam(now) {
    if (!camCtx || screenK < 0.5 || now - camAt < 66) return; camAt = now;
    const m = mates.get(focusId); if (!m) return; const d = m.desk;
    webcam.position.copy(d.monC).add(V(0, 0.23, 0)).add(d.monN.clone().multiplyScalar(0.03)); webcam.lookAt(d.seat.clone().add(V(0, 0.02, 0)));
    const w = 240, h = 160, x = 0, y = 0; // bottom-left corner of the canvas: always under the screen at this point
    renderer.setScissorTest(true); renderer.setViewport(x, y, w, h); renderer.setScissor(x, y, w, h);
    const was = m.a.visible; m.a.visible = true; renderer.render(scene, webcam); m.a.visible = was;
    renderer.setScissorTest(false); renderer.setViewport(0, 0, innerWidth, innerHeight);
    const cv = renderer.domElement, sx = x * dpr, sy = cv.height - (y + h) * dpr;
    camCtx.drawImage(cv, sx, sy, w * dpr, h * dpr, 0, 0, camCtx.canvas.width, camCtx.canvas.height);
  }

  // ---------- pointing at things: teammates look up and wave, devices lift, Pip looks where you look ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), par = { x: 0, y: 0, tx: 0, ty: 0 }; let hovered = null;
  function pick(cx, cy) {
    ndc.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
    let best = null, bd = 1e9;
    for (const h of hits) { if (h.obj.visible === false) continue; h.obj.updateMatrixWorld(); const r = ray.intersectObject(h.obj, true)[0]; if (r && r.distance < bd) { bd = r.distance; best = h; } }
    for (const [k, at] of Object.entries(PLACE)) { const s = new THREE.Sphere(at, k === "tools" ? 3.2 : 1.1), r = ray.ray.intersectSphere(s, V()); if (r) { const dd = r.distanceTo(ray.ray.origin); if (dd < bd - 0.5) { bd = dd; best = { kind: "place", id: k }; } } }
    return best;
  }
  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerType === "mouse") { par.tx = e.clientX / innerWidth - 0.5; par.ty = e.clientY / innerHeight - 0.5; }
    if (travel || mode === "desk") return;
    gaze(e.clientX, e.clientY);
    const h = pick(e.clientX, e.clientY); canvas.style.cursor = h ? "pointer" : "";
    const same = h && hovered && h.kind === hovered.kind && h.id === hovered.id && h.i === hovered.i && h.d === hovered.d;
    if (!same) { hovered = h; if (h) react(h); }
  }, { passive: true });
  addEventListener("pointermove", (e) => { if (e.target !== canvas && mode !== "desk" && !travel) gaze(e.clientX, e.clientY); }, { passive: true });
  canvas.addEventListener("click", (e) => {
    if (travel) return;
    const h = pick(e.clientX, e.clientY);
    if (!h) { if (!travel && pip.actor.acts.awake()) { pip.actor.acts.lookAt(ray.ray.at(4, V()), 1.2); } return; }
    if (h.kind === "mate" || (h.kind === "desk" && h.d.mate)) { const id = h.kind === "mate" ? h.id : h.d.mate.id, m = mates.get(id); if (m) { m.actor.acts.hop(); m.actor.acts.happy(0.9); } opts.onPick && opts.onPick(id); }
    else if (h.kind === "device") { const v = devices[h.i]; v.lift = performance.now(); opts.onStation && opts.onStation("tools", v.tool && v.tool.slot); }
    else if (h.kind === "place") opts.onStation && opts.onStation(h.id);
  });
  // poke Pip: the Marketplace's little reaction
  addEventListener("click", (e) => { const b = model.bubble; if (b && b.contains(e.target) && !e.target.closest("button")) { pip.actor.acts.hop(); pip.actor.acts.happy(1); } });
  // he watches you fill in a form, and nods when you've typed a while
  let typing = 0;
  addEventListener("input", (e) => {
    if (!e.target || !e.target.closest || !e.target.closest(".fl-desk,.fl-station")) return;
    const r = e.target.getBoundingClientRect(); gaze(r.left + r.width / 2, r.top + r.height / 2);
    if (++typing % 14 === 0) pip.actor.acts.nod();
  }, true);
  function react(h) {
    if (h.kind === "mate" || (h.kind === "desk" && h.d.mate)) { const m = h.kind === "mate" ? mates.get(h.id) : h.d.mate; if (m) { pip.actor.acts.lookAt(m.desk.seat.clone(), 1.6); hover(m.id); } }
    if (h.kind === "device") { const v = devices[h.i]; v.lift = performance.now(); pip.actor.acts.lookAt(v.g.position.clone().add(V(0, 0.3, 0)), 1.6); }
    if (h.kind === "place") pip.actor.acts.lookAt(PLACE[h.id].clone(), 1.6);
  }
  function hover(id) {
    const m = mates.get(id); if (!m || m.data.kind === "paused" || m.data.kind === "build") return;
    if (performance.now() - (m.wavedAt || 0) < 3500) return; m.wavedAt = performance.now();
    m.actor.acts.lookAt(camera.position.clone(), 2); m.actor.acts.wave();
  }

  // ---------- neighbours pass work to each other: a paper plane between desks ----------
  const planeGeo = new THREE.BufferGeometry(); planeGeo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0.12, -0.08, 0, -0.08, 0, 0.02, -0.06, 0, 0, 0.12, 0, 0.02, -0.06, 0.08, 0, -0.08], 3)); planeGeo.computeVertexNormals();
  const plane = new THREE.Mesh(planeGeo, new THREE.MeshLambertMaterial({ color: "#ffffff", side: THREE.DoubleSide })); plane.visible = false; scene.add(plane);
  let flight = null, nextFlight = performance.now() + 11000;
  function stepPlane(now) {
    if (!flight && now > nextFlight && mode === "floor" && !RM()) {
      nextFlight = now + 16000 + Math.random() * 12000;
      const list = [...mates.values()].filter((m) => m.data.kind === "live" || m.data.kind === "ready");
      if (list.length >= 2) {
        const a = list[Math.floor(Math.random() * list.length)], b = list.filter((x) => x !== a)[Math.floor(Math.random() * (list.length - 1))];
        flight = { a, b, t0: now + 700 }; a.actor.A.throwAt = a.actor.t + 0.25; b.actor.A.catchAt = b.actor.t + 2.3;
        a.actor.acts.lookAt(b.desk.seat.clone(), 2.6); b.actor.acts.lookAt(a.desk.seat.clone(), 3.8);
      }
    }
    if (flight) {
      const k = (now - flight.t0) / 1700; plane.visible = k > 0 && k < 1;
      if (plane.visible) {
        const p0 = flight.a.desk.seat.clone().add(V(0, 0.25, 0)), p1 = flight.b.desk.seat.clone().add(V(0, 0.2, 0)), at = (u) => { const p = p0.clone().lerp(p1, u); p.y += Math.sin(u * Math.PI) * 0.9; return p; };
        plane.position.copy(at(k)); plane.lookAt(at(k + 0.02)); plane.rotateZ(Math.sin(k * 9) * 0.3);
      }
      if (k >= 1.2) { flight.b.actor.acts.nod(); flight = null; }
    }
  }

  // ---------- the frame loop ----------
  let raf = 0, active = true, held = false, last = performance.now(), slow = 0, nextGlance = 0, zoomed = false, meterTex = null;
  const amber = new THREE.Color("#ffb84d"), aqua = new THREE.Color("#5fd6c8"), violet = new THREE.Color("#9b86ff");
  function loop(now) {
    raf = 0; if (!active || document.hidden) return;
    const dt = Math.min(64, now - last); last = now;
    if (dt > 24) slow++; else slow = Math.max(0, slow - 1);
    if (slow > 45 && dpr > 1) { dpr = Math.max(1, dpr - 0.25); resize(); slow = 0; } // stays smooth on a smaller machine
    par.x += (par.tx - par.x) * 0.05; par.y += (par.ty - par.y) * 0.05;
    stepDoors(now); stepCamera(now, dt); stepPip(now); stepPlane(now); stepWork(now);
    const tS = now / 1000;
    pip.actor.step(tS); for (const m of mates.values()) m.actor.step(tS);
    for (const v of devices) {
      const k = v.lift ? clamp(1 - (now - v.lift) / 900) : 0, st = v.tool ? v.tool.state : "none";
      v.g.position.y = marks["slot_" + v.i].y + Math.sin(k * Math.PI) * 0.05;
      if (st === "none") v.led.material.color.set("#d9dce2"); else v.led.material.color.copy(st === "ok" ? aqua : st === "pip" ? violet : amber).multiplyScalar(st === "you" ? 0.7 + 0.5 * Math.abs(Math.sin(tS * 2.6)) : 1.1);
    }
    if (mode === "desk" && zoomed && now > nextGlance) { nextGlance = now + 5200 + Math.random() * 3000; const m = mates.get(focusId); if (m && m.data.kind !== "paused") m.actor.acts.lookAt(m.desk.monC.clone().add(V(0, 0.3, 0)), 1.2); }
    stepWebcam(now);
    { const m = mates.get(focusId); for (const x of mates.values()) x.a.visible = !(x === m && (camera.position.distanceTo(m.desk.monC) < 0.95 || camera.position.distanceTo(m.desk.seat) < 0.78)); }
    if (!held) renderer.render(scene, camera);
    stepPins(); stepScreen(dt);
    raf = requestAnimationFrame(loop);
  }
  const kick = () => { if (!raf && active) raf = requestAnimationFrame(loop); };
  document.addEventListener("visibilitychange", kick);
  function resize() {
    renderer.setPixelRatio(dpr); renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight; camera.fov = camera.aspect < 0.8 ? 64 : camera.aspect < 1.2 ? 56 : 48; camera.updateProjectionMatrix();
  }
  addEventListener("resize", resize);

  // ---------- start ----------
  const ready = (async () => {
    await loadRoom(opts.room || "/portal-art/office.glb");
    tpl.desk = baked(); tpl.device = baked();
    mesh("room", baked());
    for (const s of ["door_l", "door_r"]) { const m = mesh(s, new THREE.MeshLambertMaterial({ color: "#e4e6ea", emissive: new THREE.Color("#e4e6ea").multiplyScalar(0.55) })); if (m) { m.geometry.translate(0, 0, 0); doorMeshes.push([m, s === "door_l" ? -1 : 1]); } }
    mesh("elight", glowMat("#5fd6c8", 1.2));
    const dial = mesh("meter_dial", null);
    if (dial) { // the dial's picture is laid flat across its face
      const g = dial.geometry, p = g.attributes.position, bb = g.boundingBox, uv = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) { uv[i * 2] = (p.getZ(i) - bb.min.z) / (bb.max.z - bb.min.z || 1); uv[i * 2 + 1] = (p.getY(i) - bb.min.y) / (bb.max.y - bb.min.y || 1); }
      g.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); meterTex = texOf(cvs(512, 512)); dial.material = new THREE.MeshBasicMaterial({ map: meterTex, toneMapped: false }); paintMeter(meterTex, null);
    }
    buildDevices(); layoutDesks(1);
    snap(STOPS.floor()); pip.a.position.copy(pipSpot(STOPS.floor())); pipTo = pip.a.position.clone();
    resize(); kick();
    setTimeout(() => root.classList.add("ready"), 1500); // in case nobody calls enter()
  })();

  return {
    ready, layer,
    get mode() { return mode; }, get tier() { return "office"; },
    has(id) { return id in STOPS && id !== "arrive" && id !== "floor"; },
    sync(m) {
      model = Object.assign({}, m, { tags: new Map(m.tags || []), cards: m.cards || {} });
      root.classList.toggle("dim", !!m.dim);
      ready.then(() => { syncCast(); syncPins(); });
    },
    enter,
    floor() {
      if (mode === "floor" && !travel) return Promise.resolve();
      const wasDesk = mode === "desk", m = mates.get(focusId);
      mode = "floor"; focusId = null; stationId = null; zoomed = false; mountScreen(null, null); syncPins();
      return ready.then(() => { const home = STOPS.floor(); pipSide = -1; pipGo(pipSpot(home), 1800);
        const st = wasDesk && m ? deskStops(m.desk) : null;
        return go(home, { before: st ? [st.shoulder.pos, st.side, st.corner] : [], delay: 160 }).then(() => pip.actor.acts.lookAt(camera.position.clone(), 1)); });
    },
    station(id) {
      if (!(id in STOPS) || (mode === "station" && stationId === id)) return Promise.resolve();
      mode = "station"; stationId = id; focusId = null; zoomed = false; syncPins();
      return ready.then(() => { const s = STOPS[id](); pipSide = id === "front" || id === "meter" || id === "comms" ? -1 : 1; pipGo(pipSpot(s, pipSide, 2.2), 1700);
        return go(s).then(() => { pip.actor.acts.point(PLACE[id].clone()); setTimeout(() => pip.actor.acts.point(null), 1800); }); });
    },
    desk(id) {
      return ready.then(() => {
        const m = mates.get(id); if (!m) return; if (mode === "desk" && focusId === id && zoomed) return;
        mode = "desk"; focusId = id; zoomed = false; syncPins();
        const d = m.desk, st = deskStops(d);
        // Pip waits by the desk on the aisle side; the camera comes over the teammate's shoulder and into their screen
        pipGo(d.g.localToWorld(V(-0.9, 0, 2.3)).setY(0), 1500);
        setTimeout(() => { m.actor.acts.lookAt(camera.position.clone(), 1.4); if (m.data.kind !== "paused") m.actor.acts.wave(); }, 900);
        const looks = [cur.look.clone(), d.seat.clone().add(V(0, 0.05, 0)), d.monC.clone(), d.monC.clone()];
        const looks2 = [cur.look.clone(), d.seat.clone().add(V(0, 0.05, 0)), d.seat.clone().add(V(0, 0.05, 0)), d.monC.clone(), d.monC.clone()];
        return go(st.near, { after: [st.corner, st.side, st.shoulder.pos], looks: looks2, ms: RM() ? 1 : 3200, delay: 180 }).then(() => settled()).then(() => { if (mode === "desk" && focusId === id) zoomed = true; });
      });
    },
    letGo(id) { const m = mates.get(id); if (m) m.actor.acts.wave(); }, // the goodbye plays once "Let go" is wired
    letGoPreview(id, on) { const m = mates.get(id); if (!m) return; if (on) { m.actor.acts.mood("concerned"); m.actor.acts.lookAt(camera.position.clone(), 6); } else m.actor.acts.mood(m.data.kind === "needs" ? "concerned" : "calm"); },
    panel(on) { panel = !!on; },
    mountScreen, hover,
    folderOut() { return Promise.resolve(); }, folderIn() {}, hoverFolder() {}, swapFolder() {},
    hold(on) { held = !!on; kick(); },
    setActive(on) { active = !!on; root.style.display = on ? "" : "none"; layer.style.display = on ? "" : "none"; if (on) kick(); },
    invalidate: kick, step() {},
    pip: {
      mood(m) { pip.actor.acts.mood(m || "calm"); }, talk(s) { pip.actor.acts.talk(s); }, happy(s) { pip.actor.acts.happy(s); pip.actor.acts.hop(); }, nod() { pip.actor.acts.nod(); },
      hop() { pip.actor.acts.hop(); }, wave() { pip.actor.acts.wave(); }, trouble() { pip.actor.acts.mood("concerned"); setTimeout(() => pip.actor.acts.mood("calm"), 2600); }, party() { pip.actor.acts.party(); },
    },
    _look(p, l) { travel = null; snap({ pos: V(...p), look: V(...l) }); }, // for the test harness
    _cam() { return { cam: camera.position.toArray().map((v) => +v.toFixed(2)), cur: cur.pos.toArray().map((v) => +v.toFixed(2)), travel: !!travel }; },
    _desks() { return desks.filter((d) => d.mate).map((d) => ({ id: d.mate.id, seat: d.seat.toArray(), mon: d.monC.toArray() })); },
    dispose() { active = false; cancelAnimationFrame(raf); renderer.dispose(); root.remove(); layer.remove(); css.remove(); },
  };
}

function CSS_TEXT() { return `
.hl-root{position:fixed;inset:0;z-index:0;overflow:hidden;background:radial-gradient(120% 90% at 50% 40%,#ffffff 0%,#f4f5f8 60%,#eceef3 100%)}
.hl-gl{position:absolute;inset:0;width:100%;height:100%;display:block;opacity:0;transition:opacity .9s ease}
.hl-root.ready .hl-gl{opacity:1}
.hl-root.dim .hl-gl{filter:saturate(.6) brightness(.97)}
.hl-pins{position:absolute;inset:0;pointer-events:none;z-index:3;transition:opacity .6s ease}
.hl-root:not(.ready) .hl-pins{opacity:0}
.hl-pins .hl-pin{position:absolute!important;left:0!important;top:0!important;will-change:transform;transition:opacity .4s ease}
.hl-pins .hl-pin.hl-hide{opacity:0!important;pointer-events:none!important}
.hl-pins .tag.hl-tag{translate:-50% -100%;opacity:1;pointer-events:auto}
.hl-pins .fl-say.hl-say{translate:0 -100%;width:300px;pointer-events:auto;display:block}
.hl-pins .fl-say.hl-say.hl-l{translate:-100% -100%}
.hl-pins .fl-say.hl-say .say{width:100%}
.hl-pins .fl-say .say .b{font-size:15px;padding:13px 17px 14px;border-radius:20px;box-shadow:0 18px 40px -18px rgba(28,32,60,.28),0 0 0 1px rgba(16,20,40,.04)}
.hl-pins .fl-say .say .b::after{display:none}
.hl-pins .btn.pri.hl-orb{translate:-22px -50%;min-height:44px;padding:0 20px 0 50px;border-radius:999px;font-size:14px;white-space:nowrap;pointer-events:auto;
  background:#14172a;color:#fff;box-shadow:0 14px 30px -12px rgba(20,23,42,.55)}
.hl-pins .btn.pri.hl-orb::before{content:"";position:absolute;left:4px;top:50%;width:36px;height:36px;translate:0 -50%;border-radius:50%;
  background:radial-gradient(circle at 34% 30%,#ffffff 0%,#e9fbf8 28%,#9fe9df 58%,#5fd6c8 100%);box-shadow:0 0 18px rgba(95,214,200,.7),inset 0 -3px 6px rgba(0,0,0,.08);animation:hlOrb 2.6s ease-in-out infinite}
@keyframes hlOrb{50%{box-shadow:0 0 26px rgba(95,214,200,.95),inset 0 -3px 6px rgba(0,0,0,.08)}}
.hl-cards{position:absolute;left:50%;bottom:calc(96px + env(safe-area-inset-bottom,0px));translate:-50% 0;z-index:4;display:flex;gap:12px;pointer-events:auto}
.hl-cards .sc-card{position:relative!important;transform:none!important}
.hl-layer{position:fixed;inset:0;z-index:13;pointer-events:none}
.hl-layer>*{position:fixed!important;left:0!important;top:0!important;pointer-events:auto;opacity:var(--k,0)}
.hl-layer:not(.on)>*{pointer-events:none}
.hl-layer .scr .ctl .fine{padding-left:150px}
.hl-cam{position:absolute;left:16px;bottom:14px;width:126px;height:84px;border-radius:14px;overflow:hidden;box-shadow:0 8px 20px -10px rgba(20,24,40,.35),0 0 0 1px rgba(16,20,40,.06);background:#eef0f4;z-index:3}
.hl-cam canvas{width:100%;height:100%;display:block}
.hl-cam::after{content:"";position:absolute;left:9px;top:9px;width:8px;height:8px;border-radius:50%;background:#ff5a5a;box-shadow:0 0 0 3px rgba(255,90,90,.18)}
@media (max-width:719px){.hl-cards{left:12px;right:12px;translate:none;flex-direction:column}}
`; }
