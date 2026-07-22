/* Brutal Bowl Arena — an original top-down arcade ball game for the league.
   Inspired by the *feel* of classic 16-bit future-sports games; all code and
   art here are original. Team data comes from the league pages (teams.js). */

'use strict';

/* ---------- persistence ---------- */
const SAVE_KEY = 'brutalbowl_save_v1';

function defaultSave() {
  return { teamId: null, credits: 20, upgrades: {}, results: [], round: 0,
           speed: 1, autoCoach: false, backdrop: 'steel' };
}
let save = loadSave();
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && typeof s === 'object' && Array.isArray(s.results)) {
      // migrate older saves that predate the speed / auto-coach settings
      if (typeof s.speed !== 'number' || !isFinite(s.speed)) s.speed = 1;
      s.autoCoach = !!s.autoCoach;
      if (typeof s.backdrop !== 'string') s.backdrop = 'steel';
      return s;
    }
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
const PR = 18, BR = 8;               // base player / ball radius (big guys scale up)
const RES = 2;                       // render supersampling — crisp high-res canvas
const MARGIN = 200;                  // stands + scenic backdrop around the pitch
// seconds per half (override for quick games with ?half=30 in the URL)
const HALF_LEN = Number(new URLSearchParams(location.search).get('half')) || 90;

const cv = $('pitch'), cx = cv.getContext('2d');
cv.width = W; cv.height = H;          // fix the drawing buffer to the play-field size
cv.width = (W + 2 * MARGIN) * RES;
cv.height = (H + 2 * MARGIN) * RES;

let M = null;                        // current match state
let keys = {};
let lastTime = 0;

addEventListener('keydown', e => {
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
  keys[e.key.toLowerCase()] = true;
  if (M && M.phase === 'play') {
    if (e.key.toLowerCase() === 'p') { setAutoCoach(!M.autoCoach); return; }
    if (!M.autoCoach) {                 // manual controls disabled while the coach plays
      if (e.key === ' ') actionKey();
      if (e.key.toLowerCase() === 'x') shootKey();
      if (e.key.toLowerCase() === 'c') switchKey();
    }
  }
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

function newPlayer(team, p, side, i, n) {
  const lane = (i + 1) / (n + 1);
  const kind = kindOf(team, p.role);
  return {
    team, side,                       // side 0 = user (bottom, attacks top), 1 = cpu
    name: p.name, role: p.role,
    sp: playerStat(team.id, p, 'sp'), ag: playerStat(team.id, p, 'ag'),
    st: playerStat(team.id, p, 'st'), to: playerStat(team.id, p, 'to'),
    kind, r: PR * (KIND_SIZE[kind] || 1),
    face: side === 0 ? -Math.PI / 2 : Math.PI / 2,
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
    autoCoach: !!save.autoCoach,
  };
  M.players.forEach(p => { p.sprite = makeSprite(p.kind, M.kits[p.side], p.r); });
  M.bg = [buildStadium(0), buildStadium(1)];
  M.active = nearestPlayer(0, M.ball);
  $('hud-home').textContent = userTeam.name;
  $('hud-away').textContent = oppTeam.name;
  updateHud();
  syncMatchControls();
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
    if (p.side === 1 || p !== M.active || M.autoCoach) {   // AI decisions (incl. under Auto Coach)
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

  // user input on active player (skipped while Auto Coach drives the whole team)
  const a = M.active;
  if (a && a.down <= 0 && !a.out && !M.autoCoach) {
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
    if (p !== M.active || p.side === 1 || M.autoCoach) aiThink(p, dt);
    p.x = clamp(p.x + p.vx * dt * 60, WALL + p.r, W - WALL - p.r);
    p.y = clamp(p.y + p.vy * dt * 60, WALL + p.r, H - WALL - p.r);
    if (Math.hypot(p.vx, p.vy) > 0.45) p.face = Math.atan2(p.vy, p.vx);
    if (!p.hx) { p.hx = p.x; p.hy = p.y; }
  }

  // separate overlapping players + tackles
  for (let i = 0; i < M.players.length; i++) for (let j = i + 1; j < M.players.length; j++) {
    const p = M.players[i], q = M.players[j];
    if (p.out || q.out || p.down > 0 || q.down > 0) continue;
    const d = dist(p, q), rr = p.r + q.r;
    if (d < rr && d > 0) {
      const overlap = rr - d, nx = (q.x - p.x) / d, ny = (q.y - p.y) / d;
      const wp = q.r / rr, wq = p.r / rr;      // the big guys barely budge
      p.x -= nx * overlap * wp; p.y -= ny * overlap * wp;
      q.x += nx * overlap * wq; q.y += ny * overlap * wq;
      if (p.side !== q.side) tryTackle(p, q) || tryTackle(q, p);
    }
  }

  // ball
  if (B.holder) {
    const h = B.holder;
    const v = Math.hypot(h.vx, h.vy) || 1;
    B.x = h.x + h.vx / v * (h.r + 5); B.y = h.y + h.vy / v * (h.r + 5);
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
      if (dist(p, B) < p.r + BR + 2) {
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

/* ---------- character art ----------
   Every figure is original vector art drawn to an offscreen sprite once per
   match, facing "up", then rotated to its heading each frame. Race/role looks
   are derived from the roster's actual roles (kindOf). */
const KIND_SIZE = {
  treeman: 1.5, steamroller: 1.5, ogre: 1.45, troll: 1.45, mummy: 1.3,
  blackorc: 1.18, fanatic: 0.95, goblin: 0.82, halfling: 0.82,
};
const SKIN = {
  halfling: '#e8b88a', human: '#e0a878', elf: '#f0d4b4', orc: '#5a8f3c',
  blackorc: '#446e2c', goblin: '#7ab648', fanatic: '#7ab648', dwarf: '#dda474',
  viking: '#e8c096', zombie: '#8fa07a', skeleton: '#e8e4d8', ghoul: '#b8c49a',
  wight: '#9aa4b8', mummy: '#d8c9a0', treeman: '#7a5a34', ogre: '#d8a070',
  troll: '#dce8f2', steamroller: '#dda474',
};

function kindOf(team, role) {
  const r = role.toLowerCase();
  if (r.includes('treeman')) return 'treeman';
  if (r.includes('steam')) return 'steamroller';
  if (r.includes('ogre')) return 'ogre';
  if (r.includes('troll')) return 'troll';
  if (r.includes('black orc')) return 'blackorc';
  if (r.includes('mummy')) return 'mummy';
  if (r.includes('skeleton')) return 'skeleton';
  if (r.includes('zombie')) return 'zombie';
  if (r.includes('ghoul')) return 'ghoul';
  if (r.includes('wight')) return 'wight';
  if (r.includes('fanatic')) return 'fanatic';
  return { halfling: 'halfling', woodelf: 'elf', human: 'human',
           orc: r.includes('goblin') ? 'goblin' : 'orc', undead: 'zombie',
           dwarf: 'dwarf', goblin: 'goblin', viking: 'viking' }[team.id] || 'human';
}

function shade(hex, f) {             // f in [-1, 1]: darken < 0 < lighten
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
    .map(v => clamp(Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f), 0, 255));
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
}

function makeSprite(kind, kit, r) {
  const pad = Math.ceil(r * 1.2) + 10;
  const c = document.createElement('canvas');
  c.width = c.height = (r + pad) * 2 * RES;
  const s = c.getContext('2d');
  s.scale(RES, RES);
  s.translate(r + pad, r + pad);
  s.lineJoin = 'round';
  const lw = Math.max(1.4, r * 0.1);
  s.lineWidth = lw;
  const skin = SKIN[kind], dark = '#0a0e14', col = kit.color, col2 = kit.color2;
  const O = (x, y, rr, fill, stroke) => { s.beginPath(); s.arc(x, y, rr, 0, 7);
    if (fill) { s.fillStyle = fill; s.fill(); } if (stroke) { s.strokeStyle = stroke; s.stroke(); } };
  const tri = (pts, fill) => { s.beginPath(); s.moveTo(pts[0], pts[1]); s.lineTo(pts[2], pts[3]);
    s.lineTo(pts[4], pts[5]); s.closePath(); s.fillStyle = fill; s.fill();
    s.strokeStyle = dark; s.stroke(); };
  const box = (x, y, w, h, rad, fill) => { s.beginPath(); s.moveTo(x + rad, y);
    s.arcTo(x + w, y, x + w, y + h, rad); s.arcTo(x + w, y + h, x, y + h, rad);
    s.arcTo(x, y + h, x, y, rad); s.arcTo(x, y, x + w, y, rad); s.closePath();
    s.fillStyle = fill; s.fill(); s.strokeStyle = dark; s.stroke(); };
  const line = (x1, y1, x2, y2, colr, w) => { s.beginPath(); s.moveTo(x1, y1); s.lineTo(x2, y2);
    s.strokeStyle = colr; if (w) s.lineWidth = w; s.stroke(); s.lineWidth = lw; };

  if (kind === 'steamroller') {      // Grudgecrusher: dwarf war machine
    box(-r * 0.95, -r * 1.3, r * 1.9, r * 0.66, r * 0.3, '#9aa4b4');
    for (let x = -r * 0.66; x <= r * 0.67; x += r * 0.33) line(x, -r * 1.24, x, -r * 0.7, '#6b7484');
    box(-r * 0.82, -r * 0.6, r * 1.64, r * 1.5, r * 0.24, shade(col, -0.08));
    line(-r * 0.82, -r * 0.05, r * 0.82, -r * 0.05, shade(col, -0.4));
    [[-r * 0.62, -r * 0.4], [r * 0.62, -r * 0.4], [-r * 0.62, r * 0.7], [r * 0.62, r * 0.7]]
      .forEach(([x, y]) => O(x, y, r * 0.07, '#20242c'));
    box(-r * 1.06, -r * 0.25, r * 0.26, r * 0.95, r * 0.1, col2);
    box(r * 0.8, -r * 0.25, r * 0.26, r * 0.95, r * 0.1, col2);
    O(r * 0.4, -r * 0.18, r * 0.3, '#3c4450', dark);
    O(r * 0.4, -r * 0.18, r * 0.13, '#12161e');
    O(0, r * 0.52, r * 0.34, '#8f97a6', dark);                       // driver's helm
    line(-r * 0.3, r * 0.52, r * 0.3, r * 0.52, '#2b313c', r * 0.12); // goggles
    tri([-r * 0.26, r * 0.78, 0, r * 1.2, r * 0.26, r * 0.78], '#c07a3a'); // beard
    return c;
  }

  if (kind === 'treeman') {
    O(0, 0, r, '#6b4a28', dark);                                     // trunk
    for (let i = 0; i < 9; i++) {                                    // bark ridges
      const a = i / 9 * Math.PI * 2 + 0.3;
      line(Math.cos(a) * r * 0.35, Math.sin(a) * r * 0.35,
           Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92, '#4e3419');
    }
    O(0, 0, r * 0.5, null, '#4e3419');                               // growth ring
    O(-r * 0.8, -r * 0.5, r * 0.42, '#3f7a37', dark);                // leaf tufts
    O(r * 0.8, -r * 0.5, r * 0.42, '#3f7a37', dark);
    O(0, -r * 0.95, r * 0.38, '#4e9440', dark);
    box(-r * 0.55, r * 0.45, r * 1.1, r * 0.26, r * 0.1, col);       // team band
    s.fillStyle = '#241708';                                          // carved face
    s.fillRect(-r * 0.34, -r * 0.3, r * 0.2, r * 0.14);
    s.fillRect(r * 0.14, -r * 0.3, r * 0.2, r * 0.14);
    s.fillRect(-r * 0.12, r * 0.05, r * 0.24, r * 0.1);
    return c;
  }

  // chainsaw drawn first so the body overlaps its handle
  if (kind === 'fanatic') {
    box(-r * 0.16, -r * 2.15, r * 0.32, r * 1.3, r * 0.08, '#9aa4b4');
    for (let y = -r * 2.05; y < -r * 0.9; y += r * 0.22) {
      s.fillStyle = '#4b5462';
      s.fillRect(-r * 0.22, y, r * 0.1, r * 0.1);
      s.fillRect(r * 0.12, y + r * 0.11, r * 0.1, r * 0.1);
    }
    box(-r * 0.3, -r * 1.0, r * 0.6, r * 0.34, r * 0.1, '#e0512e');
  }

  // ---- torso ----
  const bare = kind === 'ogre' || kind === 'troll';
  const torso = bare ? skin
    : kind === 'mummy' ? '#cfc09a'
    : kind === 'skeleton' || kind === 'wight' ? shade(col, -0.28)
    : col;
  O(0, 0, r, torso, dark);
  if (!bare && !['mummy', 'skeleton', 'zombie', 'ghoul'].includes(kind))
    O(0, r * 0.05, r * 0.62, shade(col, 0.12), shade(col, -0.35));   // chest plate

  if (bare) {                                                         // harness straps
    line(-r * 0.7, -r * 0.55, r * 0.55, r * 0.75, col, r * 0.22);
    line(r * 0.7, -r * 0.55, -r * 0.55, r * 0.75, col, r * 0.22);
    O(0, r * 0.1, r * 0.16, col2, dark);
  }
  if (kind === 'mummy') {                                             // bandages + sash
    for (let i = -2; i <= 2; i++)
      line(-r * 0.9, i * r * 0.32, r * 0.9, i * r * 0.32 + r * 0.1, '#a89a72', r * 0.1);
    box(-r * 0.6, -r * 0.08, r * 1.2, r * 0.22, r * 0.08, col);
  }
  if (kind === 'skeleton') {                                          // ribs
    s.strokeStyle = '#e8e4d8'; s.lineWidth = r * 0.09;
    for (let i = 0; i < 3; i++) {
      s.beginPath();
      s.moveTo(-r * 0.5, -r * 0.25 + i * r * 0.3);
      s.quadraticCurveTo(0, -r * 0.1 + i * r * 0.3, r * 0.5, -r * 0.25 + i * r * 0.3);
      s.stroke();
    }
    s.lineWidth = lw;
  }
  if (kind === 'zombie') {                                            // stitches + rot
    line(-r * 0.5, -r * 0.1, r * 0.35, r * 0.25, '#141a10', r * 0.07);
    for (let i = 0; i < 3; i++)
      line(-r * 0.35 + i * r * 0.28, -r * 0.22 + i * r * 0.12,
           -r * 0.25 + i * r * 0.28, r * 0.02 + i * r * 0.12, '#141a10', r * 0.05);
    O(r * 0.35, r * 0.4, r * 0.16, shade(skin, -0.3), dark);
  }

  // ---- shoulder pads ----
  if (!['mummy', 'ghoul', 'skeleton'].includes(kind)) {
    const padCol = kind === 'blackorc' ? shade(col2, -0.2) : col2;
    O(-r * 0.8, -r * 0.12, r * 0.42, padCol, dark);
    if (kind !== 'zombie') O(r * 0.8, -r * 0.12, r * 0.42, padCol, dark); // zombies lost one
    if (kind === 'orc' || kind === 'blackorc')
      [[-r * 0.9, -r * 0.3], [-r * 0.7, -r * 0.02], [r * 0.9, -r * 0.3], [r * 0.7, -r * 0.02]]
        .forEach(([x, y]) => O(x, y, r * 0.06, '#12161e'));
    if (kind === 'blackorc' || kind === 'troll') {                    // shoulder spikes
      const spike = kind === 'troll' ? '#eef4fa' : '#c4ccd8';
      tri([-r * 1.05, -r * 0.3, -r * 1.35, -r * 0.75, -r * 0.72, -r * 0.5], spike);
      tri([r * 1.05, -r * 0.3, r * 1.35, -r * 0.75, r * 0.72, -r * 0.5], spike);
    }
  }

  // ---- fists ----
  const fist = kind === 'skeleton' ? '#e8e4d8' : skin;
  O(-r * 0.58, -r * 0.78, r * 0.21, fist, dark);
  O(r * 0.58, -r * 0.78, r * 0.21, fist, dark);
  if (kind === 'ghoul') {
    tri([-r * 0.7, -r * 0.9, -r * 0.58, -r * 1.18, -r * 0.46, -r * 0.9], '#dfe6d0');
    tri([r * 0.46, -r * 0.9, r * 0.58, -r * 1.18, r * 0.7, -r * 0.9], '#dfe6d0');
  }

  // ---- head ----
  const hy = kind === 'ghoul' ? -r * 0.45 : -r * 0.3;
  const hr = r * 0.5;
  O(0, hy, hr, skin, dark);
  const eye = (dx, colr) => { s.fillStyle = colr;
    s.beginPath(); s.arc(dx, hy - hr * 0.45, hr * 0.14, 0, 7); s.fill(); };

  if (kind === 'human' || kind === 'dwarf' || kind === 'viking' || kind === 'wight') {
    O(0, hy, hr * 1.08, kind === 'wight' ? '#39414f' : '#aeb6c4', dark);       // helmet
    box(-hr * 0.62, hy - hr * 0.82, hr * 1.24, hr * 0.55, hr * 0.2, skin);     // visor
    if (kind === 'wight') {
      s.shadowColor = '#7ef0ff'; s.shadowBlur = 6;
      eye(-hr * 0.3, '#9ef4ff'); eye(hr * 0.3, '#9ef4ff'); s.shadowBlur = 0;
    } else { eye(-hr * 0.3, '#12161e'); eye(hr * 0.3, '#12161e'); }
    if (kind === 'human') box(-hr * 0.15, hy - hr * 0.2, hr * 0.3, hr * 1.15, hr * 0.12, col2);
    if (kind === 'viking') {
      tri([-hr * 1.0, hy + hr * 0.1, -hr * 1.75, hy - hr * 0.75, -hr * 0.55, hy - hr * 0.4], '#ded8c8');
      tri([hr * 1.0, hy + hr * 0.1, hr * 1.75, hy - hr * 0.75, hr * 0.55, hy - hr * 0.4], '#ded8c8');
    }
    if (kind === 'dwarf')
      tri([-hr * 0.72, hy - hr * 0.15, 0, hy - hr * 2.2, hr * 0.72, hy - hr * 0.15], '#c07a3a');
  } else if (kind === 'elf') {
    O(0, hy, hr * 1.06, col2, dark);                                            // hood
    tri([-hr * 0.32, hy + hr * 0.8, 0, hy + hr * 1.8, hr * 0.32, hy + hr * 0.8], col2);
    box(-hr * 0.55, hy - hr * 0.8, hr * 1.1, hr * 0.62, hr * 0.24, skin);
    eye(-hr * 0.26, '#12401e'); eye(hr * 0.26, '#12401e');
  } else if (kind === 'halfling') {
    s.beginPath(); s.arc(0, hy, hr * 1.04, -0.25, Math.PI + 0.25);              // curly mop
    s.fillStyle = '#8a5a2e'; s.fill(); s.strokeStyle = dark; s.stroke();
    eye(-hr * 0.3, '#12161e'); eye(hr * 0.3, '#12161e');
    O(-hr * 0.55, hy - hr * 0.1, hr * 0.14, '#d98a6a');                          // rosy cheeks
    O(hr * 0.55, hy - hr * 0.1, hr * 0.14, '#d98a6a');
  } else if (kind === 'orc' || kind === 'blackorc') {
    O(0, hy - hr * 0.5, hr * 0.66, skin, dark);                                  // jutting jaw
    tri([-hr * 0.5, hy - hr * 0.75, -hr * 0.62, hy - hr * 1.2, -hr * 0.25, hy - hr * 0.85], '#e8e4d8');
    tri([hr * 0.5, hy - hr * 0.75, hr * 0.62, hy - hr * 1.2, hr * 0.25, hy - hr * 0.85], '#e8e4d8');
    eye(-hr * 0.3, '#e04a2e'); eye(hr * 0.3, '#e04a2e');
    if (kind === 'blackorc') box(-hr * 0.7, hy + hr * 0.15, hr * 1.4, hr * 0.5, hr * 0.2, '#4b5462');
  } else if (kind === 'goblin' || kind === 'fanatic') {
    tri([-hr * 0.85, hy, -hr * 2.0, hy - hr * 0.4, -hr * 0.75, hy + hr * 0.5], skin); // ears
    tri([hr * 0.85, hy, hr * 2.0, hy - hr * 0.4, hr * 0.75, hy + hr * 0.5], skin);
    O(-hr * 0.3, hy - hr * 0.4, hr * 0.2, '#f4f4f0');
    O(hr * 0.3, hy - hr * 0.4, hr * 0.2, '#f4f4f0');
    eye(-hr * 0.3, '#12161e'); eye(hr * 0.3, '#12161e');
    if (kind === 'fanatic') { s.fillStyle = '#e0512e';                           // mad crest
      s.beginPath(); s.arc(0, hy, hr * 0.9, Math.PI + 0.5, 2 * Math.PI - 0.5); s.fill(); }
  } else if (kind === 'skeleton') {
    O(-hr * 0.3, hy - hr * 0.35, hr * 0.2, '#141a10');
    O(hr * 0.3, hy - hr * 0.35, hr * 0.2, '#141a10');
    tri([0, hy - hr * 0.05, -hr * 0.1, hy + hr * 0.18, hr * 0.1, hy + hr * 0.18], '#c9c2b0');
    line(-hr * 0.35, hy + hr * 0.55, hr * 0.35, hy + hr * 0.55, '#141a10', r * 0.05);
    for (let i = -2; i <= 2; i++)
      line(i * hr * 0.16, hy + hr * 0.42, i * hr * 0.16, hy + hr * 0.68, '#141a10', r * 0.03);
  } else if (kind === 'zombie') {
    eye(-hr * 0.3, '#f4f4f0'); eye(hr * 0.32, '#141a10');                        // mismatched
    line(-hr * 0.3, hy + hr * 0.5, hr * 0.4, hy + hr * 0.35, '#141a10', r * 0.05);
    line(-hr * 0.5, hy - hr * 0.55, hr * 0.05, hy - hr * 0.8, '#141a10', r * 0.05);
  } else if (kind === 'ghoul') {
    eye(-hr * 0.3, '#141a10'); eye(hr * 0.3, '#141a10');
    O(-hr * 0.3, hy - hr * 0.45, hr * 0.06, '#cfe08a');
    O(hr * 0.3, hy - hr * 0.45, hr * 0.06, '#cfe08a');
    for (let i = 0; i < 3; i++) O(0, r * (0.35 + i * 0.22), r * 0.07, shade(skin, -0.35));
  } else if (kind === 'mummy') {
    for (let i = -1; i <= 1; i++)
      line(-hr, hy + i * hr * 0.4, hr, hy + i * hr * 0.4 + hr * 0.15, '#a89a72', r * 0.08);
    s.shadowColor = '#a7f070'; s.shadowBlur = 5;
    eye(-hr * 0.28, '#a7f070'); eye(hr * 0.28, '#a7f070'); s.shadowBlur = 0;
  } else if (bare) {                                                              // ogre / troll
    s.beginPath(); s.arc(0, hy, hr * 1.05, 0.25, Math.PI - 0.25);                 // skullcap
    s.fillStyle = col; s.fill(); s.strokeStyle = dark; s.stroke();
    eye(-hr * 0.3, '#12161e'); eye(hr * 0.3, '#12161e');
    tri([-hr * 0.4, hy - hr * 0.6, -hr * 0.5, hy - hr * 0.95, -hr * 0.2, hy - hr * 0.65], '#e8e4d8');
    tri([hr * 0.4, hy - hr * 0.6, hr * 0.5, hy - hr * 0.95, hr * 0.2, hy - hr * 0.65], '#e8e4d8');
    if (kind === 'troll') O(0, hy - hr * 0.15, hr * 0.18, '#7aa8d8');             // frosty nose
  } else {
    eye(-hr * 0.3, '#12161e'); eye(hr * 0.3, '#12161e');
  }
  return c;
}

/* ---------- backdrops ----------
   Selectable scenery drawn around the stadium bowl. All procedural — the
   game stays a self-contained static page. */
const BACKDROPS = [
  ['steel', 'Steel Arena'], ['greyscale', 'Greyscale'], ['teamcolors', 'Team Colours'],
  ['moon', 'Moon Surface'], ['mars', 'Mars Surface'], ['cyberpunk', 'Cyberpunk City'],
  ['medieval', 'Medieval City'], ['mountains', 'Mountain Rocks'],
];

function craterField(s, n, rMin, rMax, floor, rimLight, rimDark) {
  for (let i = 0; i < n; i++) {
    const x = rand(-MARGIN, W + MARGIN), y = rand(-MARGIN, H + MARGIN), r = rand(rMin, rMax);
    s.fillStyle = floor;
    s.beginPath(); s.arc(x, y, r, 0, 7); s.fill();
    s.lineWidth = Math.max(1.5, r * 0.14);
    s.strokeStyle = rimDark;
    s.beginPath(); s.arc(x, y, r * 0.96, -0.5, 2.1); s.stroke();       // shaded rim
    s.strokeStyle = rimLight;
    s.beginPath(); s.arc(x, y, r, Math.PI * 0.72, Math.PI * 1.72); s.stroke(); // sunlit rim
  }
}

function grain(s, n, colors) {
  for (let i = 0; i < n; i++) {
    s.fillStyle = colors[(Math.random() * colors.length) | 0];
    s.fillRect(rand(-MARGIN, W + MARGIN), rand(-MARGIN, H + MARGIN), rand(1, 2.6), rand(1, 2.6));
  }
}

/* species-flavoured pattern for the "Team Colours" backdrop */
function speciesPattern(s, team) {
  const c1 = team.color, c2 = team.color2;
  s.fillStyle = shade(c1, -0.72);
  s.fillRect(-MARGIN, -MARGIN, W + 2 * MARGIN, H + 2 * MARGIN);
  const each = (n, fn) => { for (let i = 0; i < n; i++)
    fn(rand(-MARGIN, W + MARGIN), rand(-MARGIN, H + MARGIN)); };
  switch (team.id) {
    case 'halfling':                                     // rolling pasture + flowers
      each(70, (x, y) => { s.strokeStyle = shade(c1, -0.35); s.lineWidth = rand(6, 14);
        s.beginPath(); s.arc(x, y, rand(18, 46), Math.PI, 2 * Math.PI); s.stroke(); });
      each(160, (x, y) => { s.fillStyle = Math.random() < 0.5 ? c2 : '#e8d06a';
        s.beginPath(); s.arc(x, y, rand(1.5, 3), 0, 7); s.fill(); });
      break;
    case 'woodelf':                                      // drifting leaves
      each(220, (x, y) => { s.fillStyle = Math.random() < 0.5 ? shade(c1, -0.2) : shade(c2, -0.25);
        s.save(); s.translate(x, y); s.rotate(rand(0, 7));
        s.beginPath(); s.ellipse(0, 0, rand(4, 9), rand(2, 3.5), 0, 0, 7); s.fill(); s.restore(); });
      break;
    case 'human':                                        // heraldic stripes + roundels
      for (let d = -H - MARGIN * 2; d < W + MARGIN * 2; d += 64) {
        s.strokeStyle = shade(c1, -0.4); s.lineWidth = 26;
        s.beginPath(); s.moveTo(d, -MARGIN); s.lineTo(d + H + 2 * MARGIN, H + MARGIN); s.stroke();
      }
      each(26, (x, y) => { s.strokeStyle = c2; s.lineWidth = 3;
        s.beginPath(); s.arc(x, y, rand(8, 16), 0, 7); s.stroke(); });
      break;
    case 'orc':                                          // jagged teeth rows
      for (let y = -MARGIN + 30; y < H + MARGIN; y += 74) {
        s.fillStyle = shade(c1, -0.4);
        s.beginPath();
        for (let x = -MARGIN; x < W + MARGIN; x += 30) {
          s.moveTo(x, y); s.lineTo(x + 15, y - rand(16, 30)); s.lineTo(x + 30, y);
        }
        s.fill();
      }
      each(40, (x, y) => { s.fillStyle = c2;
        s.beginPath(); s.arc(x, y, rand(2, 4), 0, 7); s.fill(); });
      break;
    case 'undead':                                       // graveyard
      each(70, (x, y) => { s.fillStyle = shade(c1, -0.35);
        s.fillRect(x - 7, y - 12, 14, 24);
        s.beginPath(); s.arc(x, y - 12, 7, Math.PI, 2 * Math.PI); s.fill();
        s.strokeStyle = shade(c2, -0.3); s.lineWidth = 2;
        s.beginPath(); s.moveTo(x - 4, y - 6); s.lineTo(x + 4, y - 6);
        s.moveTo(x, y - 10); s.lineTo(x, y + 2); s.stroke(); });
      break;
    case 'dwarf':                                        // ashlar stone + runes
      for (let y = -MARGIN; y < H + MARGIN; y += 34) {
        for (let x = -MARGIN + ((y / 34 | 0) % 2) * 30; x < W + MARGIN; x += 60) {
          s.strokeStyle = shade(c1, -0.45); s.lineWidth = 3;
          s.strokeRect(x, y, 60, 34);
        }
      }
      each(30, (x, y) => { s.strokeStyle = c2; s.lineWidth = 2.5;
        s.beginPath(); s.moveTo(x, y - 8); s.lineTo(x, y + 8);
        s.moveTo(x, y - 2); s.lineTo(x + 7, y - 8); s.moveTo(x, y + 2); s.lineTo(x + 7, y + 8);
        s.stroke(); });
      break;
    case 'goblin':                                       // bolted scrap patches
      each(90, (x, y) => { const w = rand(18, 52), h = rand(14, 40);
        s.fillStyle = shade(Math.random() < 0.5 ? c1 : c2, rand(-0.55, -0.2));
        s.fillRect(x, y, w, h);
        s.strokeStyle = '#0a0e14'; s.lineWidth = 2; s.strokeRect(x, y, w, h);
        s.fillStyle = '#20242c';
        s.beginPath(); s.arc(x + 4, y + 4, 2, 0, 7); s.fill();
        s.beginPath(); s.arc(x + w - 4, y + h - 4, 2, 0, 7); s.fill(); });
      break;
    case 'viking':                                       // icy waves + shields
      for (let y = -MARGIN + 20; y < H + MARGIN; y += 46) {
        s.strokeStyle = shade(c2, -0.25); s.lineWidth = 4;
        s.beginPath();
        for (let x = -MARGIN; x < W + MARGIN; x += 40)
          s.quadraticCurveTo(x + 10, y - 14, x + 20, y), s.quadraticCurveTo(x + 30, y + 14, x + 40, y);
        s.stroke();
      }
      each(22, (x, y) => { s.fillStyle = shade(c1, -0.25);
        s.beginPath(); s.arc(x, y, 12, 0, 7); s.fill();
        s.strokeStyle = c2; s.lineWidth = 2.5;
        s.beginPath(); s.arc(x, y, 12, 0, 7); s.moveTo(x - 12, y); s.lineTo(x + 12, y); s.stroke(); });
      break;
  }
}

function drawBackdrop(s, style, teams) {
  const cw = W + 2 * MARGIN, ch = H + 2 * MARGIN;
  const full = (fill) => { s.fillStyle = fill; s.fillRect(-MARGIN, -MARGIN, cw, ch); };
  switch (style) {
    case 'greyscale': {
      full('#141416');
      for (let d = -H - MARGIN * 2; d < W + MARGIN * 2; d += 56) {     // girders
        s.strokeStyle = '#1d1d21'; s.lineWidth = 18;
        s.beginPath(); s.moveTo(d, -MARGIN); s.lineTo(d + H + 2 * MARGIN, H + MARGIN); s.stroke();
      }
      grain(s, 500, ['#232327', '#0e0e10', '#2c2c30']);
      break;
    }
    case 'teamcolors': {
      const t = teams[0];
      if (t) speciesPattern(s, t); else full('#101014');
      break;
    }
    case 'moon': {
      const g = s.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H);
      g.addColorStop(0, '#93939a'); g.addColorStop(1, '#7c7c84');
      s.fillStyle = g; s.fillRect(-MARGIN, -MARGIN, cw, ch);
      grain(s, 1400, ['#a6a6ae', '#6e6e76', '#88888f', '#5f5f66']);
      craterField(s, 46, 5, 26, '#74747c', '#b7b7bf', '#55555c');
      craterField(s, 6, 30, 54, '#6c6c74', '#c0c0c8', '#4e4e55');
      s.fillStyle = '#3b6fd4';                                          // earthrise
      s.beginPath(); s.arc(-MARGIN + 52, -MARGIN + 52, 24, 0, 7); s.fill();
      s.fillStyle = 'rgba(255,255,255,.75)';
      s.beginPath(); s.ellipse(-MARGIN + 46, -MARGIN + 46, 12, 5, 0.6, 0, 7); s.fill();
      s.beginPath(); s.ellipse(-MARGIN + 58, -MARGIN + 60, 9, 4, -0.4, 0, 7); s.fill();
      break;
    }
    case 'mars': {
      const g = s.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H);
      g.addColorStop(0, '#b5643c'); g.addColorStop(1, '#96502f');
      s.fillStyle = g; s.fillRect(-MARGIN, -MARGIN, cw, ch);
      grain(s, 1400, ['#c97a4c', '#8e4526', '#a85a34', '#7c3c20']);
      for (let i = 0; i < 30; i++) {                                    // wind-blown dunes
        const x = rand(-MARGIN, W + MARGIN), y = rand(-MARGIN, H + MARGIN);
        s.strokeStyle = 'rgba(60,25,10,.25)'; s.lineWidth = rand(2, 5);
        s.beginPath(); s.moveTo(x, y);
        s.quadraticCurveTo(x + rand(20, 60), y + rand(-14, 14), x + rand(70, 130), y);
        s.stroke();
      }
      craterField(s, 34, 5, 24, '#8e4526', '#d98a5f', '#6b3018');
      craterField(s, 4, 30, 50, '#84401f', '#e09468', '#5f2a14');
      break;
    }
    case 'cyberpunk': {
      full('#0b0d16');
      for (let y = -MARGIN; y < H + MARGIN; y += 76) {                  // rooftops
        for (let x = -MARGIN; x < W + MARGIN; x += 84) {
          const w = 84 - rand(10, 26), h = 76 - rand(10, 24);
          s.fillStyle = ['#141826', '#1b2032', '#10141f'][(Math.random() * 3) | 0];
          s.fillRect(x, y, w, h);
          s.strokeStyle = '#05070c'; s.lineWidth = 2; s.strokeRect(x, y, w, h);
          s.fillStyle = '#2b3040';                                      // AC unit
          s.fillRect(x + rand(4, w - 14), y + rand(4, h - 14), 9, 9);
          for (let i = 0; i < 14; i++) {                                // lit windows
            if (Math.random() < 0.5) continue;
            s.fillStyle = ['#59d6e6', '#e34fd0', '#e8c15a', '#7ef0ff'][(Math.random() * 4) | 0];
            s.globalAlpha = rand(0.35, 1);
            s.fillRect(x + 4 + (i % 5) * (w / 5), y + 5 + ((i / 5) | 0) * 11, 3, 5);
            s.globalAlpha = 1;
          }
        }
      }
      for (let i = 0; i < 14; i++) {                                    // neon strips
        s.strokeStyle = Math.random() < 0.5 ? '#e34fd0' : '#59d6e6';
        s.shadowColor = s.strokeStyle; s.shadowBlur = 10; s.lineWidth = 2.5;
        const x = rand(-MARGIN, W + MARGIN), y = rand(-MARGIN, H + MARGIN), l = rand(24, 70);
        s.beginPath(); s.moveTo(x, y);
        Math.random() < 0.5 ? s.lineTo(x + l, y) : s.lineTo(x, y + l);
        s.stroke(); s.shadowBlur = 0;
      }
      break;
    }
    case 'medieval': {
      full('#2a241c');
      grain(s, 700, ['#332c22', '#211c15', '#3a332a']);                 // packed earth
      for (let y = -MARGIN; y < H + MARGIN; y += 66) {                  // timber rooftops
        for (let x = -MARGIN; x < W + MARGIN; x += 74) {
          if (Math.random() < 0.22) continue;                           // lanes between houses
          const w = 74 - rand(14, 30), h = 66 - rand(14, 28);
          const roof = ['#8a4a2e', '#a05a32', '#6e4a28', '#9a7c3e', '#7a3a2a'][(Math.random() * 5) | 0];
          s.fillStyle = shade(roof, rand(-0.2, 0.05));
          s.fillRect(x, y, w, h);
          s.strokeStyle = '#171208'; s.lineWidth = 2; s.strokeRect(x, y, w, h);
          s.strokeStyle = shade(roof, 0.25);                            // roof ridge
          w > h ? (s.beginPath(), s.moveTo(x + 4, y + h / 2), s.lineTo(x + w - 4, y + h / 2))
                : (s.beginPath(), s.moveTo(x + w / 2, y + 4), s.lineTo(x + w / 2, y + h - 4));
          s.stroke();
        }
      }
      for (let i = 0; i < 8; i++) {                                     // watch towers
        const x = rand(-MARGIN + 30, W + MARGIN - 30), y = rand(-MARGIN + 30, H + MARGIN - 30);
        s.fillStyle = '#6b6f78'; s.beginPath(); s.arc(x, y, 16, 0, 7); s.fill();
        s.strokeStyle = '#43464e'; s.lineWidth = 2;
        for (let a = 0; a < 7; a += 0.8) {
          s.beginPath(); s.moveTo(x, y);
          s.lineTo(x + Math.cos(a) * 16, y + Math.sin(a) * 16); s.stroke();
        }
        s.fillStyle = '#c0392b'; s.beginPath(); s.arc(x, y, 3, 0, 7); s.fill(); // banner
      }
      break;
    }
    case 'mountains': {
      full('#45413b');
      grain(s, 1300, ['#514c45', '#38342e', '#5c574f']);
      for (let i = 0; i < 300; i++) {                                   // talus + crags
        const x = rand(-MARGIN, W + MARGIN), y = rand(-MARGIN, H + MARGIN), r = rand(7, 30);
        const base = ['#565b63', '#3f444c', '#6a6f78', '#5a5347'][(Math.random() * 4) | 0];
        s.fillStyle = base;
        s.beginPath(); s.moveTo(x, y - r);
        for (let a = 0.9; a < 6.2; a += rand(0.8, 1.4))
          s.lineTo(x + Math.cos(a) * r * rand(0.6, 1), y + Math.sin(a) * r * rand(0.6, 1));
        s.closePath(); s.fill();
        s.strokeStyle = shade(base, -0.4); s.lineWidth = 1.5; s.stroke();
        s.strokeStyle = shade(base, 0.3);                               // sunlit edge
        s.beginPath(); s.moveTo(x - r * 0.6, y - r * 0.4); s.lineTo(x, y - r * 0.9); s.stroke();
      }
      for (let i = 0; i < 26; i++) {                                    // snow patches
        s.fillStyle = 'rgba(238,244,250,' + rand(0.25, 0.7).toFixed(2) + ')';
        const x = rand(-MARGIN, W + MARGIN), y = rand(-MARGIN, H + MARGIN);
        s.beginPath(); s.ellipse(x, y, rand(5, 16), rand(3, 8), rand(0, 3), 0, 7); s.fill();
      }
      break;
    }
    default: {                                                           // steel
      full('#0a0e15');
      for (let d = -H - MARGIN * 2; d < W + MARGIN * 2; d += 72) {
        s.strokeStyle = '#0e131c'; s.lineWidth = 20;
        s.beginPath(); s.moveTo(d, -MARGIN); s.lineTo(d + H + 2 * MARGIN, H + MARGIN); s.stroke();
      }
      grain(s, 400, ['#12161f', '#080b11']);
    }
  }
}

/* ---------- stadium art ---------- */
function buildStadium(variant) {
  const cw = W + 2 * MARGIN, ch = H + 2 * MARGIN;
  const c = document.createElement('canvas');
  c.width = cw * RES; c.height = ch * RES;
  const s = c.getContext('2d');
  s.scale(RES, RES); s.translate(MARGIN, MARGIN);

  // scenery around the bowl (user-selectable backdrop)
  drawBackdrop(s, save.backdrop, M.teams);
  // stadium bowl shell — separates the stands from the scenery outside
  s.fillStyle = '#0d1118';
  s.fillRect(-96, -96, W + 192, H + 192);
  s.strokeStyle = '#3a4250'; s.lineWidth = 3;
  s.strokeRect(-96, -96, W + 192, H + 192);
  // terraces
  for (let i = 0; i < 6; i++) {
    const inset = 14 + i * 11;
    s.strokeStyle = i % 2 ? '#151b26' : '#12171f';
    s.lineWidth = 10;
    s.strokeRect(-inset, -inset, W + 2 * inset, H + 2 * inset);
  }
  // crowd (each build differs -> alternating the two frames animates the crowd)
  const grey = save.backdrop === 'greyscale';
  const palette = grey
    ? ['#c9c9ce', '#9a9aa2', '#6e6e76', '#4a4a52', '#e2e2e6', '#84848c']
    : [M.teams[0].color, M.teams[0].color2, M.teams[1].color, M.teams[1].color2,
       '#cfd6e4', '#8fa3c4', '#d9a441', '#77809a', '#5a6478'];
  for (let row = 0; row < 6; row++) {
    const inset = 14 + row * 11;
    const x0 = -inset, y0 = -inset, x1 = W + inset, y1 = H + inset;
    const dot = (x, y) => {
      if (Math.random() < 0.18) return;                    // empty seats
      s.fillStyle = palette[(Math.random() * palette.length) | 0];
      s.beginPath(); s.arc(x + rand(-1.5, 1.5), y + rand(-1.5, 1.5), rand(2, 3.1), 0, 7); s.fill();
      if (Math.random() < 0.1) { s.fillStyle = 'rgba(255,255,255,.5)';
        s.beginPath(); s.arc(x, y - 2, 1.1, 0, 7); s.fill(); }   // waving scarves
    };
    for (let x = x0; x <= x1; x += 9) { dot(x, y0); dot(x, y1); }
    for (let y = y0; y <= y1; y += 9) { dot(x0, y); dot(x1, y); }
  }
  // supporter banners on the bowl shell
  const bannerCol = (c) => grey ? '#c8c8d0' : c;
  s.textAlign = 'center'; s.font = 'bold 24px monospace';
  s.fillStyle = 'rgba(10,13,18,.78)';
  s.fillRect(W / 2 - 200, -94, 400, 30);
  s.fillRect(W / 2 - 200, H + 64, 400, 30);
  s.fillStyle = bannerCol(M.teams[1].color2);
  s.fillText(M.teams[1].name.toUpperCase(), W / 2, -72);
  s.fillStyle = bannerCol(M.teams[0].color2);
  s.fillText(M.teams[0].name.toUpperCase(), W / 2, H + 86);
  s.save(); s.translate(-79, H / 2); s.rotate(-Math.PI / 2);
  s.fillStyle = 'rgba(10,13,18,.78)'; s.fillRect(-190, -15, 380, 30);
  s.fillStyle = bannerCol('#d9a441'); s.fillText('★ BRUTAL BOWL ARENA ★', 0, 7); s.restore();
  s.save(); s.translate(W + 79, H / 2); s.rotate(Math.PI / 2);
  s.fillStyle = 'rgba(10,13,18,.78)'; s.fillRect(-190, -15, 380, 30);
  s.fillStyle = bannerCol('#d9a441'); s.fillText('MATCH DAY ' + (save.round + 1), 0, 7); s.restore();
  // floodlights on the bowl corners
  for (const [fx, fy] of [[-110, -110], [W + 110, -110],
                          [-110, H + 110], [W + 110, H + 110]]) {
    const g = s.createRadialGradient(fx, fy, 4, fx, fy, 190);
    g.addColorStop(0, 'rgba(255,244,214,.16)'); g.addColorStop(1, 'rgba(255,244,214,0)');
    s.fillStyle = g; s.beginPath(); s.arc(fx, fy, 190, 0, 7); s.fill();
    s.fillStyle = '#2b313c'; s.beginPath(); s.arc(fx, fy, 11, 0, 7); s.fill();
    s.strokeStyle = '#12161e'; s.lineWidth = 2; s.stroke();
    for (const [lx, ly] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) {
      s.fillStyle = '#fff2cc'; s.beginPath(); s.arc(fx + lx, fy + ly, 2.4, 0, 7); s.fill();
    }
  }

  // pitch floor: worn steel plates
  for (let ty = 0; ty < 10; ty++) for (let tx = 0; tx < 8; tx++) {
    const x = tx * 80, y = ty * 96;
    s.fillStyle = (tx + ty) % 2 ? '#1c2430' : '#1a212c';
    s.fillRect(x, y, 80, 96);
    if (Math.random() < 0.3) { s.fillStyle = 'rgba(255,255,255,.015)'; s.fillRect(x, y, 80, 96); }
  }
  s.strokeStyle = '#242e3e'; s.lineWidth = 1.5;
  for (let y = 0; y <= H; y += 96) { s.beginPath(); s.moveTo(0, y); s.lineTo(W, y); s.stroke(); }
  for (let x = 0; x <= W; x += 80) { s.beginPath(); s.moveTo(x, 0); s.lineTo(x, H); s.stroke(); }
  s.fillStyle = '#2e3a4e';
  for (let y = 0; y <= H; y += 96) for (let x = 0; x <= W; x += 80) {
    s.beginPath(); s.arc(x + 6, y + 6, 2.6, 0, 7); s.fill();
  }
  for (let i = 0; i < 90; i++) {                              // scuffs and skid marks
    const x = rand(WALL, W - WALL), y = rand(WALL, H - WALL);
    const a = rand(0, Math.PI * 2), l = rand(6, 26);
    s.strokeStyle = 'rgba(255,255,255,' + rand(0.015, 0.05).toFixed(3) + ')';
    s.lineWidth = rand(1, 2.6);
    s.beginPath(); s.moveTo(x, y); s.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); s.stroke();
  }
  // markings
  s.strokeStyle = '#3d4f6e'; s.lineWidth = 3;
  s.beginPath(); s.moveTo(WALL, H / 2); s.lineTo(W - WALL, H / 2); s.stroke();
  s.beginPath(); s.arc(W / 2, H / 2, 84, 0, 7); s.stroke();
  s.beginPath(); s.arc(W / 2, WALL, 130, 0, Math.PI); s.stroke();          // goal creases
  s.beginPath(); s.arc(W / 2, H - WALL, 130, Math.PI, 2 * Math.PI); s.stroke();
  // centre emblem: riveted gear + star
  s.save(); s.translate(W / 2, H / 2); s.globalAlpha = 0.5;
  s.fillStyle = '#232c3c';
  for (let i = 0; i < 8; i++) { s.rotate(Math.PI / 4); s.fillRect(-7, -46, 14, 14); }
  s.beginPath(); s.arc(0, 0, 40, 0, 7); s.fill();
  s.strokeStyle = '#d9a441'; s.lineWidth = 2.5;
  s.beginPath(); s.arc(0, 0, 40, 0, 7); s.stroke();
  s.fillStyle = '#d9a441'; s.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 12 : 27;
    s[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr);
  }
  s.closePath(); s.fill();
  s.restore();

  // walls
  s.fillStyle = '#3f4b60';
  s.fillRect(-6, -6, W + 12, WALL + 6); s.fillRect(-6, H - WALL, W + 12, WALL + 6);
  s.fillRect(-6, 0, WALL + 6, H); s.fillRect(W - WALL, 0, WALL + 6, H);
  s.fillStyle = '#5a6d8c';
  s.fillRect(WALL - 4, WALL - 4, W - 2 * WALL + 8, 4);
  s.fillRect(WALL - 4, H - WALL, W - 2 * WALL + 8, 4);
  s.fillRect(WALL - 4, WALL, 4, H - 2 * WALL);
  s.fillRect(W - WALL, WALL, 4, H - 2 * WALL);
  s.fillStyle = '#2b3444';                                     // wall bolts
  for (let x = 40; x < W; x += 56) {
    s.beginPath(); s.arc(x, WALL / 2, 3, 0, 7); s.fill();
    s.beginPath(); s.arc(x, H - WALL / 2, 3, 0, 7); s.fill();
  }
  for (let y = 40; y < H; y += 56) {
    s.beginPath(); s.arc(WALL / 2, y, 3, 0, 7); s.fill();
    s.beginPath(); s.arc(W - WALL / 2, y, 3, 0, 7); s.fill();
  }
  // hazard chevrons beside the goal mouths
  for (const gy of [0, H - WALL]) for (const dir of [-1, 1]) {
    const sx = W / 2 + dir * GOAL_W / 2, len = 52;
    const bx0 = Math.min(sx, sx + dir * len);
    s.save(); s.beginPath(); s.rect(bx0, gy, len, WALL); s.clip();
    for (let i = -2; i < 8; i++) {
      s.fillStyle = i % 2 ? '#d9a441' : '#171b22';
      const bx = bx0 + i * 12;
      s.beginPath();
      s.moveTo(bx, gy + WALL); s.lineTo(bx + 8, gy);
      s.lineTo(bx + 16, gy); s.lineTo(bx + 8, gy + WALL);
      s.closePath(); s.fill();
    }
    s.restore();
  }
  // goal bays: recessed nets, team-colour bar + glow, posts
  for (const side of [0, 1]) {                                // 0 = bottom (user's goal to defend)
    const gy = side ? 0 : H - WALL;
    const col = M.teams[side ? 1 : 0].color;
    s.fillStyle = '#0c1017';
    s.fillRect(W / 2 - GOAL_W / 2, gy, GOAL_W, WALL);
    s.strokeStyle = '#2b3444'; s.lineWidth = 1;
    for (let x = W / 2 - GOAL_W / 2; x <= W / 2 + GOAL_W / 2; x += 7) {
      s.beginPath(); s.moveTo(x, gy); s.lineTo(x, gy + WALL); s.stroke();
    }
    for (let y = gy; y <= gy + WALL; y += 7) {
      s.beginPath(); s.moveTo(W / 2 - GOAL_W / 2, y); s.lineTo(W / 2 + GOAL_W / 2, y); s.stroke();
    }
    s.fillStyle = col;
    s.fillRect(W / 2 - GOAL_W / 2, side ? WALL - 5 : gy, GOAL_W, 5);
    const gy2 = side ? WALL : H - WALL;
    const glow = s.createLinearGradient(0, gy2, 0, gy2 + (side ? 46 : -46));
    glow.addColorStop(0, col + '55'); glow.addColorStop(1, col + '00');
    s.fillStyle = glow;
    s.fillRect(W / 2 - GOAL_W / 2 - 8, side ? WALL : H - WALL - 46, GOAL_W + 16, 46);
    s.fillStyle = '#aeb6c4';
    s.fillRect(W / 2 - GOAL_W / 2 - 7, side ? 0 : H - WALL, 7, WALL);
    s.fillRect(W / 2 + GOAL_W / 2, side ? 0 : H - WALL, 7, WALL);
  }
  // vignette
  const vg = s.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.30)');
  s.fillStyle = vg; s.fillRect(-MARGIN, -MARGIN, cw, ch);
  return c;
}

/* ---------- rendering ---------- */
function draw() {
  const B = M.ball;
  cx.setTransform(RES, 0, 0, RES, MARGIN * RES, MARGIN * RES);
  const flick = M.phase === 'goal' ? 120 : 700;                // crowd goes wild on goals
  const bg = M.bg[Math.floor(performance.now() / flick) % 2];
  cx.drawImage(bg, -MARGIN, -MARGIN, W + 2 * MARGIN, H + 2 * MARGIN);

  if (M.phase === 'goal') {                                     // celebration flash
    cx.fillStyle = 'rgba(255,240,200,' + (0.12 * Math.max(0, M.phaseT - 0.6)).toFixed(3) + ')';
    cx.fillRect(-MARGIN, -MARGIN, W + 2 * MARGIN, H + 2 * MARGIN);
  }

  // players back-to-front so the big guys overlap naturally
  const ps = M.players.filter(p => !p.out).sort((a, b) => (a.y - b.y) || (b.r - a.r));
  for (const p of ps) {
    const spr = p.sprite, sw = spr.width / RES;
    cx.fillStyle = 'rgba(0,0,0,.42)';
    cx.beginPath(); cx.ellipse(p.x + 3, p.y + 5, p.r * 0.95, p.r * 0.6, 0, 0, 7); cx.fill();
    cx.save();
    cx.translate(p.x, p.y);
    if (p.down > 0) { cx.globalAlpha = 0.6; cx.rotate(p.face); cx.scale(1, 0.82); }
    else cx.rotate(p.face + Math.PI / 2);
    cx.drawImage(spr, -sw / 2, -sw / 2, sw, sw);
    cx.restore();
    if (p.down > 0) {
      cx.fillStyle = '#ffe9b0'; cx.font = 'bold 13px monospace'; cx.textAlign = 'center';
      cx.fillText('✶ ✶', p.x, p.y - p.r - 6);                   // seeing stars
    }
    if (M.ball.holder === p) {
      cx.strokeStyle = 'rgba(255,255,255,.9)'; cx.lineWidth = 2;
      cx.beginPath(); cx.arc(p.x, p.y, p.r + 3, 0, 7); cx.stroke();
    }
    if (p === M.active) {
      cx.strokeStyle = '#ffe9b0'; cx.lineWidth = 3;
      cx.beginPath(); cx.arc(p.x, p.y, p.r + 6, 0, 7); cx.stroke();
      cx.fillStyle = '#ffe9b0'; cx.font = 'bold 13px monospace'; cx.textAlign = 'center';
      cx.fillText(p.name.split(' ')[0].toUpperCase(), p.x, p.y - p.r - 12);
    }
  }

  // ball (glows when loose)
  cx.fillStyle = 'rgba(0,0,0,.42)';
  cx.beginPath(); cx.ellipse(B.x + 2, B.y + 4, BR, BR * 0.6, 0, 0, 7); cx.fill();
  if (!B.holder) {
    const g = cx.createRadialGradient(B.x, B.y, 2, B.x, B.y, BR * 3);
    g.addColorStop(0, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    cx.fillStyle = g; cx.beginPath(); cx.arc(B.x, B.y, BR * 3, 0, 7); cx.fill();
  }
  const grad = cx.createRadialGradient(B.x - 2, B.y - 2, 1, B.x, B.y, BR);
  grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#8fa3c4');
  cx.fillStyle = grad;
  cx.beginPath(); cx.arc(B.x, B.y, BR, 0, 7); cx.fill();
  cx.strokeStyle = '#0c1017'; cx.lineWidth = 1.5; cx.stroke();
  cx.strokeStyle = 'rgba(20,26,36,.8)'; cx.lineWidth = 1;       // panel seam
  cx.beginPath(); cx.arc(B.x, B.y, BR * 0.55, 0, 7); cx.stroke();

  // phase banners
  if (M.phase === 'kickoff' || M.phase === 'goal' || M.phase === 'halftime') {
    cx.fillStyle = 'rgba(10,13,18,.62)';
    cx.fillRect(-MARGIN, H / 2 - 60, W + 2 * MARGIN, 120);
    cx.strokeStyle = '#d9a441'; cx.lineWidth = 2;
    cx.strokeRect(-MARGIN, H / 2 - 60, W + 2 * MARGIN, 120);
    cx.fillStyle = '#ffe9b0'; cx.font = 'bold 46px monospace'; cx.textAlign = 'center';
    cx.fillText(M.phase === 'goal' ? 'GOAL!' : M.phase === 'halftime' ? 'HALF TIME' : 'READY…',
      W / 2, H / 2 + 15);
  }

  // Auto Coach indicator
  if (M.autoCoach) {
    cx.fillStyle = 'rgba(89,214,230,.95)';
    cx.font = 'bold 15px monospace'; cx.textAlign = 'left';
    cx.fillText('◉ AUTO COACH', WALL + 8, WALL + 30);
  }
}

function loop(t) {
  if (!M || M.phase === 'ended') return;
  const frame = Math.min(0.05, (t - lastTime) / 1000);
  lastTime = t;
  // The speed dial scales how much match-time we simulate per real frame, which
  // shortens/lengthens the whole game. Sub-step so physics stays stable when fast.
  let acc = Math.min(0.25, frame * (save.speed || 1));
  do {
    const s = Math.min(0.05, acc);
    step(s);
    if (!M || M.phase === 'ended') return;
    acc -= s;
  } while (acc > 1e-4);
  requestAnimationFrame(loop);
}

/* debug/testing hook: step the sim manually from the console */
window.__bb = { step: dt => step(dt), state: () => M, save: () => save };

/* ---------- Auto Coach + speed dial ---------- */
function setAutoCoach(on) {
  on = !!on;
  if (M) M.autoCoach = on;
  save.autoCoach = on; persist();
  const b = $('btn-autocoach');
  if (b) { b.textContent = 'AUTO COACH: ' + (on ? 'ON' : 'OFF'); b.classList.toggle('on', on); }
  const help = $('controls-help');
  if (help) help.textContent = on
    ? 'AUTO COACH ON — the team plays itself. Press the button (or P) to take control back.'
    : 'MOVE: WASD / arrows · SPACE: pass / tackle · X: shoot · C: switch player · P: auto coach';
}

function fmtClock(sec) {
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}
function estMatchSeconds(speed) { return (2 * HALF_LEN) / speed; }  // real seconds for a full match
function syncSpeedReadout() {
  const el = $('speed-readout');
  if (el) el.textContent = save.speed.toFixed(1) + '× · ~' + fmtClock(estMatchSeconds(save.speed));
}
function syncMatchControls() {
  const dial = $('speed-dial');
  if (dial) dial.value = save.speed;
  syncSpeedReadout();
  document.querySelectorAll('.backdrop-pick').forEach(sel => { sel.value = save.backdrop; });
  setAutoCoach(!!(M && M.autoCoach));
}

/* ---------- wiring ---------- */
$('btn-autocoach').onclick = () => setAutoCoach(!(M && M.autoCoach));
{
  const dial = $('speed-dial');
  dial.value = save.speed;
  dial.addEventListener('input', e => {
    save.speed = clamp(Number(e.target.value) || 1, 0.5, 4);
    persist(); syncSpeedReadout();
  });
  syncSpeedReadout();
}
document.querySelectorAll('.backdrop-pick').forEach(sel => {
  BACKDROPS.forEach(([value, label]) => sel.add(new Option(label, value)));
  sel.value = save.backdrop;
  sel.addEventListener('change', () => {
    save.backdrop = sel.value; persist();
    document.querySelectorAll('.backdrop-pick').forEach(o => { o.value = sel.value; });
    if (M && M.phase !== 'ended') M.bg = [buildStadium(0), buildStadium(1)];  // live switch
  });
});
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
