// PROTOTYPE - NOT FOR PRODUCTION
// Question: DJ의 예고를 읽고 동물 스킬로 서로를 구하는 60초가, 봇과 혼자 해도 여럿이 해도 웃기고 다시 하고 싶은가?
// Date: 2026-11-19
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
