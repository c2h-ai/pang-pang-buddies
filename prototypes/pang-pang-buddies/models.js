// PROTOTYPE - NOT FOR PRODUCTION
// Question: DJ의 예고를 읽고 동물 스킬로 서로를 구하는 60초가, 봇과 혼자 해도 여럿이 해도 웃기고 다시 하고 싶은가?
// Date: 2026-11-19
'use strict';
// The cast, drawn in code: soft matte clay bodies, big glossy eyes, stubby feet (the brief's
// 캐릭터.mov look). Each animal has its own outline: ears and trunk, wings and crest, dome and
// tentacles, round ears and a long tail. The DJ fox has pointed ears, shades and a big tail.

// What the simulation and the HUD need to know about each animal.
const KINDS = [
  { id: 'ele', name: '코코', animal: '코끼리', skill: '코 잡기', tip: '난간을 코로 잡고 버텨요. 붙어 있는 동료도 함께!', color: 0xa6bee0, css: '#a6bee0', radius: 0.85, head: 2.05, hangMul: 0.75 },
  { id: 'bird', name: '삐삐', animal: '새', skill: '날기', tip: '잠깐 날아올라요. 가까운 동료를 들고 날 수 있어요.', color: 0xffd54d, css: '#ffd54d', radius: 0.42, head: 1.3, hangMul: 1 },
  { id: 'oct', name: '무너', animal: '문어', skill: '빨판 걷기', tip: '어디서든 바닥에 붙어요. 붙은 채로 천천히 걸어요.', color: 0xff8f86, css: '#ff8f86', radius: 0.6, head: 1.75, hangMul: 1.6 },
  { id: 'mon', name: '몽이', animal: '원숭이', skill: '꼬리 낚기', tip: '위험한 동료를 꼬리로 낚아채요. 없으면 난간에 걸어요.', color: 0xd9955a, css: '#d9955a', radius: 0.5, head: 1.62, hangMul: 1.25 },
];
const DJ_INFO = { name: 'DJ 여우', css: '#ff8a3d', color: 0xff8a3d };

// ---- Shared pieces --------------------------------------------------------------------------
const G = {
  ball: new THREE.SphereGeometry(1, 32, 22),
  ballLo: new THREE.SphereGeometry(1, 14, 10),
  cone: new THREE.ConeGeometry(1, 1, 20),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 20),
  link: new THREE.CapsuleGeometry(1, 1, 5, 12),
  stub: new THREE.CapsuleGeometry(1, 0.9, 6, 14),
  arc: new THREE.TorusGeometry(1, 0.26, 8, 18, Math.PI),
  ring: new THREE.TorusGeometry(1, 0.3, 10, 26),
  ringThin: new THREE.TorusGeometry(1, 0.12, 8, 28),
  bandArc: new THREE.TorusGeometry(1, 0.085, 8, 22, Math.PI),
};
function clay(color, o) { // the one material rule: matte clay with a soft sheen
  const c = new THREE.Color(color);
  return new THREE.MeshPhysicalMaterial(Object.assign({
    color: c, roughness: 0.8, metalness: 0, sheen: 0.75, sheenRoughness: 0.5,
    sheenColor: c.clone().lerp(new THREE.Color(0xffffff), 0.6),
  }, o || {}));
}
const M = {
  eye: new THREE.MeshPhysicalMaterial({ color: 0x24140e, roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04 }),
  white: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  sclera: clay(0xfffdf6, { sheen: 0.2 }),
  blush: new THREE.MeshStandardMaterial({ color: 0xff8fa3, roughness: 0.9, transparent: true, opacity: 0.6, depthWrite: false }),
  mouth: clay(0x5a2430, { sheen: 0 }),
  cream: clay(0xfff1dc),
};
function part(parent, geo, mat, px, py, pz, sx, sy, sz) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(px, py, pz);
  m.scale.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m); return m;
}
const _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
function stretch(mesh, ax, ay, az, bx, by, bz, r) { // a capsule link laid from a to b
  _d.set(bx - ax, by - ay, bz - az);
  const len = _d.length() || 1e-4;
  mesh.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  mesh.quaternion.setFromUnitVectors(_up, _d.multiplyScalar(1 / len));
  mesh.scale.set(r, len, r);
}
function ease(cur, target, rate, dt) { return cur + (target - cur) * (1 - Math.exp(-rate * dt)); }
function easeV(v, x, y, z, rate, dt) {
  const k = 1 - Math.exp(-rate * dt);
  v.x += (x - v.x) * k; v.y += (y - v.y) * k; v.z += (z - v.z) * k;
}

// A bendy limb: capsule links along a quadratic curve from p0 through control p1 to p2.
function makeChain(parent, n, mat, tipMat) {
  const links = [];
  for (let i = 0; i < n; i++) links.push(part(parent, G.link, i === n - 1 && tipMat ? tipMat : mat, 0, 0, 0, 0.1));
  return {
    links, p0: new THREE.Vector3(), p1: new THREE.Vector3(), p2: new THREE.Vector3(),
    lay(r0, r1) {
      const { p0, p1, p2 } = this; let ax = p0.x, ay = p0.y, az = p0.z;
      for (let i = 0; i < n; i++) {
        const t = (i + 1) / n, u = 1 - t;
        const bx = u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x;
        const by = u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y;
        const bz = u * u * p0.z + 2 * u * t * p1.z + t * t * p2.z;
        stretch(links[i], ax, ay, az, bx, by, bz, r0 + (r1 - r0) * (i / (n - 1)));
        ax = bx; ay = by; az = bz;
      }
    },
  };
}

// An eye with the faces the game needs: open (glossy, two highlights), happy ^, squeeze > <,
// wide (shock) and ko (x).
function makeEye(parent, x, y, z, r, sideSign) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = Math.atan2(x, Math.abs(z) + 0.4) * 0.9; parent.add(g);
  const open = new THREE.Group(); g.add(open);
  const ball = part(open, G.ball, M.eye, 0, 0, 0, r, r * 1.12, r * 0.6);
  const hi1 = part(open, G.ballLo, M.white, -r * 0.3, r * 0.42, r * 0.5, r * 0.27); hi1.castShadow = false;
  const hi2 = part(open, G.ballLo, M.white, r * 0.3, -r * 0.34, r * 0.5, r * 0.12); hi2.castShadow = false;
  const happy = part(g, G.arc, M.eye, 0, -r * 0.25, r * 0.3, r * 0.82);
  const squeeze = new THREE.Group(); g.add(squeeze);
  const s1 = part(squeeze, G.link, M.eye, 0, r * 0.3, r * 0.35, r * 0.2, r * 0.3, r * 0.2);
  const s2 = part(squeeze, G.link, M.eye, 0, -r * 0.3, r * 0.35, r * 0.2, r * 0.3, r * 0.2);
  s1.rotation.z = -sideSign * 1.0; s2.rotation.z = sideSign * 1.0; // > < : the points meet at the nose
  const wide = new THREE.Group(); g.add(wide);
  part(wide, G.ball, M.sclera, 0, 0, 0, r * 1.28, r * 1.36, r * 0.55);
  part(wide, G.ballLo, M.eye, 0, 0, r * 0.42, r * 0.46, r * 0.5, r * 0.3);
  const ko = new THREE.Group(); g.add(ko);
  const k1 = part(ko, G.link, M.eye, 0, 0, r * 0.35, r * 0.2, r * 0.42, r * 0.2); k1.rotation.z = 0.78;
  const k2 = part(ko, G.link, M.eye, 0, 0, r * 0.35, r * 0.2, r * 0.42, r * 0.2); k2.rotation.z = -0.78;
  const faces = { open, happy, squeeze, wide, ko };
  let cur = '';
  return {
    g, r,
    set(name) { if (name === cur) return; cur = name; for (const k in faces) faces[k].visible = k === name; },
    blink(k) { open.scale.y = k; },
  };
}
function blushPair(parent, x, y, z, s) {
  for (const sgn of [-1, 1]) {
    const b = part(parent, G.ballLo, M.blush, sgn * x, y, z, s * 1.25, s * 0.8, s * 0.35);
    b.rotation.y = sgn * 0.55; b.castShadow = false; b.receiveShadow = false;
  }
}
// The pool ring an animal floats in once it is out.
function makeFloatie(color) {
  const g = new THREE.Group();
  const m = clay(color, { roughness: 0.45, sheen: 0.3, clearcoat: 0.5 });
  const t = part(g, G.ring, m, 0, 0, 0, 0.62, 0.62, 0.62); t.rotation.x = Math.PI / 2;
  const stripe = clay(0xffffff, { roughness: 0.45 });
  for (let i = 0; i < 4; i++) {
    const s = part(g, G.ring, stripe, 0, 0, 0, 0.625, 0.625, 0.64);
    s.geometry = STRIPE_GEO; s.rotation.x = Math.PI / 2; s.rotation.z = i * Math.PI / 2;
  }
  g.visible = false; return g;
}
const STRIPE_GEO = new THREE.TorusGeometry(1, 0.3, 10, 6, 0.42);

// ---- What every animal does: place, squash, face ------------------------------------------------
const _q = new THREE.Quaternion(), _qy = new THREE.Quaternion();
const BODY_CENTRE = [0.98, 0.58, 0.82, 0.72]; // m above the feet: what a tumbling body turns about
function baseRig(kind) {
  const root = new THREE.Group(), bodyG = new THREE.Group();
  root.add(bodyG);
  const floatie = makeFloatie(kind >= 0 ? [0xff9ec4, 0x8be3ff, 0xfff07a, 0xb6f2a4][kind] : 0xffffff);
  root.add(floatie);
  return {
    kind, root, bodyG, floatie, eyes: [], phase: (kind + 1) * 1.7, walkPh: 0, tumble: 0, lean: 0, faceNow: 0,
    sway: 0, lastMode: '', sinceMode: 0, expr: 'open', mouthOpen: 0, hangSwing: 0,
  };
}
function animateBase(rig, a, ctx) {
  const dt = ctx.dt, t = ctx.t, root = rig.root, b = rig.bodyG;
  if (a.mode !== rig.lastMode) { rig.lastMode = a.mode; rig.sinceMode = 0; } else rig.sinceMode += dt;
  const offDisc = a.mode === 'fall' || a.mode === 'out';
  const baseY = offDisc ? 0 : ctx.surfY(a.x, a.z);
  root.position.set(a.x, baseY + a.y, a.z);
  // facing turns smoothly; the short way round
  let df = a.face - rig.faceNow; df = Math.atan2(Math.sin(df), Math.cos(df));
  rig.faceNow += df * (1 - Math.exp(-14 * dt));
  _qy.setFromAxisAngle(_up, rig.faceNow);
  const grounded = a.mode === 'ground';
  if (grounded) root.quaternion.copy(ctx.qTilt).multiply(_qy); else root.quaternion.copy(_qy);
  // tumble in the air, settle on the ground
  const airborne = a.mode === 'air' || a.mode === 'yanked' || a.mode === 'fall';
  if (airborne) rig.tumble += dt * (5 + Math.abs(a.vy) * 0.25);
  else { const w = Math.atan2(Math.sin(rig.tumble), Math.cos(rig.tumble)); rig.tumble = ease(w, 0, 16, dt); }
  // lean against a slide, shake under strain, swing while hanging
  const slide = grounded ? Math.min(1, a.slide / 4) : 0;
  rig.lean = ease(rig.lean, slide, 8, dt);
  const strain = a.hold ? 1 : 0;
  b.rotation.set(0, 0, 0);
  b.position.set(0, 0, 0);
  const cy = BODY_CENTRE[rig.kind];
  if (airborne || Math.abs(rig.tumble) > 0.02) { b.rotation.x = rig.tumble; b.position.y = cy * (1 - Math.cos(rig.tumble)); b.position.z = -cy * Math.sin(rig.tumble); }
  else {
    b.rotation.x = -rig.lean * 0.35 + Math.sin(t * 22 + rig.phase) * 0.03 * rig.lean;
    b.rotation.z = Math.sin(rig.walkPh) * 0.07 * a.walk + Math.sin(t * 31 + rig.phase) * 0.02 * strain;
    if (strain) b.position.x = Math.sin(t * 47 + rig.phase) * 0.012;
  }
  if (a.mode === 'hang') {
    rig.hangSwing = ease(rig.hangSwing, Math.min(0.9, Math.abs(ctx.disc.w) * 0.45), 4, dt);
    b.rotation.x = -rig.hangSwing * 0.8 + Math.sin(t * 6 + rig.phase) * 0.12;
    b.rotation.z = Math.sin(t * 4.3 + rig.phase) * 0.14;
  }
  // squash and stretch, feet as the pivot
  let sy = 1 + Math.sin(t * 2.3 + rig.phase) * 0.018;
  const sinceLand = ctx.simT - a.landT;
  if (grounded && sinceLand >= 0 && sinceLand < 0.6) sy -= 0.3 * Math.exp(-7 * sinceLand) * Math.cos(17 * sinceLand);
  if (a.mode === 'air' || a.mode === 'yanked') sy += Math.min(0.22, Math.abs(a.vy) * 0.022);
  const sincePang = ctx.simT - ctx.pangT;
  if (grounded && sincePang >= 0 && sincePang < 0.4) sy -= 0.16 * Math.exp(-9 * sincePang) * Math.cos(20 * sincePang);
  if (a.emote === 'cheer') sy += Math.abs(Math.sin(t * 11 + rig.phase)) * 0.1;
  const sxz = 1 / Math.sqrt(Math.max(0.5, sy));
  b.scale.set(sxz, sy, sxz);
  if (a.emote === 'cheer' && grounded) b.position.y += Math.abs(Math.sin(t * 11 + rig.phase)) * 0.22;
  // walking
  rig.walkPh += dt * (4 + 9 * a.walk) * (a.walk > 0.05 ? 1 : 0);
  // the floatie, when out
  rig.floatie.visible = a.mode === 'out';
  if (a.mode === 'out') {
    rig.floatie.position.y = KINDS[rig.kind].radius * 0.55;
    rig.floatie.scale.setScalar(KINDS[rig.kind].radius * 1.75);
    root.position.y += Math.sin(t * 2.1 + rig.phase) * 0.06;
    b.rotation.z = Math.sin(t * 1.6 + rig.phase) * 0.1;
    b.position.y = -KINDS[rig.kind].radius * 0.35;
  }
  // the face
  let ex = 'open';
  if (a.mode === 'out') ex = rig.sinceMode < 2.2 ? 'ko' : 'happy';
  else if (a.mode === 'hang' || a.mode === 'fall' || a.mode === 'air' || a.mode === 'yanked') ex = 'wide';
  else if (a.mode === 'carried' || a.tired > 0 || (a.hold && a.gauge < 0.35)) ex = 'squeeze';
  else if (a.emote === 'cheer') ex = 'happy';
  else if (a.slide > 2.2) ex = 'wide';
  const blink = ex === 'open' && ((t * 0.37 + rig.phase * 0.61) % 1) < 0.045;
  for (const e of rig.eyes) { e.set(ex); e.blink(blink ? 0.12 : 1); }
  rig.expr = ex;
  rig.mouthOpen = ease(rig.mouthOpen, ex === 'wide' || ex === 'ko' ? 1 : ex === 'squeeze' ? 0.45 : 0, 18, dt);
  root.updateMatrixWorld(true);
}
function localTarget(rig, a, out) { // the skill's target point, in the body's own space
  out.set(a.tx, a.ty, a.tz); return rig.bodyG.worldToLocal(out);
}

// ---- 코끼리 코코 ----------------------------------------------------------------------------------
function makeElephant() {
  const rig = baseRig(0), b = rig.bodyG, C = KINDS[0].color;
  const skin = clay(C), pink = clay(0xf7b9c6), dark = clay(0x7f97bd), tusk = clay(0xfff8e7, { roughness: 0.5 });
  part(b, G.ball, skin, 0, 0.98, 0, 0.92, 0.8, 1.02);
  part(b, G.ball, skin, 0, 0.94, 0.84, 0.44, 0.42, 0.32);
  rig.ears = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Group(); e.position.set(s * 0.74, 1.3, 0.3); b.add(e);
    part(e, G.ball, skin, s * 0.44, -0.06, 0, 0.5, 0.56, 0.1);
    const inn = part(e, G.ball, pink, s * 0.46, -0.08, 0.06, 0.36, 0.42, 0.06); inn.castShadow = false;
    rig.ears.push(e);
    rig.eyes.push(makeEye(b, s * 0.36, 1.2, 0.8, 0.15, s));
    part(b, G.ball, tusk, s * 0.2, 0.78, 1.0, 0.06, 0.06, 0.15).rotation.x = 0.35;
  }
  blushPair(b, 0.56, 0.98, 0.76, 0.11);
  rig.legs = [];
  for (const [x, z] of [[-0.44, 0.44], [0.44, 0.44], [-0.44, -0.44], [0.44, -0.44]]) {
    const l = part(b, G.stub, skin, x, 0.36, z, 0.25, 0.25, 0.25);
    if (z > 0) for (const k of [-1, 0, 1]) part(l, G.ballLo, M.cream, k * 0.5, -1.2, 0.86, 0.26, 0.2, 0.2).castShadow = false;
    rig.legs.push(l);
  }
  rig.tail = part(b, G.link, dark, 0, 0.98, -1.03, 0.045, 0.2, 0.045); rig.tail.rotation.x = -0.9;
  part(b, G.ballLo, dark, 0, 0.84, -1.2, 0.09);
  rig.trunk = makeChain(b, 13, skin);
  rig.trunkTip = new THREE.Vector3(0, 0.42, 1.4); rig.trunkMid = new THREE.Vector3(0, 0.5, 1.05);
  rig.update = function (a, ctx) {
    animateBase(rig, a, ctx);
    const t = ctx.t, dt = ctx.dt;
    rig.legs.forEach((l, i) => { l.position.y = 0.36 + Math.max(0, Math.sin(rig.walkPh + (i % 3 ? Math.PI : 0))) * 0.12 * a.walk; });
    const flap = a.mode === 'air' || a.mode === 'hang' || a.mode === 'carried' ? 1 : rig.lean;
    rig.ears.forEach((e, i) => { const s = i ? 1 : -1; e.rotation.y = s * (0.5 + Math.sin(t * (6 + flap * 14) + i) * (0.08 + flap * 0.4)); e.rotation.z = s * (a.tired > 0 ? -0.5 : 0); });
    rig.tail.rotation.z = Math.sin(t * 5 + 1) * 0.3;
    // the trunk: idle curl, a waving reach, or wrapped on the rail
    const T = rig.trunk; T.p0.set(0, 0.96, 0.98);
    if (a.hasT && (a.hold || a.mode === 'hang')) {
      localTarget(rig, a, _v);
      easeV(rig.trunkTip, _v.x, _v.y, _v.z, 22, dt);
      easeV(rig.trunkMid, _v.x * 0.5, Math.max(_v.y, 0.96) + 0.5, 0.98 + (_v.z - 0.98) * 0.5, 22, dt);
    } else if (a.flail) {
      easeV(rig.trunkTip, Math.sin(t * 9) * 0.5, 1.9 + Math.sin(t * 13) * 0.15, 1.5, 14, dt);
      easeV(rig.trunkMid, Math.sin(t * 9 + 1) * 0.3, 1.25, 1.75, 14, dt);
    } else if (a.emote === 'cheer') {
      easeV(rig.trunkTip, Math.sin(t * 8) * 0.25, 2.05, 1.05, 12, dt);
      easeV(rig.trunkMid, 0, 1.2, 1.7, 12, dt);
    } else {
      const sw = Math.sin(t * 2.2 + rig.phase) * 0.12 + rig.lean * Math.sin(t * 15) * 0.3;
      easeV(rig.trunkTip, sw, 0.5 + Math.sin(t * 3.1) * 0.05, 1.42, 10, dt);
      easeV(rig.trunkMid, sw * 0.4, 0.42, 1.08, 10, dt);
    }
    T.p1.copy(rig.trunkMid); T.p2.copy(rig.trunkTip); T.lay(0.26, 0.13);
  };
  return rig;
}

// ---- 새 삐삐 ------------------------------------------------------------------------------------
function makeBird() {
  const rig = baseRig(1), b = rig.bodyG, C = KINDS[1].color;
  const skin = clay(C), belly = clay(0xfff2bd), orange = clay(0xff9838), deep = clay(0xf07f1e), crest = clay(0xffb52e);
  part(b, G.ball, skin, 0, 0.58, 0, 0.5, 0.5, 0.5);
  part(b, G.ball, belly, 0, 0.47, 0.13, 0.39, 0.37, 0.4).castShadow = false;
  for (const s of [-1, 1]) rig.eyes.push(makeEye(b, s * 0.2, 0.7, 0.4, 0.105, s));
  blushPair(b, 0.31, 0.56, 0.37, 0.07);
  part(b, G.ball, orange, 0, 0.6, 0.5, 0.12, 0.07, 0.16);
  rig.jaw = part(b, G.ball, deep, 0, 0.555, 0.47, 0.09, 0.045, 0.12);
  rig.wings = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(s * 0.43, 0.66, -0.02); b.add(w);
    part(w, G.ball, skin, s * 0.22, 0, 0, 0.27, 0.075, 0.2);
    part(w, G.ball, crest, s * 0.4, 0, -0.02, 0.12, 0.06, 0.15).castShadow = false;
    rig.wings.push(w);
    part(b, G.cyl, deep, s * 0.14, 0.08, 0.02, 0.025, 0.16, 0.025);
    part(b, G.ball, orange, s * 0.14, 0.03, 0.08, 0.09, 0.035, 0.13);
  }
  for (const k of [-1, 0, 1]) { const f = part(b, G.ball, crest, k * 0.07, 1.1 - Math.abs(k) * 0.04, -0.02, 0.045, 0.15, 0.045); f.rotation.z = -k * 0.45; }
  for (const k of [-1, 0, 1]) { const f = part(b, G.ball, crest, k * 0.09, 0.56, -0.52, 0.055, 0.045, 0.17); f.rotation.x = -0.5; f.rotation.y = k * 0.3; }
  rig.update = function (a, ctx) {
    animateBase(rig, a, ctx);
    const t = ctx.t, flying = a.mode === 'fly', panic = a.mode === 'air' || a.mode === 'hang' || a.mode === 'fall';
    rig.wings.forEach((w, i) => {
      const s = i ? 1 : -1;
      let ang = -1.2 + Math.sin(t * 3 + i) * 0.04 + rig.lean * (0.9 + Math.sin(t * 24) * 0.5);
      if (flying) ang = -0.15 + Math.sin(t * (a.carrying >= 0 ? 44 : 34)) * 0.95;
      else if (panic) ang = 0.1 + Math.sin(t * 40 + i) * 0.8;
      else if (a.emote === 'cheer') ang = 0.5 + Math.sin(t * 14) * 0.4;
      w.rotation.z = s > 0 ? ang : -ang;
    });
    rig.jaw.position.y = 0.555 - rig.mouthOpen * 0.06;
    if (flying) rig.bodyG.rotation.x = 0.25 + Math.sin(t * 17) * 0.05;
  };
  return rig;
}

// ---- 문어 무너 ----------------------------------------------------------------------------------
function makeOctopus() {
  const rig = baseRig(2), b = rig.bodyG, C = KINDS[2].color;
  const skin = clay(C), pale = clay(0xffc9bf), lip = clay(0xe8636b);
  rig.head = new THREE.Group(); b.add(rig.head);
  part(rig.head, G.ball, skin, 0, 0.84, 0, 0.6, 0.64, 0.58);
  part(rig.head, G.ball, skin, 0, 1.16, -0.12, 0.5, 0.46, 0.5);
  part(rig.head, G.ball, skin, 0, 0.36, 0, 0.5, 0.26, 0.5);
  for (const [x, y, z, s] of [[0.2, 1.52, 0.02, 0.09], [-0.16, 1.5, -0.3, 0.07], [0.02, 1.38, 0.3, 0.06]]) part(rig.head, G.ballLo, pale, x, y, z, s, s * 0.5, s).castShadow = false;
  for (const s of [-1, 1]) rig.eyes.push(makeEye(rig.head, s * 0.25, 0.82, 0.5, 0.125, s));
  blushPair(rig.head, 0.41, 0.68, 0.42, 0.08);
  rig.mouth = part(rig.head, G.ring, lip, 0, 0.6, 0.57, 0.05, 0.05, 0.05); rig.mouth.rotation.x = -0.15;
  rig.arms = []; rig.cups = [];
  for (let i = 0; i < 8; i++) {
    const ch = makeChain(b, 5, skin, pale); ch.ang = (i + 0.5) * Math.PI / 4; ch.reach = 0;
    rig.arms.push(ch);
    const cup = part(b, G.ringThin, pale, 0, 0.03, 0, 0.16, 0.16, 0.16); cup.rotation.x = Math.PI / 2; cup.castShadow = false; cup.visible = false;
    rig.cups.push(cup);
  }
  rig.spread = 0; rig.tgt = new THREE.Vector3(0, 0.3, 1); rig.reachIdx = 0;
  rig.update = function (a, ctx) {
    animateBase(rig, a, ctx);
    const t = ctx.t, dt = ctx.dt, stuck = a.hold ? 1 : 0, _v = rig.tgt;
    const loose = a.mode === 'air' || a.mode === 'fall' || a.mode === 'carried' || a.mode === 'yanked' ? 1 : 0;
    rig.spread = ease(rig.spread, stuck, 14, dt);
    rig.head.position.y = -0.12 * rig.spread + Math.sin(rig.walkPh * 2) * 0.03 * a.walk;
    rig.head.scale.set(1 + 0.08 * rig.spread, 1 - 0.1 * rig.spread, 1 + 0.08 * rig.spread);
    rig.mouth.scale.setScalar(0.05 + rig.mouthOpen * 0.05);
    // which arm reaches for the friend (or the rim, when hanging)
    let reachIdx = -1;
    if (a.hasT) { localTarget(rig, a, _v); const ta = Math.atan2(_v.x, _v.z); let best = 9; rig.arms.forEach((ch, i) => { let d = Math.abs(Math.atan2(Math.sin(ch.ang - ta), Math.cos(ch.ang - ta))); if (d < best) { best = d; reachIdx = i; } }); rig.reachIdx = reachIdx; }
    const second = a.hasT && a.mode === 'hang' ? (rig.reachIdx + 1) % 8 : -1;
    rig.arms.forEach((ch, i) => {
      const sx = Math.sin(ch.ang), cz = Math.cos(ch.ang);
      ch.reach = ease(ch.reach, i === reachIdx || i === second ? 1 : 0, 18, dt);
      const wave = Math.sin(rig.walkPh * 2 + i * 0.9) * 0.12 * a.walk + Math.sin(t * 2 + i * 1.3) * 0.04 + rig.lean * Math.sin(t * 20 + i) * 0.2;
      const len = 0.62 + 0.3 * rig.spread + wave;
      ch.p0.set(sx * 0.36, 0.3, cz * 0.36);
      let mx = sx * (0.36 + len * 0.55), my = 0.1 - 0.06 * rig.spread + loose * 0.5, mz = cz * (0.36 + len * 0.55);
      let ex = sx * (0.36 + len), ey = 0.09 + (1 - rig.spread) * 0.16 + loose * (0.9 + Math.sin(t * 16 + i) * 0.25), ez = cz * (0.36 + len);
      if (ch.reach > 0.01) {
        const k = ch.reach, ox = i === rig.reachIdx ? 0 : 0.35;
        mx += (_v.x * 0.5 + ox - mx) * k; my += (Math.max(_v.y, 0.4) + 0.35 - my) * k; mz += (_v.z * 0.5 - mz) * k;
        ex += (_v.x + ox - ex) * k; ey += (_v.y - ey) * k; ez += (_v.z - ez) * k;
      }
      ch.p1.set(mx, my, mz); ch.p2.set(ex, ey, ez); ch.lay(0.16, 0.075);
      const cup = rig.cups[i]; cup.visible = rig.spread > 0.3 && ch.reach < 0.5;
      if (cup.visible) { cup.position.set(ex, 0.03, ez); cup.scale.setScalar(0.13 + 0.05 * Math.sin(t * 10 + i * 2)); }
    });
  };
  return rig;
}

// ---- 원숭이 몽이 --------------------------------------------------------------------------------
function makeMonkey() {
  const rig = baseRig(3), b = rig.bodyG, C = KINDS[3].color;
  const skin = clay(C), cream = clay(0xffe6c8), dark = clay(0x8a5a34);
  part(b, G.ball, skin, 0, 0.5, 0, 0.37, 0.38, 0.34);
  part(b, G.ball, cream, 0, 0.47, 0.17, 0.25, 0.26, 0.2).castShadow = false;
  rig.head = new THREE.Group(); rig.head.position.set(0, 1.0, 0.04); b.add(rig.head);
  part(rig.head, G.ball, skin, 0, 0, 0, 0.45, 0.41, 0.42);
  part(rig.head, G.ball, cream, -0.13, 0.03, 0.27, 0.2, 0.22, 0.17).castShadow = false;
  part(rig.head, G.ball, cream, 0.13, 0.03, 0.27, 0.2, 0.22, 0.17).castShadow = false;
  part(rig.head, G.ball, cream, 0, -0.13, 0.33, 0.23, 0.16, 0.16);
  part(rig.head, G.ballLo, M.mouth, 0, -0.08, 0.485, 0.035, 0.028, 0.02).castShadow = false;
  rig.smile = part(rig.head, G.arc, M.mouth, 0, -0.15, 0.475, 0.06, 0.06, 0.06); rig.smile.rotation.z = Math.PI; rig.smile.castShadow = false;
  rig.oh = part(rig.head, G.ballLo, M.mouth, 0, -0.2, 0.47, 0.06, 0.07, 0.03); rig.oh.castShadow = false;
  for (const s of [-1, 1]) {
    rig.eyes.push(makeEye(rig.head, s * 0.15, 0.05, 0.4, 0.088, s));
    part(rig.head, G.ball, skin, s * 0.47, 0.04, -0.02, 0.18, 0.18, 0.07);
    part(rig.head, G.ball, cream, s * 0.48, 0.04, 0.03, 0.11, 0.11, 0.05).castShadow = false;
  }
  blushPair(rig.head, 0.28, -0.1, 0.33, 0.06);
  part(rig.head, G.ball, dark, 0, 0.42, 0.02, 0.07, 0.11, 0.07);
  part(rig.head, G.ball, dark, 0.07, 0.39, -0.02, 0.05, 0.08, 0.05);
  rig.armL = [], rig.hands = [], rig.feet = [];
  for (const s of [-1, 1]) {
    rig.armL.push(part(b, G.link, skin, 0, 0, 0, 0.07));
    rig.hands.push(part(b, G.ball, cream, 0, 0, 0, 0.1));
    part(b, G.stub, skin, s * 0.17, 0.17, 0.01, 0.1, 0.1, 0.1);
    rig.feet.push(part(b, G.ball, cream, s * 0.17, 0.06, 0.1, 0.12, 0.07, 0.18));
  }
  rig.tail = makeChain(b, 14, skin, dark);
  rig.tailTip = new THREE.Vector3(0, 1.3, -0.75); rig.tailMid = new THREE.Vector3(0, 0.3, -1.1);
  rig.update = function (a, ctx) {
    animateBase(rig, a, ctx);
    const t = ctx.t, dt = ctx.dt;
    const up = a.mode === 'hang' || a.mode === 'air' || a.mode === 'fall' || a.emote === 'cheer' ? 1 : rig.lean;
    rig.head.rotation.z = Math.sin(t * 1.7 + rig.phase) * 0.05; rig.head.rotation.x = -rig.lean * 0.2;
    rig.smile.visible = rig.mouthOpen < 0.3; rig.oh.visible = !rig.smile.visible;
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1, sw = Math.sin(rig.walkPh + i * Math.PI) * 0.22 * a.walk;
      const hx = s * (0.5 + up * 0.12), hy = 0.36 + up * (0.95 + Math.sin(t * 19 + i * 2) * 0.12), hz = 0.06 + sw + up * 0.05;
      stretch(rig.armL[i], s * 0.3, 0.66, 0.02, hx, hy, hz, 0.07);
      rig.hands[i].position.set(hx, hy, hz);
      rig.feet[i].position.y = 0.06 + Math.max(0, Math.sin(rig.walkPh + i * Math.PI)) * 0.1 * a.walk;
      rig.feet[i].position.z = 0.1 + Math.sin(rig.walkPh + i * Math.PI) * 0.08 * a.walk;
    }
    const T = rig.tail; T.p0.set(0, 0.34, -0.3);
    if (a.hasT && a.mode !== 'hang') {
      localTarget(rig, a, _v);
      easeV(rig.tailTip, _v.x, _v.y, _v.z, 30, dt);
      easeV(rig.tailMid, _v.x * 0.5, Math.max(_v.y, 0.4) + 0.9, _v.z * 0.5 - 0.3, 30, dt);
    } else {
      const sw = Math.sin(t * 2.6 + rig.phase) * 0.25 + rig.lean * Math.sin(t * 17) * 0.5;
      easeV(rig.tailTip, sw, 1.42 + Math.sin(t * 3.3) * 0.08, -0.66, 9, dt);
      easeV(rig.tailMid, sw * 0.5, 0.2, -1.35, 9, dt);
    }
    T.p1.copy(rig.tailMid); T.p2.copy(rig.tailTip); T.lay(0.065, 0.05);
  };
  return rig;
}

// ---- DJ 여우 ------------------------------------------------------------------------------------
function makeFox() {
  const root = new THREE.Group(), b = new THREE.Group(); root.add(b);
  const fur = clay(DJ_INFO.color), cream = clay(0xfff0dc), dark = clay(0x4a2f27), tip = clay(0xffffff);
  const lens = new THREE.MeshPhysicalMaterial({ color: 0x0b0d1c, roughness: 0.05, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.03 });
  const neon = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x35f2e0).multiplyScalar(2.2) });
  const band = clay(0x23284f, { roughness: 0.5 });
  const rig = { root, bodyG: b, eyes: [], moodNow: '', sinceMood: 0, slam: 0, armUp: 0, laugh: 0, shock: 0, pointK: 0, scratch: 0 };
  part(b, G.ball, fur, 0, 0.56, 0, 0.5, 0.56, 0.44);
  part(b, G.ball, cream, 0, 0.5, 0.2, 0.34, 0.42, 0.28).castShadow = false;
  const h = rig.head = new THREE.Group(); h.position.set(0, 1.2, 0.06); b.add(h);
  part(h, G.ball, fur, 0, 0, 0, 0.56, 0.46, 0.48);
  for (const s of [-1, 1]) {
    part(h, G.ball, cream, s * 0.34, -0.14, 0.2, 0.26, 0.2, 0.22);
    const tuft = part(h, G.cone, cream, s * 0.6, -0.16, 0.12, 0.12, 0.3, 0.1); tuft.rotation.z = -s * 1.75;
    const ear = new THREE.Group(); ear.position.set(s * 0.3, 0.34, 0); ear.rotation.z = -s * 0.22; h.add(ear);
    part(ear, G.cone, fur, 0, 0.2, 0, 0.19, 0.5, 0.13);
    part(ear, G.cone, dark, 0, 0.38, 0, 0.085, 0.2, 0.06);
    part(ear, G.cone, cream, 0, 0.16, 0.05, 0.1, 0.3, 0.07).castShadow = false;
    (rig.ears = rig.ears || []).push(ear);
    rig.eyes.push(makeEye(h, s * 0.22, 0.06, 0.4, 0.1, s));
  }
  part(h, G.ball, cream, 0, -0.12, 0.42, 0.2, 0.15, 0.24);
  part(h, G.ballLo, dark, 0, -0.06, 0.66, 0.06, 0.05, 0.045);
  rig.smirk = part(h, G.arc, M.mouth, 0.03, -0.2, 0.55, 0.08, 0.07, 0.06); rig.smirk.rotation.z = Math.PI - 0.25;
  rig.jaw = part(h, G.ball, M.mouth, 0, -0.26, 0.5, 0.11, 0.02, 0.1);
  const sh = rig.shades = new THREE.Group(); h.add(sh);
  for (const s of [-1, 1]) part(sh, G.ball, lens, s * 0.23, 0.06, 0.45, 0.2, 0.15, 0.06);
  part(sh, G.cyl, lens, 0, 0.1, 0.47, 0.03, 0.14, 0.03).rotation.z = Math.PI / 2;
  part(h, G.bandArc, band, 0, 0, 0, 0.62, 0.62, 0.8);
  for (const s of [-1, 1]) {
    const cup = part(h, G.cyl, band, s * 0.62, -0.02, 0, 0.2, 0.14, 0.2); cup.rotation.z = Math.PI / 2;
    const glow = part(h, G.ringThin, neon, s * 0.7, -0.02, 0, 0.15, 0.15, 0.15); glow.rotation.y = Math.PI / 2; glow.castShadow = false;
  }
  rig.arms = [], rig.paws = [];
  for (const s of [-1, 1]) { rig.arms.push(part(b, G.link, fur, 0, 0, 0, 0.1)); rig.paws.push(part(b, G.ball, dark, 0, 0, 0, 0.13)); }
  rig.pawPos = [new THREE.Vector3(-0.62, 0.72, 0.62), new THREE.Vector3(0.62, 0.72, 0.62)];
  rig.tail = makeChain(b, 6, fur, tip);
  for (const s of [-1, 1]) part(b, G.ball, dark, s * 0.24, 0.07, 0.12, 0.15, 0.08, 0.22);
  // dj: { beat (0..1 in the bar's beat), mood, moodT, count, pointX, pointZ }
  rig.update = function (dj, ctx) {
    const t = ctx.t, dt = ctx.dt, mood = dj.mood;
    if (mood !== rig.moodNow) { rig.moodNow = mood; rig.sinceMood = 0; } else rig.sinceMood += dt;
    const bob = Math.abs(Math.sin(Math.PI * dj.beat));
    rig.slam = ease(rig.slam, mood === 'slam' ? 1 : 0, mood === 'slam' ? 40 : 7, dt);
    rig.armUp = ease(rig.armUp, mood === 'count' ? Math.min(1, 0.45 + 0.3 * dj.count) : 0, 16, dt);
    rig.laugh = ease(rig.laugh, mood === 'laugh' ? 1 : 0, 10, dt);
    rig.shock = ease(rig.shock, mood === 'shock' ? 1 : 0, 9, dt);
    rig.pointK = ease(rig.pointK, mood === 'point' ? 1 : 0, 12, dt);
    rig.scratch = ease(rig.scratch, mood === 'scratch' ? 1 : 0, 14, dt);
    b.position.y = bob * 0.07 - rig.slam * 0.12 + rig.laugh * Math.abs(Math.sin(t * 19)) * 0.08;
    b.scale.set(1 + rig.slam * 0.08, 1 - rig.slam * 0.1, 1 + rig.slam * 0.08);
    b.rotation.x = rig.slam * 0.3 + rig.armUp * -0.08 - rig.laugh * 0.22 - rig.shock * 0.3;
    b.rotation.y = rig.scratch * Math.sin(t * 16) * 0.35 + Math.sin(t * 1.1) * 0.08;
    rig.head.rotation.x = (bob - 0.5) * 0.2 - rig.laugh * 0.35 + rig.slam * 0.2;
    rig.head.rotation.z = Math.sin(t * 2.1) * 0.06 + rig.laugh * Math.sin(t * 19) * 0.08;
    rig.ears.forEach((e, i) => { const s = i ? 1 : -1; e.rotation.z = -s * (0.22 + rig.shock * 0.9 + bob * 0.06); });
    rig.shades.position.y = -rig.shock * 0.16; rig.shades.rotation.x = rig.shock * 0.5;
    for (const e of rig.eyes) { e.set(rig.shock > 0.4 ? 'wide' : 'happy'); e.g.visible = rig.shock > 0.4; }
    const open = Math.max(rig.laugh, rig.shock, mood === 'slam' ? 1 : 0, mood === 'count' ? 0.6 : 0);
    rig.jaw.scale.y = 0.02 + open * 0.1; rig.jaw.position.y = -0.24 - open * 0.05; rig.smirk.visible = open < 0.3;
    // paws: left rides the record, right counts, points and slams
    const lp = rig.pawPos[0], rp = rig.pawPos[1];
    easeV(lp, -0.62 + rig.scratch * Math.sin(t * 16) * 0.22, 0.74 - rig.slam * 0.12 + rig.laugh * 0.3, 0.62 + rig.scratch * Math.cos(t * 16) * 0.12 - rig.laugh * 0.3, 20, dt);
    let rx = 0.62, ry = 0.74 + bob * 0.05, rz = 0.62;
    if (rig.armUp > 0.02) { rx = 0.66; ry = 0.74 + rig.armUp * 1.25; rz = 0.42; }
    if (rig.pointK > 0.02) { rx += (dj.pointX * 0.9 - rx) * rig.pointK; ry += (1.0 - ry) * rig.pointK; rz += (0.9 - rz) * rig.pointK; }
    if (rig.laugh > 0.02) { ry += rig.laugh * 0.35; rz -= rig.laugh * 0.3; }
    ry -= rig.slam * (ry - 0.6);
    easeV(rp, rx, ry, rz, mood === 'slam' ? 45 : 18, dt);
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1, p = rig.pawPos[i];
      stretch(rig.arms[i], s * 0.4, 0.8, 0.1, p.x, p.y, p.z, 0.1);
      rig.paws[i].position.copy(p);
    }
    const T = rig.tail, sw = Math.sin(t * 2.4) * 0.3 + rig.laugh * Math.sin(t * 15) * 0.2;
    T.p0.set(0.1, 0.3, -0.36); T.p1.set(0.75 + sw * 0.4, 0.3, -0.8); T.p2.set(0.95 + sw, 1.15 + bob * 0.06, -0.55);
    T.lay(0.17, 0.26);
  };
  return rig;
}

const MAKE_RIG = [makeElephant, makeBird, makeOctopus, makeMonkey];
