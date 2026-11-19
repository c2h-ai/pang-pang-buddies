// PROTOTYPE - NOT FOR PRODUCTION
// Question: DJ의 예고를 읽고 동물 스킬로 서로를 구하는 60초가, 봇과 혼자 해도 여럿이 해도 웃기고 다시 하고 싶은가?
// Date: 2026-11-19
'use strict';
// The ride and everything drawn around it: a giant LP record for a disc (the signature), its
// cushions and gold rail, a glowing pool on a sky deck above the night city, the DJ's booth,
// the lights, the particles and the camera.

const DISC = { R: 6, IN: 5.36, RAIL_H: 0.98, SEGS: 8, POOL_R: 7.9, POOL_Y: -1.45, DECK_Y: -1.3 };

// The title's own lettering: round strokes, drawn here so the logo and the neon sign match.
const GLYPHS = {
  '팡': { w: 100, lines: [[[8, 12], [58, 12]], [[8, 56], [58, 56]], [[22, 12], [22, 56]], [[44, 12], [44, 56]], [[80, 4], [80, 62]], [[80, 33], [97, 33]]], ovals: [[50, 90, 27, 14]] },
  '버': { w: 104, lines: [[[12, 16], [12, 94], [56, 94], [56, 16]], [[12, 56], [56, 56]], [[90, 4], [90, 106]], [[70, 54], [90, 54]]], ovals: [] },
  '디': { w: 96, lines: [[[58, 20], [12, 20], [12, 90], [60, 90]], [[86, 4], [86, 106]]], ovals: [] },
  '즈': { w: 100, lines: [[[20, 12], [80, 12]], [[24, 62], [50, 16], [76, 62]], [[6, 92], [94, 92]]], ovals: [] },
  '!': { w: 34, lines: [[[17, 6], [17, 70]]], ovals: [[17, 98, 3, 3]] },
  ' ': { w: 40, lines: [], ovals: [] },
};
function glyphRun(text, each) { // each(glyph, xOffset) over the run; returns its width (height is 110)
  let x = 0;
  for (const ch of text) { const g = GLYPHS[ch]; if (!g) continue; each(g, x); x += g.w + 16; }
  return x - 16;
}
function strokeGlyphs(g, text, x, y, h, lw, style) {
  const k = h / 110; g.save(); g.translate(x, y); g.scale(k, k);
  g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = lw / k; g.strokeStyle = style;
  glyphRun(text, (gl, ox) => {
    for (const ln of gl.lines) { g.beginPath(); ln.forEach((p, i) => i ? g.lineTo(ox + p[0], p[1]) : g.moveTo(ox + p[0], p[1])); g.stroke(); }
    for (const o of gl.ovals) { g.beginPath(); g.ellipse(ox + o[0], o[1], o[2], o[3], 0, 0, Math.PI * 2); g.stroke(); }
  });
  g.restore();
}
function glyphWidth(text, h) { return glyphRun(text, () => {}) * h / 110; }

// A flat ring sector lying on the ground (normal up), angle b = atan2(z, x).
function arcGeo(r0, r1, b0, b1, seg, uRep, planar) {
  const p = [], u = [], ix = [];
  for (let i = 0; i <= seg; i++) {
    const b = b0 + (b1 - b0) * i / seg, c = Math.cos(b), s = Math.sin(b);
    p.push(c * r0, 0, s * r0, c * r1, 0, s * r1);
    if (planar) u.push(c * r0 / planar + 0.5, s * r0 / planar + 0.5, c * r1 / planar + 0.5, s * r1 / planar + 0.5);
    else u.push(i / seg * (uRep || 1), 0, i / seg * (uRep || 1), 1);
    if (i < seg) { const n = i * 2; ix.push(n, n + 3, n + 1, n, n + 2, n + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
  g.setIndex(ix); g.computeVertexNormals(); return g;
}

const World = (() => {
  let renderer, scene, camera, composer, city, envTex, canvasEl;
  const rigs = [], q = { tilt: new THREE.Quaternion() }, v3 = new THREE.Vector3(), v3b = new THREE.Vector3(), col = new THREE.Color();
  let fox, discTilt, discSpin, segs = [], hazards = [], rimBulbs, railBulbs = [], telRing, tiltArrow, spotCone, spotDisc, aura, wedge;
  let starMeshes = [], blobs = [], shields = [], pool, eqBars, beams = [], speakers = [], turntables = [], rimA, rimB, neonSign, stringBulbs, floaties = [];
  let pBall, pBox, parts = [], rings = [], fxQueue = [], shake = 0, punch = 0, lastBeatN = -1, lineupOn = false;
  const dummy = new THREE.Object3D();
  const gold = () => new THREE.MeshStandardMaterial({ color: 0xffc94d, metalness: CHEAP ? 0.25 : 0.9, roughness: 0.3 });
  const basic = (hex, k, o) => new THREE.MeshBasicMaterial(Object.assign({ color: HDR(hex, k) }, o || {}));
  const add = (parent, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); parent.add(m); return m; };

  function init(canvas) {
    canvasEl = canvas;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !CHEAP, powerPreference: 'high-performance' });
    renderer.setPixelRatio(CHEAP ? 0.5 : Math.min(devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = !CHEAP; renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
    scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x1c1845, 0.0024);
    camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.5, 2200);
    city = buildCity(scene);
    if (!CHEAP) buildEnv();
    buildLights(); buildDisc(); buildDeck(); buildBooth(); buildTower(); buildFx();
    for (let k = 0; k < 4; k++) { const r = MAKE_RIG[k](); scene.add(r.root); rigs.push(r); }
    fox = makeFox(); scene.add(fox.root);
    if (!CHEAP) {
      const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
      composer = new THREE.EffectComposer(renderer, rt);
      composer.addPass(new THREE.RenderPass(scene, camera));
      composer.addPass(new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), 0.3, 0.42, 1.0));
      composer.addPass(new THREE.OutputPass());
    }
    resize();
  }
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); }
  }

  function buildEnv() { // what the glossy eyes, the gold and the vinyl reflect: a night sky with neon panels
    const es = new THREE.Scene();
    es.add(new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12), new THREE.MeshBasicMaterial({ color: 0x151a45, side: THREE.BackSide })));
    const panel = (hex, k, x, y, z, sx, sy) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sy), new THREE.MeshBasicMaterial({ color: HDR(hex, k), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); es.add(m); };
    panel(0xfff0dc, 9, 12, 30, 22, 26, 18); panel(0xff3da6, 6, -34, 8, -26, 22, 16); panel(0x35e8ff, 6, 34, 8, -26, 22, 16);
    panel(0x2fe0d0, 3, 0, -30, 0, 40, 40); panel(0xffc98a, 3, 0, 6, 42, 60, 6);
    const pm = new THREE.PMREMGenerator(renderer); envTex = pm.fromScene(es, 0.04).texture; pm.dispose();
    scene.environment = envTex; scene.environmentIntensity = 0.35;
  }

  function buildLights() {
    scene.add(new THREE.HemisphereLight(0x5362b8, 0x1a8f8a, 0.5));
    const key = new THREE.SpotLight(0xffe7d1, 1350, 80, 0.62, 0.55, 2);
    key.position.set(7, 23, 14); key.target.position.set(0, 0, -1.5); scene.add(key, key.target);
    key.castShadow = !CHEAP; key.shadow.mapSize.set(2048, 2048); key.shadow.camera.near = 8; key.shadow.camera.far = 50; key.shadow.bias = -0.0006; key.shadow.normalBias = 0.03; key.shadow.radius = 4;
    const moon = new THREE.DirectionalLight(0x8fa8ff, 0.4); moon.position.set(-56, 30, -77); scene.add(moon);
    rimA = new THREE.SpotLight(0xff3da6, 420, 60, 0.75, 0.8, 2); rimA.position.set(-10, 7, -13); rimA.target.position.set(1, 0.4, 0); scene.add(rimA, rimA.target);
    rimB = new THREE.SpotLight(0x35e8ff, 420, 60, 0.75, 0.8, 2); rimB.position.set(10, 7, -13); rimB.target.position.set(-1, 0.4, 0); scene.add(rimB, rimB.target);
    const boothGlow = new THREE.PointLight(0xffd9b0, 9, 14, 2); boothGlow.position.set(0, 2.6, -8.6); scene.add(boothGlow);
    const under = new THREE.PointLight(0x35f2e0, 26, 16, 2); under.position.set(0, -1.1, 7.6); scene.add(under);
  }

  // ---- The disc: a giant record ------------------------------------------------------------
  function ringText(g, text, cx, cy, radius, px, color, start) {
    g.font = `900 ${px}px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif`; g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
    let a = start;
    for (const ch of text) { const w = g.measureText(ch).width + px * 0.12, da = w / radius; a += da / 2; g.save(); g.translate(cx, cy); g.rotate(a); g.fillText(ch, 0, -radius); g.restore(); a += da / 2; }
  }
  function drawRecord(g, w) {
    const c = w / 2, R = w / 2;
    let gr = g.createRadialGradient(c, c, 0, c, c, R); gr.addColorStop(0, '#27327a'); gr.addColorStop(0.55, '#182052'); gr.addColorStop(1, '#0e1338');
    g.fillStyle = gr; g.beginPath(); g.arc(c, c, R, 0, 7); g.fill();
    for (let k = 0; k < 12; k++) { g.fillStyle = k % 2 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.07)'; g.beginPath(); g.moveTo(c, c); g.arc(c, c, R, k * Math.PI / 6, (k + 1) * Math.PI / 6); g.fill(); }
    for (let r = 0.3 * R, i = 0; r < 0.985 * R; r += 6, i++) { g.lineWidth = 1.6; g.strokeStyle = i % 2 ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.24)'; g.beginPath(); g.arc(c, c, r, 0, 7); g.stroke(); }
    for (const f of [0.5, 0.735, 0.895]) {
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 12; g.beginPath(); g.arc(c, c, f * R, 0, 7); g.stroke();
      g.strokeStyle = 'rgba(255,201,77,0.55)'; g.lineWidth = 2.5; g.beginPath(); g.arc(c, c, f * R + 9, 0, 7); g.stroke();
    }
    for (let k = 0; k < 16; k++) { // gold stars to read the spin by
      const a = k / 16 * Math.PI * 2, x = c + Math.cos(a) * 0.815 * R, y = c + Math.sin(a) * 0.815 * R, s = k % 2 ? 13 : 24;
      g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = k % 2 ? 'rgba(53,242,224,0.9)' : '#ffc94d'; g.beginPath();
      for (let j = 0; j < 8; j++) { const rr = j % 2 ? s * 0.38 : s, aa = j * Math.PI / 4; g.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr); }
      g.closePath(); g.fill(); g.restore();
    }
    ringText(g, 'PANG PANG BUDDIES  ·  DISCO PANG PANG  ·  HOLD TIGHT  ·  ', c, c, 0.618 * R, 62, 'rgba(255,201,77,0.92)', 0);
    gr = g.createRadialGradient(c - 40, c - 50, 10, c, c, 0.275 * R); gr.addColorStop(0, '#ffe08a'); gr.addColorStop(1, '#f2a93b');
    g.fillStyle = gr; g.beginPath(); g.arc(c, c, 0.275 * R, 0, 7); g.fill();
    g.strokeStyle = '#182052'; g.lineWidth = 5; g.beginPath(); g.arc(c, c, 0.255 * R, 0, 7); g.stroke();
    g.lineWidth = 2; g.beginPath(); g.arc(c, c, 0.165 * R, 0, 7); g.stroke();
    ringText(g, 'SIDE A · 33 RPM · STEREO · ', c, c, 0.208 * R, 34, '#182052', 0);
    ringText(g, 'SEASIDE SKY DECK · ', c, c, 0.208 * R, 34, '#182052', Math.PI);
    const gw = glyphWidth('팡팡', 120); strokeGlyphs(g, '팡팡', c - gw / 2, c - 60, 120, 19, '#182052');
  }
  function buildDisc() {
    const R = DISC.R, platform = new THREE.Group(); scene.add(platform);
    discTilt = new THREE.Group(); discSpin = new THREE.Group(); platform.add(discTilt); discTilt.add(discSpin);
    const recTex = canvasTex(2048, 2048, drawRecord);
    const top = add(discSpin, new THREE.CircleGeometry(R, 96), new THREE.MeshPhysicalMaterial({ map: recTex, roughness: 0.55, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.5 }));
    top.rotation.x = -Math.PI / 2; top.receiveShadow = true;
    const navy = clay(0x1b2258, { roughness: 0.5 });
    add(discSpin, new THREE.CylinderGeometry(R + 0.03, R - 0.14, 0.56, 96, 1, true), navy, 0, -0.28, 0);
    const under = add(discSpin, new THREE.CircleGeometry(R - 0.14, 64), navy, 0, -0.56, 0); under.rotation.x = Math.PI / 2;
    add(discSpin, new THREE.TorusGeometry(R + 0.03, 0.07, 8, 96), gold(), 0, -0.04, 0).rotation.x = Math.PI / 2;
    add(discSpin, new THREE.TorusGeometry(R - 0.08, 0.06, 8, 96), gold(), 0, -0.5, 0).rotation.x = Math.PI / 2;
    const dome = add(discSpin, G.ball, clay(0xf2b040, { roughness: 0.6 }), 0, 0.02, 0); dome.scale.set(0.26, 0.11, 0.26);
    // the bulbs around the rim, chasing with the beat
    rimBulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial(), 48);
    for (let k = 0; k < 48; k++) { const a = k / 48 * Math.PI * 2; dummy.position.set(Math.cos(a) * (R + 0.08), -0.28, Math.sin(a) * (R + 0.08)); dummy.scale.setScalar(1); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); rimBulbs.setMatrixAt(k, dummy.matrix); rimBulbs.setColorAt(k, col.setHex(0xffd9a0)); }
    discSpin.add(rimBulbs);
    // eight segments of cushion and rail; each folds outward on a hinge when the DJ opens it
    const teal = clay(0x1fb5ac, { roughness: 0.55, sheen: 0.4 }), cream = clay(0xfff1dc, { roughness: 0.55, sheen: 0.4 });
    const A = Math.PI * 2 / DISC.SEGS, gap = 0.045, len = A - gap * 2;
    const cushGeo = new THREE.TorusGeometry(5.72, 0.3, 12, 18, len), railGeo = new THREE.TorusGeometry(5.95, 0.065, 8, 18, len), pipeGeo = new THREE.TorusGeometry(5.72, 0.035, 6, 18, len);
    const stripeTex = canvasTex(256, 32, (g) => { for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? '#ff2e7e' : '#2a0718'; g.beginPath(); g.moveTo(k * 32, 0); g.lineTo(k * 32 + 32, 0); g.lineTo(k * 32 + 16, 32); g.lineTo(k * 32 - 16, 32); g.fill(); } }, { repeat: true });
    const bulbMat = basic(0xffd9a0, 2.6), rail = gold();
    for (let i = 0; i < DISC.SEGS; i++) {
      const b0 = i * A + gap, bm = (i + 0.5) * A;
      const hinge = new THREE.Group(); hinge.position.set(Math.cos(bm) * R, 0, Math.sin(bm) * R); discSpin.add(hinge);
      const inner = new THREE.Group(); inner.position.copy(hinge.position).multiplyScalar(-1); hinge.add(inner);
      const turn = new THREE.Group(); turn.rotation.y = -b0; inner.add(turn);
      const cm = add(turn, cushGeo, i % 2 ? cream : teal, 0, 0.22, 0); cm.rotation.x = Math.PI / 2; cm.castShadow = cm.receiveShadow = true;
      const pm = add(turn, pipeGeo, gold(), 0, 0.5, 0); pm.rotation.x = Math.PI / 2;
      const rm = add(turn, railGeo, rail, 0, DISC.RAIL_H, 0); rm.rotation.x = Math.PI / 2; rm.castShadow = true;
      for (const u of [0, len]) { const e = add(turn, G.ball, i % 2 ? cream : teal, Math.cos(u) * 5.72, 0.22, Math.sin(u) * 5.72); e.scale.setScalar(0.3); e.castShadow = true; }
      for (const u of [0.03, len / 2, len - 0.03]) {
        const p = add(turn, G.cyl, rail, Math.cos(u) * 5.95, 0.66, Math.sin(u) * 5.95); p.scale.set(0.05, 0.72, 0.05); p.castShadow = true;
        const bl = add(turn, G.ballLo, bulbMat, Math.cos(u) * 5.95, DISC.RAIL_H + 0.12, Math.sin(u) * 5.95); bl.scale.setScalar(0.085); railBulbs.push(bl);
      }
      segs.push({ hinge, axis: new THREE.Vector3(-Math.sin(bm), 0, Math.cos(bm)), open: 0 });
      const hz = add(discSpin, arcGeo(5.3, 5.98, i * A + 0.02, (i + 1) * A - 0.02, 12, 6), new THREE.MeshBasicMaterial({ map: stripeTex, color: HDR(0xffffff, 1.6), transparent: true, opacity: 0, depthWrite: false }), 0, 0.012, 0);
      hazards.push(hz);
    }
    // the light a record catches: two soft wedges that stay still while the disc turns
    const wedgeTex = canvasTex(512, 512, (g, w) => {
      const cg = g.createConicGradient(0, w / 2, w / 2);
      for (const [p, a] of [[0, 0], [0.07, 0.0], [0.125, 0.9], [0.18, 0], [0.57, 0], [0.625, 0.75], [0.68, 0], [1, 0]]) cg.addColorStop(p, `rgba(255,255,255,${a})`);
      g.fillStyle = cg; g.fillRect(0, 0, w, w); g.globalCompositeOperation = 'destination-in';
      const rg = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(0.3, 'rgba(0,0,0,0)'); rg.addColorStop(0.36, 'rgba(0,0,0,1)'); rg.addColorStop(0.86, 'rgba(0,0,0,1)'); rg.addColorStop(0.9, 'rgba(0,0,0,0)');
      g.fillStyle = rg; g.fillRect(0, 0, w, w);
    });
    wedge = add(discTilt, new THREE.CircleGeometry(R, 64), new THREE.MeshBasicMaterial({ map: wedgeTex, transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending }), 0, 0.008, 0);
    wedge.rotation.x = -Math.PI / 2; wedge.rotation.z = 0.5;
    // the pedestal and its pistons
    const steel = new THREE.MeshStandardMaterial({ color: 0x8f96b8, metalness: CHEAP ? 0.2 : 0.8, roughness: 0.35 });
    add(platform, new THREE.CylinderGeometry(2.1, 2.9, 1.5, 24), navy, 0, -1.25, 0);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.6; add(platform, new THREE.CylinderGeometry(0.16, 0.16, 1.3, 10), steel, Math.cos(a) * 3.9, -1.1, Math.sin(a) * 3.9); }
  }

  // ---- The sky deck: pool, planks, glass rail, string lights ----------------------------------
  function buildDeck() {
    const Y = DISC.DECK_Y;
    pool = new THREE.Mesh(arcGeo(0, 9.72, 0, Math.PI * 2, 72), new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uTime; varying vec2 vP;
        float lines(vec2 p, float t){ vec2 q = p;
          q += 0.35 * vec2(sin(q.y * 1.3 + t * 0.9), cos(q.x * 1.1 - t * 0.7));
          q += 0.22 * vec2(sin(q.y * 2.9 - t * 1.3), cos(q.x * 2.6 + t * 1.1));
          float a = abs(sin(q.x * 2.2) + sin(q.y * 2.2 + q.x * 0.6));
          return pow(clamp(1.0 - a * 0.75, 0.0, 1.0), 3.0); }
        void main(){ float r = length(vP);
          float c = lines(vP * 0.7, uTime * 0.8) + 0.45 * lines(vP * 1.3 + 3.1, uTime * 1.1);
          vec3 col = mix(vec3(0.015, 0.25, 0.4), vec3(0.3, 0.86, 0.84), clamp(c * 0.8, 0.0, 1.0));
          col *= mix(0.5, 1.0, smoothstep(9.72, 8.5, r)) * mix(0.4, 1.0, smoothstep(5.0, 6.6, r)) * 0.82;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    pool.position.y = DISC.POOL_Y; scene.add(pool);
    const white = clay(0xf4f1ea, { roughness: 0.6 });
    add(scene, new THREE.TorusGeometry(9.8, 0.2, 10, 96), white, 0, Y + 0.02, 0).rotation.x = Math.PI / 2;
    add(scene, new THREE.CylinderGeometry(9.72, 9.72, 0.5, 72, 1, true), new THREE.MeshLambertMaterial({ color: 0x2bb9c0, emissive: 0x0a5a66, side: THREE.BackSide }), 0, DISC.POOL_Y - 0.1, 0);
    const plankTex = canvasTex(1024, 1024, (g, w) => {
      const d = makeDeco(7);
      for (let x = 0; x < w; x += 32) { const k = 150 + Math.floor(d() * 46); g.fillStyle = `rgb(${Math.round((k + 40) * 0.7)},${Math.round(k * 0.66)},${Math.round((k - 46) * 0.66)})`; g.fillRect(x, 0, 32, w); g.fillStyle = 'rgba(40,20,10,0.5)'; g.fillRect(x, 0, 2, w); for (let j = 0; j < 4; j++) { g.fillRect(x, Math.floor(d() * w), 32, 2); } }
    });
    const deck = add(scene, arcGeo(9.8, 11.5, 0, Math.PI * 2, 72, 1, 23), new THREE.MeshStandardMaterial({ map: plankTex, roughness: 0.75 }), 0, Y, 0); deck.receiveShadow = true;
    const stage = add(scene, new THREE.BoxGeometry(14, 0.5, 6.4), new THREE.MeshStandardMaterial({ map: plankTex, roughness: 0.75 }), 0, Y - 0.25, -12.2); stage.receiveShadow = true;
    add(scene, new THREE.CylinderGeometry(11.5, 11.5, 0.7, 72, 1, true), white, 0, Y - 0.35, 0);
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xbff4ff, roughness: 0.1, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
    add(scene, new THREE.CylinderGeometry(11.4, 11.4, 1.05, 72, 1, true, Math.PI + 0.62, Math.PI * 2 - 1.24), glass, 0, Y + 0.55, 0);
    add(scene, new THREE.TorusGeometry(11.4, 0.05, 6, 96, Math.PI * 2 - 1.24), white, 0, Y + 1.08, 0).rotation.set(Math.PI / 2, 0, -(Math.PI / 2 + 0.62) - (Math.PI * 2 - 1.24));
    // poles and string lights around the deck
    const bulbs = [], poleMat = clay(0x2a2f5c, { roughness: 0.5 });
    const NP = 12;
    for (let k = 0; k < NP; k++) {
      const a = Math.PI / 2 + (k + 0.5) / NP * Math.PI * 2; if (Math.abs(Math.atan2(Math.sin(a + Math.PI / 2), Math.cos(a + Math.PI / 2))) < 0.5) continue;
      const x = Math.cos(a) * 11.4, z = Math.sin(a) * 11.4;
      const p = add(scene, G.cyl, poleMat, x, Y + 1.9, z); p.scale.set(0.06, 3.8, 0.06);
      const a2 = a + Math.PI * 2 / NP;
      for (let j = 0; j <= 9; j++) { const t = j / 9, aa = a + (a2 - a) * t; bulbs.push([Math.cos(aa) * 11.4, Y + 3.8 - Math.sin(t * Math.PI) * 1.1, Math.sin(aa) * 11.4]); }
    }
    stringBulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial(), bulbs.length);
    const sc = [0xffd9a0, 0xff7ab8, 0x7ff5ee, 0xffe873];
    bulbs.forEach((b, i) => { dummy.position.set(b[0], b[1], b[2]); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); stringBulbs.setMatrixAt(i, dummy.matrix); stringBulbs.setColorAt(i, col.setHex(sc[i % 4]).multiplyScalar(2.4)); });
    scene.add(stringBulbs);
    // things floating in the pool
    for (const [x, z, hex, s] of [[-7.6, 2.6, 0xff9ec4, 0.6], [7.9, -1.4, 0xfff07a, 0.52], [3.2, 7.4, 0xb6f2a4, 0.5]]) {
      const f = add(scene, G.ring, clay(hex, { roughness: 0.4, clearcoat: 0.5 }), x, DISC.POOL_Y + 0.1, z); f.rotation.x = Math.PI / 2; f.scale.setScalar(s); f.castShadow = true; floaties.push(f);
    }
    const ball = add(scene, G.ball, clay(0xffffff, { roughness: 0.4 }), -4.6, DISC.POOL_Y + 0.22, 6.9); ball.scale.setScalar(0.34); floaties.push(ball);
  }

  // ---- The DJ's booth ----------------------------------------------------------------------
  function buildBooth() {
    const Y = DISC.DECK_Y, dark = clay(0x161a3d, { roughness: 0.6 }), panel = clay(0x23295a, { roughness: 0.5 });
    add(scene, new THREE.BoxGeometry(6.2, 1.1, 2.8), dark, 0, Y + 0.55, -11.4).castShadow = true;        // riser
    const desk = add(scene, new THREE.BoxGeometry(4.8, 2.05, 1.15), panel, 0, -0.275, -10.15); desk.castShadow = true; desk.receiveShadow = true;
    add(scene, new THREE.BoxGeometry(4.6, 0.12, 0.05), basic(0xff3da6, 2.4), 0, 0.5, -9.56);
    add(scene, new THREE.BoxGeometry(4.6, 0.06, 0.05), basic(0x35f2e0, 2.4), 0, 0.2, -9.56);
    const logo = canvasTex(512, 160, (g) => { const w = glyphWidth('팡팡', 96); strokeGlyphs(g, '팡팡', 256 - w / 2, 34, 96, 13, '#fff1dc'); });
    add(scene, new THREE.PlaneGeometry(2.3, 0.72), new THREE.MeshBasicMaterial({ map: logo, transparent: true, color: HDR(0xffffff, 1.3) }), 0, -0.45, -9.565);
    const tt = canvasTex(128, 128, (g) => { g.fillStyle = '#0d1030'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill(); g.strokeStyle = 'rgba(255,255,255,0.18)'; for (let r = 26; r < 60; r += 5) { g.beginPath(); g.arc(64, 64, r, 0, 7); g.stroke(); } g.fillStyle = '#ff3da6'; g.beginPath(); g.arc(64, 64, 20, 0, 7); g.fill(); g.fillStyle = '#fff1dc'; g.fillRect(60, 46, 8, 14); });
    for (const x of [-1.45, 1.45]) { const t = add(scene, new THREE.CylinderGeometry(0.52, 0.52, 0.06, 28), [dark, new THREE.MeshStandardMaterial({ map: tt, roughness: 0.4 }), dark], x, 0.79, -10.15); turntables.push(t); }
    add(scene, new THREE.BoxGeometry(1.2, 0.1, 0.8), dark, 0, 0.8, -10.15);
    for (let k = 0; k < 8; k++) add(scene, G.ballLo, basic([0xff3da6, 0x35f2e0, 0xffd54d][k % 3], 2.6), -0.42 + (k % 4) * 0.28, 0.87, -10.33 + Math.floor(k / 4) * 0.34).scale.setScalar(0.045);
    // the LED wall, the truss and the speakers
    add(scene, new THREE.BoxGeometry(9, 5, 0.3), clay(0x0b0d24, { roughness: 0.4 }), 0, 2.3, -13.9);
    eqBars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 1, 0.06), new THREE.MeshBasicMaterial(), 30);
    for (let k = 0; k < 30; k++) eqBars.setColorAt(k, col.setHex(0x35f2e0).lerp(new THREE.Color(0xff3da6), k / 29).multiplyScalar(2.2));
    scene.add(eqBars);
    const sign = canvasTex(1024, 320, (g) => {
      const w = glyphWidth('팡팡 버디즈', 190), x = 512 - w / 2;
      g.shadowColor = '#ff2e9a'; g.shadowBlur = 38; strokeGlyphs(g, '팡팡 버디즈', x, 60, 190, 26, '#ff4fa8');
      g.shadowBlur = 0; strokeGlyphs(g, '팡팡 버디즈', x, 60, 190, 9, '#fff3f8');
    });
    neonSign = add(scene, new THREE.PlaneGeometry(5.6, 1.75), new THREE.MeshBasicMaterial({ map: sign, transparent: true, color: HDR(0xffffff, 1.7), depthWrite: false }), 0, 3.95, -13.7);
    const truss = clay(0x2a2f5c, { roughness: 0.45 });
    for (const x of [-5.2, 5.2]) add(scene, new THREE.BoxGeometry(0.3, 8.4, 0.3), truss, x, Y + 4.2, -13.2).castShadow = true;
    add(scene, new THREE.BoxGeometry(10.7, 0.3, 0.3), truss, 0, Y + 8.4, -13.2);
    const beamCols = [0xff3da6, 0x35f2e0, 0xffd54d, 0xb58bff];
    for (let k = 0; k < 4; k++) {
      const g = new THREE.Group(); g.position.set(-3.9 + k * 2.6, Y + 8.15, -13.1); scene.add(g);
      add(g, G.ball, truss, 0, 0, 0).scale.setScalar(0.24);
      add(g, G.ballLo, basic(beamCols[k], 3), 0, -0.16, 0.1).scale.setScalar(0.14);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.3, 15, 20, 1, true), new THREE.MeshBasicMaterial({ map: city.coneTex, color: beamCols[k], transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      cone.geometry.translate(0, -7.5, 0); g.add(cone); beams.push({ g, k });
    }
    for (const x of [-6.1, 6.1]) {
      const s = new THREE.Group(); s.position.set(x, Y, -11.7); s.rotation.y = -Math.sign(x) * 0.35; scene.add(s);
      add(s, new THREE.BoxGeometry(1.5, 3.2, 1.2), dark, 0, 1.6, 0).castShadow = true;
      for (const y of [0.85, 2.3]) { const c = add(s, new THREE.TorusGeometry(0.46, 0.07, 8, 24), basic(0x35f2e0, 1.4), 0, y, 0.61); const d = add(s, new THREE.CircleGeometry(0.44, 24), clay(0x23295a, { roughness: 0.4 }), 0, y, 0.605); speakers.push(c, d); }
    }
  }
  function buildTower() {
    const Y = DISC.DECK_Y, body = clay(0x1c2150, { roughness: 0.6 });
    add(scene, new THREE.CylinderGeometry(11.5, 7, 9, 48, 1, true), body, 0, Y - 5.2, 0);
    add(scene, new THREE.CylinderGeometry(5.4, 6.4, GROUND_Y * -1 - 10, 32, 1, true), body, 0, (GROUND_Y + Y - 9.7) / 2, 0);
    add(scene, new THREE.TorusGeometry(11.55, 0.16, 8, 96), basic(0xff3da6, 2.6), 0, Y - 0.72, 0).rotation.x = Math.PI / 2;
    add(scene, new THREE.TorusGeometry(7.1, 0.14, 8, 72), basic(0x35f2e0, 2.6), 0, Y - 9.6, 0).rotation.x = Math.PI / 2;
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; add(scene, new THREE.BoxGeometry(0.2, 46, 0.2), basic(k % 2 ? 0xffd9a0 : 0x7ff5ee, 1.8), Math.cos(a) * 5.95, GROUND_Y + 25, Math.sin(a) * 5.95); }
  }

  // ---- Effects: telegraphs, shadows, particles ------------------------------------------------
  function buildFx() {
    const addM = (geo, hex, k) => new THREE.MeshBasicMaterial({ color: HDR(hex, k), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    telRing = add(discTilt, arcGeo(0.9, 1, 0, Math.PI * 2, 64), addM(0, 0xff4fa8, 2.2), 0, 0.03, 0);
    const sh = new THREE.Shape(); sh.moveTo(0, 2.2); sh.lineTo(1.5, 0.6); sh.lineTo(0.55, 0.6); sh.lineTo(0.55, -1.6); sh.lineTo(-0.55, -1.6); sh.lineTo(-0.55, 0.6); sh.lineTo(-1.5, 0.6); sh.closePath();
    tiltArrow = add(discTilt, new THREE.ShapeGeometry(sh), addM(0, 0x35f2e0, 1.6), 0, 0.035, 0); tiltArrow.rotation.x = -Math.PI / 2;
    spotDisc = add(discTilt, arcGeo(0, 1, 0, Math.PI * 2, 40), addM(0, 0xfff3c8, 1.2), 0, 0.03, 0);
    spotCone = new THREE.Mesh(new THREE.ConeGeometry(1.5, 14, 24, 1, true), new THREE.MeshBasicMaterial({ map: city.coneTex, color: 0xfff3c8, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    scene.add(spotCone);
    aura = add(discTilt, arcGeo(0.8, 1, 0, Math.PI * 2, 48), addM(0, 0x9fd0ff, 1.6), 0, 0.03, 0);
    const blobTex = canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(0,0,0,0.85)'); r.addColorStop(0.6, 'rgba(0,0,0,0.5)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
    for (let k = 0; k < 4; k++) {
      const b = add(discTilt, new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0.55, depthWrite: false }), 0, 0.02, 0); b.rotation.x = -Math.PI / 2; blobs.push(b);
      const s = add(scene, G.ball, new THREE.MeshBasicMaterial({ color: HDR(0xffe9a8, 1.1), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }), 0, 0, 0); shields.push(s);
    }
    const shp = new THREE.Shape();
    for (let j = 0; j < 10; j++) { const rr = j % 2 ? 0.17 : 0.4, an = j * Math.PI / 5 + Math.PI / 2; j ? shp.lineTo(Math.cos(an) * rr, Math.sin(an) * rr) : shp.moveTo(Math.cos(an) * rr, Math.sin(an) * rr); }
    const sg = new THREE.ExtrudeGeometry(shp, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 2 }); sg.center();
    const sm = new THREE.MeshStandardMaterial({ color: 0xffd54d, emissive: 0xff9a1a, emissiveIntensity: 1.3, metalness: 0.3, roughness: 0.35 });
    for (let k = 0; k < 10; k++) { const m = new THREE.Mesh(sg, sm); m.castShadow = true; m.visible = false; discSpin.add(m); starMeshes.push(m); }
    pBall = new THREE.InstancedMesh(G.ballLo, new THREE.MeshLambertMaterial({ emissive: 0x555555 }), 380);
    pBox = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.2, 0.6), new THREE.MeshBasicMaterial(), 260);
    pBall.frustumCulled = pBox.frustumCulled = false; pBall.count = pBox.count = 0; scene.add(pBall, pBox);
    for (let k = 0; k < 8; k++) { const r = add(scene, arcGeo(0.82, 1, 0, Math.PI * 2, 48), addM(0, 0xffffff, 1.8), 0, 0, 0); r.visible = false; rings.push({ m: r, t: 1, life: 1, r0: 0, r1: 1, parent: scene }); }
  }
  // sim -> world: something happened worth showing
  function fx(type, x, y, z, a, b) { fxQueue.push({ type, x, y, z, a, b }); }
  const dr = makeDeco(99);
  function spawn(isBox, n, x, y, z, o) {
    for (let i = 0; i < n; i++) {
      if (parts.length > 600) return;
      const ang = dr() * Math.PI * 2, sp = (o.sp0 || 0) + dr() * (o.sp || 1), up = (o.up0 || 0) + dr() * (o.up || 0);
      parts.push({ box: isBox, x: x + (dr() - 0.5) * (o.spread || 0), y: y + dr() * (o.h || 0), z: z + (dr() - 0.5) * (o.spread || 0), vx: Math.cos(ang) * sp + (o.vx || 0), vy: up, vz: Math.sin(ang) * sp + (o.vz || 0),
        g: o.g === undefined ? 9 : o.g, drag: o.drag || 1.5, life: 0, max: (o.life || 0.6) * (0.7 + dr() * 0.6), s: (o.s || 0.1) * (0.6 + dr() * 0.8), c: Array.isArray(o.c) ? o.c[Math.floor(dr() * o.c.length)] : o.c, rot: dr() * 6, rv: (dr() - 0.5) * 14 });
    }
  }
  function ring(x, y, z, r0, r1, life, hex, tilted) {
    const r = rings.find(k => k.t >= k.life) || rings[0];
    r.t = 0; r.life = life; r.r0 = r0; r.r1 = r1; r.m.material.color.copy(HDR(hex, 2)); r.m.position.set(x, y, z);
    const par = tilted ? discTilt : scene; if (r.m.parent !== par) par.add(r.m);
  }
  const CONF = [0xff4fa8, 0x35f2e0, 0xffd54d, 0xb58bff, 0xffffff, 0xff8f86];
  function playFx(e) {
    const { type, x, y, z } = e;
    if (type === 'pang') { ring(0, 0.05, 0, 0.4, DISC.R, 0.45, 0xff4fa8, true); ring(0, 0.06, 0, 0.2, DISC.R * 0.7, 0.6, 0xffffff, true); shake = Math.max(shake, 0.55 * (e.a || 1)); punch = 1;
      for (let k = 0; k < 26; k++) { const a = k / 26 * Math.PI * 2; spawn(false, 1, Math.cos(a) * 5.2, 0.15, Math.sin(a) * 5.2, { sp: 1.5, up0: 2, up: 3, s: 0.09, c: [0xffd54d, 0xffffff, 0xff4fa8], life: 0.55 }); } }
    else if (type === 'dust') spawn(false, 1, x, y + 0.08, z, { sp: 0.6, up: 0.9, s: 0.11, c: 0xcfd3ea, life: 0.45, g: 1, spread: 0.3 });
    else if (type === 'land') { spawn(false, 9, x, y + 0.1, z, { sp0: 1.2, sp: 1.6, up: 1.2, s: 0.13, c: 0xdfe3f5, life: 0.5, g: 2 }); ring(x, y + 0.05, z, 0.2, 1.3, 0.3, 0xffffff, false); }
    else if (type === 'launch') spawn(false, 7, x, y + 0.2, z, { sp: 1.6, up0: 1, up: 2.5, s: 0.1, c: [0xffd54d, 0xffffff], life: 0.5 });
    else if (type === 'splash') { spawn(false, 30, x, DISC.POOL_Y + 0.1, z, { sp0: 0.8, sp: 3.2, up0: 3, up: 6, s: 0.14, c: [0x8ff7ef, 0xd9fffb, 0x4fd9e0], life: 0.9, g: 14 }); ring(x, DISC.POOL_Y + 0.06, z, 0.3, 2.6, 0.7, 0xd9fffb, false); ring(x, DISC.POOL_Y + 0.06, z, 0.1, 1.6, 0.9, 0x8ff7ef, false); shake = Math.max(shake, 0.25); }
    else if (type === 'pop') { spawn(false, 5, x, y + 0.05, z, { sp0: 0.8, sp: 1, up: 0.6, s: 0.07, c: 0xffc9bf, life: 0.35, g: 2, spread: 0.8 }); ring(x, y + 0.04, z, 0.3, 1.1, 0.28, 0xff8f86, false); }
    else if (type === 'feather') spawn(false, e.a || 3, x, y + 0.5, z, { sp: 1.4, up: 1.5, s: 0.09, c: [0xffd54d, 0xfff2bd, 0xffb52e], life: 0.9, g: 2.5, drag: 3 });
    else if (type === 'sweat') spawn(false, 1, x, y, z, { sp0: 1, sp: 1, up0: 1.5, up: 1.5, s: 0.06, c: 0x9fe6ff, life: 0.4, g: 9 });
    else if (type === 'saved') { spawn(false, 14, x, y + 0.6, z, { sp0: 1, sp: 2, up0: 1.5, up: 3, s: 0.09, c: [0xffe9a8, 0xffffff, 0xffd54d], life: 0.7, g: 5 }); ring(x, y + 0.1, z, 0.3, 1.9, 0.4, 0xffe9a8, false); }
    else if (type === 'whoosh') spawn(false, 6, x, y + 0.4, z, { sp: 1, up: 0.5, s: 0.08, c: 0xffffff, life: 0.3, g: 0, vx: e.a || 0, vz: e.b || 0, drag: 4 });
    else if (type === 'gate') { ring(x, 0.2, z, 0.2, 2, 0.5, 0xff2e7e, false); spawn(false, 10, x, 0.3, z, { sp: 2, up0: 1, up: 2, s: 0.08, c: [0xff2e7e, 0xffffff], life: 0.5 }); }
    else if (type === 'confetti') for (let k = 0; k < 4; k++) spawn(true, 46, (dr() - 0.5) * 10, 6 + dr() * 3, (dr() - 0.5) * 8, { sp: 2.2, up0: 0, up: 3, s: 0.16, c: CONF, life: 3.2, g: 3.4, drag: 1.2, spread: 3 });
    else if (type === 'star') { spawn(false, 12, x, y + 0.5, z, { sp0: 0.6, sp: 1.8, up0: 1, up: 2.5, s: 0.09, c: [0xffd54d, 0xffffff, 0xfff1a8], life: 0.6, g: 5 }); ring(x, y + 0.08, z, 0.2, 1.2, 0.3, 0xffd54d, false); }
    else if (type === 'shake') shake = Math.max(shake, e.a || 0.3);
  }
  function stepFx(dt) {
    while (fxQueue.length) playFx(fxQueue.shift());
    let nb = 0, nx = 0;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.life += dt;
      if (p.life >= p.max) { parts.splice(i, 1); continue; }
      const k = Math.exp(-p.drag * dt); p.vx *= k; p.vz *= k; p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rot += p.rv * dt;
      const f = p.life / p.max, s = p.s * (p.box ? 1 : Math.sin(Math.PI * Math.min(1, f * 1.15 + 0.12)) * 1.2);
      dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(p.rot, p.rot * 0.7, p.rot * 1.3); dummy.scale.setScalar(Math.max(0.001, s)); dummy.updateMatrix();
      const m = p.box ? pBox : pBall, n = p.box ? nx++ : nb++;
      if (n < (p.box ? 260 : 380)) { m.setMatrixAt(n, dummy.matrix); m.setColorAt(n, col.setHex(p.c).multiplyScalar(p.box ? 1.3 : 1)); }
    }
    pBall.count = Math.min(nb, 380); pBox.count = Math.min(nx, 260);
    pBall.instanceMatrix.needsUpdate = pBox.instanceMatrix.needsUpdate = true;
    if (pBall.instanceColor) pBall.instanceColor.needsUpdate = true; if (pBox.instanceColor) pBox.instanceColor.needsUpdate = true;
    for (const r of rings) {
      if (r.t >= r.life) { r.m.visible = false; continue; }
      r.t += dt; const f = Math.min(1, r.t / r.life), e = 1 - (1 - f) * (1 - f);
      r.m.visible = true; r.m.scale.setScalar(r.r0 + (r.r1 - r.r0) * e); r.m.material.opacity = (1 - f) * 0.85;
    }
    shake *= Math.exp(-6 * dt); punch *= Math.exp(-7 * dt);
  }

  // ---- The camera ----------------------------------------------------------------------------
  const cam = { p: new THREE.Vector3(0, 13.5, 15.5), t: new THREE.Vector3(0, 0, -1), fov: 42 }, camA = { p: new THREE.Vector3(), t: new THREE.Vector3(), fov: 0 }, camB = { p: new THREE.Vector3(), t: new THREE.Vector3(), fov: 0 };
  function pose(name, t, out, lk) {
    if (name === 'title') { const a = Math.sin(t * 0.09) * 0.75 + 0.25, rr = 24 - 2.5 * lk; out.p.set(Math.sin(a) * rr, 6 + Math.sin(t * 0.07) * 1.2 + 4.5 * lk, Math.cos(a) * rr); out.t.set(0, 1.2 - 4.2 * lk, -3 + 2.5 * lk); out.fov = 44; }
    else if (name === 'lineup') { out.p.set(0.4, 4.6, 12.4); out.t.set(0.4, 0.75, 0.6); out.fov = 36; }
    else if (name === 'win') { const a = Math.sin(t * 0.25) * 0.5; out.p.set(Math.sin(a) * 15, 5.5, Math.cos(a) * 15); out.t.set(0, 0.9, -1.5); out.fov = 42; }
    else { const fit = Math.max(1, 1.62 / camera.aspect); out.p.set(0, tune.cam_height * fit, tune.cam_dist * fit); out.t.set(0, 0.4, -2.0); out.fov = tune.cam_fov; }
    return out;
  }
  function project(x, y, z) {
    v3.set(x, y, z).project(camera);
    return { x: (v3.x * 0.5 + 0.5) * innerWidth, y: (-v3.y * 0.5 + 0.5) * innerHeight, vis: v3.z < 1 && v3.z > -1 };
  }

  // ---- One frame, from the game's state -------------------------------------------------------
  // v: { state, t (render clock), dt, cam: 'title'|'play'|'lineup'|'win', camFrom, blend }
  function frame(v) {
    const s = v.state, t = v.t, dt = v.dt, d = s.disc, dj = s.dj;
    city.update(t);
    // the disc
    const kx = Math.sin(d.tiltDir), kz = -Math.cos(d.tiltDir);
    q.tilt.setFromAxisAngle(v3.set(kx, 0, kz), d.tilt);
    discTilt.position.y = d.h; discTilt.quaternion.copy(q.tilt); discSpin.rotation.y = d.a;
    const tanT = Math.tan(d.tilt), cd = Math.cos(d.tiltDir), sd = Math.sin(d.tiltDir);
    const ctx = { t, dt, simT: s.t, pangT: s.pangT, disc: d, qTilt: q.tilt, surfY: (x, z) => d.h - tanT * (x * cd + z * sd) };
    for (let i = 0; i < DISC.SEGS; i++) {
      const g = segs[i]; g.open = ease(g.open, d.gates[i], 9, dt);
      g.hinge.quaternion.setFromAxisAngle(g.axis, -g.open * 2.0);
      const warn = d.warn[i] ? 0.55 + 0.45 * Math.sin(t * 22) : 0;
      hazards[i].material.opacity = Math.max(warn, g.open * (0.7 + 0.25 * Math.sin(t * 6)));
    }
    const beatN = dj.beatN, kick = Math.pow(1 - dj.beat, 3) * dj.energy;
    if (beatN !== lastBeatN) {
      lastBeatN = beatN;
      for (let k = 0; k < 48; k++) rimBulbs.setColorAt(k, col.setHex((k + beatN) % 4 < 2 ? 0xffd9a0 : (k % 2 ? 0xff4fa8 : 0x35f2e0)).multiplyScalar((k + beatN) % 4 < 2 ? 2.8 : 0.9));
      rimBulbs.instanceColor.needsUpdate = true;
    }
    railBulbs.forEach((b, i) => b.scale.setScalar(0.085 * (1 + 0.35 * kick * ((i + beatN) % 2))));
    wedge.material.opacity = 0.085 + 0.03 * Math.sin(t * 0.7);
    pool.material.uniforms.uTime.value = t;
    floaties.forEach((f, i) => { f.position.y = DISC.POOL_Y + 0.1 + Math.sin(t * 1.6 + i * 2) * 0.05 + (i === 3 ? 0.12 : 0); f.rotation.z = t * 0.2 + i; });
    // the booth
    for (let k = 0; k < 30; k++) {
      const h = 0.25 + (0.5 + 0.5 * Math.sin(t * (3 + (k * 7 % 5)) + k * 1.7)) * (0.5 + kick * 1.6) * (0.6 + 0.6 * Math.sin(k * 0.45 + 1) ** 2) * (0.35 + dj.energy);
      dummy.position.set(-4.05 + k * 0.28, 0.1 + h / 2, -13.72); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, h, 1); dummy.updateMatrix(); eqBars.setMatrixAt(k, dummy.matrix);
    }
    eqBars.instanceMatrix.needsUpdate = true;
    beams.forEach(({ g, k }) => { g.rotation.x = 0.62 + Math.sin(t * 0.9 + k * 1.7) * 0.22; g.rotation.z = Math.sin(t * 0.7 + k * 2.3) * 0.5; g.children[2].material.opacity = (0.05 + 0.06 * kick) * (0.4 + dj.energy); });
    speakers.forEach((m, i) => m.scale.setScalar(1 + kick * 0.09));
    turntables.forEach((m, i) => { m.rotation.y -= dt * (2.5 + d.w * 2) * (i ? 1 : -1); });
    rimA.intensity = 420 * (0.75 + 0.6 * kick); rimB.intensity = 420 * (0.75 + 0.6 * (1 - dj.beat) * dj.energy);
    neonSign.material.color.copy(HDR(0xffffff, 1.5 + 0.5 * kick));
    // the cast
    const line = v.cam === 'lineup';
    if (line !== lineupOn) lineupOn = line;
    for (let i = 0; i < 4; i++) {
      const a = s.animals[i], rig = rigs[a.kind]; rig.root.visible = true; rig.update(a, ctx);
      const b = blobs[i], onDisc = a.mode !== 'hang' && a.mode !== 'out' && a.mode !== 'fall' && Math.hypot(a.x, a.z) < DISC.R + 0.2;
      b.visible = onDisc; if (onDisc) { const r = KINDS[a.kind].radius * (1.25 - Math.min(0.6, a.y * 0.16)); b.position.set(a.x, 0.02, a.z); b.scale.setScalar(r); b.material.opacity = 0.6 - Math.min(0.35, a.y * 0.12); }
      const sm = shields[i]; sm.material.opacity = ease(sm.material.opacity, a.shield > 0 ? 0.22 + 0.08 * Math.sin(t * 14) : 0, 12, dt); sm.visible = sm.material.opacity > 0.01;
      if (sm.visible) { sm.position.copy(rig.root.position); sm.position.y += KINDS[a.kind].head * 0.5; sm.scale.setScalar(KINDS[a.kind].radius * 1.7); }
    }
    const ele = s.animals.find(a => a.kind === 0), hold = ele && ele.hold ? 1 : 0;
    aura.material.opacity = ease(aura.material.opacity, hold * (0.35 + 0.2 * Math.sin(t * 8)), 10, dt);
    if (ele) { aura.position.set(ele.x, 0.03, ele.z); aura.scale.setScalar(KINDS[0].radius + 0.5 + tune.shelter_range + 0.3); }
    if (line) { fox.root.position.set(5.3, 0, 0.9); fox.root.rotation.y = -0.2; fox.root.scale.setScalar(1.12); }
    else { fox.root.position.set(0, -0.2, -11.25); fox.root.rotation.y = 0; fox.root.scale.setScalar(1.7); }
    fox.update(dj, ctx);
    // telegraphs
    telRing.material.opacity = ease(telRing.material.opacity, dj.ring >= 0 ? 0.5 + 0.4 * dj.ring : 0, 25, dt);
    if (dj.ring >= 0) telRing.scale.setScalar(Math.max(0.2, DISC.R * (1 - dj.ring * 0.93)));
    tiltArrow.material.opacity = ease(tiltArrow.material.opacity, dj.tiltWarn > 0 ? 0.35 + 0.3 * Math.sin(t * 12) : 0, 12, dt);
    tiltArrow.rotation.z = -dj.tiltArrow + Math.PI / 2 - Math.PI; tiltArrow.position.set(Math.cos(dj.tiltArrow) * (1.2 + (t * 3 % 1.5)), 0.035, Math.sin(dj.tiltArrow) * (1.2 + (t * 3 % 1.5)));
    const sp = dj.spot >= 0 ? s.animals[dj.spot] : null;
    spotDisc.material.opacity = ease(spotDisc.material.opacity, sp ? 0.4 : 0, 12, dt); spotCone.material.opacity = ease(spotCone.material.opacity, sp ? 0.3 : 0, 12, dt);
    if (sp) { spotDisc.position.set(sp.x, 0.03, sp.z); spotDisc.scale.setScalar(1.5); spotCone.position.set(sp.x, ctx.surfY(sp.x, sp.z) + 7, sp.z); }
    starMeshes.forEach((m, i) => { const p = s.pickups && s.pickups[i]; m.visible = !!p; if (!p) return; m.position.set(Math.cos(p.la) * p.r, 0.6 + Math.sin(t * 3 + p.id) * 0.12, Math.sin(p.la) * p.r); m.scale.setScalar((p.v > 1 ? 1.45 : 1) * Math.min(1, p.t * 4)); m.rotation.set(0, t * 2.5 + p.id, 0); });
    stepFx(dt);
    // the camera
    pose(v.cam, t, camA, v.lobby || 0);
    if (v.camFrom && v.blend < 1) { pose(v.camFrom, t, camB, v.lobby || 0); const k = v.blend * v.blend * (3 - 2 * v.blend); camA.p.lerpVectors(camB.p, camA.p, k); camA.t.lerpVectors(camB.t, camA.t, k); camA.fov = camB.fov + (camA.fov - camB.fov) * k; }
    const sh = shake * tune.cam_shake;
    camera.position.set(camA.p.x + Math.sin(t * 61) * sh * 0.35, camA.p.y + Math.sin(t * 73 + 1) * sh * 0.3 - punch * 0.25, camA.p.z + Math.sin(t * 57 + 2) * sh * 0.2 - punch * 0.5);
    camera.lookAt(camA.t); if (Math.abs(camera.fov - camA.fov) > 0.01) { camera.fov = camA.fov; camera.updateProjectionMatrix(); }
    if (composer) composer.render(); else renderer.render(scene, camera);
  }

  // Head-and-shoulders portraits for the HUD, shot from the models themselves: five promises of a picture.
  function portraits() {
    const out = [], size = 192, ps = new THREE.Scene(), pc = new THREE.PerspectiveCamera(30, 1, 0.1, 40);
    ps.add(new THREE.HemisphereLight(0xffffff, 0x9aa0d0, 1.5)); const dl = new THREE.DirectionalLight(0xfff2e0, 2.6); dl.position.set(2, 4, 5); ps.add(dl);
    if (envTex) { ps.environment = envTex; ps.environmentIntensity = 0.5; }
    const pr = renderer.getPixelRatio(); renderer.setPixelRatio(1); renderer.setSize(size, size, false);
    const shadows = renderer.shadowMap.enabled; renderer.shadowMap.enabled = false;
    const shots = [[0, 1.12, 0.2, 5.2], [0, 0.62, 0, 2.7], [0, 0.92, 0, 3.7], [0, 0.86, 0, 3.3], [0, 1.2, 0, 3.4]];
    const idle = { kind: 0, x: 0, z: 0, y: 0, vx: 0, vz: 0, vy: 0, face: 0, mode: 'ground', hold: 0, gauge: 1, tired: 0, slide: 0, walk: 0, landT: -9, hasT: 0, tx: 0, ty: 0, tz: 0, flail: 0, emote: 'none', carrying: -1, shield: 0 };
    const ctx = { t: 1.3, dt: 1, simT: 0, pangT: -9, disc: { w: 0 }, qTilt: new THREE.Quaternion(), surfY: () => 0 };
    for (let k = 0; k < 5; k++) {
      const rig = k < 4 ? rigs[k] : fox, par = rig.root.parent; ps.add(rig.root);
      if (k < 4) { idle.kind = k; rig.faceNow = 0; rig.update(idle, ctx); rig.update(idle, ctx); rig.root.position.set(0, 0, 0); }
      else { rig.root.position.set(0, 0, 0); rig.root.rotation.set(0, 0, 0); rig.root.scale.setScalar(1); rig.update({ beat: 0.5, mood: 'idle', count: 0, pointX: 0 }, ctx); }
      const [tx, ty, tz, dist] = shots[k];
      ps.background = new THREE.Color(k < 4 ? KINDS[k].color : DJ_INFO.color).lerp(new THREE.Color(0xffffff), 0.55);
      pc.position.set(tx + dist * 0.32, ty + dist * 0.12, tz + dist * 0.94); pc.lookAt(tx, ty, tz);
      renderer.render(ps, pc); out.push(createImageBitmap(renderer.domElement, 0, 0, size, size)); par.add(rig.root); // a copy of the picture, kept on the GPU
    }
    renderer.shadowMap.enabled = shadows; renderer.setPixelRatio(pr); resize();
    return out;
  }
  return { init, resize, frame, fx, project, portraits, rigs: () => rigs };
})();
