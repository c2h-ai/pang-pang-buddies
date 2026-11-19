// The game: the one-shot's scripts, carried over as they were, in the page's order, in one
// module so they share one scope as the page's scripts did. The grow step splits it by what the
// code does and moves it to TypeScript.
import './config.js';
import * as THREE_CORE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
const THREE = { ...THREE_CORE, EffectComposer, RenderPass, UnrealBloomPass, OutputPass };

// ==== starter ====
'use strict';
// The one-shot's starter, kept: the fixed step, the clock hook, window.game and the play and
// figures scenes. The game itself is in the scripts below (models, city, world, sim, audio, hud).

// ---- Built to be checked ----------------------------------------------------------------
const params = new URLSearchParams(location.search);
const tune = new Proxy({}, { get: (_, k) => CONFIG[k].value }); // live: tune.speed is CONFIG.speed.value
const STEP = 1 / 60;            // simulation step in seconds; motion is per second, never per frame
const TITLE = '팡팡 버디즈 (Pang Pang Buddies)';
const clock = window.GAME_CLOCK || { now: () => performance.now() / 1000 }; // a check may inject one
const CHEAP = params.get('render') === 'cheap'; // a headless shot or check: 3D draws cheap; players never see it
let seed;
function rng() { // mulberry32; every gameplay random call reads this, never Math.random
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const events = []; // window.game.events: anything the game wants a run to see

// ---- Input: keys by position (event.code), OS key repeat ignored ------------------------
const down = new Set(), hit = new Set();
const pressed = code => hit.has(code); // true for one step after the key goes down
addEventListener('keydown', e => {
  startAudio();
  if (!e.repeat) { down.add(e.code); hit.add(e.code); }
  if (e.code === 'Space' || e.code === 'Enter' || e.code.startsWith('Arrow')) e.preventDefault();
});
addEventListener('keyup', e => down.delete(e.code));
addEventListener('pointerdown', () => startAudio());
addEventListener('blur', () => down.clear());
// Up to four players on one machine: two on the keyboard, the rest on gamepads.
const DEV = {
  kb1: { up: ['KeyW'], dn: ['KeyS'], lf: ['KeyA'], rt: ['KeyD'], skill: ['Space'], sig: ['KeyE'], label: { move: 'WASD', skill: 'Space', sig: 'E' } },
  kb2: { up: ['ArrowUp'], dn: ['ArrowDown'], lf: ['ArrowLeft'], rt: ['ArrowRight'], skill: ['Enter', 'NumpadEnter'], sig: ['ShiftRight', 'Slash'], label: { move: '방향키', skill: 'Enter', sig: '오른쪽 Shift' } },
};
const Input = {
  pads: {}, prev: {},
  poll() { // once a step: a snapshot of every gamepad
    this.prev = this.pads; this.pads = {};
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < list.length && i < 4; i++) {
      const g = list[i]; if (!g || !g.connected) continue;
      const b = k => !!(g.buttons[k] && g.buttons[k].pressed), ax = k => Math.abs(g.axes[k] || 0) > 0.28 ? g.axes[k] : 0;
      this.pads['pad' + i] = { x: ax(0) + (b(15) ? 1 : 0) - (b(14) ? 1 : 0), z: ax(1) + (b(13) ? 1 : 0) - (b(12) ? 1 : 0), skill: b(0) || b(1), sig: b(2) || b(3), start: b(9) };
    }
  },
  devices() { return ['kb1', 'kb2'].concat(Object.keys(this.pads)); },
  read(dev) { // { x, z, skill, skillHit, sigHit, lfHit, rtHit }
    const d = DEV[dev], any = l => l.some(c => down.has(c)), anyHit = l => l.some(c => hit.has(c));
    if (d) return { x: (any(d.rt) ? 1 : 0) - (any(d.lf) ? 1 : 0), z: (any(d.dn) ? 1 : 0) - (any(d.up) ? 1 : 0), skill: any(d.skill), skillHit: anyHit(d.skill), sigHit: anyHit(d.sig), lfHit: anyHit(d.lf), rtHit: anyHit(d.rt) };
    const p = this.pads[dev], q = this.prev[dev] || { x: 0, z: 0, skill: false, sig: false };
    if (!p) return { x: 0, z: 0, skill: false, skillHit: false, sigHit: false, lfHit: false, rtHit: false };
    return { x: Math.max(-1, Math.min(1, p.x)), z: Math.max(-1, Math.min(1, p.z)), skill: p.skill, skillHit: p.skill && !q.skill, sigHit: p.sig && !q.sig, lfHit: p.x < -0.5 && !(q.x < -0.5), rtHit: p.x > 0.5 && !(q.x > 0.5) };
  },
  label(dev, what) { return DEV[dev] ? DEV[dev].label[what] : { move: '스틱', skill: 'A 버튼', sig: 'X 버튼' }[what]; },
};

// ---- Audio: started on first input, mute on M --------------------------------------------
let audio = null, muted = false;
function startAudio() {
  if (!audio) {
    const ac = window.GAME_AUDIO || new (window.AudioContext || window.webkitAudioContext)(); // a check may inject one
    const out = ac.createGain(); out.gain.value = muted ? 0 : tune.volume;
    out.connect(ac.destination); audio = { ac, out };
  }
  if (audio.ac.state === 'suspended') audio.ac.resume();
}
function setMuted(m) { muted = m; if (audio) audio.out.gain.value = m ? 0 : tune.volume; }
addEventListener('tune', () => setMuted(muted)); // the tweak panel (an add-on), when added, moved a value: the volume follows

// ==== models.js ====
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

// ==== city.js ====
'use strict';
// The backdrop (the brief's 배경.mov look): a dense low-rise city built from boxes, an elevated
// rail line with a train, bright green trees, and at night every house lights up. It sits far
// below the ride's sky deck, by the sea, with a big wheel, a pier and a bridge.

function makeDeco(seed) { // decoration-only randomness: never touches the gameplay rng()
  let s = seed | 0;
  return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function canvasTex(w, h, draw, o) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  o = o || {};
  if (!o.data) t.colorSpace = THREE.SRGBColorSpace;
  if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 8;
  return t;
}
const GROUND_Y = -62, SEA_Y = -62.9, GRID_ANG = 0.3, PITCH_X = 47, PITCH_Z = 39;
const HDR = (hex, k) => new THREE.Color(hex).multiplyScalar(k); // a colour brighter than white: it blooms
function isSea(x, z) { return x + 0.45 * z < -115; }
function gridToWorld(gx, gz, out) {
  const c = Math.cos(GRID_ANG), s = Math.sin(GRID_ANG);
  out.x = gx * c - gz * s; out.z = gx * s + gz * c; return out;
}
function inPark(x, z) { const dx = (x + 54) / 50, dz = (z + 80) / 42; return dx * dx + dz * dz < 1; }
function inPlaza(x, z) { return x * x + z * z < 34 * 34; }

function buildCity(scene) {
  const deco = makeDeco(20261119), P = { x: 0, z: 0 }, anim = [];
  const glowTex = canvasTex(128, 128, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, w);
  });

  // ---- Sky: gradient dome, stars, moon ----------------------------------------------------
  const skyTex = canvasTex(16, 512, (g, w, h) => {
    const r = g.createLinearGradient(0, 0, 0, h);
    r.addColorStop(0, '#03051a'); r.addColorStop(0.3, '#0a1038'); r.addColorStop(0.44, '#1d1a52');
    r.addColorStop(0.495, '#5a3470'); r.addColorStop(0.51, '#3a2a62'); r.addColorStop(0.56, '#1a1740'); r.addColorStop(1, '#1a1740');
    g.fillStyle = r; g.fillRect(0, 0, w, h);
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 24), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.position.y = GROUND_Y; sky.renderOrder = -10; scene.add(sky);
  const starPos = [], starCol = [];
  for (let i = 0; i < 900; i++) {
    const u = deco() * Math.PI * 2, v = Math.asin(0.04 + deco() * 0.96), k = 0.5 + deco() * 1.2;
    starPos.push(Math.cos(u) * Math.cos(v) * 860, Math.sin(v) * 860 + GROUND_Y, Math.sin(u) * Math.cos(v) * 860);
    starCol.push(k, k, k * (0.85 + deco() * 0.3));
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  starGeo.setAttribute('color', new THREE.Float32BufferAttribute(starCol, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, fog: false, transparent: true, depthWrite: false })));
  const moonDir = new THREE.Vector3(-0.56, 0.3, -0.77).normalize();
  const moon = new THREE.Mesh(new THREE.CircleGeometry(26, 40), new THREE.MeshBasicMaterial({ color: HDR(0xfff3d6, 1.5), fog: false }));
  moon.position.copy(moonDir).multiplyScalar(820).add(new THREE.Vector3(0, GROUND_Y, 0)); moon.lookAt(0, 0, 0); scene.add(moon);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x9fb4ff, transparent: true, opacity: 0.5, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.position.copy(moon.position); halo.scale.setScalar(260); scene.add(halo);

  // ---- Sea --------------------------------------------------------------------------------
  const waveTex = canvasTex(256, 256, (g, w, h) => { // a tiling normal map from summed sines
    const img = g.createImageData(w, h), d = img.data, H = (x, y) => {
      const u = x / w * Math.PI * 2, v = y / h * Math.PI * 2;
      return Math.sin(u * 2 + v * 3 + Math.sin(v * 5) * 1.4) * 0.5 + Math.sin(u * 5 - v * 4 + 1.3 + Math.sin(u * 3) * 1.7) * 0.3 + Math.sin(u * 9 + v * 13 + 4 + Math.sin(v * 7 + u * 2) * 2) * 0.16 + Math.sin(-u * 11 + v * 6 + 2) * 0.1;
    };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * 2.2, dy = (H(x, y + 1) - H(x, y - 1)) * 2.2, l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
      d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (-dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { data: true, repeat: true });
  waveTex.repeat.set(23, 23);
  const seaMat = new THREE.MeshStandardMaterial({ color: 0x0a2344, roughness: 0.46, metalness: 0, normalMap: waveTex, normalScale: new THREE.Vector2(0.26, 0.26) });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800), seaMat);
  sea.rotation.x = -Math.PI / 2; sea.position.y = SEA_Y; scene.add(sea);
  anim.push(t => { waveTex.offset.set(t * 0.012, t * 0.02); });
  const streakMat = new THREE.MeshBasicMaterial({ map: glowTex, color: 0xfff0c8, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const moonPath = new THREE.Mesh(new THREE.PlaneGeometry(60, 520), streakMat);
  moonPath.rotation.x = -Math.PI / 2; moonPath.rotation.z = Math.atan2(moonDir.x, moonDir.z) + Math.PI; moonPath.position.set(moonDir.x * 430, SEA_Y + 0.2, moonDir.z * 430); scene.add(moonPath);

  // ---- Land: one plane, the streets and the lamp pools painted on ---------------------------
  const TEXM = 760, toPx = (v, w) => (v / TEXM + 0.5) * w;
  const paintCity = (g, w, glow) => {
    g.fillStyle = glow ? '#000' : '#12141c'; g.fillRect(0, 0, w, w);
    g.save(); g.translate(w / 2, w / 2); g.scale(w / TEXM, w / TEXM); g.rotate(GRID_ANG);
    for (let i = -9; i <= 9; i++) for (let j = -10; j <= 10; j++) {
      const cx = i * PITCH_X, cz = j * PITCH_Z;
      if (glow) { // warm pools under the street lamps, at the block's corners and edges
        for (const [lx, lz] of [[-23.5, -19.5], [0, -19.5], [-23.5, 0]]) {
          const r = g.createRadialGradient(cx + lx, cz + lz, 0, cx + lx, cz + lz, 9);
          r.addColorStop(0, 'rgba(255,176,96,0.5)'); r.addColorStop(1, 'rgba(255,176,96,0)');
          g.fillStyle = r; g.fillRect(cx + lx - 9, cz + lz - 9, 18, 18);
        }
      } else {
        g.fillStyle = '#20222c'; g.beginPath(); g.roundRect(cx - 19.5, cz - 15.5, 39, 31, 3); g.fill();
        g.fillStyle = '#3a3d4a';
        for (let k = -3; k <= 3; k++) { g.fillRect(cx - 23.7, cz + k * 5 - 1.2, 0.5, 2.4); g.fillRect(cx + k * 5.6 - 1.2, cz - 19.7, 2.4, 0.5); }
      }
    }
    g.restore();
    g.save(); g.translate(w / 2, w / 2); g.scale(w / TEXM, w / TEXM);
    const disc = (x, z, r, c0, c1) => { const rr = g.createRadialGradient(x, z, 0, x, z, r); rr.addColorStop(0, c0); rr.addColorStop(1, c1); g.fillStyle = rr; g.beginPath(); g.arc(x, z, r, 0, 7); g.fill(); };
    if (glow) { disc(0, 0, 44, 'rgba(255,120,200,0.55)', 'rgba(255,120,200,0)'); disc(-54, -80, 60, 'rgba(255,190,110,0.6)', 'rgba(255,190,110,0)'); }
    else { disc(0, 0, 36, '#3b3660', '#2a2748'); g.fillStyle = '#2b2843'; g.beginPath(); g.ellipse(-54, -80, 52, 44, 0, 0, 7); g.fill(); }
    g.restore();
  };
  const landMap = canvasTex(2048, 2048, (g, w) => paintCity(g, w, false));
  const landGlow = canvasTex(1024, 1024, (g, w) => paintCity(g, w, true));
  const landGeo = new THREE.BufferGeometry(), L = 900;
  const lv = [[-115 + 0.45 * L, -L], [L, -L], [L, L], [-115 - 0.45 * L, L]], lp = [], lu = [];
  for (const [x, z] of lv) { lp.push(x, GROUND_Y, z); lu.push(x / TEXM + 0.5, 0.5 - z / TEXM); }
  landGeo.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  landGeo.setAttribute('uv', new THREE.Float32BufferAttribute(lu, 2));
  landGeo.setIndex([0, 2, 1, 0, 3, 2]); landGeo.computeVertexNormals();
  scene.add(new THREE.Mesh(landGeo, new THREE.MeshLambertMaterial({ map: landMap, emissiveMap: landGlow, emissive: 0xffffff, emissiveIntensity: 0.9 })));

  // ---- Buildings: merged boxes, windows from one sheet ---------------------------------------
  const WCELL = 32, WN = 16;
  const lit = []; for (let i = 0; i < WN * WN; i++) lit.push(deco() < 0.4 ? 1 + Math.floor(deco() * 5) : 0);
  const winMap = canvasTex(WCELL * WN, WCELL * WN, (g) => {
    g.fillStyle = '#b9b4ae'; g.fillRect(0, 0, WCELL * WN, WCELL * WN);
    for (let y = 0; y < WN; y++) for (let x = 0; x < WN; x++) {
      g.fillStyle = '#9d9892'; g.fillRect(x * WCELL, y * WCELL + 28, WCELL, 4);
      g.fillStyle = lit[y * WN + x] ? '#5b5348' : '#1c2436'; g.fillRect(x * WCELL + 7, y * WCELL + 5, 18, 19);
    }
  }, { repeat: true });
  const winGlow = canvasTex(WCELL * WN, WCELL * WN, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, WCELL * WN, WCELL * WN);
    const cols = ['#ffd49a', '#ffe7c2', '#ffbf70', '#d6e8ff', '#9fe9d9'];
    for (let y = 0; y < WN; y++) for (let x = 0; x < WN; x++) {
      const k = lit[y * WN + x]; if (!k) continue;
      g.fillStyle = cols[k - 1]; g.globalAlpha = 0.55 + deco() * 0.45; g.fillRect(x * WCELL + 7, y * WCELL + 5, 18, 19);
      if (deco() < 0.35) { g.fillStyle = '#000'; g.globalAlpha = 0.45; g.fillRect(x * WCELL + 7, y * WCELL + 5 + 9, 18, 10); }
    }
    g.globalAlpha = 1;
  }, { repeat: true });
  const pos = [], uv = [], col = [], idx = [], rpos = [], rcol = [], ridx = [];
  const tints = [0xd9cdb8, 0xe6d8c4, 0xcdb7a8, 0xb7c2cf, 0xd4a48f, 0xc9c4bb, 0xa9b3c4, 0xe0c9b0, 0xbfa58f];
  const roofs = [0x8e8f98, 0xa9553f, 0x595c67, 0x8c5a48, 0x767985, 0x9aa0a8];
  const tc = new THREE.Color(), boxes = [];
  const quad = (a, b, c, d, u0, v0, u1, v1) => { // a,b bottom; c,d top; counter-clockwise from outside
    const n = pos.length / 3;
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]);
    uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    for (let k = 0; k < 4; k++) col.push(tc.r, tc.g, tc.b);
    idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
  };
  const addBuilding = (gx, gz, w, d, h) => {
    const cs = [[gx - w / 2, gz - d / 2], [gx + w / 2, gz - d / 2], [gx + w / 2, gz + d / 2], [gx - w / 2, gz + d / 2]].map(([x, z]) => { gridToWorld(x, z, P); return [P.x, P.z]; });
    tc.setHex(tints[Math.floor(deco() * tints.length)]).multiplyScalar(0.55 + deco() * 0.3);
    const y0 = GROUND_Y, y1 = GROUND_Y + h, fl = Math.round(h / 3);
    for (let k = 0; k < 4; k++) {
      const p = cs[(k + 1) % 4], q = cs[k], len = Math.hypot(p[0] - q[0], p[1] - q[1]), bays = Math.max(1, Math.round(len / 3.2));
      const u0 = Math.floor(deco() * WN) / WN, v0 = Math.floor(deco() * WN) / WN;
      quad([p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]], u0, v0, u0 + bays / WN, v0 + fl / WN);
    }
    const n = rpos.length / 3; tc.setHex(roofs[Math.floor(deco() * roofs.length)]).multiplyScalar(0.7 + deco() * 0.3);
    for (const c of cs) { rpos.push(c[0], y1, c[1]); rcol.push(tc.r, tc.g, tc.b); }
    ridx.push(n, n + 2, n + 1, n, n + 3, n + 2);
    gridToWorld(gx, gz, P); boxes.push({ x: P.x, z: P.z, w, d, h });
  };
  const lots = [];
  for (let i = -8; i <= 8; i++) for (let j = -9; j <= 9; j++) {
    const nx = 3 + Math.floor(deco() * 2), lw = 38 / nx;
    for (let a = 0; a < nx; a++) for (let b = 0; b < 2; b++) {
      const gx = i * PITCH_X - 19 + lw * (a + 0.5), gz = j * PITCH_Z + (b ? 7.4 : -7.4);
      gridToWorld(gx, gz, P);
      if (isSea(P.x - 8, P.z) || inPark(P.x, P.z) || inPlaza(P.x, P.z)) continue;
      if (Math.hypot(P.x, P.z) > 370) continue;
      const far = Math.hypot(P.x - 150, P.z + 250);
      let h = 3 * (2 + Math.floor(deco() * deco() * 7));
      if (deco() < 0.07) h = 3 * (9 + Math.floor(deco() * 6));
      if (far < 120 && deco() < 0.5) h = 3 * (10 + Math.floor(deco() * 12));
      if (deco() < 0.1) { lots.push({ x: P.x, z: P.z }); continue; } // a garden or a car park
      addBuilding(gx, gz, lw - 1.2 - deco() * 2, 13.6 - deco() * 2.5, h);
    }
  }
  const bGeo = new THREE.BufferGeometry();
  bGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  bGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  bGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  bGeo.setIndex(idx); bGeo.computeVertexNormals();
  scene.add(new THREE.Mesh(bGeo, new THREE.MeshLambertMaterial({ map: winMap, emissiveMap: winGlow, emissive: 0xffffff, emissiveIntensity: 1.5, vertexColors: true })));
  const rGeo = new THREE.BufferGeometry();
  rGeo.setAttribute('position', new THREE.Float32BufferAttribute(rpos, 3));
  rGeo.setAttribute('color', new THREE.Float32BufferAttribute(rcol, 3));
  rGeo.setIndex(ridx); rGeo.computeVertexNormals();
  scene.add(new THREE.Mesh(rGeo, new THREE.MeshLambertMaterial({ vertexColors: true })));

  // ---- Rooftops, trees, lamps: instanced ---------------------------------------------------
  const dummy = new THREE.Object3D(), ic = new THREE.Color();
  const inst = (geo, mat, list, colored) => {
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((o, i) => {
      dummy.position.set(o.x, o.y, o.z); dummy.rotation.set(0, o.ry || 0, 0); dummy.scale.set(o.sx, o.sy, o.sz); dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix); if (colored) m.setColorAt(i, ic.setHex(o.c).multiplyScalar(o.k || 1));
    });
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    scene.add(m); return m;
  };
  const unitBox = new THREE.BoxGeometry(1, 1, 1), tanks = [], huts = [];
  for (const b of boxes) {
    const top = GROUND_Y + b.h, n = 1 + Math.floor(deco() * 3);
    for (let k = 0; k < n; k++) {
      const ox = (deco() - 0.5) * b.w * 0.6, oz = (deco() - 0.5) * b.d * 0.6, c = Math.cos(GRID_ANG), s = Math.sin(GRID_ANG);
      const x = b.x + ox * c - oz * s, z = b.z + ox * s + oz * c;
      if (deco() < 0.4) tanks.push({ x, y: top + 1.1, z, sx: 0.9, sy: 2.2, sz: 0.9, c: deco() < 0.5 ? 0x22252e : 0x3d5f8a });
      else huts.push({ x, y: top + 0.9, z, ry: -GRID_ANG, sx: 2 + deco() * 3, sy: 1.8, sz: 2 + deco() * 2, c: deco() < 0.25 ? 0x24456e : 0xb8b6b0, k: 0.75 });
    }
  }
  inst(new THREE.CylinderGeometry(1, 1, 1, 10), new THREE.MeshLambertMaterial(), tanks, true);
  inst(unitBox, new THREE.MeshLambertMaterial(), huts, true);
  const trees = [], lamps = [];
  const greens = [0x58c247, 0x3fae3c, 0x7fd65a, 0x2f9a45, 0x66cc4a];
  const tree = (x, z, s) => { if (isSea(x - 3, z)) return; trees.push({ x, y: GROUND_Y + 2.7 * s, z, sx: 2.1 * s, sy: 2.5 * s, sz: 2.1 * s, ry: deco() * 6, c: greens[Math.floor(deco() * greens.length)], k: 0.75 + deco() * 0.4 }); };
  for (let i = -9; i <= 8; i++) for (let j = -10; j <= 9; j++) {
    for (let k = 0; k < 6; k++) {
      if (deco() < 0.55) { gridToWorld(i * PITCH_X + 21.5, j * PITCH_Z - 16 + k * 6.4, P); if (!inPlaza(P.x, P.z) && Math.hypot(P.x, P.z) < 380) tree(P.x, P.z, 0.8 + deco() * 0.5); }
      if (deco() < 0.4) { gridToWorld(i * PITCH_X - 17 + k * 6.8, j * PITCH_Z + 17.6, P); if (!inPlaza(P.x, P.z) && Math.hypot(P.x, P.z) < 380) tree(P.x, P.z, 0.8 + deco() * 0.5); }
    }
    for (const [lx, lz] of [[-23.5, -19.5], [0, -19.5], [-23.5, 0]]) { gridToWorld(i * PITCH_X + lx, j * PITCH_Z + lz, P); if (!isSea(P.x, P.z) && Math.hypot(P.x, P.z) < 380) lamps.push({ x: P.x, y: GROUND_Y + 7, z: P.z, sx: 0.45, sy: 0.45, sz: 0.45 }); }
  }
  for (const l of lots) for (let k = 0; k < 4; k++) tree(l.x + (deco() - 0.5) * 9, l.z + (deco() - 0.5) * 11, 0.9 + deco() * 0.6);
  for (let k = 0; k < 26; k++) { const a = k / 26 * Math.PI * 2; tree(Math.cos(a) * 30, Math.sin(a) * 30, 1.1); }
  for (let k = 0; k < 40; k++) { const a = deco() * 7, r = 0.55 + deco() * 0.45; const x = -54 + Math.cos(a) * 50 * r, z = -80 + Math.sin(a) * 42 * r; if (Math.hypot(x + 58, z + 84) > 24) tree(x, z, 0.9 + deco() * 0.5); }
  inst(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ emissive: 0x1c5a1a, emissiveIntensity: 0.55 }), trees, true);
  inst(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: HDR(0xffc47a, 2.4) }), lamps, false);

  // ---- Traffic: lights sliding along the street grid ----------------------------------------
  const NCAR = 130, cars = [];
  for (let i = 0; i < NCAR; i++) cars.push({ alongX: deco() < 0.5, line: Math.floor(deco() * 17) - 8, off: deco() * 760 - 380, v: (7 + deco() * 7) * (deco() < 0.5 ? 1 : -1) });
  const headM = new THREE.InstancedMesh(unitBox, new THREE.MeshBasicMaterial({ color: HDR(0xfff2cc, 2.6) }), NCAR);
  const tailM = new THREE.InstancedMesh(unitBox, new THREE.MeshBasicMaterial({ color: HDR(0xff2a3a, 2.2) }), NCAR);
  const bodyM = new THREE.InstancedMesh(unitBox, new THREE.MeshLambertMaterial({ color: 0x3a3f52 }), NCAR);
  scene.add(headM, tailM, bodyM);
  anim.push(t => {
    for (let i = 0; i < NCAR; i++) {
      const c = cars[i], s = ((c.off + c.v * t + 380) % 760 + 760) % 760 - 380, lane = c.v > 0 ? 1.7 : -1.7;
      if (c.alongX) gridToWorld(s, (c.line + 0.5) * PITCH_Z + lane, P); else gridToWorld((c.line + 0.5) * PITCH_X - lane, s, P);
      const hide = isSea(P.x, P.z) || inPlaza(P.x, P.z) || inPark(P.x, P.z) ? 0 : 1, dir = (c.alongX ? 0 : Math.PI / 2) + GRID_ANG, sg = c.v > 0 ? 1 : -1;
      const fx = Math.cos(dir) * sg, fz = Math.sin(dir) * sg;
      dummy.rotation.set(0, -dir, 0);
      dummy.position.set(P.x, GROUND_Y + 0.8, P.z); dummy.scale.set(4.2 * hide, 1.3 * hide, 1.8 * hide); dummy.updateMatrix(); bodyM.setMatrixAt(i, dummy.matrix);
      dummy.position.set(P.x + fx * 2.1, GROUND_Y + 0.8, P.z + fz * 2.1); dummy.scale.set(0.3 * hide, 0.5 * hide, 1.7 * hide); dummy.updateMatrix(); headM.setMatrixAt(i, dummy.matrix);
      dummy.position.set(P.x - fx * 2.1, GROUND_Y + 0.8, P.z - fz * 2.1); dummy.updateMatrix(); tailM.setMatrixAt(i, dummy.matrix);
    }
    headM.instanceMatrix.needsUpdate = tailM.instanceMatrix.needsUpdate = bodyM.instanceMatrix.needsUpdate = true;
  });

  // ---- The elevated line and its train -------------------------------------------------------
  const RAIL_Y = GROUND_Y + 11;
  const curve = new THREE.CatmullRomCurve3([[-250, -20], [-170, -52], [-112, -92], [-62, -132], [6, -152], [86, -158], [168, -132], [246, -78], [330, -30]].map(([x, z]) => new THREE.Vector3(x, RAIL_Y, z)));
  const NS = 220, tp = [], ti = [], railLen = curve.getLength();
  for (let i = 0; i <= NS; i++) {
    const p = curve.getPointAt(i / NS), tg = curve.getTangentAt(i / NS), nx = -tg.z, nz = tg.x;
    tp.push(p.x + nx * 1.5, p.y, p.z + nz * 1.5, p.x - nx * 1.5, p.y, p.z - nz * 1.5, p.x + nx * 1.1, p.y - 1.3, p.z + nz * 1.1, p.x - nx * 1.1, p.y - 1.3, p.z - nz * 1.1);
    if (i < NS) { const n = i * 4; ti.push(n, n + 4, n + 1, n + 1, n + 4, n + 5, n, n + 2, n + 4, n + 2, n + 6, n + 4, n + 1, n + 5, n + 3, n + 3, n + 5, n + 7); }
  }
  const tGeo = new THREE.BufferGeometry(); tGeo.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3)); tGeo.setIndex(ti); tGeo.computeVertexNormals();
  scene.add(new THREE.Mesh(tGeo, new THREE.MeshLambertMaterial({ color: 0xa9a7b8, side: THREE.DoubleSide })));
  const pillars = [];
  for (let s = 12; s < railLen; s += 24) { const p = curve.getPointAt(s / railLen); if (!isSea(p.x, p.z)) pillars.push({ x: p.x, y: GROUND_Y + 4.8, z: p.z, sx: 1.5, sy: 9.6, sz: 1.5, c: 0x9997a8 }); }
  inst(unitBox, new THREE.MeshLambertMaterial(), pillars, true);
  const carTex = canvasTex(256, 64, (g) => {
    g.fillStyle = '#e9e7f2'; g.fillRect(0, 0, 256, 64); g.fillStyle = '#7b5bd6'; g.fillRect(0, 44, 256, 7);
    g.fillStyle = '#1b1e2c'; for (let k = 0; k < 7; k++) g.fillRect(10 + k * 35, 14, 26, 22);
  });
  const carGlow = canvasTex(256, 64, (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, 256, 64); g.fillStyle = '#ffe2a8'; for (let k = 0; k < 7; k++) g.fillRect(10 + k * 35, 14, 26, 22); });
  const carMat = new THREE.MeshLambertMaterial({ map: carTex, emissiveMap: carGlow, emissive: 0xffffff, emissiveIntensity: 1.7 });
  const train = []; for (let k = 0; k < 4; k++) { const m = new THREE.Mesh(new THREE.BoxGeometry(10.4, 2.9, 2.7), carMat); scene.add(m); train.push(m); }
  const beam = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: HDR(0xfff6d8, 4) })); scene.add(beam);
  anim.push(t => {
    const head = ((t * 15) % (railLen + 160)) - 60;
    train.forEach((m, k) => {
      const s = Math.min(railLen - 1, Math.max(1, head - k * 11.2)), p = curve.getPointAt(s / railLen), tg = curve.getTangentAt(s / railLen);
      m.visible = head - k * 11.2 > 1 && head - k * 11.2 < railLen - 1;
      m.position.set(p.x, RAIL_Y + 1.75, p.z); m.rotation.y = Math.atan2(-tg.z, tg.x);
      if (k === 0) { beam.visible = m.visible; beam.position.set(p.x + tg.x * 5.4, RAIL_Y + 1.5, p.z + tg.z * 5.4); }
    });
  });
  const st = curve.getPointAt(0.52), stT = curve.getTangentAt(0.52), station = new THREE.Group();
  station.position.set(st.x, RAIL_Y, st.z); station.rotation.y = Math.atan2(-stT.z, stT.x); scene.add(station);
  const plat = new THREE.Mesh(new THREE.BoxGeometry(64, 1.2, 9), new THREE.MeshLambertMaterial({ color: 0x9c9aae })); plat.position.y = -0.4; station.add(plat);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 6.4, 62, 14, 1, false, 0, Math.PI), new THREE.MeshLambertMaterial({ color: 0x3faea2, emissive: 0x1f9c8f, emissiveIntensity: 0.22, side: THREE.DoubleSide }));
  roof.rotation.z = Math.PI / 2; roof.rotation.y = Math.PI / 2; roof.scale.set(1, 1, 0.75); roof.position.y = 3.4; station.add(roof);
  const stLight = new THREE.Mesh(new THREE.BoxGeometry(60, 0.25, 0.5), new THREE.MeshBasicMaterial({ color: HDR(0xdffcf6, 2.2) })); stLight.position.y = 3.2; station.add(stLight);

  // ---- The seaside park: wheel, carousel, drop tower, stalls -----------------------------------
  const park = new THREE.Group(); scene.add(park);
  const metal = new THREE.MeshLambertMaterial({ color: 0xcfd3ea }), WR = 21;
  const wheel = new THREE.Group(); wheel.position.set(-58, GROUND_Y + WR + 4.5, -84); wheel.rotation.y = 0.53; park.add(wheel);
  const spin = new THREE.Group(); wheel.add(spin);
  for (const z of [-1, 1]) {
    spin.add(new THREE.Mesh(new THREE.TorusGeometry(WR, 0.28, 6, 64), metal)).position.z = z;
    spin.add(new THREE.Mesh(new THREE.TorusGeometry(WR * 0.55, 0.16, 6, 48), metal)).position.z = z;
    for (const x of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, WR + 6, 8), metal); leg.position.set(x * 6.5, -(WR + 4.5) / 2, z * 2.2); leg.rotation.z = x * 0.29; wheel.add(leg); }
  }
  const spokes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.1, 1, 5), metal, 32), NB = 72;
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.42, 8, 6), new THREE.MeshBasicMaterial(), NB * 2), gond = [];
  const wheelCols = [0xff4fa3, 0x35f2e0, 0xffd54d, 0xb58bff];
  for (let k = 0; k < 16; k++) {
    const a = k / 16 * Math.PI * 2;
    for (const z of [-1, 1]) { dummy.position.set(Math.cos(a) * WR / 2, Math.sin(a) * WR / 2, z); dummy.rotation.set(0, 0, a - Math.PI / 2); dummy.scale.set(1, WR, 1); dummy.updateMatrix(); spokes.setMatrixAt(k * 2 + (z > 0 ? 1 : 0), dummy.matrix); }
    const gm = new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 10), new THREE.MeshLambertMaterial({ color: wheelCols[k % 4], emissive: wheelCols[k % 4], emissiveIntensity: 0.55 }));
    gm.scale.set(1, 1.05, 1); spin.add(gm); gond.push({ m: gm, a });
  }
  spin.add(spokes, bulbs);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 3.4, 20), new THREE.MeshBasicMaterial({ color: HDR(0xffd9a0, 0.95) })); hub.rotation.x = Math.PI / 2; hub.scale.setScalar(0.7); spin.add(hub);
  for (let k = 0; k < NB * 2; k++) { const a = (k % NB) / NB * Math.PI * 2; dummy.position.set(Math.cos(a) * WR, Math.sin(a) * WR, k < NB ? -1.3 : 1.3); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); bulbs.setMatrixAt(k, dummy.matrix); }
  let lastChase = -1;
  anim.push(t => {
    spin.rotation.z = t * 0.11;
    for (const g of gond) { g.m.position.set(Math.cos(g.a) * WR, Math.sin(g.a) * WR - 2.2, 0); g.m.rotation.z = -spin.rotation.z; }
    const step = Math.floor(t * 6); if (step === lastChase) return; lastChase = step;
    for (let k = 0; k < NB * 2; k++) { const i = k % NB, on = (i + step) % 6 < 3; bulbs.setColorAt(k, ic.setHex(wheelCols[Math.floor(((i + step * 0.5) % NB) / (NB / 4)) % 4]).multiplyScalar(on ? 2.6 : 0.5)); }
    bulbs.instanceColor.needsUpdate = true;
  });
  const stripes = (a, b) => canvasTex(256, 32, (g) => { for (let k = 0; k < 16; k++) { g.fillStyle = k % 2 ? a : b; g.fillRect(k * 16, 0, 16, 32); } }, { repeat: true });
  const car = new THREE.Group(); car.position.set(-22, GROUND_Y, -62); park.add(car);
  const tent = new THREE.Mesh(new THREE.ConeGeometry(8.5, 4.4, 24), new THREE.MeshLambertMaterial({ map: stripes('#ff5d8f', '#fff1dc'), emissive: 0x552233, emissiveIntensity: 0.6 })); tent.position.y = 7.2; car.add(tent);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(7.4, 7.4, 5, 24, 1, true), new THREE.MeshBasicMaterial({ color: HDR(0xffc98a, 1.25), side: THREE.DoubleSide })); drum.position.y = 2.5; car.add(drum);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(8.2, 8.2, 0.6, 24), metal); base.position.y = 0.3; car.add(base);
  const dropT = new THREE.Group(); dropT.position.set(-92, GROUND_Y, -56); park.add(dropT);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, 44, 8), metal); mast.position.y = 22; dropT.add(mast);
  const ringCar = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.7, 8, 20), new THREE.MeshBasicMaterial({ color: HDR(0x35f2e0, 2.4) })); ringCar.rotation.x = Math.PI / 2; dropT.add(ringCar);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(1.8, 12, 8), new THREE.MeshBasicMaterial({ color: HDR(0xff4fa3, 2.6) })); cap.position.y = 45; dropT.add(cap);
  anim.push(t => { const c = (t * 0.16) % 1; ringCar.position.y = 6 + 36 * (c < 0.7 ? c / 0.7 : 1 - Math.pow((c - 0.7) / 0.3, 2)); car.rotation.y = t * 0.3; });
  const awn = stripes('#35c9c0', '#fff1dc'), awn2 = stripes('#ffb52e', '#fff1dc'), stalls = [];
  for (let k = 0; k < 11; k++) {
    const a = -0.6 + k * 0.42, x = -54 + Math.cos(a) * 34, z = -80 + Math.sin(a) * 30;
    if (isSea(x - 4, z) || Math.hypot(x + 58, z + 84) < 25 || Math.hypot(x + 22, z + 62) < 12) continue;
    const s = new THREE.Group(); s.position.set(x, GROUND_Y, z); s.rotation.y = -a + Math.PI / 2; park.add(s);
    const body = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 4), new THREE.MeshBasicMaterial({ color: HDR(0xffcf99, 0.9) })); body.position.y = 1.5; s.add(body);
    const top = new THREE.Mesh(new THREE.BoxGeometry(7, 0.5, 5.4), new THREE.MeshLambertMaterial({ map: k % 2 ? awn : awn2, emissive: 0x333333, emissiveIntensity: 0.7 })); top.position.y = 3.4; top.rotation.x = 0.12; s.add(top);
    stalls.push(s);
  }
  const fest = [];
  for (let k = 0; k < 150; k++) { const a = k / 150 * Math.PI * 2, r = 0.72 + 0.2 * Math.sin(a * 5); const x = -54 + Math.cos(a) * 50 * r, z = -80 + Math.sin(a) * 42 * r; if (!isSea(x, z)) fest.push({ x, y: GROUND_Y + 6 + Math.abs(Math.sin(k * 0.52)) * -1.6, z, sx: 0.36, sy: 0.36, sz: 0.36, c: wheelCols[k % 4], k: 2.4 }); }
  inst(new THREE.SphereGeometry(1, 6, 5), new THREE.MeshBasicMaterial(), fest, true);

  // ---- Pier, lighthouse, boats, the far bridge ---------------------------------------------
  const sx = -0.912, sz = -0.41, pier = new THREE.Group(); pier.position.set(-80, GROUND_Y, -80); pier.rotation.y = Math.atan2(-sz, sx); scene.add(pier);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(84, 0.6, 6), new THREE.MeshLambertMaterial({ color: 0x8a6a52 })); deck.position.set(42, -0.2, 0); pier.add(deck);
  const pl = [];
  for (let k = 0; k < 9; k++) for (const s of [-1, 1]) pl.push({ x: -80 + sx * (6 + k * 9.5) + -sz * s * 2.7, y: GROUND_Y + 2.6, z: -80 + sz * (6 + k * 9.5) + sx * s * 2.7, sx: 0.4, sy: 0.4, sz: 0.4 });
  inst(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: HDR(0xffe2a8, 2.6) }), pl, false);
  const lh = new THREE.Group(); lh.position.set(-80 + sx * 88, GROUND_Y, -80 + sz * 88); scene.add(lh);
  lh.add(new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.4, 13, 12), new THREE.MeshLambertMaterial({ color: 0xf2efe8 }))).position.y = 6.5;
  lh.add(new THREE.Mesh(new THREE.ConeGeometry(2.2, 2.4, 12), new THREE.MeshLambertMaterial({ color: 0xe0455a }))).position.y = 16.4;
  lh.add(new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 8), new THREE.MeshBasicMaterial({ color: HDR(0xfff6d8, 3.2) }))).position.y = 14.2;
  const coneTex = canvasTex(8, 128, (g, w, h) => { const r = g.createLinearGradient(0, 0, 0, h); r.addColorStop(0, 'rgba(255,255,255,0.85)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); });
  const sweep = new THREE.Mesh(new THREE.ConeGeometry(6, 150, 16, 1, true), new THREE.MeshBasicMaterial({ map: coneTex, color: 0xfff0c8, transparent: true, opacity: 0.045, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }));
  sweep.geometry.translate(0, -75, 0); sweep.rotation.z = Math.PI / 2 + 0.05; const sweepG = new THREE.Group(); sweepG.position.y = 14.2; sweepG.add(sweep); lh.add(sweepG);
  anim.push(t => { sweepG.rotation.y = t * 0.5; });
  const boats = [];
  for (let k = 0; k < 7; k++) {
    const b = new THREE.Group(), big = k === 0;
    const hull = new THREE.Mesh(new THREE.BoxGeometry(big ? 34 : 9, big ? 5 : 1.6, big ? 9 : 3.2), new THREE.MeshLambertMaterial({ color: big ? 0xe8e6ee : 0x44506a, emissive: big ? 0xffd9a0 : 0, emissiveIntensity: big ? 0.35 : 0 })); hull.position.y = big ? 2.5 : 0.8; b.add(hull);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(big ? 0.9 : 0.5, 8, 6), new THREE.MeshBasicMaterial({ color: HDR(k % 2 ? 0x8fffd2 : 0xffe2a8, 3) })); lamp.position.y = big ? 7 : 2.6; b.add(lamp);
    const st = new THREE.Mesh(new THREE.PlaneGeometry(big ? 12 : 5, big ? 46 : 26), streakMat); st.rotation.x = -Math.PI / 2; st.position.set(0, 0.25, 0); b.add(st);
    b.userData = { u: deco() * 400 - 200, d: 60 + deco() * 200, v: (1.5 + deco() * 2.5) * (deco() < 0.5 ? 1 : -1) };
    b.position.y = SEA_Y; scene.add(b); boats.push(b);
  }
  anim.push(t => { for (const b of boats) { const d = b.userData, u = ((d.u + d.v * t + 300) % 600 + 600) % 600 - 300; b.position.x = -115 * 0.83 + sx * d.d + -sz * u - 20; b.position.z = sz * d.d + sx * u - 40; b.rotation.y = Math.atan2(-sx, -sz) + (d.v > 0 ? 0 : Math.PI) + Math.PI / 2; } });
  const bridge = new THREE.Group(); bridge.position.set(-330, SEA_Y, -330); bridge.rotation.y = 0.95; scene.add(bridge);
  const bl = [], dark = new THREE.MeshBasicMaterial({ color: 0x241f4a, fog: false });
  bridge.add(new THREE.Mesh(new THREE.BoxGeometry(620, 2.5, 9), dark)).position.y = 26;
  for (const x of [-110, 110]) {
    bridge.add(new THREE.Mesh(new THREE.BoxGeometry(5, 96, 5), dark)).position.set(x, 48, 0);
    for (let k = 1; k <= 9; k++) for (const s of [-1, 1]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1, 4), dark); const ex = x + s * k * 11, len = Math.hypot(k * 11, 94 - 27 - k * 3); c.position.set((x + ex) / 2, (94 - k * 3 + 27) / 2, 0); c.scale.y = len; c.rotation.z = s * Math.atan2(k * 11, 94 - 27 - k * 3); bridge.add(c); }
    bl.push({ x, y: 97, z: 0, sx: 1.4, sy: 1.4, sz: 1.4, c: 0xff3344, k: 3 });
  }
  for (let k = -30; k <= 30; k++) bl.push({ x: k * 10, y: 28.5, z: 0, sx: 0.8, sy: 0.8, sz: 0.8, c: 0xffe2a8, k: 2.2 });
  const blm = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 5), new THREE.MeshBasicMaterial({ fog: false }), bl.length);
  bl.forEach((o, i) => { dummy.position.set(o.x, o.y, o.z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(o.sx); dummy.updateMatrix(); blm.setMatrixAt(i, dummy.matrix); blm.setColorAt(i, ic.setHex(o.c).multiplyScalar(o.k)); });
  bridge.add(blm);
  for (let k = 0; k < 5; k++) { // islands on the horizon
    const isl = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), new THREE.MeshBasicMaterial({ color: 0x15133a, fog: false }));
    isl.position.set(-640 + k * 90 + deco() * 40, SEA_Y, -80 - k * 130); isl.scale.set(70 + deco() * 60, 14 + deco() * 16, 50 + deco() * 40); scene.add(isl);
  }
  return { update(t) { for (const f of anim) f(t); }, glowTex, coneTex };
}

// ==== world.js ====
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

// ==== audio.js ====
'use strict';
// Sound, all of it made by Web Audio while the game runs: a disco groove that follows the
// game's own beat (so the DJ's count lands on it), and the effects. No files.

const Snd = (() => {
  let ac = null, musicG, sfxG, noiseBuf, off = null, next16 = 0, lastT = -1, duck = 1;
  function ready() {
    if (!audio) return false;
    if (ac !== audio.ac) {
      ac = audio.ac;
      const comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.18; comp.connect(audio.out);
      musicG = ac.createGain(); sfxG = ac.createGain(); musicG.connect(comp); sfxG.connect(comp);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0); let x = 22222;
      for (let i = 0; i < d.length; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; d[i] = x / 0x3fffffff - 1; }
      off = null;
    }
    musicG.gain.value = tune.music_volume * 0.9; sfxG.gain.value = tune.sfx_volume;
    return !muted;
  }
  // a tone that slides from f0 to f1 and dies away
  function tone(type, f0, f1, t, dur, peak, dest, o) {
    o = o || {}; const os = ac.createOscillator(), g = ac.createGain(); os.type = type;
    os.frequency.setValueAtTime(Math.max(20, f0), t); if (f1 !== f0) os.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur * (o.slide || 1));
    if (o.vib) { const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = o.vib; lg.gain.value = o.vibAmt || 20; l.connect(lg).connect(os.frequency); l.start(t); l.stop(t + dur + 0.05); }
    const a = o.attack || 0.005; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = os;
    if (o.filter) { const f = ac.createBiquadFilter(); f.type = o.filter; f.frequency.setValueAtTime(o.cut || 1200, t); if (o.cut1) f.frequency.exponentialRampToValueAtTime(o.cut1, t + dur); f.Q.value = o.q || 1; os.connect(f); node = f; }
    node.connect(g).connect(dest || sfxG); os.start(t); os.stop(t + dur + 0.05);
  }
  function noise(t, dur, peak, type, f0, f1, q, dest, attack) {
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(); src.buffer = noiseBuf; src.loop = true;
    f.type = type; f.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur); f.Q.value = q || 0.8;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + (attack || 0.004)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest || sfxG); src.start(t, (t * 7.3) % 0.9); src.stop(t + dur + 0.05);
  }

  // ---- The groove: four bars round a ii-V-I-IV, sixteen steps a bar ------------------------------
  const BASS = [55, 73.42, 49, 65.41];
  const CHORD = [[220, 261.63, 329.63, 392], [220, 261.63, 329.63, 369.99], [196, 246.94, 293.66, 369.99], [196, 246.94, 261.63, 329.63]];
  const STAB = [0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0, 1, 0];
  function step16(n, t, lv, bpm) {
    const st = n % 16, bar = Math.floor(n / 16) % 4, s16 = 15 / bpm, m = musicG;
    if (st % 4 === 0) { tone('sine', 150, 42, t, 0.26, lv ? 0.95 : 0.6, m, { slide: 0.35 }); noise(t, 0.02, 0.2, 'highpass', 3000, 0, 0.7, m); }
    if (lv >= 2 && st % 8 === 4) { noise(t, 0.16, 0.5, 'bandpass', 1700, 1300, 1.2, m); noise(t + 0.012, 0.1, 0.3, 'bandpass', 2400, 0, 2, m); }
    if (st % 4 === 2) noise(t, lv >= 2 ? 0.2 : 0.05, lv >= 2 ? 0.22 : 0.16, 'highpass', 7500, 0, 0.7, m);
    else if (lv >= 3 || st % 2 === 0) noise(t, 0.03, 0.08, 'highpass', 9000, 0, 0.7, m);
    const root = BASS[bar], oct = st % 4 === 2 || st === 15 ? 2 : 1;
    if (st % 2 === 0 || st === 15) tone('sawtooth', root * oct * (st === 14 ? 1.122 : 1), root * oct, t, s16 * 1.7, 0.42, m, { filter: 'lowpass', cut: 900, cut1: 220, q: 4 });
    if (lv >= 1 && STAB[st]) for (const f of CHORD[bar]) tone('sawtooth', f * 2, f * 2, t, 0.11, 0.07, m, { filter: 'bandpass', cut: 2100, q: 0.9 });
    if (lv >= 2 && st === 0) for (const f of CHORD[bar]) tone('sawtooth', f * 1.003, f * 1.003, t, s16 * 15.5, 0.035, m, { attack: 0.3, filter: 'lowpass', cut: 1100, q: 0.5 });
    if (lv >= 3) { const c = CHORD[bar], f = c[[0, 2, 1, 3, 2, 0, 3, 1][st % 8]] * 4; tone('triangle', f, f, t, 0.13, 0.1, m); }
  }
  // called once a game step: schedules the next sixteenths a little ahead of the game clock
  function tick(simT, bpm, lv) {
    if (!ready() || lv < 0) { lastT = simT; return; }
    const now = ac.currentTime, tgt = now - simT;
    if (off === null || Math.abs(tgt - off) > 0.09 || simT < lastT - 0.2) { off = tgt; next16 = Math.ceil(simT * bpm / 15 + 0.001); }
    else off += (tgt - off) * 0.02;
    lastT = simT;
    while (next16 * 15 / bpm <= simT + 0.14) { const at = next16 * 15 / bpm + off; if (at >= now - 0.01) step16(next16, Math.max(now, at), lv, bpm); next16++; }
    if (duck < 1) { duck = Math.min(1, duck + 0.03); musicG.gain.value = tune.music_volume * 0.9 * duck; }
  }

  // ---- Effects ---------------------------------------------------------------------------------
  const PITCH = [0.6, 1.5, 1.05, 1.2]; // each animal's voice: 코끼리 low, 새 high
  function play(name, a) {
    if (!ready()) return;
    const t = ac.currentTime + 0.005, p = PITCH[a] || 1;
    switch (name) {
      case 'count': tone('triangle', 780 + a * 150, 760 + a * 150, t, 0.09, 0.5); noise(t, 0.02, 0.25, 'highpass', 4000); break;
      case 'pang': { const k = a || 1; duck = 0.45; tone('sine', 130, 34, t, 0.6, 1.1 * k, sfxG, { slide: 0.4 }); noise(t, 0.5, 0.6 * k, 'bandpass', 5200, 900, 0.6); tone('square', 233, 220, t, 0.22, 0.2 * k); tone('square', 311, 294, t, 0.22, 0.16 * k); tone('sawtooth', 466, 440, t, 0.3, 0.12 * k); break; }
      case 'fake': noise(t, 0.16, 0.5, 'bandpass', 2600, 500, 5); noise(t + 0.14, 0.14, 0.4, 'bandpass', 600, 2400, 5); tone('sawtooth', 300, 110, t + 0.02, 0.35, 0.2, sfxG, { filter: 'lowpass', cut: 900 }); break;
      case 'scratch': for (let k = 0; k < 3; k++) noise(t + k * 0.15, 0.13, 0.5, 'bandpass', k % 2 ? 700 : 2800, k % 2 ? 2800 : 700, 6); break;
      case 'warn': for (let k = 0; k < 2; k++) { tone('square', 880, 880, t + k * 0.22, 0.09, 0.16); tone('square', 660, 660, t + k * 0.22 + 0.1, 0.09, 0.16); } break;
      case 'tilt': tone('sine', 950, 280, t, 0.55, 0.28, sfxG, { vib: 9, vibAmt: 25 }); break;
      case 'gate': tone('square', 90, 50, t, 0.2, 0.5); noise(t, 0.18, 0.5, 'lowpass', 1800, 300); tone('sawtooth', 520, 130, t + 0.03, 0.3, 0.14); break;
      case 'spot': for (let k = 0; k < 4; k++) tone('triangle', 900 * Math.pow(1.19, k), 900 * Math.pow(1.19, k), t + k * 0.06, 0.12, 0.25); break;
      case 'boing': tone('sine', 190 * p, 640 * p, t, 0.32, 0.4, sfxG, { vib: 26, vibAmt: 40 * p }); break;
      case 'land': tone('sine', 170 * p, 60, t, 0.13, 0.5); noise(t, 0.08, 0.2, 'lowpass', 900); break;
      case 'trunk': tone('sawtooth', 290, 500, t, 0.2, 0.3, sfxG, { filter: 'bandpass', cut: 950, q: 3, vib: 32, vibAmt: 26 }); tone('sawtooth', 500, 410, t + 0.18, 0.28, 0.28, sfxG, { filter: 'bandpass', cut: 950, q: 3, vib: 32, vibAmt: 30 }); break;
      case 'flap': for (let k = 0; k < 3; k++) noise(t + k * 0.07, 0.06, 0.25, 'lowpass', 1400, 500); tone('sine', 2300, 3400, t, 0.07, 0.25); tone('sine', 2600, 3700, t + 0.09, 0.07, 0.22); break;
      case 'pop': tone('sine', 520, 110, t, 0.07, 0.5); noise(t, 0.02, 0.2, 'highpass', 3000); break;
      case 'whip': noise(t, 0.14, 0.4, 'bandpass', 700, 4200, 3); tone('square', 620, 470, t + 0.05, 0.09, 0.14); tone('square', 880, 700, t + 0.15, 0.1, 0.14); break;
      case 'whiff': noise(t, 0.16, 0.2, 'bandpass', 2600, 600, 2); break;
      case 'grab': tone('triangle', 500, 990, t, 0.1, 0.3); break;
      case 'yelp': tone('sine', 1300 * p, 640 * p, t, 0.28, 0.35, sfxG, { vib: 18, vibAmt: 60 }); break;
      case 'fall': tone('sine', 1150 * p, 180, t, 0.6, 0.3, sfxG, { vib: 12, vibAmt: 30 }); break;
      case 'splash': noise(t, 0.65, 0.7, 'lowpass', 3600, 320, 0.7); tone('sine', 310, 70, t, 0.2, 0.5); noise(t + 0.08, 0.4, 0.25, 'highpass', 5000); break;
      case 'saved': [523.25, 659.25, 783.99, 1046.5].forEach((f, k) => tone('triangle', f, f, t + k * 0.055, 0.2, 0.3)); break;
      case 'tired': tone('sawtooth', 300, 210, t, 0.22, 0.2, sfxG, { filter: 'lowpass', cut: 900 }); tone('sawtooth', 230, 150, t + 0.24, 0.35, 0.2, sfxG, { filter: 'lowpass', cut: 800 }); break;
      case 'cheer': tone('triangle', 660 * p, 990 * p, t, 0.1, 0.25); tone('triangle', 880 * p, 1320 * p, t + 0.1, 0.12, 0.25); break;
      case 'whistle': for (let k = 0; k < 2; k++) tone('sine', 2250, 2350, t + k * 0.16, 0.12, 0.28, sfxG, { vib: 45, vibAmt: 120 }); break;
      case 'go': [392, 493.88, 587.33, 783.99].forEach(f => tone('sawtooth', f, f, t, 0.5, 0.11, sfxG, { filter: 'lowpass', cut: 3200, cut1: 700 })); noise(t, 0.7, 0.3, 'highpass', 6000); break;
      case 'horn': for (const [dt, len] of [[0, 0.11], [0.15, 0.11], [0.3, 0.5]]) for (const f of [466, 587, 698]) tone('sawtooth', f, len > 0.3 ? f * 0.93 : f, t + dt, len, 0.1, sfxG, { filter: 'lowpass', cut: 2600, slide: 1 }); break;
      case 'win': [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, k) => tone('triangle', f, f, t + k * 0.09, 0.3, 0.28)); [523.25, 659.25, 783.99].forEach(f => tone('sawtooth', f, f, t + 0.5, 0.9, 0.09, sfxG, { filter: 'lowpass', cut: 2400 })); noise(t + 0.1, 1.6, 0.22, 'bandpass', 1800, 2600, 0.5, sfxG, 0.4); break;
      case 'lose': [[233, 0], [220, 0.3], [208, 0.6], [196, 0.9]].forEach(([f, d], k) => tone('sawtooth', f, k === 3 ? f * 0.8 : f * 0.97, t + d, k === 3 ? 0.9 : 0.26, 0.22, sfxG, { filter: 'lowpass', cut: 1100, q: 3, vib: k === 3 ? 6 : 0, vibAmt: 8 })); break;
      case 'coin': tone('triangle', 988, 988, t, 0.07, 0.28); tone('triangle', 1319, 1319, t + 0.07, 0.18, 0.28); break;
      case 'join': tone('triangle', 520, 780, t, 0.1, 0.3); break;
      case 'ready': tone('triangle', 660, 660, t, 0.08, 0.3); tone('triangle', 990, 990, t + 0.08, 0.14, 0.3); break;
      case 'ui': tone('triangle', 440, 520, t, 0.06, 0.2); break;
    }
  }
  return { tick, play };
})();

// ==== sim.js ====
'use strict';
// The rules, on the fixed step: the disc (spin, pang, tilt, gates), four animals with one skill
// and one gauge each, hanging and rescue, bot partners, and the DJ's script for three rounds.
// state is plain data, so window.game.state reports it and a replay repeats it.

const Sim = (() => {
  const TAU = Math.PI * 2, R = DISC.R, RIN = DISC.IN, SEG = TAU / DISC.SEGS, RAILR = 5.95;
  const CLEAR = 0.55; // m: higher than the cushion, a thrown animal goes over the rail
  const PRE = ['ele', 'bird', 'oct', 'mon'];
  const kv = (k, n) => tune[PRE[k] + '_' + n];
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const pick = arr => arr[Math.floor(rng() * arr.length) % arr.length];
  const HOME_R = [3.7, 2.0, 2.7, 3.1], SPAWN_A = [2.5, 0.65, 1.2, 1.95];
  const fx = (...a) => { if (typeof World !== 'undefined') World.fx(...a); };
  const sfx = (...a) => { if (typeof Snd !== 'undefined') Snd.play(...a); };

  // ---- State ---------------------------------------------------------------------------------
  function newAnimal(kind, dev, pl) {
    return { kind, dev, pl, x: 0, z: 0, y: 0, vx: 0, vz: 0, vy: 0, face: 0, mode: 'ground', hold: 0, gauge: 1, tired: 0, lastUse: -9,
      slide: 0, walk: 0, landT: -9, stun: 0, hasT: 0, tx: 0, ty: 0, tz: 0, flail: 0, emote: 'none', emoteT: 0, carrying: -1, carriedBy: -1,
      shield: 0, sheltered: 0, hangA: 0, hangT: 0, hangMax: 1, rescue: 0, helpers: 0, lr: 0, la: 0, zip: 0, arm: -1, tailT: 0, tailTo: -1,
      yT: 0, ysx: 0, ysy: 0, ysz: 0, yBy: -1, wasHang: 0, savedBy: -1, outA: 0, air: 0, hangStart: 0,
      ix: 0, iz: 0, sk: 0, skHit: 0, sig: 0, skPrev: 0,
      rescues: 0, hangs: 0, alive: 0, falls: 0, stars: 0,
      helpAt: 0, ai: { home: SPAWN_A[kind], plan: 0, at: 0, from: 0, to: 0, goal: 0, help: -1, fly: 0, panic: 0, selfAt: 0, coolT: 0 } };
  }
  // seats: four entries in animal order (코끼리, 새, 문어, 원숭이); dev '' is a bot
  function newState(seats) {
    const s = { t: 0, phase: 'intro', phaseT: 0, rt: 0, round: 1, rounds: 3, timeLeft: tune.round_seconds, stars: [0, 0, 0], score: 0, gained: '', goalReached: false,
      done: false, failed: false, pangT: -9, spinDir: 1, tele: null, pid: 0, rescues: 0, firstHang: 0, teachT: -1, gatherBy: -1, gatherT: 0, hintT: 0, pickups: [], starT: 0, nextPid: 0,
      animals: seats.map((se, k) => newAnimal(k, se.dev, se.pl)),
      disc: { a: 0, w: 0, wT: 0, tilt: 0, tiltT: 0, tiltDir: 0, h: 0, hv: 0, scratch: 0, gates: [0, 0, 0, 0, 0, 0, 0, 0], warn: [0, 0, 0, 0, 0, 0, 0, 0] },
      dj: { beat: 0, beatN: 0, bpm: tune.bpm_r1, mood: 'idle', moodT: 0, count: 0, pointX: 0, energy: 0.5, ring: -1, ringFake: 0, tiltWarn: 0, tiltArrow: 0, spot: -1, say: '', sayN: 0, sayT: 0 },
      cues: [], cueI: 0, callout: { text: '', kind: '', n: 0 }, hint: '', toasts: [], result: null };
    startRound(s, 1);
    return s;
  }
  function place(s, a) {
    const wa = SPAWN_A[a.kind] * TAU / 2.6 - s.disc.a, r = HOME_R[a.kind] * 0.85;
    Object.assign(a, { x: Math.cos(wa) * r, z: Math.sin(wa) * r, y: 0, vx: 0, vz: 0, vy: 0, mode: 'ground', hold: 0, gauge: 1, tired: 0, shield: 0, hasT: 0, carrying: -1, carriedBy: -1, rescue: 0, zip: 0, arm: -1, stun: 0, wasHang: 0, emote: 'none', flail: 0 });
    a.face = Math.atan2(-a.x, -a.z); a.ai.plan = 0; a.ai.goal = 0; a.ai.fly = 0; a.ai.help = -1; a.ai.home = SPAWN_A[a.kind] * TAU / 2.6;
  }
  function startRound(s, n) {
    s.round = n; s.phase = 'intro'; s.phaseT = 0; s.rt = 0; s.timeLeft = tune.round_seconds; s.failed = false; s.tele = null; s.result = null; s.teachT = -1; s.firstHang = 0; s.hintT = 0; s.pickups = []; s.starT = 1.2;
    const d = s.disc; d.w *= 0.3; d.wT = 0; d.tilt = d.tiltT = 0; d.scratch = 0; d.gates.fill(0); d.warn.fill(0);
    s.dj.bpm = [tune.bpm_r1, tune.bpm_r2, tune.bpm_r3][n - 1]; s.dj.energy = 0.45 + n * 0.15; s.dj.ring = -1; s.dj.tiltWarn = 0; s.dj.spot = -1; s.dj.mood = 'idle';
    s.spinDir = rng() < 0.5 ? 1 : -1;
    for (const a of s.animals) { if (a.gone) { a.mode = 'out'; a.hasT = 0; a.hold = 0; a.outA = SPAWN_A[a.kind] * TAU / 2.6; } else place(s, a); } // out in an earlier song: out for good
    s.cues = buildCues(s, n); s.cueI = 0;
    say(s, ['자, 출발합니다~ 꽉 잡아요!', '2절 갑니다! 이번엔 기울여 볼까~', '피날레! 문 열립니다~ 조심!'][n - 1]);
    s.hint = '';
  }

  // ---- The DJ's script: cues on the beat -----------------------------------------------------
  function buildCues(s, n) {
    const cues = [], b = 60 / s.dj.bpm, T = tune.round_seconds, snap = t => Math.round(t / b) * b;
    const top = [tune.spin_r1, tune.spin_r2, tune.spin_r3][n - 1], gap = [tune.pang_gap_r1, tune.pang_gap_r2, tune.pang_gap_r3][n - 1];
    const fakeP = [0, tune.fake_chance_r2, tune.fake_chance_r3][n - 1];
    const push = (t, type, o) => cues.push(Object.assign({ t: Math.max(0, t), type }, o || {}));
    const pang = (t, power, o) => { // t is the impact, counted in on the beats before it
      o = o || {}; const cnt = o.count || 2;
      push(t - cnt * b, 'ring', { at: t, fake: o.fake ? 1 : 0, dur: cnt * b, quick: 0, teach: o.teach ? 1 : 0 });
      for (let i = 0; i < cnt; i++) push(t - (cnt - i) * b, 'count', { i: i + 1 });
      if (o.fake) { const late = snap(0.55 + rng() * 0.9) || b; push(t, 'fakeout'); push(t + late - 0.42, 'ring', { at: t + late, fake: 0, dur: 0.42, quick: 1, teach: 0 }); push(t + late, 'impact', { power, tgt: -1 }); }
      else push(t, 'impact', { power, tgt: o.spot ? -2 : -1 });
      for (let k = 1; k <= (o.more || 0); k++) { push(t + (k - 1) * 2 * b + 0.05, 'ring', { at: t + k * 2 * b, fake: 0, dur: 2 * b - 0.05, quick: 0, teach: 0 }); push(t + k * 2 * b, 'impact', { power: power * 0.92, tgt: -1 }); }
    };
    const tilt = (t) => { const dir = Math.floor(rng() * 4) * Math.PI / 2 + (rng() - 0.5) * 0.5; push(t - 1.2, 'tiltWarn', { dir }); push(t, 'tiltOn', { dir }); push(t + tune.tilt_hold, 'tiltOff'); };
    const scratch = t => push(t, 'scratch');
    const spot = (t, power) => { push(t - tune.spot_warn, 'spot'); pang(t, power, { spot: 1 }); };
    push(0, 'spin', { w: top * 0.5 });
    if (n === 1) {
      const p1 = snap(tune.first_pang), p2 = snap(tune.first_strong_pang);
      push(p1 - 4.2, 'say', { text: '하나, 둘 하면 튕깁니다~' }); pang(p1, 0.55);
      push(p1 + 3, 'spin', { w: top }); push(p1 + 3, 'say', { text: '속도 올립니다~' });
      pang(p2, 1, { teach: 1 });
      let t = p2 + gap, k = 0;
      while (t < T - 9.5) { if (k === 2) pang(snap(t), 0.95, { more: 1 }); else pang(snap(t), 0.85 + rng() * 0.15); if (k % 2) push(t + 1.5, 'spin', { w: top * (0.8 + rng() * 0.3) }); t += gap * (0.9 + rng() * 0.25) + (k === 2 ? 2 * b : 0); k++; }
      push(T - 9, 'spin', { w: top * 1.25 }); push(T - 9, 'say', { text: '막판 스퍼트! 버틸 수 있을까~?' });
      pang(snap(T - 6.2), 1); pang(snap(T - 2.6), 1);
    } else if (n === 2) {
      push(2.5, 'spin', { w: top }); pang(snap(5), 0.95);
      push(8.2, 'say', { text: '기울입니다~ 미끄러져요!' }); tilt(snap(9.6));
      pang(snap(14.6), 1, { fake: 1 });
      push(19.6, 'say', { text: '스크래치! 반대로~' }); scratch(snap(20.4));
      let t = 24.5, k = 0;
      while (t < T - 10) {
        const r = rng(), st = snap(t);
        if (r < 0.34) pang(st, 0.9 + rng() * 0.12, { fake: rng() < fakeP ? 1 : 0, count: rng() < 0.3 ? 3 : 2 });
        else if (r < 0.52) tilt(st);
        else if (r < 0.74) { tilt(st); pang(snap(st + 1.6), 0.9); t += 1.2; }
        else if (r < 0.9) { scratch(st); pang(snap(st + 2.2), 0.95); t += 1.2; }
        else pang(st, 0.9, { more: 1 });
        t += gap * (0.9 + rng() * 0.25); k++;
      }
      push(T - 9.5, 'spin', { w: top * 1.2 }); push(T - 9.5, 'say', { text: '10초 남았다! 버텨 봐~' });
      tilt(snap(T - 8)); pang(snap(T - 6.2), 1); pang(snap(T - 2.6), 1, { fake: rng() < 0.5 ? 1 : 0 });
    } else {
      push(2, 'spin', { w: top });
      const order = [0, 3, 6, 1, 4, 7, 2, 5], start = Math.floor(rng() * 8), ng = Math.round(tune.gates_r3);
      for (let k = 0; k < ng; k++) { const t = 3.2 + k * 12.5; push(t - tune.gate_warn, 'gateWarn', { seg: (order[k] + start) % 8 }); push(t, 'gateOpen', { seg: (order[k] + start) % 8 }); }
      pang(snap(7), 1); spot(snap(12.2), 1);
      scratch(snap(17)); pang(snap(19.4), 1);
      let t = 23.5;
      while (t < T - 10) {
        const r = rng(), st = snap(t);
        if (r < 0.3) pang(st, 0.95 + rng() * 0.1, { fake: rng() < fakeP ? 1 : 0, count: rng() < 0.35 ? 3 : 2 });
        else if (r < 0.5) spot(st, 1);
        else if (r < 0.7) { tilt(st); pang(snap(st + 1.6), 0.95); t += 1.2; }
        else if (r < 0.85) { scratch(st); pang(snap(st + 2.2), 1); t += 1.2; }
        else pang(st, 0.95, { more: 2 });
        t += gap * (0.9 + rng() * 0.25);
      }
      push(T - 9.5, 'spin', { w: top * 1.3 }); push(T - 9.5, 'say', { text: '마지막이다~! 다 떨어져라!' });
      pang(snap(T - 7.4), 1); pang(snap(T - 4.2), 1, { more: 1 });
    }
    cues.sort((p, q) => p.t - q.t);
    return cues;
  }
  function say(s, text) { s.dj.say = text; s.dj.sayN++; s.dj.sayT = 3.2; }
  function callout(s, text, kind) { s.callout.text = text; s.callout.kind = kind; s.callout.n++; }
  function mood(s, m) { s.dj.mood = m; s.dj.moodT = 0; }
  function toast(s, a, text) { s.toasts.push({ x: a.x, z: a.z, h: KINDS[a.kind].head + 0.6, text, t: 0, c: a.kind }); if (s.toasts.length > 6) s.toasts.shift(); }
  const DIRNAME = d => { const x = Math.cos(d), z = Math.sin(d); return Math.abs(x) > Math.abs(z) ? (x > 0 ? '오른쪽' : '왼쪽') : (z > 0 ? '앞쪽' : '뒤쪽'); };

  function fire(s, c) {
    const d = s.disc, dj = s.dj;
    if (c.type === 'spin') d.wT = c.w * s.spinDir;
    else if (c.type === 'say') say(s, c.text);
    else if (c.type === 'ring') { s.tele = { at: c.at, start: s.rt, dur: Math.max(0.05, c.at - s.rt), fake: c.fake, quick: c.quick }; botsOnRing(s, c); }
    else if (c.type === 'count') { callout(s, ['하나!', '둘!', '셋!'][c.i - 1], 'count'); mood(s, 'count'); dj.count = c.i; sfx('count', c.i); }
    else if (c.type === 'fakeout') { callout(s, '안 해~', 'fake'); mood(s, 'laugh'); s.tele = null; sfx('fake'); if (rng() < 0.6) say(s, pick(['속았지~?', '어? 벌써 힘 뺐어요?', '아직이야~ 아직!'])); }
    else if (c.type === 'impact') doPang(s, c.power, c.tgt === -2 ? dj.spot : -1);
    else if (c.type === 'tiltWarn') { dj.tiltWarn = 1; dj.tiltArrow = c.dir; callout(s, DIRNAME(c.dir) + '으로 기울어요!', 'warn'); sfx('warn'); }
    else if (c.type === 'tiltOn') { d.tiltT = tune.tilt_angle * Math.PI / 180; d.tiltDir = c.dir; dj.tiltWarn = 2; dj.tiltArrow = c.dir; sfx('tilt'); }
    else if (c.type === 'tiltOff') { d.tiltT = 0; dj.tiltWarn = 0; }
    else if (c.type === 'gateWarn') { d.warn[c.seg] = 1; callout(s, '문 열립니다!', 'warn'); sfx('warn'); if (rng() < 0.5) say(s, '문 열립니다~ 그쪽은 그대로 밖이에요!'); }
    else if (c.type === 'gateOpen') { d.warn[c.seg] = 0; d.gates[c.seg] = 1; const wa = (c.seg + 0.5) * SEG - d.a; fx('gate', Math.cos(wa) * R, 0, Math.sin(wa) * R); sfx('gate'); }
    else if (c.type === 'scratch') { s.spinDir *= -1; d.wT = -d.wT; d.scratch = 0.9; mood(s, 'scratch'); callout(s, '스크래치!', 'warn'); sfx('scratch'); }
    else if (c.type === 'spot') {
      const on = s.animals.filter(a => a.mode === 'ground' || a.mode === 'air' || a.mode === 'fly');
      if (on.length) { const a = pick(on); dj.spot = a.kind; dj.pointX = clamp(a.x / 6, -1, 1); mood(s, 'point'); callout(s, KINDS[a.kind].name + ' 지목!', 'spot'); say(s, KINDS[a.kind].name + ' 손님~ 준비됐나요?'); sfx('spot'); }
    }
  }
  function doPang(s, power, tgt) {
    const d = s.disc;
    s.pangT = s.t; d.hv += 5.2 * power; s.tele = null; mood(s, 'slam'); callout(s, '팡!', 'pang'); fx('pang', 0, 0, 0, power); sfx('pang', power);
    for (const a of s.animals) {
      const mult = power * (a.kind === tgt ? tune.spot_bonus : 1);
      if (a.mode === 'hang') { a.hangT -= tune.hang_pang_loss * power; continue; }
      if (a.mode !== 'ground' || a.shield > 0) continue;
      if (a.hold) {
        const friends = s.animals.filter(o => o !== a && o.sheltered === a.kind + 1).length;
        a.gauge -= tune.pang_gauge_cost * mult * (1 + 0.5 * friends); a.lastUse = s.t;
        if (a.gauge <= 0) { a.gauge = 0; a.tired = tune.tired_time; letGo(s, a); launch(s, a, mult * 0.75); }
        continue;
      }
      if (a.sheltered) continue;
      launch(s, a, mult);
    }
    if (tgt >= 0) s.dj.spot = -1;
  }
  function launch(s, a, mult) {
    const r = Math.hypot(a.x, a.z) || 1;
    a.mode = 'air'; a.y = r > RIN - 0.6 ? CLEAR + 0.05 : 0.02; a.vy = tune.pang_power * mult * kv(a.kind, 'launch'); a.air = 0;
    a.vx += a.x / r * tune.pang_kick * mult + (rng() - 0.5) * 1.2; a.vz += a.z / r * tune.pang_kick * mult + (rng() - 0.5) * 1.2;
    a.walk = 0; a.hasT = 0; a.ai.panic = a.ai.plan !== 3 && rng() < 0.55 ? 1 : 0; fx('launch', a.x, 0, a.z); sfx('boing', a.kind);
  }
  function letGo(s, a) { a.hold = 0; a.hasT = 0; a.zip = 0; a.arm = -1; }

  // ---- Where things are on the disc ----------------------------------------------------------
  const segAt = (s, x, z) => Math.floor((((Math.atan2(z, x) + s.disc.a) % TAU) + TAU) % TAU / SEG) % DISC.SEGS;
  const openAt = (s, x, z) => s.disc.gates[segAt(s, x, z)] > 0.5;
  function nearestRail(s, x, z) {
    const beta = Math.atan2(z, x) + s.disc.a; let best = null;
    for (let i = 0; i < DISC.SEGS; i++) {
      if (s.disc.gates[i] > 0.5) continue;
      const mid = (i + 0.5) * SEG, la = mid + clamp(wrap(beta - mid), -SEG / 2 + 0.14, SEG / 2 - 0.14), wa = la - s.disc.a;
      const px = Math.cos(wa) * RAILR, pz = Math.sin(wa) * RAILR, dd = Math.hypot(px - x, pz - z);
      if (!best || dd < best.d) best = { d: dd, x: px, z: pz, seg: i, la };
    }
    return best;
  }
  const surfY = (s, x, z) => s.disc.h - Math.tan(s.disc.tilt) * (x * Math.cos(s.disc.tiltDir) + z * Math.sin(s.disc.tiltDir));

  // ---- Controls --------------------------------------------------------------------------------
  function readControls(s, a) {
    a.skPrev = a.sk;
    if (a.dev) { const c = Input.read(a.dev); a.ix = c.x; a.iz = c.z; a.sk = c.skill ? 1 : 0; a.sig = c.sigHit ? 1 : 0; }
    else botThink(s, a);
    a.skHit = a.sk && !a.skPrev ? 1 : 0;
  }

  // ---- Bot partners: help, never ruin the plan ---------------------------------------------------
  function botsOnRing(s, c) {
    const err = [tune.bot_error_r1, tune.bot_error_r2, tune.bot_error_r3][s.round - 1];
    let teach = -1;
    if (c.teach) { let best = -1; for (const a of s.animals) if (!a.dev && a.mode === 'ground' && kv(a.kind, 'launch') > best) { best = kv(a.kind, 'launch'); teach = a.kind; } s.teachT = teach >= 0 ? c.at : -1; }
    for (const a of s.animals) {
      if (a.dev) continue; const ai = a.ai;
      let plan = 1;
      if (teach >= 0) plan = a.kind === teach ? 3 : 1;                 // one friend is caught out, to teach the rescue
      else if (c.fake) plan = rng() < tune.bot_fooled ? 1 : 0;        // fooled: spends its gauge on nothing
      else if (c.quick) plan = rng() > err + 0.3 ? 1 : 2;
      else plan = rng() > err ? 1 : 2;
      ai.plan = plan; ai.at = c.at; ai.from = c.at - tune.bot_react - (a.kind === 0 ? 0.15 : 0) - rng() * 0.08; ai.to = c.at + 0.42 + rng() * 0.15;
      if (plan === 2) { ai.from = c.at + 0.06 + rng() * 0.2; ai.to = ai.from + 0.5; }
    }
  }
  function botThink(s, a) {
    const ai = a.ai, d = s.disc, rt = s.rt; let tx = a.x, tz = a.z, sk = 0, go = 1;
    const r = Math.hypot(a.x, a.z), wa = ai.home - d.a, hr = HOME_R[a.kind];
    tx = Math.cos(wa) * hr; tz = Math.sin(wa) * hr;                   // ride at its own spot on the record
    if (d.tilt > 0.03) { tx -= Math.cos(d.tiltDir) * 1.6; tz -= Math.sin(d.tiltDir) * 1.6; }
    if (r > RIN - 1.3 && openAt(s, a.x, a.z)) { tx = a.x * 0.4; tz = a.z * 0.4; }
    if (!s.tele && s.phase === 'run' && a.mode === 'ground') { let bd = 4.5; for (const p of s.pickups) { const px = Math.cos(p.la - d.a) * p.r, pz = Math.sin(p.la - d.a) * p.r, dd = Math.hypot(px - a.x, pz - a.z); if (dd < bd && !openAt(s, px, pz)) { bd = dd; tx = px; tz = pz; } } }
    const usable = a.tired <= 0 && a.gauge > 0.14;
    // someone is hanging: the bot that noticed goes; a call for help brings every bot
    let hang = null;
    if (ai.help >= 0) { const o = s.animals[ai.help]; if (o.mode === 'hang') hang = o; else ai.help = -1; }
    if (!hang && s.gatherT > 0 && s.gatherBy >= 0 && s.gatherBy !== a.kind && s.animals[s.gatherBy].mode === 'hang') hang = s.animals[s.gatherBy];
    const hd = hang ? Math.hypot(hang.x - a.x, hang.z - a.z) : 99;
    if (hang && s.phase === 'run') {
      if (s.rt >= hang.helpAt && a.mode === 'ground') {
        const k = (RIN - 0.35) / (R + 0.38); tx = hang.x * k; tz = hang.z * k; ai.goal = 1;
        if (a.kind === 1 && a.gauge > 0.55 && a.tired <= 0 && hd < 7) { ai.fly = 1; }
        if (a.kind === 3 && a.gauge >= tune.tail_cost && a.tired <= 0 && hd < tune.tail_range - 0.4 && ai.coolT <= 0) { sk = 1; ai.coolT = 0.5; }
        if (a.kind === 2 && usable && Math.hypot(tx - a.x, tz - a.z) < 1.2 && Math.abs(d.w) > 0.7) sk = 1;
      }
    } else ai.goal = 0;
    if (ai.coolT > 0) ai.coolT -= STEP;
    // the bird's rescue flight: out to the friend, back to the middle
    if (a.kind === 1 && ai.fly) {
      if (a.mode === 'fly') { sk = a.gauge > 0.08 ? 1 : 0; if (a.carrying >= 0 || !hang) { tx = 0; tz = 0; if (r < 2.8) { sk = 0; ai.fly = 0; } } else { tx = hang.x; tz = hang.z; } }
      else if (a.mode === 'ground' && hang && usable) { sk = hd < 4.2 ? 1 : 0; tx = hang.x * 0.8; tz = hang.z * 0.8; }
      else if (!hang || !usable) ai.fly = 0;
    }
    // a human called: come over
    if (s.gatherT > 0 && s.gatherBy >= 0 && s.gatherBy !== a.kind && ai.goal === 0 && !ai.fly) { const c = s.animals[s.gatherBy]; if (c.mode === 'ground' || c.mode === 'air') { tx = c.x * 0.86; tz = c.z * 0.86; } }
    // a pang is coming
    if (s.tele && ai.plan && s.phase === 'run') {
      if (ai.plan >= 2) { const k = 4.85 / (r || 1); tx = a.x * k; tz = a.z * k; }           // caught dancing by the rail
      else {
        if (ai.plan === 1 && a.kind === 0) { const rl = nearestRail(s, a.x, a.z); if (rl && rl.d > tune.trunk_reach - 0.5) { const k = (RAILR - 1.7) / RAILR; tx = rl.x * k; tz = rl.z * k; } else go = 0.4; }
        if (ai.plan === 1 && a.kind === 3) { const rl = nearestRail(s, a.x, a.z); if (rl && rl.d > tune.tail_hook_range - 0.6) { tx = rl.x * 0.7; tz = rl.z * 0.7; } }
        if (!usable && ai.plan === 1) { tx = 0; tz = 0; }
        if (rt >= ai.from && rt <= ai.to && usable) sk = 1;
        if (a.kind === 1 && sk) { tx = a.x * 0.3; tz = a.z * 0.3; }
      }
    } else if (ai.plan && s.rt > ai.to) ai.plan = 0;
    if (ai.plan && !s.tele && rt >= ai.from && rt <= ai.to && usable && ai.plan !== 3) sk = 1;
    // sliding out through an open gate, or thrown: last-ditch skill
    const outv = (a.vx * a.x + a.vz * a.z) / (r || 1) - 0;
    if (a.mode === 'ground' && usable && r > 4.3 && openAt(s, a.x, a.z) && outv > 1.6) { sk = 1; tx = 0; tz = 0; }
    if (a.mode === 'air' && usable && (a.kind === 1 || a.kind === 3) && ai.panic) { if (r > 3.6 && a.vy < 3) sk = 1; tx = 0; tz = 0; }
    if (a.kind === 1 && a.mode === 'fly' && !ai.fly && r > 2.6 && a.gauge > 0.06) { sk = 1; tx = 0; tz = 0; }
    if (a.mode === 'hang' && (a.kind === 1 || a.kind === 3) && a.gauge >= tune.self_rescue_cost && a.tired <= 0 && s.rt >= ai.selfAt) sk = a.sk ? 0 : 1;
    if (a.mode === 'hang' && s.rt >= ai.selfAt && rng() < tune.bot_climb) sk = 1;
    if (a.mode === 'out') sk = 0;
    const dx = tx - a.x, dz = tz - a.z, dd = Math.hypot(dx, dz);
    if (dd > 0.3) { a.ix = dx / dd * go; a.iz = dz / dd * go; } else { a.ix = 0; a.iz = 0; }
    if (ai.plan === 3 && a.mode === 'air') { a.ix = 0; a.iz = 0; }
    a.sk = sk; a.sig = 0;
  }

  // ---- One animal, one step ------------------------------------------------------------------
  function gaugeSecs(k) { return [tune.ele_gauge, tune.bird_gauge, tune.oct_gauge, tune.mon_gauge][k]; }
  function toHang(s, a) {
    if (a.carrying >= 0) drop(s, a);
    a.mode = 'hang'; a.hold = 0; a.hasT = 1; a.zip = 0; a.arm = -1; a.hangA = Math.atan2(a.z, a.x) + s.disc.a; a.hangMax = tune.hang_time * KINDS[a.kind].hangMul; a.hangT = a.hangMax;
    a.rescue = 0; a.hangs++; a.vx = a.vz = a.vy = 0; a.hangStart = s.rt; a.ai.selfAt = s.rt + 0.9 + rng() * 1.2; a.ai.fly = 0; a.walk = 0;
    const lesson = s.round === 1 && s.firstHang === 0; let near = null, nd = 99;
    for (const o of s.animals) { if (o.ai.help === a.kind) o.ai.help = -1; if (o !== a && !o.dev && o.mode === 'ground') { const dd = Math.hypot(o.x - a.x, o.z - a.z); if (dd < nd) { nd = dd; near = o; } } }
    if (near && (lesson || rng() < tune.bot_help)) near.ai.help = a.kind;
    a.helpAt = s.rt + (lesson ? 2.4 : 0.6);
    if (lesson) a.ai.selfAt += 3.4; // the first one waits for a friend: that is the lesson
    s.firstHang++; toast(s, a, '구해줘!'); sfx('yelp', a.kind);
    if (rng() < 0.55) say(s, pick([KINDS[a.kind].name + ' 손님 매달렸다~!', '거기 떨어지면 풍덩이야~', '어어? 손 놓지 마요~']));
    if (a.dev) { s.hint = Input.label(a.dev, 'skill') + ' 연타로 기어오르기 · ' + Input.label(a.dev, 'sig') + ' 키로 "구해줘!" 하면 동료가 달려와요'; s.hintT = 5; }
    else if (s.firstHang <= 2 && s.round === 1) { s.hint = '매달린 동료 옆에 붙어 있으면 끌어올려요!'; s.hintT = 5; }
  }
  function saved(s, a, by) {
    const wa = Math.atan2(a.z, a.x), rr = Math.min(RIN - 0.9, Math.hypot(a.x, a.z));
    a.mode = 'ground'; a.x = Math.cos(wa) * rr; a.z = Math.sin(wa) * rr; a.y = 0; a.vy = 0; a.vx = s.disc.w * a.z; a.vz = -s.disc.w * a.x;
    a.shield = tune.saved_shield; a.gauge = Math.max(a.gauge, 0.5); a.tired = 0; a.rescue = 0; a.hasT = 0; a.wasHang = 0; a.landT = s.t; a.emote = 'cheer'; a.emoteT = 1;
    if (by.length) s.rescues++; fx('saved', a.x, surfY(s, a.x, a.z), a.z); sfx('saved'); toast(s, a, by.length ? '구조 성공!' : '영차, 복귀!');
    for (const k of by) bonus(s, s.animals[k]);
    if (rng() < 0.5) say(s, pick(['어? 구해 줬네? 우정 좋다~', '에이, 아깝다~!', '팀워크 뭐야~?']));
    s.hintT = Math.min(s.hintT, 0.6);
  }
  function bonus(s, o) { // a rescuer's reward: free stars
    o.rescues++; o.stars += tune.rescue_bonus; o.emote = 'cheer'; o.emoteT = 1;
    toast(s, o, '구조 보너스 별 +' + tune.rescue_bonus); fx('star', o.x, surfY(s, o.x, o.z), o.z); sfx('coin');
  }
  function drop(s, bird) {
    const o = s.animals[bird.carrying]; bird.carrying = -1; if (!o) return;
    o.carriedBy = -1; o.mode = 'air'; o.vy = 0; o.vx = bird.vx * 0.5; o.vz = bird.vz * 0.5; o.air = 0;
  }
  function stepAnimal(s, a, dt) {
    const d = s.disc, k = a.kind, r = Math.hypot(a.x, a.z);
    if (a.tired > 0) a.tired = Math.max(0, a.tired - dt);
    if (a.shield > 0) a.shield = Math.max(0, a.shield - dt);
    if (a.stun > 0) a.stun = Math.max(0, a.stun - dt);
    if (a.emoteT > 0) { a.emoteT -= dt; if (a.emoteT <= 0) a.emote = 'none'; }
    if (a.tailT > 0) { a.tailT -= dt; if (a.tailT <= 0) { a.tailTo = -1; if (!a.hold) a.hasT = 0; } }
    a.flail = 0;
    if (a.skHit && a.dev && a.tired > 0 && a.mode !== 'out') toast(s, a, '지쳤어요…');
    const want = a.sk && a.tired <= 0 && a.gauge > 0, startOK = a.gauge > 0.1;
    let drain = 0;
    // -- skills --
    if (k === 0) { // 코끼리: the trunk on the rail
      if (a.mode === 'ground') {
        if (want && (a.hold || startOK)) {
          const rl = nearestRail(s, a.x, a.z);
          if (rl && rl.d <= tune.trunk_reach + (a.hold ? 0.4 : 0)) {
            if (!a.hold) { a.hold = 1; a.lr = r; a.la = Math.atan2(a.z, a.x) + d.a; sfx('trunk'); }
            a.hasT = 1; a.tx = rl.x; a.tz = rl.z; a.ty = surfY(s, rl.x, rl.z) + DISC.RAIL_H;
            drain = 1 + tune.shelter_cost * s.animals.filter(o => o.sheltered === 1).length;
          } else { if (a.hold) letGo(s, a); a.flail = 1; if (a.skHit && a.dev) toast(s, a, '난간이 멀어요!'); }
        } else if (a.hold) letGo(s, a);
      }
    } else if (k === 1) { // 새: a short flight, a friend in its feet
      if (a.mode === 'fly') {
        if (!want) { a.mode = 'air'; a.vy = 0; a.air = 0; if (a.carrying >= 0) drop(s, a); }
        else {
          drain = 1; const o = a.carrying >= 0 ? s.animals[a.carrying] : null;
          if (o) drain = o.kind === 0 ? tune.carry_cost_heavy : tune.carry_cost_light;
          else for (const f of s.animals) if (f !== a && (f.mode === 'hang' || f.mode === 'air') && Math.hypot(f.x - a.x, f.z - a.z) < tune.carry_reach) { grab(s, a, f); break; }
        }
      } else if (a.skHit && a.tired <= 0 && (a.mode === 'ground' || a.mode === 'air' || a.mode === 'hang')) {
        const cost = a.mode === 'hang' ? tune.self_rescue_cost : 0;
        if (a.gauge > 0.1 + cost) {
          a.gauge -= cost; if (a.mode === 'hang') { a.y = surfY(s, a.x, a.z) * 0 - 0.6; }
          a.mode = 'fly'; a.hold = 0; a.vy = 0; a.lastUse = s.t; sfx('flap'); fx('feather', a.x, surfY(s, a.x, a.z) + a.y, a.z, 4);
          let best = null, bd = tune.carry_reach;
          const rescueOnly = !a.dev && a.ai.fly; // a bot on a rescue flight picks up the friend in trouble, not a bystander
          for (const f of s.animals) if (f !== a && ((f.mode === 'ground' && !rescueOnly) || f.mode === 'hang' || f.mode === 'air') && !f.hold) { const dd = Math.hypot(f.x - a.x, f.z - a.z) - (f.mode === 'hang' ? 0.6 : 0); if (dd < bd) { bd = dd; best = f; } }
          if (best) grab(s, a, best);
        } else a.flail = 1;
      }
    } else if (k === 2) { // 문어: suckers anywhere, one arm for a friend
      if (a.mode === 'ground') {
        if (want && (a.hold || startOK)) {
          if (!a.hold) { a.hold = 1; fx('pop', a.x, surfY(s, a.x, a.z), a.z); sfx('pop'); a.arm = -1; }
          let f = a.arm >= 0 ? s.animals[a.arm] : null;
          if (f && (f.mode !== 'ground' || Math.hypot(f.x - a.x, f.z - a.z) > tune.arm_reach * 1.25)) { f = null; a.arm = -1; }
          if (!f) { let bd = tune.arm_reach; for (const o of s.animals) if (o !== a && o.mode === 'ground' && !o.hold) { const dd = Math.hypot(o.x - a.x, o.z - a.z); if (dd < bd) { bd = dd; f = o; } } a.arm = f ? f.kind : -1; }
          a.hasT = f ? 1 : 0; if (f) { a.tx = f.x; a.tz = f.z; a.ty = surfY(s, f.x, f.z) + KINDS[f.kind].head * 0.45; }
          drain = 1 + (f ? tune.arm_cost : 0);
        } else if (a.hold) letGo(s, a);
      }
    } else { // 원숭이: the tail, for a friend first, the rail second
      if (a.hold) {
        if (!want) letGo(s, a);
        else { drain = 1; const wa = a.la - d.a; a.hasT = 1; a.tx = Math.cos(wa) * RAILR; a.tz = Math.sin(wa) * RAILR; a.ty = surfY(s, a.tx, a.tz) + DISC.RAIL_H; }
      } else if (a.skHit && a.tired <= 0 && a.mode === 'hang') {
        if (a.gauge >= tune.self_rescue_cost) { a.gauge -= tune.self_rescue_cost; a.lastUse = s.t; saved(s, a, []); sfx('whip'); }
      } else if (a.skHit && a.tired <= 0 && (a.mode === 'ground' || a.mode === 'air')) {
        let best = null, bp = 0, bd = 99;
        for (const f of s.animals) {
          if (f === a) continue; const dd = Math.hypot(f.x - a.x, f.z - a.z), fr = Math.hypot(f.x, f.z); let p = 0;
          if (f.mode === 'hang') p = a.dev || a.ai.help === f.kind || (s.gatherT > 0 && s.gatherBy === f.kind) ? 3 : 0; else if (f.mode === 'air' && fr > RIN - 1.6) p = 2;
          else if (f.mode === 'ground' && !f.hold && fr > RIN - 0.9 && openAt(s, f.x, f.z)) p = 1;
          if (p && dd <= tune.tail_range && (p > bp || (p === bp && dd < bd))) { best = f; bp = p; bd = dd; }
        }
        if (best && a.gauge >= tune.tail_cost) {
          a.gauge -= tune.tail_cost; a.lastUse = s.t; best.wasHang = best.mode === 'hang' ? 1 : 0; best.savedBy = a.kind;
          best.ysx = best.x; best.ysz = best.z; best.ysy = best.mode === 'hang' ? -0.6 : best.y; best.yT = 0; best.yBy = a.kind; best.mode = 'yanked'; best.hold = 0;
          if (best.carrying >= 0) drop(s, best);
          a.tailT = 0.5; a.tailTo = best.kind; a.hasT = 1; sfx('whip');
        } else if (a.gauge > 0.12) {
          const rl = nearestRail(s, a.x, a.z);
          if (rl && rl.d <= tune.tail_hook_range) { a.hold = 1; a.mode = 'ground'; a.y = 0; a.vy = 0; a.zip = 0.2; a.la = rl.la; a.lr = RIN - 0.25; a.lastUse = s.t; sfx('whip'); }
          else { a.gauge = Math.max(0, a.gauge - 0.06); a.flail = 1; sfx('whiff'); }
        } else a.flail = 1;
      }
      if (a.tailTo >= 0 && a.tailT > 0) { const f = s.animals[a.tailTo]; a.hasT = 1; a.tx = f.x; a.tz = f.z; a.ty = surfY(s, f.x, f.z) + Math.max(0.3, f.y + 0.4); }
    }
    // -- the gauge --
    if (drain > 0) {
      a.gauge -= dt / gaugeSecs(k) * drain; a.lastUse = s.t;
      if (a.gauge < 0.3 && rng() < 0.2) fx('sweat', a.x, surfY(s, a.x, a.z) + KINDS[k].head, a.z);
      if (a.gauge <= 0) { a.gauge = 0; a.tired = tune.tired_time; sfx('tired'); if (a.mode === 'fly') { a.mode = 'air'; a.vy = 0; a.air = 0; if (a.carrying >= 0) drop(s, a); } else letGo(s, a); }
    } else if (s.t - a.lastUse > tune.regen_delay && a.tired <= 0) a.gauge = Math.min(1, a.gauge + tune.gauge_regen * dt);
    // -- motion, by mode --
    const sx = d.w * a.z, sz = -d.w * a.x;                              // the floor's own velocity here
    if (a.mode === 'ground') {
      if (a.hold && k !== 2) { // locked to a spot on the record
        const wa = a.la - d.a; let px = Math.cos(wa) * a.lr, pz = Math.sin(wa) * a.lr;
        if (a.zip > 0) { a.zip -= dt; const u = clamp(dt / Math.max(dt, a.zip + dt), 0, 1); px = a.x + (px - a.x) * u; pz = a.z + (pz - a.z) * u; }
        a.x = px; a.z = pz; a.vx = d.w * a.z; a.vz = -d.w * a.x; a.walk = 0; a.slide = 0;
        a.face = Math.atan2(a.tx - a.x, a.tz - a.z);
      } else {
        const stuck = a.hold && k === 2, sh = a.sheltered ? 1 : 0;
        const walk = kv(k, 'walk') * (stuck ? tune.suction_walk : sh ? 0.6 : 1) * (a.stun > 0 ? 0.35 : 1);
        const il = Math.hypot(a.ix, a.iz), ix = il > 1 ? a.ix / il : a.ix, iz = il > 1 ? a.iz / il : a.iz;
        const wx = sx + ix * walk, wz = sz + iz * walk;
        if (stuck) { a.vx = wx; a.vz = wz; }
        else {
          const trac = kv(k, 'traction') * (sh ? 6 : 1) * (a.stun > 0 ? 0.55 : 1);
          // feet carry the animal round with the floor for free; grip only limits moving across it
          let rx = a.vx - sx, rz = a.vz - sz;
          let ax = (ix * walk - rx) * tune.grip_stiffness, az = (iz * walk - rz) * tune.grip_stiffness; const al = Math.hypot(ax, az);
          if (al > trac) { ax *= trac / al; az *= trac / al; }
          const slope = tune.gravity * Math.sin(d.tilt) * tune.tilt_slide * (sh ? 0.2 : 1), push = d.w * d.w * tune.spin_push * (sh ? 0.2 : 1);
          rx += (ax + Math.cos(d.tiltDir) * slope + a.x * push) * dt; rz += (az + Math.sin(d.tiltDir) * slope + a.z * push) * dt;
          a.vx = sx + rx; a.vz = sz + rz;
        }
        a.x += a.vx * dt; a.z += a.vz * dt;
        const sl = Math.hypot(a.vx - wx, a.vz - wz); a.slide += (sl - a.slide) * Math.min(1, dt * 10); a.walk += ((il > 0.1 ? Math.min(1, il) : 0) - a.walk) * Math.min(1, dt * 12);
        if (il > 0.15) a.face = Math.atan2(ix, iz);
        if (a.slide > 1.8 && rng() < 0.3) fx('dust', a.x, surfY(s, a.x, a.z), a.z);
        if (stuck && il > 0.2 && rng() < 0.06) { fx('pop', a.x, surfY(s, a.x, a.z), a.z); sfx('pop'); }
        const nr = Math.hypot(a.x, a.z);
        if (nr > RIN) {
          if (!openAt(s, a.x, a.z)) { // the cushion and rail hold a sliding animal in
            const nx = a.x / nr, nz = a.z / nr; a.x = nx * RIN; a.z = nz * RIN;
            const rvx = a.vx - d.w * a.z, rvz = a.vz + d.w * a.x, out = rvx * nx + rvz * nz;
            if (out > 0) { a.vx -= out * nx; a.vz -= out * nz; }
          } else if (nr > R + 0.2) toHang(s, a);
        }
      }
    } else if (a.mode === 'air') {
      a.air += dt; a.vy -= tune.gravity * dt; a.y += a.vy * dt;
      a.vx += a.ix * 3 * dt; a.vz += a.iz * 3 * dt; a.x += a.vx * dt; a.z += a.vz * dt;
      const nr = Math.hypot(a.x, a.z);
      if (nr > RIN && nr < R + 0.3 && a.y < CLEAR && !openAt(s, a.x, a.z)) { // too low to clear the rail: it holds
        const nx = a.x / nr, nz = a.z / nr, out = a.vx * nx + a.vz * nz; a.x = nx * RIN; a.z = nz * RIN;
        if (out > 0) { a.vx -= out * nx; a.vz -= out * nz; }
      } else if (nr > R + 0.3) { a.vx *= 0.8; a.vz *= 0.8; if (a.y < 0.6 || a.vy < 0) toHang(s, a); }
      if (a.mode === 'air' && a.y <= 0 && a.vy < 0) {
        a.y = 0; a.vy = 0; a.mode = 'ground'; a.landT = s.t; a.stun = 0.45; fx('land', a.x, surfY(s, a.x, a.z), a.z); sfx('land', k);
        if (a.wasHang) { a.wasHang = 0; a.shield = tune.saved_shield * 0.6; const by = s.animals[a.savedBy]; if (by) bonus(s, by); s.rescues++; fx('saved', a.x, surfY(s, a.x, a.z), a.z); sfx('saved'); toast(s, a, '구조 성공!'); }
      }
    } else if (a.mode === 'fly') {
      const o = a.carrying >= 0 ? s.animals[a.carrying] : null, hgt = Math.max(tune.fly_height, o ? KINDS[o.kind].head + 0.45 : 0);
      a.y += (hgt - a.y) * Math.min(1, dt * 9); a.vy = 0;
      const sp = tune.fly_speed * (o ? (o.kind === 0 ? 0.45 : 0.8) : 1), il = Math.hypot(a.ix, a.iz);
      a.vx += (a.ix * sp - a.vx) * Math.min(1, dt * 7); a.vz += (a.iz * sp - a.vz) * Math.min(1, dt * 7); a.x += a.vx * dt; a.z += a.vz * dt;
      const fr = Math.hypot(a.x, a.z); if (fr > R + 1.1) { a.x *= (R + 1.1) / fr; a.z *= (R + 1.1) / fr; } // the ride's own airspace: no flying off over the deck
      if (il > 0.15) a.face = Math.atan2(a.ix, a.iz);
      if (rng() < 0.25) fx('feather', a.x, surfY(s, a.x, a.z) + a.y, a.z, 1);
      if (o) { o.x = a.x; o.z = a.z; o.y = a.y - KINDS[o.kind].head - 0.02; o.vx = a.vx; o.vz = a.vz; o.face = a.face; }
    } else if (a.mode === 'hang') {
      const wa = a.hangA - d.a; a.x = Math.cos(wa) * (R + 0.38); a.z = Math.sin(wa) * (R + 0.38); a.y = -KINDS[k].head * 0.8; a.face = Math.atan2(-a.x, -a.z);
      a.hasT = 1; a.tx = Math.cos(wa) * (R - 0.1); a.tz = Math.sin(wa) * (R - 0.1); a.ty = surfY(s, a.tx, a.tz) + 0.05;
      const px = Math.cos(wa) * RIN, pz = Math.sin(wa) * RIN, by = [];
      for (const o of s.animals) if (o !== a && o.mode === 'ground' && Math.hypot(o.x - px, o.z - pz) < tune.rescue_reach) by.push(o.kind);
      a.helpers = by.length;
      if (a.skHit) { a.rescue += tune.self_climb; if (a.dev) fx('sweat', a.x, surfY(s, a.x, a.z), a.z); }
      if (by.length) { a.rescue += dt / tune.rescue_time * (by.length > 1 ? 1.6 : 1); a.hangT -= dt * 0.3; } else a.hangT -= dt;
      if (a.rescue >= 1) saved(s, a, by);
      else if (a.hangT <= 0) { a.mode = 'fall'; a.y = surfY(s, a.x, a.z) + a.y; a.vy = 0; a.hasT = 0; a.falls++; sfx('fall', k); }
    } else if (a.mode === 'fall') {
      a.vy -= tune.gravity * dt; a.y += a.vy * dt; const nr = Math.hypot(a.x, a.z) || 1, go = Math.min(1, dt * 3);
      a.x += (a.x / nr * DISC.POOL_R - a.x) * go; a.z += (a.z / nr * DISC.POOL_R - a.z) * go;
      if (a.y <= DISC.POOL_Y - 0.1) { a.mode = 'out'; a.y = DISC.POOL_Y; a.outA = Math.atan2(a.z, a.x); a.gauge = 0; fx('splash', a.x, 0, a.z); sfx('splash'); say(s, pick([KINDS[k].name + ' 손님 퇴장~ 풍덩!', '한 명 보냈다~!', '풍덩~! 시원하겠다~'])); mood(s, 'laugh');
        if (a.dev) { s.hint = '풍덩! 남은 곡은 튜브에서 응원해요 · ' + Input.label(a.dev, 'skill') + ' 키로 응원하기'; s.hintT = 6; } }
    } else if (a.mode === 'out') {
      a.outA += dt * 0.06; a.x = Math.cos(a.outA) * DISC.POOL_R; a.z = Math.sin(a.outA) * DISC.POOL_R; a.y = DISC.POOL_Y - 0.1; a.face = Math.atan2(-a.x, -a.z); a.gauge = 0;
      if (a.skHit) { a.emote = 'cheer'; a.emoteT = 0.8; sfx('cheer', k); }
    } else if (a.mode === 'yanked') {
      const m = s.animals[a.yBy], D = 0.42; a.yT += dt; const u = clamp(a.yT / D, 0, 1), e = u * u * (3 - 2 * u);
      const mr = Math.hypot(m.x, m.z) || 1, kk = Math.max(0, mr - 1) / mr, ex = m.x * kk, ez = m.z * kk;
      a.x = a.ysx + (ex - a.ysx) * e; a.z = a.ysz + (ez - a.ysz) * e; a.y = a.ysy * (1 - e) + Math.sin(Math.PI * u) * 1.7; a.vy = 1;
      if (u >= 1) { a.mode = 'ground'; a.y = 0; a.vy = 0; a.vx = d.w * a.z; a.vz = -d.w * a.x; a.landT = s.t; a.shield = tune.saved_shield * 0.7; fx('land', a.x, surfY(s, a.x, a.z), a.z); sfx('land', k);
        if (a.wasHang) { a.wasHang = 0; bonus(s, m); s.rescues++; toast(s, a, '구조 성공!'); fx('saved', a.x, surfY(s, a.x, a.z), a.z); sfx('saved'); s.hintT = Math.min(s.hintT, 0.6); }
        m.emote = 'cheer'; m.emoteT = 0.8; }
    }
    if (a.mode !== 'out' && a.mode !== 'fall') a.alive += dt;
  }
  function grab(s, bird, f) {
    if (f.carrying >= 0) return;
    f.wasHang = f.mode === 'hang' ? 1 : f.wasHang; f.savedBy = bird.kind; f.mode = 'carried'; f.carriedBy = bird.kind; f.hold = 0; f.hasT = 0; bird.carrying = f.kind;
    bird.hasT = 0; sfx('grab');
  }
  function shelterPass(s) {
    for (const a of s.animals) a.sheltered = 0;
    const e = s.animals[0], o = s.animals[2];
    const lesson = a => !a.dev && a.ai.plan === 3;
    if (e.hold && e.mode === 'ground') for (const a of s.animals) if (a !== e && a.mode === 'ground' && !a.hold && !lesson(a) && Math.hypot(a.x - e.x, a.z - e.z) < KINDS[0].radius + KINDS[a.kind].radius + tune.shelter_range) a.sheltered = 1;
    if (o.hold && o.arm >= 0 && s.animals[o.arm].mode === 'ground' && !s.animals[o.arm].sheltered && !lesson(s.animals[o.arm])) s.animals[o.arm].sheltered = 3;
  }
  function collide(s) {
    const A = s.animals;
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
      const a = A[i], b = A[j]; if (a.mode !== 'ground' || b.mode !== 'ground') continue;
      const dx = b.x - a.x, dz = b.z - a.z, dd = Math.hypot(dx, dz) || 0.001, min = (KINDS[a.kind].radius + KINDS[b.kind].radius) * 0.88;
      if (dd >= min) continue;
      const mass = o => (o.hold ? 50 : 1) * (o.kind === 0 ? 3 : 1) * (o.dev ? 4 : 1), ma = mass(a), mb = mass(b), push = (min - dd), nx = dx / dd, nz = dz / dd;
      a.x -= nx * push * mb / (ma + mb); a.z -= nz * push * mb / (ma + mb); b.x += nx * push * ma / (ma + mb); b.z += nz * push * ma / (ma + mb);
    }
  }

  // ---- One step of the game ------------------------------------------------------------------
  function step(s, dt) {
    const d = s.disc, dj = s.dj;
    s.t += dt; s.phaseT += dt;
    const bps = dj.bpm / 60, bt = s.t * bps; dj.beatN = Math.floor(bt); dj.beat = bt - dj.beatN; dj.moodT += dt;
    if (dj.mood !== 'idle' && dj.moodT > (dj.mood === 'laugh' ? 1.5 : dj.mood === 'shock' ? 99 : dj.mood === 'point' ? 2 : 0.6)) dj.mood = 'idle';
    if (dj.sayT > 0) { dj.sayT -= dt; if (dj.sayT <= 0) dj.say = ''; }
    for (let i = s.toasts.length - 1; i >= 0; i--) { s.toasts[i].t += dt; if (s.toasts[i].t > 1.4) s.toasts.splice(i, 1); }
    if (s.gatherT > 0) s.gatherT -= dt;
    // the disc
    const acc = (d.scratch > 0 ? tune.scratch_accel : tune.spin_accel) * dt; if (d.scratch > 0) d.scratch -= dt;
    d.w += clamp(d.wT - d.w, -acc, acc); d.a = (d.a + d.w * dt) % TAU;
    d.tilt += clamp(d.tiltT - d.tilt, -0.55 * dt, 0.55 * dt);
    d.hv += (-d.h * 240 - d.hv * 15) * dt; d.h += d.hv * dt;
    if (s.phase === 'intro') {
      d.wT = 0.25 * s.spinDir;
      if (s.phaseT >= 0.6 && s.phaseT - dt < 0.6) { callout(s, ['1절', '2절', '피날레'][s.round - 1], 'spot'); sfx('spot'); }
      if (s.phaseT >= (s.round === 1 ? 3.4 : 2.6)) { s.phase = 'run'; s.phaseT = 0; s.rt = 0; callout(s, '시작!', 'go'); sfx('go'); }
    } else if (s.phase === 'run') {
      s.rt += dt; s.timeLeft = Math.max(0, tune.round_seconds - s.rt);
      while (s.cueI < s.cues.length && s.cues[s.cueI].t <= s.rt) fire(s, s.cues[s.cueI++]);
      s.starT -= dt; for (const p of s.pickups) p.t += dt;
      if (s.starT <= 0 && s.pickups.length < tune.star_max) { s.starT = tune.star_every * (0.7 + rng() * 0.6); const r = 1.2 + rng() * 3.7; s.pickups.push({ id: s.nextPid++, la: rng() * TAU, r, v: r > 4 ? 2 : 1, t: 0 }); }
      dj.ring = s.tele ? clamp((s.rt - s.tele.start) / s.tele.dur, 0, 1) : -1; dj.ringFake = s.tele && s.tele.quick ? 1 : 0;
      if (s.hintT > 0) s.hintT -= dt;
      else if (s.round === 1) {
        const h = s.animals.find(a => a.dev); const k = h ? h.kind : 0, dev = h ? h.dev : 'kb1';
        s.hint = s.rt < 7.5 ? Input.label(dev, 'move') + ' 이동 · 바깥일수록 더 밀려요' : s.rt < 17 ? Input.label(dev, 'skill') + ' 누르고 있기: ' + KINDS[k].skill + ' · ' + KINDS[k].tip : s.rt < 24 ? 'DJ가 "하나, 둘" 세면 팡! 게이지는 아껴 쓰세요' : '';
      } else s.hint = s.rt < 6 ? ['', '기울면 낮은 쪽으로 미끄러져요', '열린 난간 쪽은 그대로 밖이에요'][s.round - 1] : '';
      const alive = s.animals.filter(a => a.mode !== 'out' && a.mode !== 'fall').length;
      if (alive === 0) { s.phase = 'fail'; s.phaseT = 0; s.failed = true; d.wT = 0.2 * s.spinDir; d.tiltT = 0; dj.tiltWarn = 0; s.tele = null; dj.ring = -1; mood(s, 'laugh'); say(s, '전원 풍덩~! 이번 판은 내가 이겼다!'); callout(s, 'DJ 여우 승리!', 'fail'); s.gained = 'DJ 여우 승리 · ' + s.round + '절에서 전원 탈락'; sfx('lose'); s.hint = ''; }
      else if (s.timeLeft <= 0) roundClear(s, alive);
    } else if (s.phase === 'clear') {
      if (s.phaseT > 2.4) { s.phase = 'rest'; s.phaseT = 0; for (const a of s.animals) if (a.mode === 'out' || a.mode === 'fall') a.gone = 1; else if (a.mode === 'hang') { place(s, a); a.shield = 0.5; fx('saved', a.x, 0, a.z); } }
    } else if (s.phase === 'rest') {
      for (const a of s.animals) { a.gauge = Math.min(1, a.gauge + dt); a.tired = 0; }
      const skip = s.phaseT > 1.2 && s.animals.some(a => a.dev && a.skHit);
      if (s.phaseT >= tune.rest_seconds || skip) { if (s.round >= s.rounds) { s.done = true; } else startRound(s, s.round + 1); }
    }
    // the animals
    for (const a of s.animals) readControls(s, a);
    for (const a of s.animals) if (a.sig && a.dev) { s.gatherBy = a.kind; s.gatherT = 4; for (const o of s.animals) if (o.mode === 'ground') { o.emote = 'cheer'; o.emoteT = 0.7; } toast(s, a, a.mode === 'hang' ? '구해줘!' : '모여!'); sfx('whistle'); }
    if (s.phase === 'run' || s.phase === 'intro' || s.phase === 'rest' || s.phase === 'clear' || s.phase === 'fail') {
      const frozen = s.phase === 'intro';
      shelterPass(s);
      for (const a of s.animals) { if (frozen) { a.sk = 0; a.skHit = 0; } stepAnimal(s, a, dt); }
      collide(s);
      if (s.phase === 'run') collect(s);
    }
    if (s.phase === 'clear' || s.phase === 'rest') for (const a of s.animals) if (a.mode === 'ground' && a.emote === 'none' && rng() < 0.03) { a.emote = 'cheer'; a.emoteT = 0.9; }
    s.score = s.animals.reduce((n, a) => n + a.stars, 0);
  }
  function collect(s) {
    for (let i = s.pickups.length - 1; i >= 0; i--) {
      const p = s.pickups[i], wx = Math.cos(p.la - s.disc.a) * p.r, wz = Math.sin(p.la - s.disc.a) * p.r;
      for (const a of s.animals) {
        if (a.mode === 'hang' || a.mode === 'out' || a.mode === 'fall' || a.y > 2.6) continue;
        if (Math.hypot(a.x - wx, a.z - wz) > KINDS[a.kind].radius + 0.45) continue;
        a.stars += p.v; s.pickups.splice(i, 1); fx('star', wx, surfY(s, wx, wz), wz); sfx('coin'); toast(s, a, '별 +' + p.v); break;
      }
    }
  }
  function roundClear(s, alive) {
    const d = s.disc, st = alive >= 4 ? 3 : alive >= 2 ? 2 : 1;
    s.phase = 'clear'; s.phaseT = 0; s.stars[s.round - 1] = st; s.tele = null; s.dj.ring = -1; s.dj.tiltWarn = 0; s.dj.spot = -1; s.hint = '';
    d.wT = 0.22 * s.spinDir; d.tiltT = 0; d.warn.fill(0); d.gates.fill(0);
    for (const a of s.animals) {
      if (a.mode === 'fly') { a.mode = 'air'; if (a.carrying >= 0) drop(s, a); }
      if (a.mode === 'hang') saved(s, a, []);
      if (a.mode === 'ground') { a.emote = 'cheer'; a.emoteT = 2; }
    }
    s.result = { round: s.round, stars: st, alive, last: s.round >= s.rounds };
    if (s.round >= s.rounds) { s.goalReached = true; mood(s, 'shock'); say(s, '졌다 졌어… 여러분이 이겼습니다!'); }
    else { mood(s, 'shock'); say(s, pick(['이걸 버텨?! 다음 곡 간다!', '오~ 제법인데? 다음 곡!', '봐줬다 봐줬어~ 다음 곡!'])); }
    s.pickups = []; s.score = s.animals.reduce((n, a) => n + a.stars, 0);
    s.gained = '별 ' + s.score + '개 · 구조 ' + s.rescues + '회';
    callout(s, alive >= 4 ? '전원 생존!' : '버텼다!', 'win'); fx('confetti'); sfx('win');
  }

  // ---- States for the title and the cast line-up ------------------------------------------------
  function demoState() {
    const s = newState([{ dev: '', pl: 0 }, { dev: '', pl: 0 }, { dev: '', pl: 0 }, { dev: '', pl: 0 }]);
    s.phase = 'demo'; s.cues = []; s.dj.say = ''; s.dj.sayT = 0; s.hint = ''; return s;
  }
  function stepDemo(s, dt) {
    const d = s.disc, dj = s.dj; s.t += dt; d.w = 0.3; d.a = (d.a + d.w * dt) % TAU;
    const bt = s.t * dj.bpm / 60; dj.beatN = Math.floor(bt); dj.beat = bt - dj.beatN; dj.energy = 0.5; dj.mood = 'idle'; dj.ring = -1;
    s.animals.forEach((a, k) => {
      const wa = k * TAU / 4 + 0.6 - d.a, r = [3.5, 2.6, 3.1, 3.3][k];
      a.x = Math.cos(wa) * r; a.z = Math.sin(wa) * r; a.vx = d.w * a.z; a.vz = -d.w * a.x; a.face = Math.atan2(-a.x * 0.2, 1); a.mode = 'ground'; a.walk = 0; a.slide = 0;
      const ph = (s.t * 0.45 + k * 0.25) % 1; a.emote = ph < 0.16 ? 'cheer' : 'none';
    });
  }
  function lineupState() {
    const s = demoState(); s.disc.a = 0.4;
    [-4.9, -2.45, -0.55, 1.75].forEach((x, k) => { const a = s.animals[k]; a.x = x; a.z = 1.0 + (k === 0 ? -0.3 : 0); a.face = 0.08 - x * 0.03; a.mode = 'ground'; });
    s.dj.beat = 0.5; s.dj.energy = 0.5; return s;
  }
  return { newState, step, startRound, demoState, stepDemo, lineupState };
})();

// ==== hud.js ====
'use strict';
// The HUD, in HTML over the 3D view: the song bar (the timer), each animal's card and gauge,
// markers over heads, the DJ's speech bubble and call-outs, the title with its lobby, and the
// pause, round and end panels. Portraits are shots of the models; the logo is drawn in strokes.

const Hud = (() => {
  let ui, lastCall = -1, callT0 = -9;
  const faces = [null, null, null, null, null];
  function paint(root) { // fill in the portraits that have arrived
    root.querySelectorAll('canvas.face').forEach(c => { const b = faces[+c.dataset.k]; if (b && !c.dataset.done) { c.getContext('2d').drawImage(b, 0, 0, c.width, c.height); c.dataset.done = '1'; } });
  }
  const L = {}, cards = [], marks = [], toasts = [], seatEls = [], figEls = [];
  const SONGS = ['몸풀기 디스코', '기우뚱 펑키', '문 열린 밤'];
  const $ = (tag, cls, parent, html, id) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; if (id) e.id = id; if (parent) parent.appendChild(e); return e; };
  const set = (el, key, v) => { // touch the page only when something changed
    if (el['_' + key] === v) return; el['_' + key] = v;
    if (key === 'text') el.textContent = v; else if (key === 'html') el.innerHTML = v; else if (key === 'cls') el.className = v; else if (key === 'src') el.src = v; else el.style[key] = v;
  };
  const mmss = t => { const s = Math.max(0, Math.ceil(t)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const stars = (n, of) => { let h = ''; for (let i = 0; i < of; i++) h += `<span class="star${i < n ? ' on' : ''}"></span>`; return h; };
  // The logo and the big "팡!": round strokes from the game's own letter shapes.
  function lettering(text, colors) {
    let body = '', i = 0;
    const W = glyphRun(text, (g, ox) => {
      const c = colors[Math.min(i, colors.length - 1)]; let d = '';
      for (const ln of g.lines) d += 'M' + ln.map(p => (ox + p[0]) + ' ' + p[1]).join('L');
      const ov = g.ovals.map(o => `<ellipse cx="${ox + o[0]}" cy="${o[1]}" rx="${o[2]}" ry="${o[3]}"/>`).join('');
      if (d || ov) body += `<g class="gl" style="animation-delay:${(-i * 0.19).toFixed(2)}s" fill="none" stroke-linecap="round" stroke-linejoin="round">` +
        `<g stroke="#0a0e2a" stroke-width="35"><path d="${d}"/>${ov}</g><g stroke="${c}" stroke-width="20"><path d="${d}"/>${ov}</g>` +
        `<g stroke="rgba(255,255,255,0.8)" stroke-width="4.5" transform="translate(-3.5,-4.5)"><path d="${d}"/>${ov}</g></g>`;
      i++;
    });
    return `<svg viewBox="-28 -28 ${W + 56} 166" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
  }

  function init(portraits) {
    ui = document.getElementById('ui');
    portraits.forEach((p, k) => p.then(b => { faces[k] = b; paint(ui); }).catch(() => {}));
    // -- play --
    const hud = L.hud = $('div', 'layer', ui);
    L.song = $('div', 'glass', hud, '<div class="rec"></div><div class="info"><div class="ttl"></div><div class="track"><div class="fill"></div><div class="head"></div></div></div><div class="time"></div>', 'song');
    L.ttl = L.song.querySelector('.ttl'); L.fill = L.song.querySelector('.fill'); L.head = L.song.querySelector('.head'); L.time = L.song.querySelector('.time');
    L.round = $('div', 'glass', hud, '<div class="lab"></div><div class="stars"></div>', 'round');
    L.rlab = L.round.querySelector('.lab'); L.rstars = L.round.querySelector('.stars');
    $('div', 'glass', hud, '<kbd>P</kbd> 일시정지 <kbd>M</kbd> 음소거', 'keys');
    const cl = $('div', 'cards', hud, '', 'cards-l'), cr = $('div', 'cards', hud, '', 'cards-r');
    for (let k = 0; k < 4; k++) {
      const c = $('div', 'card glass', k < 2 ? cl : cr, `<canvas class="face" data-k="${k}" width="192" height="192"></canvas><div class="meta"><div class="nm"></div><div class="sk"></div><div class="gauge"><i></i></div></div><div class="st"></div><div class="cnt"><span class="star on"></span><b></b></div><div class="crown"></div>`);
      c.style.setProperty('--c', KINDS[k].css);
      cards.push({ el: c, nm: c.querySelector('.nm'), sk: c.querySelector('.sk'), g: c.querySelector('.gauge i'), st: c.querySelector('.st'), cnt: c.querySelector('.cnt b'), crown: c.querySelector('.crown') });
      const m = $('div', 'mark', hud, '<div class="who"></div><div class="pin"></div><div class="bar"><i></i></div><div class="sos"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="18" fill="rgba(10,14,42,0.8)" stroke="rgba(255,255,255,0.22)" stroke-width="5"/><circle class="tm" cx="22" cy="22" r="18" fill="none" stroke="#ff2e7e" stroke-width="5" stroke-dasharray="113.1"/><circle class="rs" cx="22" cy="22" r="11" fill="none" stroke="#35f2e0" stroke-width="5" stroke-dasharray="69.1"/></svg><div class="bang"></div></div>');
      m.style.setProperty('--c', KINDS[k].css);
      marks.push({ el: m, who: m.querySelector('.who'), bar: m.querySelector('.bar'), bi: m.querySelector('.bar i'), tm: m.querySelector('.tm'), rs: m.querySelector('.rs') });
    }
    for (let i = 0; i < 6; i++) toasts.push($('div', 'toast', hud));
    L.bubble = $('div', '', hud, '<b>DJ 여우</b><span></span>', 'bubble'); L.btext = L.bubble.querySelector('span');
    L.hint = $('div', 'glass', hud, '', 'hint');
    L.call = $('div', '', hud, '', 'callout');
    // -- title and lobby --
    const title = L.title = $('div', 'layer', ui, '', 'title');
    $('div', 'logo', title, lettering('팡팡 버디즈', ['#ff4fa8', '#ff4fa8', '#fff', '#ffc94d', '#ffc94d', '#ffc94d']) + '<div class="sub">PANG PANG BUDDIES</div><div class="tagline glass">DJ 여우가 돌리고 튕기는 디스코 팡팡, 넷이서 끝까지 버텨라!</div>');
    const seats = $('div', '', title, '', 'seats');
    for (let k = 0; k < 4; k++) {
      const e = $('div', 'seat glass', seats, `<canvas class="face" data-k="${k}" width="192" height="192"></canvas><div class="nm">${KINDS[k].name}<small>${KINDS[k].animal}</small></div><div class="sk">${KINDS[k].skill}</div><div class="tip">${KINDS[k].tip}</div><div class="who"></div>`);
      e.style.setProperty('--c', KINDS[k].css); seatEls.push({ el: e, who: e.querySelector('.who') });
    }
    L.prompt = $('div', '', title, '', 'prompt');
    $('div', 'glass', title, '혼자서도 OK, 빈자리는 봇이 채워요 · 키보드 2명(WASD + Space / 방향키 + Enter)과 게임패드 · 신호 "모여!" E · M 음소거', 'how');
    // -- panels and the cast line-up --
    L.panel = $('div', 'layer', ui, '<div class="box glass"></div>', 'panel'); L.box = L.panel.querySelector('.box');
    L.figs = $('div', 'layer', ui, '<h2 class="glass">팡팡 버디즈의 동물들</h2>', 'figs');
    for (let k = 0; k < 5; k++) figEls.push($('div', 'fig glass', L.figs, k < 4 ? `${KINDS[k].animal} ${KINDS[k].name}<small>${KINDS[k].skill}</small>` : `${DJ_INFO.name}<small>세고, 놀리고, 속인다</small>`));
  }
  const rows = (s, f, rank) => '<div class="rows">' + (rank ? s.animals.slice().sort((p, q) => q.stars - p.stars || q.rescues - p.rescues) : s.animals).map((a, i) => `<div class="row" style="--c:${KINDS[a.kind].css}">${rank ? `<div class="rank">${i + 1}위</div>${i === 0 && a.stars > 0 ? '<div class="crown"></div>' : ''}` : ''}<canvas class="face" data-k="${a.kind}" width="192" height="192"></canvas><div class="nm">${KINDS[a.kind].name}</div><div class="v">${f(a)}</div></div>`).join('') + '</div>';
  function panelHtml(scene, s) {
    const h = s.animals.find(a => a.dev), key = Input.label(h ? h.dev : 'kb1', 'skill');
    if (scene === 'pause') return ['', '<h1>일시정지</h1><table><tr><td>이동</td><td><kbd>WASD</kbd> <kbd>방향키</kbd> 스틱</td></tr><tr><td>스킬 (누르는 동안)</td><td><kbd>Space</kbd> <kbd>Enter</kbd> A 버튼</td></tr><tr><td>신호 "모여!"</td><td><kbd>E</kbd> <kbd>오른쪽 Shift</kbd> X 버튼</td></tr><tr><td>음소거</td><td><kbd>M</kbd></td></tr></table><div class="foot"><kbd>P</kbd> 또는 <kbd>Esc</kbd> 계속하기</div>'];
    if (scene === 'over') return ['', '<h1 class="bad">DJ 여우 승리!</h1><div class="line">' + s.round + '절에서 모두 떨어졌다. 여우가 배를 잡고 웃는다</div>' + rows(s, a => `별 <b>${a.stars}</b> · 구조 <b>${a.rescues}</b>${a.gone || a.mode === 'out' ? '<br>탈락' : ''}`) + '<div class="foot"><kbd>R</kbd> 또는 <kbd>Enter</kbd> 처음부터 다시</div>'];
    if (scene === 'results') return ['low', '<h1 class="good">DJ 여우 항복!</h1>' + `<div class="line">팀 별 ${s.score}개 · 구조 ${s.rescues}회 · 별을 가장 많이 모은 동물은?</div>` + rows(s, a => `별 <b>${a.stars}</b> · 구조 <b>${a.rescues}</b>${a.gone || a.mode === 'out' ? '<br>탈락' : ''}`, true) + '<div class="foot"><kbd>Enter</kbd> 처음으로</div>'];
    if (scene === 'play' && s.result && ((s.phase === 'clear' && s.phaseT > 0.9) || s.phase === 'rest')) {
      const left = s.phase === 'rest' ? Math.max(0, Math.ceil(tune.rest_seconds - s.phaseT)) : Math.ceil(tune.rest_seconds);
      return ['top', `<h1 class="good">${s.result.round}절 클리어!</h1><div class="line">생존 ${s.result.alive} / 4 · 팀 별 ${s.score}개 · 구조 ${s.rescues}회</div>` + rows(s, a => `별 <b>${a.stars}</b> · 구조 <b>${a.rescues}</b>${a.gone || a.mode === 'out' ? '<br>탈락' : ''}`, true) +
        `<div class="foot">${s.result.last ? '결과 발표까지' : '다음 곡까지'} ${left}초 · <kbd>${key}</kbd> 바로 넘기기</div>`];
    }
    return null;
  }

  function draw(v) {
    const { scene, state: s, lobby } = v, playish = scene === 'play' || scene === 'pause' || scene === 'over';
    set(L.hud, 'cls', 'layer' + (playish ? ' on' : '')); set(L.title, 'cls', 'layer' + (scene === 'title' ? ' on' : '') + (lobby.players.length ? ' lobby' : '')); set(L.figs, 'cls', 'layer' + (scene === 'figures' ? ' on' : ''));
    const ph = panelHtml(scene, s); set(L.panel, 'cls', 'layer' + (ph ? ' on ' + ph[0] : '')); if (ph && L.box._html !== ph[1]) { set(L.box, 'html', ph[1]); paint(L.box); }
    const rigs = World.rigs();
    if (playish) {
      const frac = 1 - s.timeLeft / tune.round_seconds;
      set(L.ttl, 'html', `<b>ROUND ${s.round}</b>${SONGS[s.round - 1]}`); set(L.fill, 'width', (frac * 100).toFixed(1) + '%'); set(L.head, 'left', (frac * 100).toFixed(1) + '%');
      set(L.time, 'text', mmss(s.timeLeft)); set(L.song, 'cls', 'glass' + (s.phase === 'run' && s.timeLeft < 10 ? ' low' : ''));
      set(L.rlab, 'text', `ROUND ${s.round} / ${s.rounds}`); set(L.rstars, 'html', `<span class="star on"></span> 팀 별 <b>${s.score}</b>`);
      for (let k = 0; k < 4; k++) {
        const a = s.animals[k], c = cards[k], K = KINDS[k], using = a.hold || a.mode === 'fly';
        set(c.nm, 'html', `${K.name}<span class="tag${a.dev ? '' : ' bot'}">${a.dev ? 'P' + a.pl : 'BOT'}</span>`);
        set(c.sk, 'html', K.skill + (a.dev ? ` <kbd>${Input.label(a.dev, 'skill')}</kbd>` : ''));
        set(c.g, 'width', (a.gauge * 100).toFixed(0) + '%'); set(c.cnt, 'text', String(a.stars));
        const top = Math.max(...s.animals.map(o => o.stars)); set(c.crown, 'display', top > 0 && a.stars === top && s.animals.filter(o => o.stars === top).length === 1 ? 'block' : 'none');
        set(c.el, 'cls', 'card glass' + (using ? ' use' : '') + (a.tired > 0 ? ' tired' : '') + (a.mode === 'hang' ? ' hang' : '') + (a.mode === 'out' || a.mode === 'fall' ? ' out' : ''));
        set(c.st, 'text', a.mode === 'hang' ? '매달림 ' + Math.max(0, a.hangT).toFixed(1) : a.mode === 'out' || a.mode === 'fall' ? '탈락' : '');
        const m = marks[k], rp = rigs[k].root.position, p = World.project(rp.x, rp.y + K.head + 0.3, rp.z), on = p.vis && a.mode !== 'out';
        set(m.el, 'display', on ? 'block' : 'none');
        if (on) {
          m.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
          set(m.el, 'cls', 'mark' + (a.mode === 'hang' ? ' hang' : '') + (a.tired > 0 ? ' tired' : ''));
          set(m.who, 'text', a.dev ? 'P' + a.pl : ''); set(m.who, 'display', a.dev ? 'block' : 'none');
          set(m.bar, 'display', (a.gauge < 0.995 || using) && a.mode !== 'hang' ? 'block' : 'none'); set(m.bi, 'width', (a.gauge * 100).toFixed(0) + '%');
          if (a.mode === 'hang') { m.tm.style.strokeDashoffset = (113.1 * (1 - Math.max(0, a.hangT) / a.hangMax)).toFixed(1); m.rs.style.strokeDashoffset = (69.1 * (1 - Math.min(1, a.rescue))).toFixed(1); }
        }
      }
      for (let i = 0; i < toasts.length; i++) {
        const tt = s.toasts[i], e = toasts[i];
        if (!tt) { set(e, 'display', 'none'); continue; }
        const p = World.project(tt.x, tt.h + tt.t * 1.3, tt.z);
        set(e, 'display', p.vis ? 'block' : 'none'); set(e, 'text', tt.text); set(e, 'color', KINDS[tt.c].css);
        e.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -50%) scale(${(1 + Math.max(0, 0.25 - tt.t) * 2).toFixed(2)})`; e.style.opacity = Math.min(1, (1.4 - tt.t) * 3).toFixed(2);
      }
      if (s.callout.n !== lastCall) {
        lastCall = s.callout.n; const kind = s.callout.kind === 'go' ? 'start' : s.callout.kind;
        if (s.callout.text === '팡!') L.call.innerHTML = lettering('팡!', ['#ff4fa8', '#ffc94d']); else L.call.textContent = s.callout.text;
        L.call.className = kind; callT0 = v.t;
      }
      const age = (v.t - callT0) / 0.95;
      if (age >= 0 && age < 1) {
        const sc = age < 0.16 ? 0.3 + 0.9 * (age / 0.16) : age < 0.28 ? 1.2 - 0.2 * ((age - 0.16) / 0.12) : 1, op = age < 0.1 ? age / 0.1 : age > 0.76 ? 1 - (age - 0.76) / 0.24 : 1;
        L.call.style.opacity = op.toFixed(2); L.call.style.transform = `translate(-50%, ${(-50 - Math.max(0, age - 0.76) * 50).toFixed(1)}%) scale(${sc.toFixed(3)}) rotate(${(age < 0.16 ? -8 + 11 * (age / 0.16) : age < 0.28 ? 3 - 5 * ((age - 0.16) / 0.12) : -2).toFixed(1)}deg)`;
      } else if (L.call.style.opacity !== '0') L.call.style.opacity = '0';
      const bp = World.project(2.3, 2.5, -11.2), sayOn = !!s.dj.say && scene === 'play' && !ph;
      set(L.bubble, 'cls', sayOn ? 'on' : ''); if (s.dj.say) set(L.btext, 'text', s.dj.say);
      L.bubble.style.left = Math.min(innerWidth * 0.62, bp.x).toFixed(0) + 'px'; L.bubble.style.top = (Math.max(innerHeight * 0.2, bp.y) - L.bubble.offsetHeight).toFixed(0) + 'px';
      const hintOn = !!s.hint && s.phase === 'run' && scene === 'play'; set(L.hint, 'cls', 'glass' + (hintOn ? ' on' : '')); if (s.hint) set(L.hint, 'text', s.hint);
    } else lastCall = s.callout ? s.callout.n : lastCall;
    if (scene === 'title') {
      for (let k = 0; k < 4; k++) {
        const i = lobby.players.findIndex(p => p.kind === k), p = lobby.players[i], e = seatEls[k];
        set(e.el, 'cls', 'seat glass' + (p ? ' mine' : '') + (p && p.ready ? ' ready' : ''));
        set(e.who, 'text', p ? `P${i + 1} · ${Input.label(p.dev, 'move')}${p.ready ? ' · 준비 완료!' : ''}` : 'BOT');
      }
      const n = lobby.players.length, all = n > 0 && lobby.players.every(p => p.ready);
      set(L.prompt, 'html', !n ? '<kbd>Space</kbd> 또는 <kbd>Enter</kbd>를 눌러 참가' : all ? '출발합니다!' : '<kbd>A</kbd> <kbd>D</kbd> 또는 방향키로 동물 고르기 · 스킬 키를 한 번 더 눌러 준비');
    }
    if (scene === 'figures') {
      for (let k = 0; k < 5; k++) {
        const pos = k < 4 ? rigs[k].root.position : { x: 5.3, y: 0, z: 0.9 }, p = World.project(pos.x, -0.25, pos.z);
        figEls[k].style.left = p.x.toFixed(0) + 'px'; figEls[k].style.top = p.y.toFixed(0) + 'px';
      }
    }
  }
  return { init, draw };
})();

// ==== loop ====
'use strict';
// ---- Scenes: title (with the lobby), play, pause, over, results, and figures for the check ----
let scene, state, viewT = 0, lastRT = 0, camFrom = null, camT = 9, lobbyK = 0;
const lobby = { players: [], startT: -1 };   // players: { dev, kind, ready }
let demo = null, lineup = null;
function seats() { // four animals; whoever joined holds one, bots hold the rest
  const list = lobby.players.length ? lobby.players : [{ dev: 'kb1', kind: 0 }];
  return [0, 1, 2, 3].map(k => { const i = list.findIndex(p => p.kind === k); return i >= 0 ? { dev: list[i].dev, pl: i + 1 } : { dev: '', pl: 0 }; });
}
function reset() {
  seed = Number(params.get('seed')) || CONFIG.seed;
  state = Sim.newState(seats()); // state.gained: what this run gained, the high the ending shows
  const r0 = Number(params.get('round')); if (r0 === 2 || r0 === 3) Sim.startRound(state, r0); // ?round=2 or 3: open on a later song
}
function freeKind(from, dir) { for (let n = 1; n <= 4; n++) { const k = (from + dir * n + 8) % 4; if (!lobby.players.some(p => p.kind === k)) return k; } return from; }
const scenes = {
  figures: {
    update(dt) { state.t += dt; },
    cam: 'lineup',
  },
  title: {
    update(dt) {
      Sim.stepDemo(demo, dt); state = demo; Snd.tick(demo.t, demo.dj.bpm, 0);
      for (const dev of Input.devices()) {
        const c = Input.read(dev), p = lobby.players.find(q => q.dev === dev);
        if (!p) { if (c.skillHit && lobby.players.length < 4) { lobby.players.push({ dev, kind: freeKind(3, 1), ready: false }); Snd.play('join'); } continue; }
        if (c.skillHit) { p.ready = !p.ready; Snd.play(p.ready ? 'ready' : 'ui'); }
        else if (!p.ready && (c.lfHit || c.rtHit)) { p.kind = freeKind(p.kind, c.rtHit ? 1 : -1); Snd.play('ui'); }
        else if (c.sigHit) { if (p.ready) p.ready = false; else lobby.players.splice(lobby.players.indexOf(p), 1); Snd.play('ui'); }
      }
      const all = lobby.players.length > 0 && lobby.players.every(p => p.ready);
      if (!all) lobby.startT = -1; else if (lobby.startT < 0) lobby.startT = 0.7;
      if (lobby.startT >= 0) { lobby.startT -= dt; if (lobby.startT <= 0) { lobby.startT = -1; reset(); scene = 'play'; camFrom = 'title'; camT = 0; Snd.play('horn'); } }
    },
    cam: 'title',
  },
  play: {
    update(dt) {
      if (pressed('KeyP') || pressed('Escape')) { scene = 'pause'; return; }
      Sim.step(state, dt);
      Snd.tick(state.t, state.dj.bpm, state.phase === 'run' ? state.round : state.phase === 'intro' ? 1 : 0);
      if (state.phase === 'fail' && state.phaseT > 2.2) scene = 'over';
      if (state.done) { scene = 'results'; camFrom = 'play'; camT = 0; Snd.play('horn'); }
    },
    cam: 'play',
  },
  pause: {
    update() { if (pressed('KeyP') || pressed('Escape')) scene = 'play'; },
    cam: 'play',
  },
  over: {
    update(dt) {
      Sim.step(state, dt);
      if (pressed('KeyR') || pressed('Enter') || pressed('Space')) { reset(); scene = 'play'; Snd.play('horn'); }
    },
    cam: 'play',
  },
  results: {
    update(dt) {
      Sim.step(state, dt); Snd.tick(state.t, state.dj.bpm, 1);
      if (state.phaseT > 1 && (pressed('Enter') || pressed('Space'))) { lobby.players.forEach(p => { p.ready = false; }); scene = 'title'; camFrom = 'win'; camT = 0; }
    },
    cam: 'win',
  },
};

// ---- Loop: fixed step, frame time clamped ---------------------------------------------
function step() {
  if (pressed('KeyM')) { setMuted(!muted); hit.delete('KeyM'); }
  Input.poll();
  scenes[scene].update(STEP); hit.clear();
  if (scene !== 'pause') { viewT += STEP; camT += STEP; }
}
let last, acc = 0, ALPHA = 1; // ALPHA: how far the frame is between the last two steps
function tick() {
  const now = clock.now();
  acc += Math.min(now - last, 0.25); last = now; // a stall never fast-forwards the game
  while (acc >= STEP) { step(); acc -= STEP; }
  ALPHA = acc / STEP; // draw between steps, so the view never judders
  drawFrame();
}
function drawFrame() {
  const rt = viewT + (scene === 'pause' ? 0 : ALPHA * STEP), dt = Math.max(0, Math.min(1.5, rt - lastRT)); lastRT = rt; // effects keep time even when frames are far apart
  const blendDur = camFrom === 'title' ? 2.6 : 1.6;
  lobbyK += ((scene === 'title' && lobby.players.length ? 1 : 0) - lobbyK) * Math.min(1, dt * 5);
  World.frame({ state, t: rt, dt, cam: scenes[scene].cam, camFrom: camT < blendDur ? camFrom : null, blend: Math.min(1, camT / blendDur), lobby: lobbyK });
  Hud.draw({ scene, state, lobby, t: rt });
}
function frame() { tick(); requestAnimationFrame(frame); }
// A headless browser on a time budget runs timers but almost no animation frames: a timer
// ticks when no frame has come for 100 ms on a visible page; a hidden tab stays paused.
function timer() { if (document.visibilityState === 'visible' && clock.now() - last > 0.1) tick(); }

// ---- What a check can read and drive (?manual=1 stops the loop; players never see it) ----
window.game = {
  get scene() { return scene; },
  get state() { return state; },
  press(code) { hit.add(code); },
  hold(code, on) { on ? down.add(code) : down.delete(code); },
  get events() { return events; }, // the loop steps; a check empties it
  step(n = 1, draw = true, alpha = 1) {
    for (let i = 0; i < n; i++) step();
    if (draw) { ALPHA = alpha; drawFrame(); }
  },
};

World.init(document.getElementById('game'));
Hud.init(World.portraits());
addEventListener('resize', () => World.resize());
seed = Number(params.get('seed')) || CONFIG.seed;
demo = Sim.demoState(); lineup = Sim.lineupState();
scene = params.get('scene') || 'title';
if (!scenes[scene]) scene = 'title';
if (scene === 'figures') state = lineup; else if (scene === 'title') state = demo; else reset();
last = clock.now();
if (params.get('manual') === '1') drawFrame();
else { requestAnimationFrame(frame); setInterval(timer, 50); }
