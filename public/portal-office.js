// Pip Portal: the office. Loaded by portal.html after sign-in (see loadPart there).
// One real room, made in Blender (tools/hall/hall.py) with its light baked into the colours, so the browser only paints
// it: nothing here computes lighting for the room, which is why it stays smooth. Pip and every teammate are real 3D,
// from Pip's own code (portal-pip.js, createPipEngine with kit: true): teammates are Pip's model in their colour with
// their accessory. The camera never cuts: it travels down the hall behind Pip. Everything you click is HTML from
// portal.html or a part of the room wired to the same actions. Marks in the room file say where things are.

function threeAddons() { return null; }

function createOffice(THREE, X, opts) {
  "use strict";
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const RM = () => !!(opts.reduce && opts.reduce());
  const PHONE = () => innerWidth < 720;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const TEAM = { violet: "#8f7bff", teal: "#2fc4b2", amber: "#e9a534", rose: "#ff7d98", sky: "#5b9dff", green: "#6fc36a" };

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
  scene.fog = new THREE.Fog("#e7dff6", 16, 46);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.08, 120);
  let dpr = Math.min(devicePixelRatio || 1, 1.6);

  // the same light Pip has always had, for everything drawn live (Pip, teammates, the moving parts)
  const kit = createPipEngine(THREE, { kit: true });
  const pmrem = new THREE.PMREMGenerator(renderer), env = pmrem.fromScene(kit.room(), 0.04).texture; pmrem.dispose();
  scene.add(new THREE.HemisphereLight("#ffffff", "#d9dce8", 0.7));
  const key = new THREE.DirectionalLight("#ffffff", 2); key.position.set(-4, 9, 6); scene.add(key);
  const fill = new THREE.DirectionalLight("#dfe8ff", 1); fill.position.set(5, 3, -10); scene.add(fill);

  // ---------- the room file: a .glb read directly (no loader to download) ----------
  const marks = {}, live = {}, hits = [];
  async function loadRoom(url) {
    const buf = await (await fetch(url)).arrayBuffer(), dv = new DataView(buf);
    let off = 12, json = null, bin = null;
    while (off < buf.byteLength) {
      const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
      if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, off + 8, len))); else if (type === 0x004e4942) bin = buf.slice(off + 8, off + 8 + len);
      off += 8 + len;
    }
    const TY = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }, N = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
    const acc = (i) => { const a = json.accessors[i], bv = json.bufferViews[a.bufferView], T = TY[a.componentType], n = N[a.type];
      return { arr: new T(bin, (bv.byteOffset || 0) + (a.byteOffset || 0), a.count * n), n, norm: !!a.normalized }; };
    const attr = (i) => { const a = acc(i); return new THREE.BufferAttribute(a.arr, a.n, a.norm); };
    // the skin: pictures packed in the file, decoded off the main thread
    const pics = await Promise.all((json.images || []).map(async (im) => { const bv = json.bufferViews[im.bufferView];
      const bmp = await createImageBitmap(new Blob([new Uint8Array(bin, bv.byteOffset || 0, bv.byteLength)], { type: im.mimeType }), { colorSpaceConversion: "none" });
      const t = new THREE.Texture(bmp); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true; return t; }));
    const mats = (json.materials || []).map((m) => { const p = m.pbrMetallicRoughness || {}, e = m.emissiveFactor || [0, 0, 0], k = (m.extensions && m.extensions.KHR_materials_emissive_strength && m.extensions.KHR_materials_emissive_strength.emissiveStrength) || 1;
      const tx = p.baseColorTexture && json.textures[p.baseColorTexture.index];
      return { name: m.name, base: p.baseColorFactor || [1, 1, 1, 1], emit: e.map((v) => v * k), map: tx ? pics[tx.source] : null }; });
    const walk = (ni, parent) => {
      const nd = json.nodes[ni], m = new THREE.Matrix4();
      if (nd.matrix) m.fromArray(nd.matrix); else m.compose(V(...(nd.translation || [0, 0, 0])), new THREE.Quaternion(...(nd.rotation || [0, 0, 0, 1])), V(...(nd.scale || [1, 1, 1])));
      const w = parent.clone().multiply(m);
      if (nd.mesh != null) for (const pr of json.meshes[nd.mesh].primitives) {
        const g = new THREE.BufferGeometry();
        for (const [k, i] of Object.entries(pr.attributes)) { const nm = { POSITION: "position", NORMAL: "normal", COLOR_0: "color", TEXCOORD_0: "uv" }[k]; if (nm) g.setAttribute(nm, attr(i)); }
        if (pr.indices != null) g.setIndex(attr(pr.indices));
        g.applyMatrix4(w); g.computeBoundingSphere();
        make(nd.name, g, mats[pr.material] || { base: [1, 1, 1, 1], emit: [0, 0, 0] });
      } else if (!nd.children) marks[nd.name] = V().setFromMatrixPosition(w);
      for (const c of nd.children || []) walk(c, w);
    };
    for (const ni of json.scenes[json.scene || 0].nodes) walk(ni, new THREE.Matrix4());
  }
  const lin = (c) => new THREE.Color().setRGB(c[0], c[1], c[2], THREE.LinearSRGBColorSpace);
  function make(name, g, mt) {
    let mesh;
    const glow = mt.emit[0] + mt.emit[1] + mt.emit[2] > 0.5 && !/^tile_/.test(name);
    if (name === "room" && mt.map) mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: mt.map, toneMapped: false })); // the painted skin, shown exactly as painted
    else if (name === "room") mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.75, 1.75, 1.8) }));
    else if (glow) mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: lin(mt.emit).multiplyScalar(0.55) }));
    else { // live parts sit inside a painted, sunlit room: lift them towards its pearly pastel so they don't read as grey plastic
      const base = lin(mt.base).lerp(new THREE.Color(1, 0.97, 1), 0.3), glass = /glass/.test(name);
      mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: base, emissive: base.clone().multiplyScalar(0.38).add(lin(mt.emit).multiplyScalar(0.25)), transparent: glass, opacity: glass ? 0.42 : 1, depthWrite: !glass, toneMapped: false })); // shown like the painted room around them
    }
    if (!g.attributes.normal && !mesh.material.isMeshBasicMaterial) g.computeVertexNormals();
    mesh.name = name; mesh.matrixAutoUpdate = false; scene.add(mesh);
    (live[name.replace(/\.\d+$/, "")] ||= []).push(mesh);
    return mesh;
  }
  const one = (n) => (live[n] || [])[0];

  // ---------- soft light the bake can't hold: halo blooms and their glow on the floor ----------
  function radial(stops, size = 128) {
    const cv = document.createElement("canvas"); cv.width = cv.height = size;
    const g = cv.getContext("2d"), gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [at, col] of stops) gr.addColorStop(at, col);
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  const soft = radial([[0, "rgba(255,255,255,1)"], [0.35, "rgba(255,255,255,.35)"], [1, "rgba(255,255,255,0)"]]);
  function bloom(pos, size, color, floor, opacity) {
    const m = new THREE.MeshBasicMaterial({ map: soft, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity });
    const q = new THREE.Mesh(new THREE.PlaneGeometry(size, size), m);
    q.position.copy(pos); q.rotation.x = -Math.PI / 2; if (floor) q.position.y = 0.012; q.renderOrder = 2; q.userData.o = opacity; scene.add(q); return q;
  }

  // ---------- canvases painted onto the room: a teammate's monitor, a sticky note, a tool's tile ----------
  function canvasTex(w, h) { const cv = document.createElement("canvas"); cv.width = w; cv.height = h; const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t._cv = cv; return t; }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function wrap(g, text, x, y, maxW, lh, lines) {
    const words = String(text || "").split(/\s+/); let line = "", n = 0;
    for (const w of words) { const t = line ? line + " " + w : w; if (g.measureText(t).width > maxW && line) { if (n === lines - 1) { line += "…"; break; } g.fillText(line, x, y + n * lh); line = w; n++; } else line = t; }
    g.fillText(line, x, y + n * lh, maxW);
  }
  const FONT = '"Geist", "Inter", system-ui, sans-serif', SERIF = '"Instrument Serif", Georgia, serif';
  function paintScreen(t, a) {
    const g = t._cv.getContext("2d"), W = t._cv.width, H = t._cv.height;
    g.fillStyle = "#fbfaff"; g.fillRect(0, 0, W, H); g.fillStyle = "#f1eefb"; g.fillRect(0, 0, W, 54);
    g.fillStyle = a.hex || "#8f7bff"; g.beginPath(); g.arc(34, 27, 11, 0, 7); g.fill();
    g.fillStyle = "#14162b"; g.font = "600 26px " + FONT; g.fillText(a.name || "", 56, 36, W - 260);
    const chip = a.kind === "needs" ? ["Needs you", "#fff1cc", "#7a4e00"] : a.kind === "paused" ? ["Paused", "#eceaf4", "#6b6f8a"] : a.kind === "build" ? ["Being built", "#efeaff", "#5b48c9"] : a.kind === "ready" ? ["Ready", "#eceaf4", "#4b5175"] : ["Working", "#dcf7f1", "#0c6b5d"];
    g.font = "600 20px " + FONT; const cw = g.measureText(chip[0]).width + 30;
    g.fillStyle = chip[1]; rr(g, W - cw - 20, 13, cw, 30, 15); g.fill(); g.fillStyle = chip[2]; g.fillText(chip[0], W - cw - 5, 35);
    g.fillStyle = "#6b6f8a"; g.font = "600 17px " + FONT; g.fillText("RIGHT NOW", 30, 98);
    g.fillStyle = "#14162b"; g.font = "400 42px " + SERIF; wrap(g, a.line || "", 30, 148, W - 60, 46, 3);
    g.fillStyle = "#eceaf6"; rr(g, 30, H - 74, W - 60, 46, 12); g.fill();
    g.fillStyle = "#6b6f8a"; g.font = "500 19px " + FONT; g.fillText(a.role || "", 46, H - 44, W - 92);
    t.needsUpdate = true;
  }
  function paintNote(t, text) {
    const g = t._cv.getContext("2d"), W = t._cv.width, H = t._cv.height;
    g.clearRect(0, 0, W, H); g.fillStyle = "#ffd86b"; rr(g, 6, 6, W - 12, H - 12, 10); g.fill();
    g.fillStyle = "#7a4e00"; g.font = "700 34px " + FONT; g.fillText("Needs you", 22, 52);
    g.font = "500 24px " + FONT; wrap(g, text, 22, 92, W - 44, 30, 3); t.needsUpdate = true;
  }
  function paintTile(t, tool) {
    const g = t._cv.getContext("2d"), W = t._cv.width, H = t._cv.height; g.clearRect(0, 0, W, H);
    if (tool) {
      g.fillStyle = "rgba(255,255,255,.94)"; rr(g, 10, H - 70, W - 20, 58, 29); g.fill();
      g.fillStyle = tool.state === "ok" ? "#2fc4b2" : tool.state === "pip" ? "#9b86ff" : "#f2b02a"; g.beginPath(); g.arc(40, H - 41, 10, 0, 7); g.fill();
      g.fillStyle = "#14162b"; g.font = "600 26px " + FONT; g.fillText(tool.short, 60, H - 32, W - 80);
    }
    t.needsUpdate = true;
  }

  // ---------- the cast ----------
  const SCALE_PIP = 0.42, SCALE_MATE = 0.3;
  function cast(look, scale, base) {
    const a = new THREE.Group(); a.scale.setScalar(scale); scene.add(a);
    const rig = kit.buildPip(env, look);
    a.add(rig.root, rig.shadow, rig.floorGlow, ...rig.handShadows);
    const actor = kit.makeActor(rig, camera, { base, core: look.core, local: (v) => a.worldToLocal(v), world: (v) => a.localToWorld(v) });
    return { a, rig, actor };
  }
  const shade = (hex, k) => "#" + new THREE.Color(hex).lerp(new THREE.Color("#ffffff"), k).getHexString();
  const pip = cast({}, SCALE_PIP, 3.1);
  const mates = new Map();
  let seats = [];

  // ---------- where the camera can be: stops along the hall, and one path between them ----------
  const AISLE_Y = 2.15, cur = { pos: V(), look: V() };
  let travel = null, mode = "floor", focusId = null, stationId = null, panel = false;
  function stopFor(kind, arg) {
    if (kind === "arrive") return { pos: V(0, 1.7, marks.cam_arrive.z), look: V(0, 1.5, marks.cam_arrive.z - 12) };
    if (kind === "tools") { const z = marks.cam_tools.z; return { pos: V(0, 2.0, z), look: V(0, 2.35, z - 6.5) }; }
    if (kind === "desk") {
      // beside the teammate, so you see their face and their screen together
      const s = seats[arg]; if (s) { const d = Math.sign(s.pos.x - s.mon.x) || -s.out; return { pos: V(s.pos.x + d * 0.8, 1.72, s.pos.z + 1.75), look: V(s.mon.x * 0.55 + s.pos.x * 0.45, 1.3, s.mon.z - 0.3) }; }
    }
    const z = marks.cam_floor.z; return { pos: V(0, AISLE_Y, z), look: V(0, 1.25, z - 11) };
  }
  function go(to, ms) {
    const from = { pos: cur.pos.clone(), look: cur.look.clone() }, pts = [from.pos.clone()];
    const far = Math.abs(from.pos.z - to.pos.z) > 2.2 || Math.abs(from.pos.x - to.pos.x) > 2.5;
    if (far) { // through the aisle, never through a desk
      const dz = Math.sign(to.pos.z - from.pos.z) || -1;
      pts.push(V(from.pos.x * 0.35, AISLE_Y, from.pos.z + dz * 0.9));
      pts.push(V(to.pos.x * 0.35, AISLE_Y, to.pos.z - dz * 1.4));
    }
    pts.push(to.pos.clone());
    const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
    const len = curve.getLength(), dur = RM() ? 1 : ms || clamp(900 + len * 110, 1100, 2600);
    travel = { curve, from, to, t0: performance.now(), dur };
    pipTravel = { start: pip.a.position.clone(), end: pipTo.clone(), t0: performance.now(), dur: dur * 0.82 };
    return new Promise((res) => (travel.done = res));
  }
  function stepCamera(now) {
    if (travel) {
      const k = clamp((now - travel.t0) / travel.dur), e = ease(k);
      cur.pos.copy(travel.curve.getPointAt(e));
      const ahead = travel.curve.getPointAt(clamp(e + 0.15)); ahead.y -= 0.3;
      const settle = ease(clamp((k - 0.5) / 0.5)), lead = Math.sin(Math.min(1, k * 2) * Math.PI / 2) * (1 - settle);
      cur.look.copy(travel.from.look).lerp(ahead, lead).lerp(travel.to.look, settle);
      if (k >= 1) { const d = travel.done; travel = null; d && d(); }
    }
    const t = now / 1000, px = RM() ? 0 : par.x, py = RM() ? 0 : par.y;
    camera.position.copy(cur.pos).add(V(Math.sin(t * 0.21) * 0.03 + px * 0.16, Math.sin(t * 0.17 + 1) * 0.02 - py * 0.07, 0));
    camera.lookAt(cur.look.clone().add(V(px * 0.22, -py * 0.1, 0)));
    // with a panel open on the right, the room shifts left so what you're looking at stays in view
    if (panel && !PHONE()) camera.setViewOffset(innerWidth, innerHeight, Math.min(620, innerWidth * 0.42) / 2, 0, innerWidth, innerHeight); else camera.clearViewOffset();
  }

  // ---------- Pip leads the way: floats ahead along the hall, turns back to you when he gets there ----------
  let pipTo = V(0, 0, -6), pipTravel = null;
  function pipMarkFor(kind, arg) {
    if (kind === "tools") return marks.pip_tools.clone().setY(0);
    if (kind === "desk") { const s = seats[arg]; if (s) return V(s.mon.x - s.out * 1.7, 0, s.mon.z - 1.5); }
    return marks.pip_floor.clone().setY(0);
  }
  const lerpAngle = (a, b, k) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * k; };
  function stepPip(now) {
    const toCam = (p) => Math.atan2(camera.position.x - p.x, camera.position.z - p.z);
    if (pipTravel) {
      const k = clamp((now - pipTravel.t0) / pipTravel.dur), e = ease(k), d = pipTravel.end.clone().sub(pipTravel.start);
      const p = pipTravel.start.clone().lerp(pipTravel.end, e); p.y = Math.sin(e * Math.PI) * 0.12 * Math.min(1, d.length() / 4);
      pip.a.position.copy(p);
      const heading = d.lengthSq() > 0.01 ? Math.atan2(d.x, d.z) : toCam(p);
      pip.a.rotation.y = lerpAngle(lerpAngle(pip.a.rotation.y, heading, 0.12), toCam(p), ease(clamp((k - 0.62) / 0.38)));
      pip.a.rotation.z = -Math.sin(e * Math.PI) * clamp(d.x * 0.03, -0.12, 0.12);
      if (k >= 1) { pipTravel = null; pip.a.rotation.z = 0; }
    } else pip.a.rotation.y = lerpAngle(pip.a.rotation.y, toCam(pip.a.position), 0.05);
  }

  // ---------- the arrival: the elevator doors part, the camera steps onto the floor, Pip says hello ----------
  let doorsT0 = -1e9, doorsTo = 1;
  function stepDoors(now) {
    const k = clamp((now - doorsT0) / 1500), o = doorsTo ? ease(k) : 1 - ease(k);
    for (const [n, s] of [["door_l", -1], ["door_r", 1]]) for (const m of live[n] || []) m.matrix.makeTranslation(s * o * 2.15, 0, 0);
  }
  async function enter(full = true) {
    await ready;
    if (full && !RM()) {
      doorsTo = 0; doorsT0 = -1e9;
      const a = stopFor("arrive"); cur.pos.copy(a.pos); cur.look.copy(a.look);
      pipTo = pipMarkFor("floor"); pip.a.position.copy(pipTo);
      setTimeout(() => { doorsTo = 1; doorsT0 = performance.now(); }, 500);
      setTimeout(() => { if (mode === "floor") go(stopFor("floor"), 2400).then(() => { pip.actor.acts.wave(); opts.onEntered && opts.onEntered(); }); }, 1350);
    } else {
      doorsTo = 1; doorsT0 = -1e9;
      if (!travel && mode === "floor") { const f = stopFor("floor"); cur.pos.copy(f.pos).add(V(0, 0.12, 1.4)); cur.look.copy(f.look); go(f, 950); }
      opts.onEntered && opts.onEntered();
    }
  }

  // ---------- keeping the cast and the room in step with the Portal ----------
  let model = { agents: [] };
  const colorName = (hex) => { hex = String(hex || "").toLowerCase(); for (const [k, v] of Object.entries(TEAM)) if (v === hex) return k; return "violet"; };
  const lookOf = (a) => { const base = TEAM[colorName(a.hex)];
    return { name: a.id, lite: true, core: base, flank: shade(base, 0.62), belly: shade(base, 0.34), stalk: shade(base, 0.1), acc: a.acc || null }; };
  function syncCast() {
    const list = model.agents.filter((a) => a.look !== "open").slice(0, seats.length), keep = new Set();
    list.forEach((a, i) => {
      keep.add(a.id); const s = seats[i], lk = lookOf(a), k = JSON.stringify(lk);
      let m = mates.get(a.id);
      if (!m || m.key !== k) {
        if (m) { scene.remove(m.a); const j = hits.findIndex((h) => h.id === a.id); if (j >= 0) hits.splice(j, 1); }
        m = Object.assign(cast(lk, SCALE_MATE, 4.55), { key: k, id: a.id }); mates.set(a.id, m);
        hits.push({ obj: m.rig.body, kind: "mate", id: a.id });
      }
      m.seat = i; m.data = a;
      m.a.position.copy(s.pos).setY(0); m.a.rotation.y = Math.atan2(s.mon.x - s.pos.x, s.mon.z - s.pos.z); // turned to their monitor
      m.actor.A.task = a.kind === "paused" ? "sleep" : a.kind === "needs" ? "needs" : a.kind === "live" || a.kind === "build" ? "type" : null;
      m.actor.acts.mood(a.kind === "needs" ? "concerned" : "calm");
      m.rig.skin.transparent = a.kind === "build"; m.rig.skin.opacity = a.kind === "build" ? 0.55 : 1;
      s.note.visible = a.kind === "needs"; if (a.kind === "needs") paintNote(s.noteTex, a.sticky || a.line || "");
      s.lamp.visible = a.kind === "needs";
      paintScreen(s.screenTex, { name: a.name, role: a.role, line: a.line, kind: a.kind, hex: lk.core });
    });
    for (const [id, m] of mates) if (!keep.has(id)) { scene.remove(m.a); mates.delete(id); const j = hits.findIndex((h) => h.id === id); if (j >= 0) hits.splice(j, 1); }
    seats.forEach((s, i) => { if (i >= list.length) { paintScreen(s.screenTex, { name: "Open desk", role: "Room for one more", line: "A new teammate can sit here.", kind: "ready" }); s.note.visible = false; s.lamp.visible = false; } });
    const tools = (model.stations && model.stations.tools) || [];
    tiles.forEach((t, i) => { const tool = tools[i] || null; t.tool = tool; paintTile(t.tex, tool && { short: tool.short, state: tool.state }); t.mesh.material.color.copy(t.base).lerp(new THREE.Color(1, 0.97, 1), tool ? 0.12 : 0.5); }); // empty slots are frosted, filled ones candy-bright
  }
  const tiles = [];
  function buildSeats() {
    for (let i = 0; i < 12; i++) {
      const p = marks["seat_" + i], mon = marks["mon_" + i]; if (!p) break;
      const out = Math.sign(p.x) || 1, screen = one("screen_" + i), screenTex = canvasTex(640, 384);
      if (screen) { screen.material = new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }); remapUV(screen.geometry, out); }
      const noteTex = canvasTex(320, 220), note = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.24), new THREE.MeshBasicMaterial({ map: noteTex, transparent: true, toneMapped: false }));
      note.position.set(mon.x - out * 0.075, 1.5, mon.z + 0.3); note.rotation.y = out < 0 ? Math.PI / 2 : -Math.PI / 2; note.rotation.z = out * 0.05; note.visible = false; scene.add(note);
      const lamp = bloom(V(p.x - out * 0.4, 0, p.z), 2.6, new THREE.Color("#ffb52e"), true, 0.5); lamp.visible = false;
      // they sit just beside their monitor, turned to it, so you see them from the aisle
      seats.push({ pos: p.clone().add(V(0, 0, 0.78)), mon: mon.clone(), out, screen, screenTex, note, noteTex, lamp });
    }
    for (let i = 0; i < 12; i++) {
      const m = one("tile_" + i); if (!m) break;
      m.geometry.computeBoundingBox(); const bb = m.geometry.boundingBox, c = bb.getCenter(V());
      const tex = canvasTex(256, 256), q = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.86), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false }));
      q.position.set(c.x, c.y, bb.max.z + 0.012); scene.add(q);
      m.material.toneMapped = false;
      tiles.push({ mesh: m, tex, label: q, z0: q.position.z, base: m.material.color.clone(), i }); hits.push({ obj: m, kind: "tile", i });
    }
  }
  function remapUV(g, out) { // the screen's picture, the right way round as the teammate sees it
    const p = g.attributes.position; g.computeBoundingBox(); const b = g.boundingBox, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { const u = (p.getZ(i) - b.min.z) / (b.max.z - b.min.z || 1); uv[i * 2] = out < 0 ? 1 - u : u; uv[i * 2 + 1] = (p.getY(i) - b.min.y) / (b.max.y - b.min.y || 1); }
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  }

  // ---------- name pills and Pip's bubble follow their owners on screen ----------
  const Pp = V();
  function project(world, el, dy) {
    Pp.copy(world).project(camera);
    const vis = Pp.z < 1 && Math.abs(Pp.x) < 1.1 && Math.abs(Pp.y) < 1.15;
    el.style.transform = `translate3d(${((Pp.x * 0.5 + 0.5) * innerWidth).toFixed(1)}px,${((-Pp.y * 0.5 + 0.5) * innerHeight + dy).toFixed(1)}px,0)`;
    return vis;
  }
  function syncPins() {
    pins.replaceChildren();
    if (model.bubble && !PHONE()) { model.bubble.classList.add("hl-pin", "hl-say"); pins.append(model.bubble); }
    for (const [id, el] of model.tags || []) if (mates.has(id)) { el.classList.add("hl-pin", "hl-tag"); pins.append(el); }
    stack.replaceChildren();
    for (const c of (mode === "station" && model.cards && model.cards[stationId]) || []) if (c.kind !== "label" && c.kind !== "hot") stack.append(c.el);
  }
  function stepPins() {
    const b = model.bubble;
    if (b && b.parentElement === pins) { const vis = project(pip.a.position.clone().add(V(0, 0.68, 0)), b, 22); b.classList.toggle("hl-hide", !vis || mode !== "floor" || !!travel); }
    for (const [id, el] of model.tags || []) { const m = mates.get(id); if (!m || el.parentElement !== pins) continue;
      const vis = project(m.a.position.clone().add(V(0, 1.78, 0)), el, -4); el.classList.toggle("hl-hide", !vis || mode !== "floor" || !!travel); }
  }

  // ---------- a teammate's screen, the real HTML, glued to their monitor while you're at the desk ----------
  let screenEl = null;
  function mountScreen(id, el) {
    if (screenEl && screenEl !== el) screenEl.remove();
    screenEl = el || null; if (el) { el.classList.add("on", "settled"); layer.append(el); }
  }
  function stepScreen() {
    const m = mates.get(focusId), s = m && seats[m.seat];
    const on = !!(screenEl && mode === "desk" && !travel && !held && s && s.screen);
    layer.classList.toggle("on", on); if (!on) return;
    const b = s.screen.geometry.boundingBox, x = (b.min.x + b.max.x) / 2;
    const zL = s.out < 0 ? b.max.z : b.min.z, zR = s.out < 0 ? b.min.z : b.max.z; // left and right as the teammate (and the camera behind them) sees it
    let corners = [V(x, b.max.y, zL), V(x, b.max.y, zR), V(x, b.min.y, zR), V(x, b.min.y, zL)].map((v) => { const q = v.project(camera); return [(q.x * 0.5 + 0.5) * innerWidth, (-q.y * 0.5 + 0.5) * innerHeight]; });
    if (corners[0][0] > corners[1][0]) corners = [corners[1], corners[0], corners[3], corners[2]]; // always read left to right, whichever side the camera is on
    const W = screenEl.offsetWidth || 1000, H = screenEl.offsetHeight || 600;
    screenEl.style.transformOrigin = "0 0"; screenEl.style.transform = homography(W, H, corners);
  }
  function homography(w, h, [[x0, y0], [x1, y1], [x2, y2], [x3, y3]]) {
    const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    const den = dx1 * dy2 - dx2 * dy1, g = (dx3 * dy2 - dx2 * dy3) / den, hh = (dx1 * dy3 - dx3 * dy1) / den;
    const a = x1 - x0 + g * x1, b = x3 - x0 + hh * x3, c = x0, d = y1 - y0 + g * y1, e = y3 - y0 + hh * y3, f = y0;
    return "matrix3d(" + [a / w, d / w, 0, g / w, b / h, e / h, 0, hh / h, 0, 0, 1, 0, c, f, 0, 1].map((v) => +v.toFixed(9)).join(",") + ")";
  }

  // ---------- pointing at things: teammates turn and wave, tool tiles lift, Pip looks where you look ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), par = { x: 0, y: 0, tx: 0, ty: 0 }; let hovered = null;
  function pick(cx, cy) {
    ndc.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
    let best = null, bd = 1e9;
    for (const h of hits) { h.obj.updateMatrixWorld(); const r = ray.intersectObject(h.obj, false)[0]; if (r && r.distance < bd) { bd = r.distance; best = h; } }
    return best;
  }
  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerType === "mouse") { par.tx = e.clientX / innerWidth - 0.5; par.ty = e.clientY / innerHeight - 0.5; }
    if (travel) return;
    const h = pick(e.clientX, e.clientY); canvas.style.cursor = h ? "pointer" : "";
    const same = h && hovered && h.kind === hovered.kind && h.id === hovered.id && h.i === hovered.i;
    if (!same) { hovered = h; if (h) react(h); }
  }, { passive: true });
  canvas.addEventListener("click", (e) => {
    if (travel) return;
    const h = pick(e.clientX, e.clientY); if (!h) return;
    if (h.kind === "mate") { const m = mates.get(h.id); if (m) { m.actor.acts.hop(); m.actor.acts.happy(0.9); } opts.onPick && opts.onPick(h.id); }
    if (h.kind === "tile") { const t = tiles[h.i]; t.lift = performance.now(); opts.onStation && opts.onStation("tools", t.tool && t.tool.slot); }
  });
  function react(h) {
    const at = h.kind === "mate" ? mates.get(h.id) && mates.get(h.id).a.position.clone().add(V(0, 1.3, 0)) : tiles[h.i] && tiles[h.i].label.position.clone();
    if (at) pip.actor.acts.lookAt(at, 1.6);
    if (h.kind === "mate") hover(h.id);
    if (h.kind === "tile") tiles[h.i].lift = performance.now();
  }
  function hover(id) {
    const m = mates.get(id); if (!m || m.data.kind === "paused" || m.data.kind === "build") return;
    if (performance.now() - (m.wavedAt || 0) < 3500) return; m.wavedAt = performance.now();
    m.actor.acts.lookAt(camera.position.clone(), 2); m.actor.acts.wave();
  }

  // ---------- neighbours: now and then one sends another a paper plane ----------
  const planeGeo = new THREE.BufferGeometry(); planeGeo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0.12, -0.08, 0, -0.08, 0, 0.02, -0.06, 0, 0, 0.12, 0, 0.02, -0.06, 0.08, 0, -0.08], 3)); planeGeo.computeVertexNormals();
  const plane = new THREE.Mesh(planeGeo, new THREE.MeshLambertMaterial({ color: "#ffffff", side: THREE.DoubleSide })); plane.visible = false; scene.add(plane);
  let flight = null, nextFlight = performance.now() + 9000;
  function stepPlane(now) {
    if (!flight && now > nextFlight && mode === "floor" && !RM()) {
      nextFlight = now + 14000 + Math.random() * 12000;
      const list = [...mates.values()].filter((m) => m.data.kind === "live" || m.data.kind === "ready");
      if (list.length >= 2) {
        const a = list[Math.floor(Math.random() * list.length)], b = list.filter((x) => x !== a)[Math.floor(Math.random() * (list.length - 1))];
        flight = { a, b, t0: now + 700 }; a.actor.A.throwAt = a.actor.t + 0.25; b.actor.A.catchAt = b.actor.t + 2.3;
        a.actor.acts.lookAt(b.a.position.clone().add(V(0, 1.3, 0)), 2.6); b.actor.acts.lookAt(a.a.position.clone().add(V(0, 1.3, 0)), 3.8);
      }
    }
    if (flight) {
      const k = (now - flight.t0) / 1600; plane.visible = k > 0 && k < 1;
      if (plane.visible) {
        const p0 = flight.a.a.position.clone().add(V(0, 1.55, 0)), p1 = flight.b.a.position.clone().add(V(0, 1.45, 0)), at = (u) => { const p = p0.clone().lerp(p1, u); p.y += Math.sin(u * Math.PI) * 1.1; return p; };
        plane.position.copy(at(k)); plane.lookAt(at(k + 0.02)); plane.rotateZ(Math.sin(k * 9) * 0.3);
      }
      if (k >= 1.2) flight = null;
    }
  }

  // ---------- the frame loop ----------
  let raf = 0, active = true, held = false, last = performance.now(), slow = 0, nextGlance = 0;
  const amber = new THREE.Color("#ffb52e"), tmp = new THREE.Color();
  function loop(now) {
    raf = 0; if (!active || document.hidden) return;
    const dt = now - last; last = now;
    if (dt > 24) slow++; else slow = Math.max(0, slow - 1);
    if (slow > 45 && dpr > 1) { dpr = Math.max(1, dpr - 0.25); resize(); slow = 0; } // stays smooth on a smaller machine
    par.x += (par.tx - par.x) * 0.05; par.y += (par.ty - par.y) * 0.05;
    stepDoors(now); stepCamera(now); stepPip(now); stepPlane(now);
    const tS = now / 1000;
    pip.actor.step(tS); for (const m of mates.values()) m.actor.step(tS);
    for (const t of tiles) {
      const k = t.lift ? clamp(1 - (now - t.lift) / 900) : 0, st = t.tool && t.tool.state, lift = Math.sin(k * Math.PI) * 0.07;
      const glow = st === "you" ? 0.3 + 0.22 * Math.sin(tS * 4) : st === "pip" ? 0.2 + 0.1 * Math.sin(tS * 2) : t.tool ? 0.3 : 0.6;
      t.mesh.material.emissive.copy(st === "you" ? amber : t.tool ? t.base : t.mesh.material.color).multiplyScalar(glow + k * 0.35); // empty slots: soft frosted glass
      t.mesh.matrix.makeTranslation(0, 0, lift); t.label.position.z = t.z0 + lift;
    }
    for (const s of seats) if (s.lamp.visible) s.lamp.material.opacity = 0.35 + 0.2 * Math.sin(tS * 3.2);
    if (mode === "desk" && !travel && now > nextGlance) { nextGlance = now + 5200 + Math.random() * 3000; const m = mates.get(focusId); if (m && m.data.kind !== "paused") m.actor.acts.lookAt(camera.position.clone(), 1.6); } // at their desk, they look up at you now and then
    for (const h of halos) h.material.opacity = h.userData.o * (0.85 + 0.15 * Math.sin(tS * 1.3 + h.position.z));
    if (!held) renderer.render(scene, camera);
    stepPins(); stepScreen();
    raf = requestAnimationFrame(loop);
  }
  const kick = () => { if (!raf && active) raf = requestAnimationFrame(loop); };
  document.addEventListener("visibilitychange", kick);
  function resize() {
    renderer.setPixelRatio(dpr); renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight; camera.fov = camera.aspect < 0.8 ? 68 : camera.aspect < 1.2 ? 58 : 50; camera.updateProjectionMatrix();
  }
  addEventListener("resize", resize);

  // ---------- start ----------
  const halos = [];
  const ready = (async () => {
    await loadRoom(opts.room || "/portal-art/hall.glb");
    for (const [n, ms] of Object.entries(live)) if (/^halo/.test(n)) for (const m of ms) {
      const c = m.geometry.boundingSphere.center;
      halos.push(bloom(c.clone(), 3.6, new THREE.Color("#fff4e8"), false, 0.3), bloom(c.clone(), 3.4, new THREE.Color("#fff0dc"), true, 0.14));
    }
    buildSeats();
    const f = stopFor("floor"); cur.pos.copy(f.pos); cur.look.copy(f.look);
    pipTo = pipMarkFor("floor"); pip.a.position.copy(pipTo);
    resize(); root.classList.add("ready"); kick();
  })();

  return {
    ready, layer,
    get mode() { return mode; }, get tier() { return "hall"; },
    has(id) { return id === "tools"; }, // the rest of the floor arrives in the next part of the build
    sync(m) {
      model = Object.assign({}, m, { tags: new Map(m.tags || []), cards: m.cards || {} });
      root.classList.toggle("dim", !!m.dim);
      ready.then(() => { syncCast(); syncPins(); });
    },
    enter,
    floor() { if (mode === "floor" && !travel) return Promise.resolve(); mode = "floor"; focusId = null; stationId = null; mountScreen(null, null); syncPins(); return ready.then(() => { pipTo = pipMarkFor("floor"); return go(stopFor("floor")); }); },
    station(id) {
      if (id !== "tools" || (mode === "station" && stationId === id)) return Promise.resolve();
      mode = "station"; stationId = id; focusId = null; syncPins();
      return ready.then(() => { pipTo = pipMarkFor("tools"); return go(stopFor("tools")).then(() => { if (tiles[5]) { pip.actor.acts.point(tiles[5].label.position.clone()); setTimeout(() => pip.actor.acts.point(null), 1800); } }); });
    },
    desk(id) {
      return ready.then(() => { const m = mates.get(id); if (!m) return; if (mode === "desk" && focusId === id) return; mode = "desk"; focusId = id; syncPins(); pipTo = pipMarkFor("desk", m.seat);
        return go(stopFor("desk", m.seat)).then(() => { m.actor.acts.lookAt(camera.position.clone(), 2.2); if (m.data.kind !== "paused") m.actor.acts.wave(); }); });
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
      mood(m) { pip.actor.acts.mood(m || "calm"); }, talk(s) { pip.actor.acts.talk(s); }, happy(s) { pip.actor.acts.happy(s); }, nod() { pip.actor.acts.nod(); },
      hop() { pip.actor.acts.hop(); }, wave() { pip.actor.acts.wave(); }, trouble() { pip.actor.acts.mood("concerned"); setTimeout(() => pip.actor.acts.mood("calm"), 2600); }, party() { pip.actor.acts.party(); },
    },
    dispose() { active = false; cancelAnimationFrame(raf); renderer.dispose(); root.remove(); layer.remove(); css.remove(); },
  };
}

function CSS_TEXT() { return `
.hl-root{position:fixed;inset:0;z-index:0;overflow:hidden;background:linear-gradient(180deg,#c9c0f3 0%,#e3daf8 38%,#f6eefb 62%,#efe8f9 100%)}
.hl-gl{position:absolute;inset:0;width:100%;height:100%;display:block;opacity:0;transition:opacity .8s}
.hl-root.ready .hl-gl{opacity:1}
.hl-root.dim .hl-gl{filter:saturate(.6) brightness(.95)}
.hl-pins{position:absolute;inset:0;pointer-events:none;z-index:3}
.hl-pins .hl-pin{position:absolute!important;left:0!important;top:0!important;will-change:transform;transition:opacity .35s}
.hl-pins .hl-pin.hl-hide{opacity:0!important;pointer-events:none!important}
.hl-pins .tag.hl-tag{translate:-50% -100%;opacity:1;pointer-events:auto}
.hl-pins .fl-say.hl-say{translate:-50% 0;width:300px;pointer-events:auto;display:flex;flex-direction:column;align-items:center}
.hl-pins .fl-say.hl-say .say{width:100%}
.hl-pins .fl-say .say .b{font-size:14.5px;padding:12px 16px 13px}
.hl-pins .fl-say .btn.pri{width:auto;min-height:42px;margin-top:9px;padding:0 18px;border-radius:999px;font-size:14px}
.hl-cards{position:absolute;left:50%;bottom:calc(96px + env(safe-area-inset-bottom,0px));translate:-50% 0;z-index:4;display:flex;gap:12px;pointer-events:auto}
.hl-cards .sc-card{position:relative!important;transform:none!important}
.hl-layer{position:fixed;inset:0;z-index:13;pointer-events:none}
.hl-layer>*{position:fixed!important;left:0!important;top:0!important;pointer-events:auto;opacity:0;transition:opacity .45s}
.hl-layer.on>*{opacity:1}
@media (max-width:719px){.hl-cards{left:12px;right:12px;translate:none;flex-direction:column}}
`; }
