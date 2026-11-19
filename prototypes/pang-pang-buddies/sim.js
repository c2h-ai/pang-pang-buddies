// PROTOTYPE - NOT FOR PRODUCTION
// Question: DJ의 예고를 읽고 동물 스킬로 서로를 구하는 60초가, 봇과 혼자 해도 여럿이 해도 웃기고 다시 하고 싶은가?
// Date: 2026-11-19
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
