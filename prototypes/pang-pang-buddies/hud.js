// PROTOTYPE - NOT FOR PRODUCTION
// Question: DJ의 예고를 읽고 동물 스킬로 서로를 구하는 60초가, 봇과 혼자 해도 여럿이 해도 웃기고 다시 하고 싶은가?
// Date: 2026-11-19
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
    if (scene === 'over') return ['', '<h1 class="bad">전원 탈락!</h1><div class="line">DJ 여우가 배를 잡고 웃는다. 한 번 더?</div>' + rows(s, a => `별 <b>${a.stars}</b> · 구조 <b>${a.rescues}</b>`) + '<div class="foot"><kbd>R</kbd> 또는 <kbd>Enter</kbd> 이번 곡 다시</div>'];
    if (scene === 'results') return ['low', '<h1 class="good">DJ 여우 항복!</h1>' + `<div class="line">팀 별 ${s.score}개 · 구조 ${s.rescues}회 · 별을 가장 많이 모은 동물은?</div>` + rows(s, a => `별 <b>${a.stars}</b> · 구조 <b>${a.rescues}</b>`, true) + '<div class="foot"><kbd>Enter</kbd> 처음으로</div>'];
    if (scene === 'play' && s.result && ((s.phase === 'clear' && s.phaseT > 0.9) || s.phase === 'rest')) {
      const left = s.phase === 'rest' ? Math.max(0, Math.ceil(tune.rest_seconds - s.phaseT)) : Math.ceil(tune.rest_seconds);
      return ['top', `<h1 class="good">${s.result.round}절 클리어!</h1><div class="line">생존 ${s.result.alive} / 4 · 팀 별 ${s.score}개 · 구조 ${s.rescues}회</div>` + rows(s, a => `별 <b>${a.stars}</b> · 구조 <b>${a.rescues}</b>`, true) +
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
