// PROTOTYPE - NOT FOR PRODUCTION
// Question: DJ의 예고를 읽고 동물 스킬로 서로를 구하는 60초가, 봇과 혼자 해도 여럿이 해도 웃기고 다시 하고 싶은가?
// Date: 2026-11-19
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
