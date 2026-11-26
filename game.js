// ================================================================
//  MANCALA — PewPlay
//  @bg #2b1b12
//  @accent #e9a23b
//  Regole Kalah: 6 buche per lato, 4 semi. Turno extra nel granaio,
//  cattura sulle buche vuote. Semina animata seme per seme.
//  Indici: 0-5 buche giocatore, 6 granaio giocatore, 7-12 avversario, 13 granaio avversario.
// ================================================================
(function () {
  'use strict';
  const { rand, sfx, store } = PP;

  const GAME_ID = 'mancala';
  const MODES = ['vs Computer', '2 Players'];
  const LEVELS = ['Easy', 'Medium', 'Hard'];
  const DEPTH = [1, 4, 8];
  const SEED_COLS = ['#e94f4f', '#3fb6e8', '#f2c14e', '#6fd06b', '#b57bef', '#ff8f3f'];

  let mode = 0, level = 1, seedsPer = 4;
  let pits, turn, sowing, aiTimer, done, msg, msgT;
  let seeds = [];     // { pit, ox, oy, col, x, y } posizioni visive
  let geo;

  // ── REGOLE ──────────────────────────────────────
  const store1 = p => (p === 1 ? 6 : 13);
  const side = (p, i) => (p === 1 ? i >= 0 && i <= 5 : i >= 7 && i <= 12);
  function simulate(b, p, i) {
    let n = b[i]; b[i] = 0; let k = i;
    while (n > 0) { k = (k + 1) % 14; if (k === store1(3 - p)) continue; b[k]++; n--; }
    let extra = k === store1(p);
    if (side(p, k) && b[k] === 1) { const opp = 12 - k; if (b[opp] > 0) { b[store1(p)] += b[opp] + 1; b[opp] = 0; b[k] = 0; } }
    return { last: k, extra };
  }
  const sideEmpty = (b, p) => (p === 1 ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12]).every(i => !b[i]);
  function sweep(b) { for (let i = 0; i < 6; i++) { b[6] += b[i]; b[i] = 0; } for (let i = 7; i < 13; i++) { b[13] += b[i]; b[i] = 0; } }
  const valid = (b, p) => (p === 1 ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12]).filter(i => b[i] > 0);

  function minimax(b, depth, alpha, beta, p) {
    if (sideEmpty(b, 1) || sideEmpty(b, 2)) { const c = b.slice(); sweep(c); return (c[13] - c[6]) * 100; }
    if (depth === 0) return b[13] - b[6];
    let best = p === 2 ? -Infinity : Infinity;
    for (const i of valid(b, p)) {
      const c = b.slice(); const r = simulate(c, p, i);
      const v = minimax(c, depth - 1, alpha, beta, r.extra ? p : 3 - p);
      if (p === 2) { best = Math.max(best, v); alpha = Math.max(alpha, v); } else { best = Math.min(best, v); beta = Math.min(beta, v); }
      if (beta <= alpha) break;
    }
    return best;
  }
  function aiMove() {
    const opts = PP.shuffle(valid(pits, 2));
    if (level === 0 && Math.random() < 0.5) return opts[0];
    let best = opts[0], bv = -Infinity;
    for (const i of opts) { const c = pits.slice(); const r = simulate(c, 2, i); const v = minimax(c, DEPTH[level] - 1, -Infinity, Infinity, r.extra ? 2 : 1) + (r.extra ? 0.5 : 0); if (v > bv) { bv = v; best = i; } }
    return best;
  }

  // ── GEOMETRIA ───────────────────────────────────
  function layout() {
    const W = PP.W, H = PP.H, top = 64;
    const vertical = H > W * 1.15;   // in verticale la tavola viene ruotata
    const longSide = vertical ? H - top - 20 : W - 24;
    const shortSide = vertical ? W - 24 : H - top - 30;
    const unit = Math.min(longSide / 8.4, shortSide / 2.9);
    const bw = unit * 8.4, bh = unit * 2.9;
    geo = { unit, vertical, bw, bh, cx: W / 2, cy: top + (H - top) / 2 };
  }
  // centro di una buca in coordinate schermo
  function pitPos(i) {
    const { unit, vertical, cx, cy } = geo;
    let lx, ly; // coordinate "orizzontali" con l'origine al centro tavola
    if (i === 6) { lx = 3.55; ly = 0; }
    else if (i === 13) { lx = -3.55; ly = 0; }
    else if (i < 6) { lx = -2.5 + i; ly = 0.68; }
    else { lx = 2.5 - (i - 7); ly = -0.68; }
    lx *= unit; ly *= unit;
    return vertical ? { x: cx - ly, y: cy + lx } : { x: cx + lx, y: cy + ly };
  }
  const pitR = i => (i === 6 || i === 13 ? geo.unit * 0.42 : geo.unit * 0.42);

  function placeSeeds() {
    // assegna a ogni seme una posizione nella sua buca
    const counts = Array(14).fill(0);
    for (const s of seeds) {
      const k = counts[s.pit]++;
      const big = s.pit === 6 || s.pit === 13;
      const a = k * 2.4, rr = Math.min(1, Math.sqrt(k) * 0.24) * (big ? 1 : 0.8);
      let ox = Math.cos(a) * rr, oy = Math.sin(a) * rr;
      if (big) oy *= 1.9;
      if (big && geo.vertical) [ox, oy] = [oy, ox];
      s.ox = ox; s.oy = oy;
    }
  }

  function start() {
    layout();
    pits = [seedsPer, seedsPer, seedsPer, seedsPer, seedsPer, seedsPer, 0, seedsPer, seedsPer, seedsPer, seedsPer, seedsPer, seedsPer, 0];
    seeds = [];
    for (let i = 0; i < 14; i++) for (let k = 0; k < pits[i]; k++) seeds.push({ pit: i, col: PP.pick(SEED_COLS), x: 0, y: 0, ox: 0, oy: 0 });
    placeSeeds();
    for (const s of seeds) { const p = pitPos(s.pit); s.x = p.x + s.ox * pitR(s.pit); s.y = p.y + s.oy * pitR(s.pit); }
    turn = 1; sowing = null; aiTimer = 0; done = false; msg = ''; msgT = 0;
  }

  // ── SEMINA ANIMATA ──────────────────────────────
  function play(i) {
    if (sowing || done || !pits[i] || !side(turn, i)) return;
    const hand = seeds.filter(s => s.pit === i);
    sowing = { from: i, hand, k: i, t: 0, p: turn };
    pits[i] = 0;
    sfx.tone(380, 0.05, 'triangle', 0.1);
  }

  function stepSow() {
    const so = sowing;
    let k = so.k;
    do { k = (k + 1) % 14; } while (k === store1(3 - so.p));
    so.k = k;
    const s = so.hand.shift();
    s.pit = k; pits[k]++;
    sfx.tone(500 + so.hand.length * 25, 0.04, 'sine', 0.1);
    placeSeeds();
    if (!so.hand.length) endSow();
  }

  function endSow() {
    const p = sowing.p, k = sowing.k;
    sowing = null;
    let extra = k === store1(p);
    if (side(p, k) && pits[k] === 1 && pits[12 - k] > 0) {
      const opp = 12 - k, gain = pits[opp] + 1;
      for (const s of seeds) if (s.pit === opp || s.pit === k) s.pit = store1(p);
      pits[store1(p)] += gain; pits[opp] = 0; pits[k] = 0;
      placeSeeds();
      showMsg(`Capture! +${gain}`);
      const pp = pitPos(store1(p));
      PP.burst(pp.x, pp.y, ['#ffd166', '#fff'], 18, 180, 3, 0.7, 0);
      sfx.chord([523, 659, 784], 0.15, 'triangle', 0.12, 0.05);
    }
    if (sideEmpty(pits, 1) || sideEmpty(pits, 2)) {
      for (const s of seeds) if (s.pit < 6) s.pit = 6; else if (s.pit > 6 && s.pit < 13) s.pit = 13;
      sweep(pits); placeSeeds();
      return finish();
    }
    if (extra) { showMsg('Extra turn!'); sfx.chord([660, 990], 0.12, 'triangle', 0.1, 0.05); }
    else turn = 3 - turn;
    if (mode === 0 && turn === 2) aiTimer = 0.7;
  }

  function showMsg(m) { msg = m; msgT = 1.4; }

  function finish() {
    done = true;
    const a = pits[6], b = pits[13];
    const w = a > b ? 1 : b > a ? 2 : 3;
    const key = `stats-${level}`, st = store.get(key, { w: 0, l: 0 });
    if (mode === 0) { if (w === 1) st.w++; if (w === 2) st.l++; store.set(key, st); }
    if (w === 2 && mode === 0) sfx.lose(); else sfx.win();
    const title = w === 3 ? 'Draw!' : mode === 1 ? `${w === 1 ? 'Player 1' : 'Player 2'} wins!` : w === 1 ? 'You win!' : 'Computer wins';
    PP.game.overDelay = 1200;
    PP.over(title, `${a} – ${b}${mode === 0 ? `\n${LEVELS[level]}: ${st.w} wins · ${st.l} losses` : ''}`);
  }

  function update(dt) {
    msgT = Math.max(0, msgT - dt);
    if (sowing) { sowing.t += dt; if (sowing.t > 0.16) { sowing.t = 0; stepSow(); } }
    else if (!done && mode === 0 && turn === 2) { aiTimer -= dt; if (aiTimer <= 0) play(aiMove()); }
    // i semi scivolano verso il loro posto
    for (const s of seeds) {
      const p = pitPos(s.pit), r = pitR(s.pit);
      const tx = p.x + s.ox * r, ty = p.y + s.oy * r;
      s.x += (tx - s.x) * Math.min(1, dt * 14); s.y += (ty - s.y) * Math.min(1, dt * 14);
    }
    if (sowing) for (let i = 0; i < sowing.hand.length; i++) {
      const s = sowing.hand[i], p = pitPos(sowing.k);
      s.x += (p.x + (i % 3 - 1) * 6 - s.x) * Math.min(1, dt * 10); s.y += (p.y - geo.unit * 0.55 - Math.floor(i / 3) * 6 - s.y) * Math.min(1, dt * 10);
    }
  }

  // ── DISEGNO ─────────────────────────────────────
  function draw(ctx, W, H) {
    layout();
    const bg = ctx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, Math.max(W, H) * 0.7);
    bg.addColorStop(0, '#4a2f1d'); bg.addColorStop(1, '#1a0f08');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    if (!pits) return;
    const { unit, vertical, bw, bh, cx, cy } = geo;
    const w = vertical ? bh : bw, hh = vertical ? bw : bh;
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 12;
    const wood = ctx.createLinearGradient(cx - w / 2, cy - hh / 2, cx + w / 2, cy + hh / 2);
    wood.addColorStop(0, '#b8763f'); wood.addColorStop(0.5, '#9a5e2e'); wood.addColorStop(1, '#7d4a22');
    PP.rr(cx - w / 2, cy - hh / 2, w, hh, unit * 0.6); ctx.fillStyle = wood; ctx.fill(); ctx.restore();
    // venature
    ctx.save(); PP.rr(cx - w / 2, cy - hh / 2, w, hh, unit * 0.6); ctx.clip();
    ctx.strokeStyle = 'rgba(60,30,10,.18)'; ctx.lineWidth = 2;
    for (let k = -10; k < 10; k++) { ctx.beginPath(); if (vertical) { ctx.moveTo(cx + k * unit * 0.35, cy - hh / 2); ctx.bezierCurveTo(cx + k * unit * 0.35 + 20, cy, cx + k * unit * 0.35 - 20, cy, cx + k * unit * 0.35, cy + hh / 2); } else { ctx.moveTo(cx - w / 2, cy + k * unit * 0.35); ctx.bezierCurveTo(cx, cy + k * unit * 0.35 + 20, cx, cy + k * unit * 0.35 - 20, cx + w / 2, cy + k * unit * 0.35); } ctx.stroke(); }
    ctx.restore();

    const humanTurn = PP.state === 'playing' && !sowing && !done && (mode === 1 || turn === 1);
    for (let i = 0; i < 14; i++) {
      const p = pitPos(i), big = i === 6 || i === 13;
      ctx.save();
      const g = ctx.createRadialGradient(p.x, p.y - unit * 0.1, unit * 0.05, p.x, p.y, unit * 0.5);
      g.addColorStop(0, '#3a2010'); g.addColorStop(1, '#5e3418');
      ctx.fillStyle = g;
      if (big) { const ew = vertical ? unit * 1.15 : unit * 0.48, eh = vertical ? unit * 0.48 : unit * 1.15; PP.rr(p.x - ew, p.y - eh, ew * 2, eh * 2, unit * 0.45); ctx.fill(); PP.text(String(pits[i]), p.x, p.y + 2, unit * 0.75, 'rgba(255,231,194,.28)', 'center', 900); }
      else { ctx.beginPath(); ctx.arc(p.x, p.y, unit * 0.42, 0, 7); ctx.fill(); }
      if (humanTurn && side(turn, i) && pits[i]) { ctx.strokeStyle = 'rgba(255,209,102,.85)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, unit * 0.46, 0, 7); ctx.stroke(); }
      ctx.restore();
    }
    for (const s of seeds) {
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1.5;
      const r = Math.max(4, unit * 0.085);
      const g = ctx.createRadialGradient(s.x - r * 0.3, s.y - r * 0.4, r * 0.1, s.x, s.y, r);
      g.addColorStop(0, '#fff'); g.addColorStop(0.35, s.col); g.addColorStop(1, s.col);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, 7); ctx.fill(); ctx.restore();
    }
    // numeri delle buche piccole: fuori dalla buca, dal lato di chi la possiede
    for (let i = 0; i < 14; i++) {
      if (i === 6 || i === 13) continue;
      const p = pitPos(i), mine = i < 6 ? 1 : -1;
      const tx = vertical ? p.x - mine * unit * 0.62 : p.x, ty = vertical ? p.y : p.y + mine * unit * 0.62;
      PP.text(String(pits[i]), tx, ty, Math.max(13, unit * 0.26), '#ffe7c2', 'center', 800);
    }
    PP.drawFx();
    if (PP.state !== 'menu') {
      const name = p => (mode === 0 ? (p === 1 ? 'You' : 'Computer') : `Player ${p}`);
      PP.text(done ? 'Game over' : mode === 0 && turn === 2 ? 'Computer is thinking…' : `${mode === 0 ? 'Your' : `${name(turn)}'s`} turn`, 16, 30, 17, '#fff', 'left', 800);
      PP.text(`${name(1)} ${pits[6]} · ${name(2)} ${pits[13]}`, 16, 52, 12, 'rgba(255,255,255,.7)', 'left', 600);
      if (msgT > 0) { ctx.globalAlpha = Math.min(1, msgT * 2); PP.text(msg, cx, cy, Math.max(20, unit * 0.4), '#ffd166', 'center', 900); ctx.globalAlpha = 1; }
    }
  }

  function pointerDown(p) {
    if (sowing || done || (mode === 0 && turn === 2)) return;
    for (let i = 0; i < 14; i++) {
      if (i === 6 || i === 13) continue;
      const q = pitPos(i);
      if (Math.hypot(p.x - q.x, p.y - q.y) < geo.unit * 0.55) {
        if (side(turn, i) && pits[i]) play(i); else sfx.tone(170, 0.08, 'square', 0.06);
        return;
      }
    }
  }
  function keyDown(code) {
    const n = parseInt(code.replace('Digit', ''), 10);
    if (n >= 1 && n <= 6 && !(mode === 0 && turn === 2)) play(turn === 1 ? n - 1 : 13 - n);
  }

  function demo(n) {
    const sets = { 1: [5, 0, 6, 6, 5, 5, 2, 5, 5, 4, 0, 6, 5, 0], 2: [2, 7, 0, 3, 1, 4, 14, 0, 3, 5, 1, 2, 4, 6], 3: [4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0] }[n];
    pits = sets.slice(); seeds = [];
    for (let i = 0; i < 14; i++) for (let k = 0; k < pits[i]; k++) seeds.push({ pit: i, col: SEED_COLS[(i * 7 + k * 3) % 6], x: 0, y: 0 });
    placeSeeds();
    for (const s of seeds) { const p = pitPos(s.pit); s.x = p.x + s.ox * pitR(s.pit); s.y = p.y + s.oy * pitR(s.pit); }
    turn = 1; done = false; sowing = null;
    if (n === 2) { msg = 'Capture! +6'; msgT = 99; const pp = pitPos(6); PP.burst(pp.x, pp.y, ['#ffd166', '#fff'], 20, 120, 3, 2, 0); }
    if (n === 1) { msg = 'Extra turn!'; msgT = 99; }
    PP.game.update = (dt) => { for (const s of seeds) { const p = pitPos(s.pit), r = pitR(s.pit); s.x = p.x + s.ox * r; s.y = p.y + s.oy * r; } };
  }

  function icon(c, S) {
    c.fillStyle = '#3a2414'; c.fillRect(0, 0, S, S);
    const g = c.createLinearGradient(0, S * 0.3, 0, S * 0.7); g.addColorStop(0, '#b8763f'); g.addColorStop(1, '#7d4a22');
    c.fillStyle = g; c.beginPath(); c.roundRect(S * 0.16, S * 0.3, S * 0.68, S * 0.4, S * 0.1); c.fill();
    const holes = [[0.33, 0.42], [0.5, 0.42], [0.67, 0.42], [0.33, 0.58], [0.5, 0.58], [0.67, 0.58]];
    holes.forEach(([x, y], i) => {
      c.fillStyle = '#3a2010'; c.beginPath(); c.arc(x * S, y * S, S * 0.065, 0, 7); c.fill();
      for (let k = 0; k < 3; k++) { c.fillStyle = SEED_COLS[(i + k) % 6]; c.beginPath(); c.arc(x * S + Math.cos(k * 2.1) * S * 0.022, y * S + Math.sin(k * 2.1) * S * 0.022, S * 0.018, 0, 7); c.fill(); }
    });
  }

  const realUpdate = update;
  PP.run({
    id: GAME_ID,
    title: 'Mancala',
    intro: 'Sow seeds around the board and collect the most in your store.\nLand in your store for an extra turn; land in an empty pit to capture.',
    choices: () => [
      { label: 'Opponent', options: MODES, value: mode, onChange: i => { mode = i; store.set('mode', i); PP.showMain(); } },
      ...(mode === 0 ? [{ label: 'Difficulty', options: LEVELS, value: level, onChange: i => { level = i; store.set('level', i); PP.showMain(); } }] : []),
      { label: 'Seeds per pit', options: ['3', '4', '5', '6'], value: seedsPer - 3, onChange: i => { seedsPer = i + 3; store.set('seeds', seedsPer); } },
    ],
    bestText: () => { if (mode) return ''; const st = store.get(`stats-${level}`, { w: 0, l: 0 }); return `${LEVELS[level]}: ${st.w} wins · ${st.l} losses`; },
    pauseText: () => `${pits[6]} – ${pits[13]}`,
    init() { mode = store.get('mode', 0); level = store.get('level', 1); seedsPer = store.get('seeds', 4); start(); },
    start() { PP.game.update = realUpdate; PP.game.overDelay = 650; start(); },
    update, draw, pointerDown, keyDown, demo, icon,
    resize: layout,
  });
})();
