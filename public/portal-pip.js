// Pip Portal: Pip in 3D, a readable port of the Marketplace's own Pip. Nothing here is a new drawing. Loaded by portal.html after first paint (see loadPart there).
// Readable on purpose: edit it here. The page checks that it loaded before it uses it.
// ---------- Pip in 3D ----------
// A readable port of the Marketplace's own Pip (public/app.html, the Recall script): the same body, pearl glass,
// eyes, cheeks, mouth, antenna, bulb, halo, hands, floor shadow, room light, tone mapping, blink schedule,
// antenna lag, damped springs and act vocabulary. Nothing here is a new drawing. THREE is three.js r170,
// the same version the Marketplace bundles.
function createPipEngine(THREE, opts) {
  "use strict";
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const C = { aqua: "#5eead9", violet: "#9b86ff", lilac: "#cfc3ff", ink: "#14162b", pink: "#ffb3d4" };
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ramp = (x, a, b) => clamp((x - a) / (b - a));
  const smoother = (x) => x * x * x * (x * (x * 6 - 15) + 10);
  const pulse = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
  const lerp = (a, b, t) => a + (b - a) * t;
  const back = (x, s = 1.6) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);
  const expoOut = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
  const hash = (x) => { const e = Math.sin(x * 127.1 + 311.7) * 43758.5453; return e - Math.floor(e); };

  // ----- the room the Marketplace lights Pip with (three/examples RoomEnvironment, as bundled) -----
  function room() {
    const scene = new THREE.Scene(), box = new THREE.BoxGeometry();
    box.deleteAttribute("uv");
    const wall = new THREE.MeshStandardMaterial({ side: THREE.BackSide }), plain = new THREE.MeshStandardMaterial();
    const lamp = new THREE.PointLight(0xffffff, 900, 28, 2); lamp.position.set(0.418, 16.199, 0.3); scene.add(lamp);
    const add = (mat, p, s, ry) => { const m = new THREE.Mesh(box, mat); m.position.set(...p); m.scale.set(...s); if (ry) m.rotation.set(0, ry, 0); scene.add(m); };
    const glow = (n) => { const m = new THREE.MeshBasicMaterial(); m.color.setScalar(n); return m; };
    add(wall, [-0.757, 13.219, 0.717], [31.713, 28.305, 28.591]);
    add(plain, [-10.906, 2.009, 1.846], [2.328, 7.905, 4.651], -0.195);
    add(plain, [-5.607, -0.754, -0.758], [1.97, 1.534, 3.955], 0.994);
    add(plain, [6.167, 0.857, 7.803], [3.927, 6.285, 3.687], 0.561);
    add(plain, [-2.017, 0.018, 6.124], [2.002, 4.566, 2.064], 0.333);
    add(plain, [2.291, -0.756, -2.621], [1.546, 1.552, 1.496], -0.286);
    add(plain, [-2.193, -0.369, -5.547], [3.875, 3.487, 2.986], 0.516);
    add(glow(50), [-16.116, 14.37, 8.208], [0.1, 2.428, 2.739]);
    add(glow(50), [-16.109, 18.021, -8.207], [0.1, 2.425, 2.751]);
    add(glow(17), [14.904, 12.198, -1.832], [0.15, 4.265, 6.331]);
    add(glow(43), [-0.462, 8.89, 14.52], [4.38, 5.441, 0.088]);
    add(glow(20), [3.235, 11.486, -12.541], [2.5, 2, 0.1]);
    add(glow(100), [0, 20, 0], [1, 0.1, 1]);
    return scene;
  }

  // ----- materials -----
  function pearl(tint = 1, pal = {}) {
    const m = new THREE.MeshPhysicalMaterial({
      color: "#ffffff", roughness: 0.38, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, sheen: 0.55, sheenRoughness: 0.5,
      sheenColor: new THREE.Color("#e6dcff"), iridescence: 0.28, iridescenceIOR: 1.35, iridescenceThicknessRange: [180, 520], envMapIntensity: 0.8,
    });
    m.userData.u = { uCore: { value: new THREE.Color(C.aqua) }, uCoreK: { value: 0.55 }, uRim: { value: 0.55 }, uTint: { value: tint },
      uFlankC: { value: pal.flank ? new THREE.Color(pal.flank) : new THREE.Color().setRGB(0.8, 0.76, 1) }, uBellyC: { value: pal.belly ? new THREE.Color(pal.belly) : new THREE.Color().setRGB(0.58, 0.93, 0.89) } }; // Pip's own values unless a teammate's colour is given
    m.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, m.userData.u);
      s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vObjN;")
        .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nvObjN = normalize(normal);");
      s.fragmentShader = s.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vObjN; uniform vec3 uCore, uFlankC, uBellyC; uniform float uCoreK, uRim, uTint;")
        .replace("#include <color_fragment>", `#include <color_fragment>
{ // pearl gradient: white crown, lilac flanks, aqua belly (Pip's palette)
  vec3 n = normalize(vObjN);
  float belly = smoothstep(.15, -.95, n.y * .8 - n.x * .35);
  float flank = smoothstep(.35, 1.0, abs(n.x)) * .7 + smoothstep(.2, -.6, n.z) * .3;
  vec3 c = vec3(.985, .975, 1.0);
  c = mix(c, uFlankC, flank * .75 * uTint);
  c = mix(c, uBellyC, belly * .80 * uTint);
  c = mix(c, vec3(1.0, .93, .97), smoothstep(.2, 1., n.x * .6 + n.y * .5) * .25 * uTint);
  diffuseColor.rgb *= c;
}`)
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
{ // a light inside the glass, brightest where you look straight in
  float nv = clamp(dot(normalize(normal), normalize(vViewPosition)), 0., 1.);
  totalEmissiveRadiance += uCore * uCoreK * (.10 + .55 * pow(nv, 2.2) + .35 * pow(nv, 9.0));
}`)
        .replace("#include <opaque_fragment>", `{ float nv = clamp(dot(normalize(normal), normalize(vViewPosition)), 0., 1.);
  outgoingLight += vec3(.80, .86, 1.0) * uRim * pow(1. - nv, 3.0); }
#include <opaque_fragment>`);
    };
    return m;
  }
  const gloss = (color, extra = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.05, ...extra });
  function radial(stops, size = 128) {
    const cv = document.createElement("canvas"); cv.width = cv.height = size;
    const g = cv.getContext("2d"), gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [at, col] of stops) gr.addColorStop(at, col);
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  const onSphere = (obj, dir, r = 1) => { const n = dir.clone().normalize(); obj.position.copy(n.clone().multiplyScalar(r)); obj.lookAt(n.clone().multiplyScalar(r + 1)); return obj; };

  // ----- Pip -----
  function buildPip(env, look = {}) {
    const root = new THREE.Group(); root.name = look.name || "pip";
    const seg = look.lite ? [48, 32] : [96, 64];
    const squash = new THREE.Group(); root.add(squash);
    const head = new THREE.Group(); squash.add(head);
    const skin = pearl(1, look); skin.envMap = env;
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, seg[0], seg[1]), skin); head.add(body);
    const face = new THREE.Group(); head.add(face);
    const eyeMat = gloss(C.ink, { roughness: 0.15, envMap: env, envMapIntensity: 1.3 });
    const white = new THREE.MeshBasicMaterial({ color: "#ffffff" }), ink = new THREE.MeshBasicMaterial({ color: C.ink });
    const eyes = [-1, 1].map((s) => {
      const holder = onSphere(new THREE.Group(), V(s * 0.31, 0.14, 0.94), 1); face.add(holder);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), eyeMat); eye.scale.set(0.118, 0.168, 0.05); holder.add(eye);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), white); glint.scale.set(0.038, 0.046, 0.02); glint.position.set(-0.04, 0.068, 0.045); holder.add(glint);
      const glint2 = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), white); glint2.scale.setScalar(0.014); glint2.position.set(0.04, -0.055, 0.045); holder.add(glint2);
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.02, 8, 24, Math.PI), ink); arc.position.z = 0.03; holder.add(arc);
      return { eye, glint, glint2, arc, s };
    });
    const cheekMat = new THREE.MeshBasicMaterial({ map: radial([[0, "rgba(255,140,185,.85)"], [0.55, "rgba(255,160,200,.42)"], [1, "rgba(255,190,215,0)"]]), transparent: true, depthWrite: false });
    for (const s of [-1, 1]) { const ck = onSphere(new THREE.Mesh(new THREE.CircleGeometry(0.15, 24), cheekMat), V(s * 0.56, -0.1, 0.82), 1.006); ck.scale.y = 0.72; face.add(ck); }
    const mouthAnchor = onSphere(new THREE.Group(), V(0, -0.13, 0.99), 1); face.add(mouthAnchor);
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.095, 32, Math.PI, Math.PI), new THREE.MeshBasicMaterial({ color: "#2a1830" })); mouth.position.z = 0.012; mouthAnchor.add(mouth);
    const tongue = new THREE.Mesh(new THREE.CircleGeometry(0.05, 24, Math.PI, Math.PI), new THREE.MeshBasicMaterial({ color: "#ff8fb5" })); tongue.position.set(0, -0.042, 0.016); tongue.scale.y = 0.7; mouthAnchor.add(tongue);
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.014, 8, 24, Math.PI), ink); smile.rotation.z = Math.PI; smile.position.z = 0.012; mouthAnchor.add(smile);
    const stalk = new THREE.Mesh(new THREE.BufferGeometry(), gloss(look.stalk || C.violet, { roughness: 0.3 })); head.add(stalk);
    const bulbMat = new THREE.MeshBasicMaterial({ color: C.aqua }), bulb = new THREE.Mesh(new THREE.SphereGeometry(0.085, 24, 16), bulbMat); head.add(bulb);
    const haloMat = new THREE.MeshBasicMaterial({ map: radial([[0, "rgba(255,255,255,.9)"], [0.3, "rgba(255,255,255,.45)"], [1, "rgba(255,255,255,0)"]]), transparent: true, depthWrite: false, color: C.aqua });
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), haloMat); head.add(halo);
    const handSkin = pearl(0.8, look); handSkin.envMap = env;
    const hands = [-1, 1].map(() => { const g = new THREE.Mesh(new THREE.SphereGeometry(0.24, seg[0] / 2, seg[1] / 2), handSkin); root.add(g); return g; });
    if (look.acc) accessory(look.acc, head, face, hands, env, look.core || C.aqua);
    const shadowTex = radial([[0, "rgba(40,36,70,.55)"], [0.45, "rgba(40,36,70,.22)"], [1, "rgba(40,36,70,0)"]]);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.renderOrder = -4;
    const handShadows = hands.map(() => { const s = shadow.clone(); s.material = shadow.material.clone(); return s; });
    const floorGlow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: radial([[0, "rgba(255,255,255,1)"], [1, "rgba(255,255,255,0)"]]), transparent: true, depthWrite: false, color: C.aqua, opacity: 0 }));
    floorGlow.rotation.x = -Math.PI / 2; floorGlow.renderOrder = -5;
    const q = new THREE.Quaternion();

    function apply(Y, camera) {
      root.position.copy(Y.pos); squash.scale.set(Y.sx, Y.sy, Y.sx); squash.position.y = (Y.sy - 1) * 0.9;
      head.rotation.set(Y.pitch, Y.yaw, Y.roll);
      for (const e of eyes) {
        const st = e.s < 0 ? Y.eyeL : Y.eyeR, open = st === "open" || st === "wide" || st === "squint";
        const k = open ? Math.max(0.06, 1 - Y.blink) * (st === "wide" ? 1.18 : st === "squint" ? 0.55 : 1) : 0;
        e.eye.visible = e.glint.visible = e.glint2.visible = k > 0.1;
        e.eye.scale.set(0.118 * (st === "wide" ? 1.12 : 1), 0.168 * k, 0.05);
        e.glint.visible = e.glint.visible && k > 0.4; e.glint2.visible = e.glint.visible;
        e.arc.visible = !open || k <= 0.1;
        e.arc.rotation.z = st === "happy" || st === "wink" ? 0 : Math.PI;
        e.arc.position.y = st === "happy" || st === "wink" ? -0.02 : 0.02;
      }
      const K = clamp(Y.mouth, 0, 1);
      mouth.visible = tongue.visible = K > 0.08; smile.visible = !mouth.visible;
      mouth.scale.set(1 + Y.mouthW * 0.3, 0.35 + K * 1.1, 1); tongue.scale.set(1, 0.5 + K * 0.5, 1); tongue.position.y = -0.02 - K * 0.03;
      skin.userData.u.uCore.value.set(Y.core); skin.userData.u.uCoreK.value = Y.coreK;
      handSkin.userData.u.uCore.value.set(Y.core); handSkin.userData.u.uCoreK.value = Y.coreK * 0.6;
      bulbMat.color.set(Y.bulb); haloMat.color.set(Y.bulb); haloMat.opacity = 0.35 + Y.bulbK * 0.5; bulb.scale.setScalar(0.85 + Y.bulbK * 0.3);
      const a = V(0, 0.97, -0.06), tip = V(0.12 + Y.ant.x, 1.5 + Y.ant.y, -0.08 + Y.ant.z), mid = V(-0.02 + Y.ant.x * 0.35, 1.28, -0.1);
      stalk.geometry.dispose(); stalk.geometry = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, tip), 20, 0.026, 8);
      bulb.position.copy(tip); halo.position.copy(tip);
      halo.quaternion.copy(camera.quaternion).premultiply(q.copy(head.getWorldQuaternion(new THREE.Quaternion())).invert());
      hands.forEach((h, i) => { h.position.copy(Y.hands[i]); h.scale.setScalar(Y.handS[i]); h.visible = Y.handS[i] > 0.02; });
      const lift = Math.max(0, Y.pos.y - 1);
      shadow.position.set(Y.pos.x, 0.003, Y.pos.z); shadow.scale.setScalar(2.3 + lift * 0.9); shadow.material.opacity = 0.62 / (1 + lift * 1.25);
      hands.forEach((h, i) => {
        const w = h.getWorldPosition(new THREE.Vector3()), s = handShadows[i];
        s.position.set(w.x, 0.002, w.z); s.scale.setScalar(0.6 + w.y * 0.25); s.material.opacity = h.visible ? 0.4 / (1 + w.y * 1.4) : 0;
      });
      floorGlow.position.set(Y.pos.x, 0.004, Y.pos.z); floorGlow.scale.setScalar(4.8 + lift * 1.2); floorGlow.material.color.set(Y.core); floorGlow.material.opacity = Y.floorGlow;
    }
    return { root, head, face, apply, shadow, handShadows, floorGlow, hands, body, skin };
  }

  // ----- a teammate's one accessory: the same eight the Marketplace's teammates carry -----
  function accessory(kind, head, face, hands, env, tint) {
    const ink = gloss("#5b5680", { envMap: env, roughness: 0.3 }), pale = gloss("#ffffff", { envMap: env }), col = gloss(tint, { envMap: env, roughness: 0.25 });
    const add = (parent, geo, mat, p, r = [0, 0, 0], sc = [1, 1, 1]) => { const m = new THREE.Mesh(geo, mat); m.position.set(...p); m.rotation.set(...r); m.scale.set(...sc); parent.add(m); return m; };
    if (kind === "headset") {
      add(head, new THREE.TorusGeometry(1.04, 0.06, 10, 48, Math.PI), ink, [0, 0.02, -0.06], [0, Math.PI / 2, Math.PI / 2]);
      for (const s of [-1, 1]) add(head, new THREE.CylinderGeometry(0.26, 0.26, 0.16, 28), ink, [s * 1.02, 0.02, -0.04], [0, 0, Math.PI / 2]);
      const boom = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(-1.02, -0.08, 0.1), new THREE.Vector3(-0.95, -0.55, 0.7), new THREE.Vector3(-0.35, -0.55, 0.98)), 16, 0.035, 8);
      add(head, boom, ink, [0, 0, 0]); add(head, new THREE.SphereGeometry(0.075, 16, 12), ink, [-0.33, -0.55, 0.99]);
    } else if (kind === "glasses") {
      for (const s of [-1, 1]) add(face, new THREE.TorusGeometry(0.17, 0.025, 8, 32), ink, [s * 0.31, 0.12, 1.02]);
      add(face, new THREE.CylinderGeometry(0.02, 0.02, 0.26, 8), ink, [0, 0.14, 1.03], [0, 0, Math.PI / 2]);
    } else {
      const h = hands[1], g = new THREE.Group(); g.position.set(0, 0.32, 0.05); h.add(g);
      if (kind === "calendar") { add(g, new THREE.BoxGeometry(0.5, 0.46, 0.08), pale, [0, 0, 0]); add(g, new THREE.BoxGeometry(0.5, 0.12, 0.09), col, [0, 0.17, 0.005]); }
      else if (kind === "bubble") { add(g, new THREE.SphereGeometry(0.26, 24, 16), pale, [0, 0, 0], [0, 0, 0], [1.2, 0.85, 0.5]); add(g, new THREE.ConeGeometry(0.08, 0.16, 12), pale, [-0.16, -0.22, 0], [0, 0, 0.6]); }
      else if (kind === "star") { const sh = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.12 : 0.28; sh[i ? "lineTo" : "moveTo"](Math.cos(a) * r, Math.sin(a) * r); } add(g, new THREE.ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 }), gloss("#ffd27d", { envMap: env }), [0, 0, 0]); }
      else if (kind === "heart") { const m = gloss("#ff8fb5", { envMap: env }); add(g, new THREE.SphereGeometry(0.15, 20, 14), m, [-0.1, 0.06, 0]); add(g, new THREE.SphereGeometry(0.15, 20, 14), m, [0.1, 0.06, 0]); add(g, new THREE.ConeGeometry(0.22, 0.3, 20), m, [0, -0.14, 0], [Math.PI, 0, 0]); }
      else if (kind === "drop") { const m = gloss("#7cc4ff", { envMap: env }); add(g, new THREE.SphereGeometry(0.2, 20, 14), m, [0, -0.05, 0]); add(g, new THREE.ConeGeometry(0.17, 0.3, 20), m, [0, 0.2, 0]); }
      else if (kind === "lens") { add(g, new THREE.TorusGeometry(0.18, 0.04, 10, 32), ink, [0, 0.08, 0]); add(g, new THREE.CircleGeometry(0.17, 24), gloss("#e8f6ff", { envMap: env, transparent: true, opacity: 0.6 }), [0, 0.08, 0]); add(g, new THREE.CylinderGeometry(0.035, 0.035, 0.28, 10), ink, [0.18, -0.16, 0], [0, 0, 0.7]); }
    }
  }

  // ----- one character: the Marketplace's act vocabulary, posed and sprung, on any rig in any scene -----
  // o.base: how high it floats (in its own units); o.local/o.world: convert between the scene and the rig's parent;
  // o.core: the colour of the light inside; o.still: no idle beats.
  function makeActor(pip, camera, o = {}) {
    const BASE = o.base || 1.5, toWorld = o.world || ((v) => v), toLocal = o.local || ((v) => v);
  // ----- what Pip is doing: the Marketplace's act vocabulary -----
  const A = { mood: "calm", moodAt: 0, concern: 0, think: 0, talkUntil: 0, happyUntil: 0, wideUntil: 0, hopAt: null, flashAt: null, nodAt: null,
    partyAt: null, waveAt: null, wakeAt: null, look: null, lookUntil: 0, pointTo: null, pointK: 0, nextBeat: 4 + Math.random() * 4, beat: null,
      task: null, ph: Math.random() * 9, throwAt: null, catchAt: null, ext: V(), crouchAt: null }; // ext: how fast the page is carrying him (his own units/s) // task: what a teammate is doing at their desk (type, sleep, needs, idle)
  const now = () => (o.clock ? o.clock() : performance.now() / 1000);
  const T0 = now();

  // where Pip's body is at time t (pure, so the antenna can feel his motion like the Marketplace's)
  function posAt(t) {
    const p = V(0, BASE, 0);
    let bob = 1;
    if (A.wakeAt != null) {
      const P = wakeP(t);
      if (P < 3.4) { bob = ramp(P, 2.3, 2.9); p.y = P < 2.32 ? BASE - 0.7 : lerp(BASE - 0.7, BASE, expoOut(ramp(P, 2.32, 2.87))); }
    }
    if (A.task === "sleep") p.y += Math.sin(t * Math.PI * 2 / 5.5) * 0.04 - 0.12; // asleep at the desk: lower, slower
    else p.y += Math.sin(t * Math.PI * 2 / 3.6) * 0.055 * bob;
    if (A.hopAt != null) { const y = t - A.hopAt; if (y > 0 && y < 1.2) p.y += Math.sin(clamp((y - 0.12) / 0.5) * Math.PI) * 0.35; }
    if (A.partyAt != null) {
      const x = t - A.partyAt;
      if (x > 0 && x < 3) p.y += (Math.max(0, Math.sin(ramp(x, 0.2, 0.7) * Math.PI)) + Math.max(0, Math.sin(ramp(x, 0.85, 1.35) * Math.PI))) * 0.16 + Math.sin(ramp(x, 1.5, 2.5) * Math.PI) * 0.18;
    }
    if (A.beat && A.beat.k === "hops") { const x = t - A.beat.at; p.y += (Math.max(0, Math.sin(ramp(x, 0.2, 0.7) * Math.PI)) + Math.max(0, Math.sin(ramp(x, 0.85, 1.35) * Math.PI))) * 0.16 * A.beat.q; }
    if (A.beat && A.beat.k === "turn") { const x = t - A.beat.at; p.y += Math.sin(ramp(x, 0.1, 1.3) * Math.PI) * 0.2; }
    return p;
  }
  const wakeP = (t) => 0.5 + Math.max(0, t - A.wakeAt - 0.9) * 1.65; // asleep for a beat, then the Marketplace's wake-up

  function pose(t) {
    const Y = { pos: posAt(t), sx: 1, sy: 1, yaw: 0, pitch: 0, roll: 0, lookX: 0, lookY: 0, lookAt: null, eyeL: "open", eyeR: "open", blink: 0, mouth: 0.45, mouthW: 0,
      core: o.core || C.aqua, coreK: 0.5, bulb: o.core || C.aqua, bulbK: 0.7, ant: V(), hands: [V(-1.32, -0.32, 0.25), V(1.32, -0.32, 0.25)], handS: [1, 1], floorGlow: 0.1 };
    const pos = Y.pos, hand = (j, to, k) => { Y.hands[j] = Y.hands[j].clone().lerp(to, clamp(k)); };
    const look = A.look && t < A.lookUntil ? A.look : null;
    Y.lookAt = look;
    // blinks, the Marketplace's schedule
    { const N = t % 60; for (let R = 0; R < 20; R++) { const at = 3.3 + R * 3.1 + hash(R) * 1.4; if (Math.abs(N - at) < 0.2) Y.blink = Math.max(Y.blink, pulse(N, at, 0.055)); } }
    // waking up, as on the Marketplace home
    let waking = false;
    if (A.wakeAt != null) {
      const P = wakeP(t);
      if (P < 3.4) {
        waking = true;
        const D = ramp(P, 2.3, 2.9), Vv = Math.sin(t * 2.2) * 0.02 * (1 - D);
        Y.eyeL = Y.eyeR = P < 1.15 ? "sleep" : "open";
        Y.blink = P < 1.15 ? 0 : pulse(P, 1.3, 0.06) + pulse(P, 1.55, 0.05);
        Y.bulbK = P < 0.8 ? 0.05 : 0.05 + 0.95 * ramp(P, 0.8, 1.1) * (P < 1.1 ? (Math.sin(P * 90) > 0 ? 1 : 0.3) : 1);
        Y.coreK = 0.15 + 0.4 * ramp(P, 0.9, 1.5);
        Y.lookAt = P < 1.4 ? null : P < 1.85 ? V(-4, 1.2, 3) : look;
        Y.pitch = P < 1.15 ? 0.18 : 0.05;
        let R = lerp(0.84 + Vv, 1, smoother(ramp(P, 2.22, 2.5)));
        R -= pulse(P, 2.12, 0.085) * 0.09; R += pulse(P, 2.4, 0.11) * 0.15; R -= pulse(P, 2.9, 0.07) * 0.06;
        if (P > 2.95) R += Math.sin((P - 2.95) * 18) * 0.025 * Math.exp(-(P - 2.95) * 6);
        Y.sy = R; Y.sx = 1 + (1 - R) * 0.55;
        Y.handS = [back(ramp(P, 2.42, 2.82)), back(ramp(P, 2.48, 2.88))];
        Y.mouth = P < 1.15 ? 0 : 0.3;
      }
    }
    if (!waking) { Y.hands[0].y += Math.sin(t * 1.9) * 0.045; Y.hands[1].y += Math.sin(t * 1.9 + 1.3) * 0.045; }

    // idle beats while calm (a subset of the Marketplace's repertoire)
    if (!waking && !A.task && A.mood === "calm" && !A.pointTo && A.beat) {
      const b = A.beat, x = t - b.at, d = b.d, q = clamp(x / 0.45) * clamp((d - x) / 0.45);
      b.q = q;
      if (x > d) A.beat = null;
      else if (b.k === "chin") {
        hand(1, V(0.4, -0.5, 1).add(V(0, Math.sin(x * 15) * 0.035 * ramp(x, 0.8, 1) * (1 - ramp(x, 2.2, 2.4)), 0)), q * smoother(ramp(x, 0.2, 0.7)));
        Y.lookAt = pos.clone().add(V(-2.6, 3.6, 3)); Y.roll -= 0.07 * q; Y.pitch -= 0.05 * q;
        if (q > 0.5) Y.eyeL = Y.eyeR = x > 0.7 && x < 1.9 ? "squint" : x > 2.3 && x < 2.7 ? "wide" : "open";
        Y.coreK += pulse(x, 2.5, 0.12) * 0.8 * q; Y.mouth = lerp(Y.mouth, x > 2.3 && x < 2.7 ? 0.6 : 0.08, q);
      } else if (b.k === "sweep") {
        const s = smoother(ramp(x, 0.2, d - 0.3)), tx = lerp(-5.5, 5.5, s);
        Y.lookAt = V(tx, 2.4 + Math.sin(s * Math.PI) * 0.8, 2.5); Y.yaw += lerp(-0.32, 0.32, s) * q;
        Y.bulbK = lerp(Y.bulbK, 0.6 + 0.4 * Math.abs(Math.sin(t * 14)), q); if (q > 0.5) Y.eyeL = Y.eyeR = "wide";
        hand(0, V(-1.2, 0.1, 0.8), q * 0.6); hand(1, V(1.2, 0.1, 0.8), q * 0.6);
      } else if (b.k === "stretch") {
        const s = Math.sin(ramp(x, 0.3, 2) * Math.PI);
        Y.sy += 0.1 * s * q; Y.sx -= 0.05 * s * q; hand(0, V(-0.95, 1.2, 0.2), s * q); hand(1, V(0.95, 1.2, 0.2), s * q);
        if (q > 0.5 && s > 0.3) Y.eyeL = Y.eyeR = "happy"; Y.mouth = lerp(Y.mouth, 0.55, s * q); Y.pitch -= 0.08 * s * q;
      } else if (b.k === "turn") {
        const a = smoother(ramp(x, 0.2, 1.2)) * Math.PI * 2;
        Y.yaw += a; Y.hands = Y.hands.map((h) => h.clone().applyAxisAngle(V(0, 1, 0), a)); Y.coreK += pulse(x, 1.25, 0.12) * 0.9;
        if (x > 1.15 && x < 1.6) Y.eyeL = Y.eyeR = "happy";
      } else if (b.k === "hops") {
        hand(0, V(-1.4, 0.35, 0.5), q * 0.7); hand(1, V(1.4, 0.35, 0.5), q * 0.7); if (q > 0.5) Y.eyeL = Y.eyeR = "happy"; Y.mouth = lerp(Y.mouth, 0.7, q);
      }
    }

    // thinking: the colour wheel in his core, eyes up, a hand at the chin
    if (A.think > 0.01) {
      const k = A.think, cs = ["#5eead9", "#9b86ff", "#ff7d98", "#ffd27d"], D = (t * 1.4) % 4;
      const cc = new THREE.Color(cs[Math.floor(D)]).lerp(new THREE.Color(cs[(Math.floor(D) + 1) % 4]), D % 1);
      Y.core = "#" + new THREE.Color(Y.core).lerp(cc, k).getHexString(); Y.coreK = lerp(Y.coreK, 0.8, k);
      Y.bulbK = lerp(Y.bulbK, 0.7 + 0.3 * Math.sin(t * 10), k);
      hand(1, V(0.4, -0.5, 1).add(V(0, Math.sin(t * 15) * 0.03, 0)), k);
      if (!look) Y.lookAt = pos.clone().add(V(-2.6, 3.6, 3));
      Y.roll -= 0.06 * k; Y.mouth = lerp(Y.mouth, 0.1, k); if (k > 0.5) Y.eyeL = Y.eyeR = "squint";
    }

    // concerned: head down and tilted, hands held in, small mouth, the antenna droops, the light inside cools to pink
    if (A.concern > 0.01) {
      const k = A.concern;
      Y.pitch += 0.1 * k; Y.roll += 0.1 * k; Y.mouth = lerp(Y.mouth, 0.1, k); Y.mouthW = lerp(Y.mouthW, 0.25, k);
      hand(0, V(-0.62, -0.3, 1.0).add(V(0, Math.sin(t * 2.4) * 0.03, 0)), k); hand(1, V(0.62, -0.3, 1.0).add(V(0, Math.sin(t * 2.4 + 1) * 0.03, 0)), k);
      Y.core = "#" + new THREE.Color(Y.core).lerp(new THREE.Color(C.pink), 0.6 * k).getHexString();
      Y.coreK = lerp(Y.coreK, 0.42, k); Y.bulb = "#" + new THREE.Color(Y.bulb).lerp(new THREE.Color(C.pink), 0.7 * k).getHexString(); Y.bulbK = lerp(Y.bulbK, 0.3, k);
      const since = t - A.moodAt;
      if (A.mood === "concerned" && since < 1.4) { Y.roll += pulse(since, 0.4, 0.28) * 0.18; Y.eyeL = Y.eyeR = "squint"; }
      if (!look && !A.pointTo) Y.lookAt = pos.clone().add(V(0, -0.6, 4));
    }

    // pointing at the next thing to do (the Marketplace's point: a hand reaches toward it, eyes follow)
    if (A.pointTo && A.pointK > 0.01) {
      const P = A.pointTo.clone(), dir = P.clone().sub(pos); dir.z = Math.max(dir.z, 0.4); dir.normalize();
      const j = dir.x < -0.15 ? 0 : 1, reach = dir.clone().multiplyScalar(1.45).add(V(0, -0.05, 0.25));
      reach.y += Math.sin(t * 3.2) * 0.03;
      hand(j, reach, A.pointK);
      Y.lookAt = P; Y.yaw += clamp((P.x - pos.x) * 0.08, -0.35, 0.35) * A.pointK;
    }

    // a teammate at work (the Portal's desks): typing with both hands, a glance up now and then, a sip, a stretch
    if (A.task === "type" && !waking) {
      const g = (t + A.ph) % 9.5, glance = g > 6.2 && g < 7.6, sip = (t + A.ph * 1.7) % 23 < 2.2;
      const tap = (o2) => Math.max(0, Math.sin(t * 16 + o2)) * 0.06;
      hand(0, V(-0.44, -1.1 + tap(0), 1.34), 0.92); hand(1, sip ? V(0.32, -0.42, 1.02) : V(0.44, -1.1 + tap(1.9), 1.34), 0.92); // on the keys
      Y.pitch += glance ? -0.02 : 0.07; Y.mouth = sip ? 0.1 : 0.3;
      if (!look) Y.lookAt = glance ? toLocal(camera.position.clone()) : pos.clone().add(V(Math.sin(t * 0.7) * 0.4, -0.35, 3));
      if (glance) Y.eyeL = Y.eyeR = "open";
    }
    if (A.task === "sleep" && !waking) {
      Y.eyeL = Y.eyeR = "sleep"; Y.blink = 0; Y.bulbK = 0.08 + 0.05 * Math.sin(t * 1.1); Y.coreK = 0.12; Y.pitch += 0.24; Y.roll += 0.06; Y.mouth = 0;
      hand(0, V(-0.9, -0.82, 0.55), 0.9); hand(1, V(0.9, -0.82, 0.55), 0.9); Y.ant.y -= 0.1;
    }
    if (A.task === "needs" && !waking) { // waiting on the owner: looks out to the aisle, a hand up now and then
      const w = (t + A.ph) % 5.2;
      if (!look) Y.lookAt = toLocal(camera.position.clone());
      if (w < 1.6) { const k = Math.sin(clamp(w / 1.6) * Math.PI); hand(1, V(1.1, 0.7 + Math.sin(w * 13) * 0.08 * k, 0.5), k); Y.eyeL = Y.eyeR = "wide"; }
    }
    if (A.throwAt != null) { const x = t - A.throwAt; if (x > 0 && x < 1) { const k = Math.sin(clamp(x) * Math.PI); hand(1, V(0.9, 0.35, 1.2), k); Y.eyeL = Y.eyeR = x < 0.8 ? "happy" : "open"; } }
    if (A.catchAt != null) { const x = t - A.catchAt; if (x > -0.6 && x < 0.9) { const k = Math.sin(clamp((x + 0.6) / 1.5) * Math.PI); hand(0, V(-0.9, 0.5, 1.1), k); if (x > 0) Y.eyeL = Y.eyeR = "happy"; } }

    // talking
    if (t < A.talkUntil) { Y.mouth = 0.22 + 0.45 * Math.abs(Math.sin(t * 13)); Y.pitch += (Math.sin(t * 5.3) * 0.5 + 0.5) * 0.03; }
    if (t < A.happyUntil) { Y.eyeL = Y.eyeR = "happy"; if (t >= A.talkUntil) Y.mouth = 0.7; }
    if (t < A.wideUntil) Y.eyeL = Y.eyeR = "wide";
    if (A.nodAt != null) Y.pitch += (pulse(t, A.nodAt + 0.18, 0.16) - 0.6 * pulse(t, A.nodAt + 0.45, 0.14)) * 0.22;
    if (A.hopAt != null) {
      const y = t - A.hopAt;
      if (y < 1.2 && y > 0) { Y.sy -= pulse(y, 0.08, 0.06) * 0.12; Y.sy += pulse(y, 0.3, 0.1) * 0.14; Y.sy -= pulse(y, 0.7, 0.06) * 0.08; Y.sx = 1 + (1 - Y.sy) * 0.55; }
    }
    if (A.flashAt != null) { const w = pulse(t, A.flashAt + 0.05, 0.12); Y.coreK += w * 1.3; if (w > 0.05) Y.core = "#bff8ef"; }

    // hello (and goodbye): the Marketplace's wave
    if (A.waveAt != null) {
      const x = t - A.waveAt, w = ramp(x, 0, 0.35) * (1 - ramp(x, 1.3, 1.7));
      if (w > 0) {
        hand(1, V(1.22, 0.6, 0.4), smoother(w));
        Y.hands[1].x += Math.sin(x * Math.PI * 2 * 2.1) * 0.17 * w; Y.hands[1].y += Math.cos(x * Math.PI * 4.2) * 0.04 * w;
        Y.roll += Math.sin(x * Math.PI * 2 * 2.1) * 0.05 * w; if (w > 0.5) Y.eyeL = Y.eyeR = "happy"; Y.mouth = Math.max(Y.mouth, 0.6 * w);
      }
    }

    // celebrating: two happy hops, hands up, a flash, then a full spin (go-live, accepted price, a tool connected)
    if (A.partyAt != null) {
      const x = t - A.partyAt;
      if (x < 3) {
        const q = clamp(x / 0.2) * clamp((3 - x) / 0.4);
        hand(0, V(-1.4, 0.55, 0.5), q * 0.85); hand(1, V(1.4, 0.55, 0.5), q * 0.85);
        Y.eyeL = Y.eyeR = x < 2.6 ? "happy" : Y.eyeL; Y.mouth = lerp(Y.mouth, 0.75, q);
        Y.sy -= (pulse(x, 0.12, 0.06) + pulse(x, 0.78, 0.06)) * 0.1; Y.sx = 1 + (1 - Y.sy) * 0.55;
        const sp = smoother(ramp(x, 1.45, 2.4));
        if (sp > 0 && sp < 1) { Y.yaw += sp * Math.PI * 2; Y.hands = Y.hands.map((h) => h.clone().applyAxisAngle(V(0, 1, 0), sp * Math.PI * 2)); }
        Y.coreK += pulse(x, 0.35, 0.2) * 1.1 + pulse(x, 2.45, 0.2) * 0.8; if (pulse(x, 0.35, 0.2) > 0.3) Y.core = "#bff8ef";
        Y.floorGlow = 0.1 + 0.3 * pulse(x, 2.45, 0.35) + 0.12 * q;
        Y.ant.y += Math.sin(x * 15) * 0.1 * Math.exp(-x * 1.6);
      } else A.partyAt = null;
    }

    // the antenna trails his motion (as in the Marketplace), including being carried across the room
    const p0 = posAt(t), p1 = posAt(t - 0.12), p2 = posAt(t - 0.24), j = p0.clone().sub(p1), g = j.clone().sub(p1.clone().sub(p2));
    Y.ant.add(V(-j.x * 0.9 - g.x * 2 + Math.sin(t * 2.3) * 0.03, -Math.abs(j.y) * 0.4 - g.y * 2.2, -j.z * 0.5));
    const ex = clamp(A.ext.x / 6, -1, 1), ez = clamp(A.ext.z / 6, -1, 1);
    Y.ant.x -= ex * 0.22; Y.ant.z -= ez * 0.16; Y.roll -= ex * 0.09; Y.pitch += ez * 0.07; // leans into the move, the antenna streams behind
    // a little crouch before he sets off
    if (A.crouchAt != null) { const y = t - A.crouchAt; if (y > 0 && y < 0.6) { const c = pulse(y, 0.1, 0.09); Y.sy -= c * 0.1; Y.sx = Math.max(Y.sx, 1 + c * 0.055); Y.pos.y -= c * 0.12; } }
    if (A.concern > 0.01) { Y.ant.y -= 0.12 * A.concern; Y.ant.x += 0.1 * A.concern; }
    if (A.wakeAt != null) { const P = wakeP(t); if (P < 1.1) { Y.ant.y = -0.18; Y.ant.x = 0.14; } else if (P < 2.2) { Y.ant.y = lerp(-0.18, 0, back(ramp(P, 1.1, 1.5))); Y.ant.x = lerp(0.14, 0, ramp(P, 1.1, 1.5)); } }
    return Y;
  }

  // ----- no jolts: every pose passes through critically damped springs (the Marketplace's pipSmooth) -----
  const S = {};
  function sd(c, g0, v, st, dt, mx) {
    const om = 2 / st, x = om * dt, ex = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    let ch = c - g0; const mc = mx * st; ch = Math.max(-mc, Math.min(mc, ch));
    const g = c - ch, tm = (v + om * ch) * dt; let nv = (v - om * tm) * ex, o = g + (ch + tm) * ex;
    if (g0 - c > 0 === o > g0) { o = g0; nv = 0; }
    return [o, nv];
  }
  function sdv(k, tgt, st, dt, mx) {
    const p = S[k], v = S[k + "v"] || (S[k + "v"] = [0, 0, 0]);
    if (!p) return (S[k] = tgt.clone());
    ["x", "y", "z"].forEach((a, i) => { const r = sd(p[a], tgt[a], v[i], st, dt, mx); p[a] = r[0]; v[i] = r[1]; });
    return p;
  }
  function sda(k, tgt, st, dt, mx) {
    if (S[k] == null) { S[k] = tgt; S[k + "v"] = 0; return tgt; }
    let d = tgt - S[k]; d = Math.atan2(Math.sin(d), Math.cos(d));
    const r = sd(S[k], S[k] + d, S[k + "v"], st, dt, mx); S[k] = r[0]; S[k + "v"] = r[1]; return r[0];
  }
  let lastT = null, lastF = null;
  function smooth(J) {
    const t = now(), dt = lastT == null ? 1 : t - lastT; lastT = t;
    const lk = J.lookAt ? J.lookAt.clone() : toLocal(camera.position.clone());
    if (dt > 0.3 || dt <= 0) {
      for (const k in S) delete S[k];
      S.look = lk.clone(); S.pos = J.pos.clone(); S.h0 = J.hands[0].clone(); S.h1 = J.hands[1].clone(); S.yaw = J.yaw; S.pitch = J.pitch; S.roll = J.roll;
      for (const k of ["lookv", "posv", "h0v", "h1v"]) S[k] = [0, 0, 0];
      for (const k of ["yawv", "pitchv", "rollv"]) S[k] = 0;
      J.lookAt = lk; return J;
    }
    const o = { ...J };
    o.lookAt = sdv("look", lk, 0.13, dt, 38).clone(); o.pos = sdv("pos", J.pos, 0.05, dt, 22).clone();
    o.hands = [sdv("h0", J.hands[0], 0.06, dt, 9).clone(), sdv("h1", J.hands[1], 0.06, dt, 9).clone()];
    o.yaw = sda("yaw", J.yaw, 0.11, dt, 14); o.pitch = sda("pitch", J.pitch, 0.1, dt, 8); o.roll = sda("roll", J.roll, 0.1, dt, 8);
    return o;
  }

  function step(tAbs, noSmooth) {
    const t = tAbs - T0;
    // ease the mood layers in and out
    const target = A.mood === "concerned" ? 1 : 0, think = A.mood === "think" ? 1 : 0, dt = Math.min(0.1, lastF == null ? 0.016 : Math.max(0, tAbs - lastF)), ease = (r) => (noSmooth ? 1 : 1 - Math.exp(-dt * r));
    lastF = tAbs;
    A.concern += (target - A.concern) * ease(3.6); A.think += (think - A.think) * ease(4.8);
    A.pointK += ((A.pointTo ? 1 : 0) - A.pointK) * ease(4.2);
    if (!A.pointTo && A.pointK < 0.02) A.pointTarget = null;
    // the next idle beat
    if (!o.still && !A.task && A.mood === "calm" && !A.beat && !A.pointTo && t > A.nextBeat && (A.wakeAt == null || wakeP(t) > 4)) {
      const pool = [["chin", 3, 2.8], ["sweep", 2, 3], ["stretch", 2, 2.4], ["turn", 0.6, 1.8], ["hops", 0.8, 1.8]];
      let r = Math.random() * pool.reduce((s, x) => s + x[1], 0), pick = pool[0];
      for (const p of pool) { if (r < p[1]) { pick = p; break; } r -= p[1]; }
      A.beat = { k: pick[0], at: t, d: pick[2], q: 0 };
      A.nextBeat = t + pick[2] + 7 + Math.random() * 7;
    }
    let J = pose(t);
    if (!noSmooth) J = smooth(J);
    else if (!J.lookAt) J.lookAt = toLocal(camera.position.clone());
    pip.apply(J, camera);
    const lk = pip.head.worldToLocal(toWorld((J.lookAt || toLocal(camera.position.clone())).clone()));
    J.lookX = clamp((lk.x / Math.max(1, Math.hypot(lk.x, lk.z))) * 1.6, -1, 1); J.lookY = clamp((lk.y / Math.max(1, lk.length())) * 1.6, -1, 1);
    pip.face.rotation.set(-J.lookY * 0.17, J.lookX * 0.22, 0);
    return J;
  }

    const acts = {
    mood(m) { if (m === A.mood) return; A.mood = m; A.moodAt = now() - T0; A.beat = null; },
    talk(sec) { A.talkUntil = now() - T0 + sec; },
    happy(sec = 1.2) { A.happyUntil = now() - T0 + sec; },
    wide(sec = 1) { A.wideUntil = now() - T0 + sec; },
    nod() { A.nodAt = now() - T0; },
    hop() { A.hopAt = now() - T0; },
    crouch() { A.crouchAt = now() - T0; },
    flash() { A.flashAt = now() - T0; },
    wave() { A.waveAt = now() - T0; },
    party() { A.partyAt = now() - T0; A.flashAt = A.partyAt + 0.3; },
    wake() { A.wakeAt = now() - T0; },
    awake() { return A.wakeAt == null || wakeP(now() - T0) > 3.4; },
    lookAt(world, sec = 1.2) { A.look = world ? toLocal(world.clone()) : null; A.lookUntil = now() - T0 + sec; },
    point(world) { A.pointTo = world ? toLocal(world.clone()) : null; },
    };
    return { step, A, acts, wakeP, T0, now, get t() { return now() - T0; } };
  }
  if (opts.kit) return { room, buildPip, makeActor, C, pearl };

  // ----- the stage: transparent, so Pip stands on the Portal's own paper -----
  const canvas = opts.canvas;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: !!opts.still });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer), env = pmrem.fromScene(room(), 0.04).texture; pmrem.dispose();
  scene.environment = env;
  scene.add(new THREE.HemisphereLight("#ffffff", "#d9dce8", 0.7));
  const key = new THREE.DirectionalLight("#ffffff", 2); key.position.set(-4, 7, 5); scene.add(key);
  const fill = new THREE.DirectionalLight("#dfe8ff", 1); fill.position.set(5, 3, -4); scene.add(fill);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  const pip = buildPip(env);
  scene.add(pip.root, pip.shadow, pip.floorGlow, ...pip.handShadows);

  const CAM = V(0, 2.1, 7.6), LOOK = V(0, 1.72, 0);
  let W = 1, H = 1, dpr = Math.min(2, window.devicePixelRatio || 1);
  function resize(w, h) {
    W = Math.max(1, Math.round(w)); H = Math.max(1, Math.round(h));
    renderer.setPixelRatio(dpr); renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.fov = W / H < 0.8 ? 38 : 30; camera.updateProjectionMatrix();
  }

  const actor = makeActor(pip, camera, { still: opts.still, clock: opts.clock }), A = actor.A, T0 = actor.T0, now = actor.now, wakeP = actor.wakeP;
  function screenToWorld(px, py, depth) {
    const p = V((px / W) * 2 - 1, -((py / H) * 2 - 1), 0.5).unproject(camera), d = p.sub(camera.position).normalize();
    const k = (depth - camera.position.z) / d.z;
    return camera.position.clone().add(d.multiplyScalar(k));
  }

  function frame(tAbs, noSmooth, noRender) {
    const t = tAbs - T0, cam = CAM.clone();
    cam.x += Math.sin(t * 0.21) * 0.05; cam.y += Math.sin(t * 0.17 + 1) * 0.035;
    camera.position.copy(cam); camera.lookAt(LOOK); camera.updateMatrixWorld();
    actor.step(tAbs, noSmooth);
    if (!noRender) renderer.render(scene, camera);
  }

  const api = {
    renderer, resize, frame,
    get t() { return now() - T0; },
    screenToWorld,
    mood(m) { if (m === A.mood) return; A.mood = m; A.moodAt = now() - T0; A.beat = null; },
    talk(sec) { A.talkUntil = now() - T0 + sec; },
    happy(sec = 1.2) { A.happyUntil = now() - T0 + sec; },
    wide(sec = 1) { A.wideUntil = now() - T0 + sec; },
    nod() { A.nodAt = now() - T0; },
    hop() { A.hopAt = now() - T0; },
    crouch() { A.crouchAt = now() - T0; },
    flash() { A.flashAt = now() - T0; },
    wave() { A.waveAt = now() - T0; },
    party() { A.partyAt = now() - T0; A.flashAt = A.partyAt + 0.3; },
    wake() { A.wakeAt = now() - T0; },
    awake() { return A.wakeAt == null || wakeP(now() - T0) > 3.4; },
    lookAt(world, sec = 1.2) { A.look = world; A.lookUntil = now() - T0 + sec; },
    point(world) { A.pointTo = world; },
    // render a posed frame with no springs, for the stills
    pose(set) { Object.assign(A, set); },
    dispose() { renderer.dispose(); env.dispose(); },
  };
  return api;
}

