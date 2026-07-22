/* Brutal Bowl Arena — an original top-down arcade ball game for the league.
   Inspired by the *feel* of classic 16-bit future-sports games; all code and
   art here are original. Team data comes from the league pages (teams.js). */

'use strict';

/* ---------- persistence ---------- */
const SAVE_KEY = 'brutalbowl_save_v1';

function defaultSave() {
  return { teamId: null, credits: 20, upgrades: {}, results: [], round: 0 };
}
let save = loadSave();
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && typeof s === 'object' && Array.isArray(s.results)) return s;
  } catch (e) { /* corrupted save -> start fresh */ }
  return defaultSave();
}
function persist() { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); }

/* ---------- helpers ---------- */
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const rand = (a, b) => a + Math.random() * (b - a);

function teamById(id) { return TEAMS.find(t => t.id === id); }

function playerStat(teamId, p, key) {
  const up = (save.teamId === teamId && save.upgrades[p.name]) || {};
  return clamp(p[key] + (up[key] || 0), 1, 10);
}

function teamPower(t) {
  return t.roster.reduce((s, p) =>
    s + playerStat(t.id, p, 'sp') + playerStat(t.id, p, 'ag') +
        playerStat(t.id, p, 'st') + playerStat(t.id, p, 'to'), 0) / t.roster.length;
}

/* ---------- screens ---------- */
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

/* ---------- fixtures: single round robin, 8 teams, 7 rounds ---------- */
function fixtures() {
  const ids = TEAMS.map(t => t.id);
  const rounds = [];
  const n = ids.length;
  const rot = ids.slice(1);
  for (let r = 0; r < n - 1; r++) {
    const pairs = [[ids[0], rot[0]]];
    for (let i = 1; i < n / 2; i++) pairs.push([rot[i], rot[n - 1 - i]]);
    rounds.push(pairs);
    rot.push(rot.shift());
  }
  return rounds;
}
const ROUNDS = fixtures();

function userFixture() {
  if (save.round >= ROUNDS.length) return null;
  return ROUNDS[save.round].find(p => p.includes(save.teamId));
}

function simScore(a, b) {
  // strength-weighted goal counts, Speedball-style tens
  const pa = teamPower(teamById(a)), pb = teamPower(teamById(b));
  const ga = Math.max(0, Math.round(rand(0, 2.4) + (pa - pb) * 0.35));
  const gb = Math.max(0, Math.round(rand(0, 2.4) + (pb - pa) * 0.35));
  return [ga * 10, gb * 10];
}

function recordResult(home, away, hs, as) {
  save.results.push({ round: save.round, home, away, hs, as });
}

function completeRound(userScore) {
  const fix = userFixture();
  const userHome = fix[0] === save.teamId;
  recordResult(fix[0], fix[1],
    userHome ? userScore[0] : userScore[1],
    userHome ? userScore[1] : userScore[0]);
  for (const [a, b] of ROUNDS[save.round]) {
    if (a === fix[0] && b === fix[1]) continue;
    const [sa, sb] = simScore(a, b);
    recordResult(a, b, sa, sb);
  }
  save.round++;
  persist();
}

function standings() {
  const table = {};
  TEAMS.forEach(t => table[t.id] = { id: t.id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });
  for (const r of save.results) {
    const H = table[r.home], A = table[r.away];
    H.p++; A.p++; H.gf += r.hs; H.ga += r.as; A.gf += r.as; A.ga += r.hs;
    if (r.hs > r.as) { H.w++; A.l++; H.pts += 3; }
    else if (r.hs < r.as) { A.w++; H.l++; A.pts += 3; }
    else { H.d++; A.d++; H.pts++; A.pts++; }
  }
  return Object.values(table).sort((x, y) =>
    y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf);
}

/* ---------- team select ---------- */
function renderSelect() {
  const grid = $('team-grid');
  grid.innerHTML = '';
  for (const t of TEAMS) {
    const avg = k => t.roster.reduce((s, p) => s + p[k], 0) / t.roster.length;
    const card = document.createElement('div');
    card.className = 'team-card';
    card.innerHTML = `
      <img src="${t.img}" alt="${t.race}" loading="lazy">
      <div class="tc-body">
        <div class="tc-race">${t.race}</div>
        <h3>${t.name}</h3>
        ${['sp', 'ag', 'st', 'to'].map(k => `
          <div class="statbar"><i style="width:${avg(k) * 10}%;background:${t.color2}"></i></div>`).join('')}
        <div class="statlabel"><span>SPD·AGI·STR·TGH</span><span>${teamPower(t).toFixed(1)}</span></div>
      </div>`;
    card.onclick = () => {
      if (save.teamId !== t.id) { save = defaultSave(); save.teamId = t.id; persist(); }
      renderManage(); show('screen-manage');
    };
    grid.appendChild(card);
  }
}

/* ---------- manage / gym ---------- */
function squadOf(team) {
  // 5 on the pitch: best anchor, two fastest, two best remaining
  const r = team.roster.slice();
  const stat = (p, k) => playerStat(team.id, p, k);
  r.sort((a, b) => stat(b, 'st') + stat(b, 'to') - stat(a, 'st') - stat(a, 'to'));
  const anchor = r.shift();
  r.sort((a, b) => stat(b, 'sp') + stat(b, 'ag') - stat(a, 'sp') - stat(a, 'ag'));
  const fast = r.splice(0, 2);
  r.sort((a, b) => ['sp','ag','st','to'].reduce((s,k)=>s+stat(b,k)-stat(a,k),0));
  return [anchor, ...fast, ...r.slice(0, 2)];
}

function renderManage() {
  const t = teamById(save.teamId);
  $('manage-img').src = t.img;
  $('manage-title').textContent = `${t.name} (${t.race})`;
  $('manage-lore').textContent = t.lore;
  $('manage-credits').textContent = save.credits;
  const squad = new Set(squadOf(t).map(p => p.name));
  const tbl = document.createElement('table');
  tbl.innerHTML = `<tr><th>Player</th><th>Role</th>
    <th>SPD</th><th>AGI</th><th>STR</th><th>TGH</th></tr>`;
  for (const p of t.roster) {
    const tr = document.createElement('tr');
    if (squad.has(p.name)) tr.className = 'squad';
    let cells = `<td>${p.name}</td><td>${p.role}</td>`;
    for (const k of ['sp', 'ag', 'st', 'to']) {
      const v = playerStat(t.id, p, k);
      const boosted = v > p[k] ? ' style="color:#59d6e6"' : '';
      cells += `<td class="stat-cell"><span${boosted}>${v}</span>
        <button class="plus" data-p="${p.name}" data-k="${k}"
          ${save.credits < 10 || v >= 10 ? 'disabled' : ''}>+</button></td>`;
    }
    tr.innerHTML = cells;
    tbl.appendChild(tr);
  }
  const box = $('roster');
  box.innerHTML = '';
  box.appendChild(tbl);
  box.querySelectorAll('.plus').forEach(b => b.onclick = () => {
    if (save.credits < 10) return;
    save.credits -= 10;
    const u = save.upgrades[b.dataset.p] = save.upgrades[b.dataset.p] || {};
    u[b.dataset.k] = (u[b.dataset.k] || 0) + 1;
    persist(); renderManage();
  });
  const fix = userFixture();
  if (fix) {
    const opp = teamById(fix[0] === save.teamId ? fix[1] : fix[0]);
    $('next-fixture').textContent =
      `Match day ${save.round + 1} of ${ROUNDS.length} — next opponent: ${opp.name} (${opp.race})`;
    $('btn-play').style.display = '';
  } else {
    $('next-fixture').textContent = 'Season complete! Check the league table, or reset from the title screen.';
    $('btn-play').style.display = 'none';
  }
}

/* ---------- league table ---------- */
function renderLeague() {
  const tbl = $('league-table');
  tbl.innerHTML = `<tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>Pts</th></tr>`;
  standings().forEach((s, i) => {
    const t = teamById(s.id);
    const tr = document.createElement('tr');
    if (s.id === save.teamId) tr.className = 'you';
    tr.innerHTML = `<td>${i + 1}</td><td>${t.name}</td><td>${s.p}</td><td>${s.w}</td>
      <td>${s.d}</td><td>${s.l}</td><td>${s.gf}</td><td>${s.ga}</td><td>${s.pts}</td>`;
    tbl.appendChild(tr);
  });
}

/* =========================================================
   MATCH ENGINE
   ========================================================= */
const W = 640, H = 960, WALL = 22, GOAL_W = 150;
const PR = 14, BR = 7;               // player / ball radius
// seconds per half (override for quick games with ?half=30 in the URL)
const HALF_LEN = Number(new URLSearchParams(location.search).get('half')) || 90;

const cv = $('pitch'), cx = cv.getContext('2d');

let M = null;                        // current match state
let keys = {};
let lastTime = 0;

addEventListener('keydown', e => {
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
  keys[e.key.toLowerCase()] = true;
  if (M && M.phase === 'play') {
    if (e.key === ' ') actionKey();
    if (e.key.toLowerCase() === 'x') shootKey();
    if (e.key.toLowerCase() === 'c') switchKey();
  }
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

function newPlayer(team, p, side, i, n) {
  const lane = (i + 1) / (n + 1);
  return {
    team, side,                       // side 0 = user (bottom, attacks top), 1 = cpu
    name: p.name, role: p.role,
    sp: playerStat(team.id, p, 'sp'), ag: playerStat(team.id, p, 'ag'),
    st: playerStat(team.id, p, 'st'), to: playerStat(team.id, p, 'to'),
    x: WALL + lane * (W - 2 * WALL),
    y: side === 0 ? H * (0.6 + 0.25 * (i % 2)) : H * (0.4 - 0.25 * (i % 2)),
    hx: 0, hy: 0, vx: 0, vy: 0,
    down: 0, lunge: 0, cooldown: 0, out: false,
  };
}

function startMatch() {
  const fix = userFixture();
  if (!fix) return;
  const userTeam = teamById(save.teamId);
  const oppTeam = teamById(fix[0] === save.teamId ? fix[1] : fix[0]);
  const A = squadOf(userTeam).map((p, i, arr) => newPlayer(userTeam, p, 0, i, arr.length));
  const B = squadOf(oppTeam).map((p, i, arr) => newPlayer(oppTeam, p, 1, i, arr.length));
  // away team wears a white change kit if the colors would clash
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const [cA, cB] = [rgb(userTeam.color), rgb(oppTeam.color)];
  const clash = Math.hypot(cA[0] - cB[0], cA[1] - cB[1], cA[2] - cB[2]) < 110;
  M = {
    kits: [
      { color: userTeam.color, color2: userTeam.color2 },
      clash ? { color: '#e8e8f0', color2: oppTeam.color }
            : { color: oppTeam.color, color2: oppTeam.color2 },
    ],
    teams: [userTeam, oppTeam],
    players: [...A, ...B],
    ball: { x: W / 2, y: H / 2, vx: 0, vy: 0, holder: null, freeCd: 0 },
    score: [0, 0], half: 1, clock: HALF_LEN,
    phase: 'kickoff', phaseT: 1.5,
    active: null, ticker: '', tickerT: 0,
  };
  M.active = nearestPlayer(0, M.ball);
  $('hud-home').textContent = userTeam.name;
  $('hud-away').textContent = oppTeam.name;
  updateHud();
  show('screen-match');
  ticker('MATCH DAY ' + (save.round + 1) + ' — GET READY');
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

function resetPositions() {
  const perSide = [M.players.filter(p => p.side === 0), M.players.filter(p => p.side === 1)];
  perSide.forEach((list, side) => {
    const alive = list.filter(p => !p.out);
    alive.forEach((p, i) => {
      const lane = (i + 1) / (alive.length + 1);
      p.x = WALL + lane * (W - 2 * WALL);
      p.y = side === 0 ? H * (0.62 + 0.2 * (i % 2)) : H * (0.38 - 0.2 * (i % 2));
      p.vx = p.vy = 0; p.down = 0; p.lunge = 0;
    });
  });
  Object.assign(M.ball, { x: W / 2, y: H / 2, vx: 0, vy: 0, holder: null, freeCd: 0 });
}

function ticker(msg) { M.ticker = msg; M.tickerT = 2.2; $('ticker').textContent = msg; }
function updateHud() {
  $('hud-score').textContent = `${M.score[0]} — ${M.score[1]}`;
  $('hud-clock').textContent = `${M.half === 1 ? '1st' : '2nd'} ${Math.ceil(M.clock)}`;
}

function nearestPlayer(side, pos, excludeDown = true) {
  let best = null, bd = 1e9;
  for (const p of M.players) {
    if (p.side !== side || p.out) continue;
    if (excludeDown && p.down > 0) continue;
    const d = dist(p, pos);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

/* ---------- user actions ---------- */
function actionKey() {
  const a = M.active;
  if (!a || a.down > 0) return;
  if (M.ball.holder === a) passBall(a);
  else { a.lunge = 0.28; }             // tackle lunge
}
function shootKey() {
  const a = M.active;
  if (a && M.ball.holder === a) shoot(a);
}
function switchKey() {
  const cands = M.players.filter(p => p.side === 0 && !p.out && p.down <= 0 && p !== M.active);
  if (!cands.length) return;
  cands.sort((p, q) => dist(p, M.ball) - dist(q, M.ball));
  M.active = cands[0];
}

/* ---------- ball mechanics ---------- */
function goalCenter(side) {           // goal this side attacks
  return side === 0 ? { x: W / 2, y: WALL } : { x: W / 2, y: H - WALL };
}

function passBall(p) {
  const mates = M.players.filter(q => q.side === p.side && q !== p && !q.out && q.down <= 0);
  if (!mates.length) return;
  const goal = goalCenter(p.side);
  mates.sort((a, b) => score(b) - score(a));
  function score(q) {
    const opp = nearestPlayer(1 - p.side, q);
    const open = opp ? Math.min(dist(q, opp), 200) : 200;
    const forward = (dist(p, goal) - dist(q, goal));
    return open * 1.2 + forward;
  }
  const t = mates[0];
  const d = dist(p, t) || 1;
  const speed = 7.5 + p.ag * 0.55;
  M.ball.holder = null;
  M.ball.freeCd = 0.18; M.ball.lastKick = p;
  M.ball.vx = (t.x - p.x) / d * speed + rand(-0.4, 0.4);
  M.ball.vy = (t.y - p.y) / d * speed + rand(-0.4, 0.4);
}

function shoot(p) {
  const goal = goalCenter(p.side);
  const d = dist(p, goal) || 1;
  const wobble = (d / 300) * (1.6 - p.ag * 0.12);
  M.ball.holder = null;
  M.ball.freeCd = 0.18; M.ball.lastKick = p;
  const speed = 11 + p.st * 0.4;
  M.ball.vx = (goal.x - p.x) / d * speed + rand(-wobble, wobble);
  M.ball.vy = (goal.y - p.y) / d * speed;
  ticker(p.name.toUpperCase() + ' SHOOTS!');
}

function dropBall(p, hard) {
  if (M.ball.holder !== p) return;
  M.ball.holder = null;
  M.ball.freeCd = 0.25; M.ball.lastKick = p;
  const ang = rand(0, Math.PI * 2), s = hard ? rand(3, 6) : rand(1.5, 3);
  M.ball.vx = Math.cos(ang) * s; M.ball.vy = Math.sin(ang) * s;
}

/* ---------- AI ---------- */
function aiSteer(p, tx, ty, dt) {
  const d = Math.hypot(tx - p.x, ty - p.y) || 1;
  const max = 1.6 + p.sp * 0.28;
  p.vx += ((tx - p.x) / d * max - p.vx) * Math.min(1, dt * 6);
  p.vy += ((ty - p.y) / d * max - p.vy) * Math.min(1, dt * 6);
}

function aiThink(p, dt) {
  const ball = M.ball, holder = ball.holder;
  const goal = goalCenter(p.side);
  if (holder === p) {
    // carrier: advance, dodge nearest tackler, consider pass / shot
    const threat = nearestPlayer(1 - p.side, p);
    let tx = goal.x + (p.x < W / 2 ? -80 : 80), ty = goal.y;
    if (threat && dist(p, threat) < 90) {
      tx += (p.x - threat.x) * 2.2; ty += (p.y - threat.y) * 0.6;
    }
    aiSteer(p, tx, ty, dt);
    if (p.side === 1 || p !== M.active) {          // AI decisions (not user-controlled carrier)
      const dGoal = dist(p, goal);
      if (dGoal < 300 && Math.random() < dt * (0.8 + p.ag * 0.1)) shoot(p);
      else if (threat && dist(p, threat) < 55 && Math.random() < dt * 3) passBall(p);
    }
    return;
  }
  if (holder && holder.side === p.side) {
    // support: spread ahead of carrier
    const off = (M.players.indexOf(p) % 2 ? -1 : 1) * (90 + (M.players.indexOf(p) % 3) * 55);
    aiSteer(p, clamp(holder.x + off, WALL + PR, W - WALL - PR),
               clamp(holder.y + (goal.y > H / 2 ? 130 : -130), WALL + PR, H - WALL - PR), dt);
    return;
  }
  if (holder) {
    // defend: two nearest chase, rest drop between ball and own goal
    const mates = M.players.filter(q => q.side === p.side && !q.out && q.down <= 0)
      .sort((a, b) => dist(a, holder) - dist(b, holder));
    if (mates.indexOf(p) < 2) aiSteer(p, holder.x, holder.y, dt);
    else {
      const own = goalCenter(1 - p.side);
      aiSteer(p, (holder.x + own.x) / 2 + (M.players.indexOf(p) % 3 - 1) * 70,
                 (holder.y + own.y) / 2, dt);
    }
    return;
  }
  // loose ball
  const mates = M.players.filter(q => q.side === p.side && !q.out && q.down <= 0)
    .sort((a, b) => dist(a, ball) - dist(b, ball));
  if (mates.indexOf(p) < 2) aiSteer(p, ball.x + ball.vx * 8, ball.y + ball.vy * 8, dt);
  else aiSteer(p, p.hx || p.x, p.hy || p.y, dt);
}

/* ---------- physics & rules ---------- */
function step(dt) {
  const B = M.ball;

  if (M.phase === 'kickoff' || M.phase === 'halftime' || M.phase === 'goal') {
    M.phaseT -= dt;
    if (M.phaseT <= 0) {
      if (M.phase === 'halftime') { M.half = 2; M.clock = HALF_LEN; M.players.forEach(p => p.out = false); }
      if (M.phase !== 'kickoff') resetPositions();
      M.phase = M.phase === 'kickoff' ? 'play' : 'kickoff';
      if (M.phase === 'kickoff') M.phaseT = 1.2;
    }
    if (M.phase !== 'play') { draw(); return; }
  }

  M.clock -= dt;
  if (M.clock <= 0) {
    if (M.half === 1) { M.phase = 'halftime'; M.phaseT = 2.5; ticker('HALF TIME'); updateHud(); return; }
    endMatch(); return;
  }

  // user input on active player
  const a = M.active;
  if (a && a.down <= 0 && !a.out) {
    let dx = (keys['arrowright'] || keys['d'] ? 1 : 0) - (keys['arrowleft'] || keys['a'] ? 1 : 0);
    let dy = (keys['arrowdown'] || keys['s'] ? 1 : 0) - (keys['arrowup'] || keys['w'] ? 1 : 0);
    const max = (1.6 + a.sp * 0.28) * (a.lunge > 0 ? 1.9 : 1);
    if (dx || dy) {
      const n = Math.hypot(dx, dy);
      a.vx += (dx / n * max - a.vx) * Math.min(1, dt * 8);
      a.vy += (dy / n * max - a.vy) * Math.min(1, dt * 8);
    } else if (a.lunge <= 0) { a.vx *= 0.85; a.vy *= 0.85; }
  }

  for (const p of M.players) {
    if (p.out) continue;
    if (p.down > 0) { p.down -= dt; p.vx = p.vy = 0; continue; }
    if (p.lunge > 0) p.lunge -= dt;
    if (p.cooldown > 0) p.cooldown -= dt;
    if (p !== M.active || p.side === 1) aiThink(p, dt);
    p.x = clamp(p.x + p.vx * dt * 60, WALL + PR, W - WALL - PR);
    p.y = clamp(p.y + p.vy * dt * 60, WALL + PR, H - WALL - PR);
    if (!p.hx) { p.hx = p.x; p.hy = p.y; }
  }

  // separate overlapping players + tackles
  for (let i = 0; i < M.players.length; i++) for (let j = i + 1; j < M.players.length; j++) {
    const p = M.players[i], q = M.players[j];
    if (p.out || q.out || p.down > 0 || q.down > 0) continue;
    const d = dist(p, q);
    if (d < PR * 2 && d > 0) {
      const push = (PR * 2 - d) / 2, nx = (q.x - p.x) / d, ny = (q.y - p.y) / d;
      p.x -= nx * push; p.y -= ny * push; q.x += nx * push; q.y += ny * push;
      if (p.side !== q.side) tryTackle(p, q) || tryTackle(q, p);
    }
  }

  // ball
  if (B.holder) {
    const h = B.holder;
    const v = Math.hypot(h.vx, h.vy) || 1;
    B.x = h.x + h.vx / v * (PR + 4); B.y = h.y + h.vy / v * (PR + 4);
    B.vx = h.vx; B.vy = h.vy;
  } else {
    if (B.freeCd > 0) B.freeCd -= dt;
    B.x += B.vx * dt * 60; B.y += B.vy * dt * 60;
    B.vx *= Math.pow(0.985, dt * 60); B.vy *= Math.pow(0.985, dt * 60);
    // goal check before wall bounce
    if (B.y < WALL + BR && Math.abs(B.x - W / 2) < GOAL_W / 2) return scoreGoal(0);
    if (B.y > H - WALL - BR && Math.abs(B.x - W / 2) < GOAL_W / 2) return scoreGoal(1);
    if (B.x < WALL + BR) { B.x = WALL + BR; B.vx = Math.abs(B.vx) * 0.85; }
    if (B.x > W - WALL - BR) { B.x = W - WALL - BR; B.vx = -Math.abs(B.vx) * 0.85; }
    if (B.y < WALL + BR) { B.y = WALL + BR; B.vy = Math.abs(B.vy) * 0.85; }
    if (B.y > H - WALL - BR) { B.y = H - WALL - BR; B.vy = -Math.abs(B.vy) * 0.85; }
    // pickup / catch
    for (const p of M.players) {
      if (p.out || p.down > 0) continue;
      if (B.freeCd > 0 && p === B.lastKick) continue;
      if (dist(p, B) < PR + BR + 2) {
        const catchProb = 0.55 + p.ag * 0.06;
        if (Math.random() < catchProb) {
          B.holder = p;
          if (p.side === 0 && M.active && M.active.side === 0) M.active = p;
        } else { B.vx = -B.vx * 0.6 + rand(-1, 1); B.vy = -B.vy * 0.6 + rand(-1, 1); B.freeCd = 0.2; B.lastKick = p; }
        break;
      }
    }
  }

  // auto-switch if active player is down/out
  if (!M.active || M.active.down > 0 || M.active.out) {
    M.active = nearestPlayer(0, B) || M.active;
  }

  if (M.tickerT > 0) { M.tickerT -= dt; if (M.tickerT <= 0) $('ticker').textContent = ''; }
  updateHud();
  draw();
}

function tryTackle(tackler, victim) {
  if (M.ball.holder !== victim || tackler.cooldown > 0) return false;
  tackler.cooldown = 0.6;
  let prob = 0.35 + (tackler.st - victim.st) * 0.08 + (tackler.lunge > 0 ? 0.25 : 0)
             - victim.ag * 0.02;
  prob = clamp(prob, 0.12, 0.9);
  if (Math.random() < prob) {
    dropBall(victim, true);
    victim.down = clamp(3.4 - victim.to * 0.25, 0.8, 3);
    if (tackler.st - victim.to >= -2 && Math.random() < 0.08) {
      victim.out = true;
      ticker('MEDIC! ' + victim.name.toUpperCase() + ' IS CARRIED OFF');
    } else {
      ticker(tackler.name.toUpperCase() + ' FLATTENS ' + victim.name.toUpperCase());
    }
    return true;
  }
  return false;
}

function scoreGoal(side) {
  M.score[side] += 10;
  M.phase = 'goal'; M.phaseT = 1.8;
  ticker(side === 0 ? 'GOAL!! +10' : 'GOAL FOR ' + M.teams[1].name.toUpperCase());
  updateHud();
  draw();
}

function endMatch() {
  M.phase = 'ended';
  const [hs, as] = M.score;
  const win = hs > as, drawGame = hs === as;
  const creditsEarned = (win ? 30 : drawGame ? 15 : 5) + hs / 10 * 2;
  save.credits += creditsEarned;
  completeRound([hs, as]);
  $('post-title').textContent = win ? 'VICTORY' : drawGame ? 'DRAW' : 'DEFEAT';
  $('post-score').textContent = `${M.teams[0].name} ${hs} — ${as} ${M.teams[1].name}`;
  const done = save.round >= ROUNDS.length;
  const champ = done ? teamById(standings()[0].id) : null;
  $('post-detail').textContent = `You earned ${creditsEarned} credits. Total: ${save.credits}.` +
    (done ? ` SEASON COMPLETE — champions: ${champ.name}!` : '');
  show('screen-post');
}

/* ---------- rendering ---------- */
function draw() {
  const B = M.ball;
  // steel floor
  cx.fillStyle = '#1b222e'; cx.fillRect(0, 0, W, H);
  cx.strokeStyle = '#232c3c'; cx.lineWidth = 1;
  for (let y = 0; y <= H; y += 96) { cx.beginPath(); cx.moveTo(0, y); cx.lineTo(W, y); cx.stroke(); }
  for (let x = 0; x <= W; x += 96) { cx.beginPath(); cx.moveTo(x, 0); cx.lineTo(x, H); cx.stroke(); }
  // rivets
  cx.fillStyle = '#2e3a4e';
  for (let y = 48; y < H; y += 96) for (let x = 48; x < W; x += 96) { cx.beginPath(); cx.arc(x, y, 3, 0, 7); cx.fill(); }
  // centre line + circle
  cx.strokeStyle = '#3a4a66'; cx.lineWidth = 3;
  cx.beginPath(); cx.moveTo(WALL, H / 2); cx.lineTo(W - WALL, H / 2); cx.stroke();
  cx.beginPath(); cx.arc(W / 2, H / 2, 80, 0, 7); cx.stroke();
  // walls
  cx.fillStyle = '#46536a';
  cx.fillRect(0, 0, W, WALL); cx.fillRect(0, H - WALL, W, WALL);
  cx.fillRect(0, 0, WALL, H); cx.fillRect(W - WALL, 0, WALL, H);
  cx.fillStyle = '#5a6d8c';
  cx.fillRect(0, WALL - 4, W, 4); cx.fillRect(0, H - WALL, W, 4);
  // goals (glow slots)
  for (const [side, y] of [[1, 0], [0, H - WALL]]) {
    const gy = side === 1 ? 0 : H - WALL;
    cx.fillStyle = side === 1 ? M.teams[1].color : M.teams[0].color;
    cx.fillRect(W / 2 - GOAL_W / 2, gy, GOAL_W, WALL);
    cx.fillStyle = 'rgba(255,255,255,.25)';
    cx.fillRect(W / 2 - GOAL_W / 2, gy + (side === 1 ? WALL - 5 : 0), GOAL_W, 5);
  }
  // players
  for (const p of M.players) {
    if (p.out) continue;
    const col = M.kits[p.side].color;
    const col2 = M.kits[p.side].color2;
    cx.save();
    if (p.down > 0) cx.globalAlpha = 0.55;
    // shadow
    cx.fillStyle = 'rgba(0,0,0,.4)';
    cx.beginPath(); cx.ellipse(p.x + 3, p.y + 5, PR, PR * 0.6, 0, 0, 7); cx.fill();
    // body
    cx.fillStyle = col;
    cx.beginPath(); cx.arc(p.x, p.y, PR, 0, 7); cx.fill();
    cx.strokeStyle = '#0c1017'; cx.lineWidth = 2; cx.stroke();
    // helmet shine
    cx.fillStyle = col2;
    cx.beginPath(); cx.arc(p.x - 4, p.y - 4, PR * 0.45, 0, 7); cx.fill();
    if (p === M.active) {
      cx.strokeStyle = '#ffe9b0'; cx.lineWidth = 3;
      cx.beginPath(); cx.arc(p.x, p.y, PR + 5, 0, 7); cx.stroke();
      cx.fillStyle = '#ffe9b0'; cx.font = 'bold 12px monospace'; cx.textAlign = 'center';
      cx.fillText(p.name.split(' ')[0].toUpperCase(), p.x, p.y - PR - 10);
    }
    if (M.ball.holder === p) {
      cx.strokeStyle = '#fff'; cx.lineWidth = 1.5;
      cx.beginPath(); cx.arc(p.x, p.y, PR + 2, 0, 7); cx.stroke();
    }
    cx.restore();
  }
  // ball
  cx.fillStyle = 'rgba(0,0,0,.4)';
  cx.beginPath(); cx.ellipse(B.x + 2, B.y + 4, BR, BR * 0.6, 0, 0, 7); cx.fill();
  const grad = cx.createRadialGradient(B.x - 2, B.y - 2, 1, B.x, B.y, BR);
  grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#8fa3c4');
  cx.fillStyle = grad;
  cx.beginPath(); cx.arc(B.x, B.y, BR, 0, 7); cx.fill();
  cx.strokeStyle = '#0c1017'; cx.lineWidth = 1.5; cx.stroke();

  // phase banners
  if (M.phase === 'kickoff' || M.phase === 'goal' || M.phase === 'halftime') {
    cx.fillStyle = 'rgba(10,13,18,.55)'; cx.fillRect(0, H / 2 - 60, W, 120);
    cx.fillStyle = '#ffe9b0'; cx.font = 'bold 44px monospace'; cx.textAlign = 'center';
    cx.fillText(M.phase === 'goal' ? 'GOAL!' : M.phase === 'halftime' ? 'HALF TIME' : 'READY…',
      W / 2, H / 2 + 14);
  }
}

function loop(t) {
  if (!M || M.phase === 'ended') return;
  const dt = Math.min(0.05, (t - lastTime) / 1000);
  lastTime = t;
  step(dt);
  requestAnimationFrame(loop);
}

/* debug/testing hook: step the sim manually from the console */
window.__bb = { step: dt => step(dt), state: () => M, save: () => save };

/* ---------- wiring ---------- */
$('btn-start').onclick = () => {
  if (save.teamId) { renderManage(); show('screen-manage'); }
  else { renderSelect(); show('screen-select'); }
};
$('btn-reset-save').onclick = () => {
  if (confirm('Reset the season, credits and upgrades?')) { save = defaultSave(); persist(); }
};
$('btn-back-select').onclick = () => { renderSelect(); show('screen-select'); };
$('btn-league').onclick = () => { renderLeague(); show('screen-league'); };
$('btn-back-manage').onclick = () => { renderManage(); show('screen-manage'); };
$('btn-play').onclick = startMatch;
$('btn-post-league').onclick = () => { renderLeague(); show('screen-league'); };
$('btn-post-continue').onclick = () => { renderManage(); show('screen-manage'); };
