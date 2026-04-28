// ── AI engine — pure logic, no DOM ────────────────────────────────────────────
import { BLACK, WHITE, EMPTY } from './go-rules.js';

// ── Move utilities ────────────────────────────────────────────────────────────

export function validMoves(g) {
  const out = [];
  for (let x = 0; x < g.size; x++)
    for (let y = 0; y < g.size; y++) {
      if (g.board[x][y] !== EMPTY) continue;
      const t = g.clone();
      if (t.tryMove(x, y).ok) out.push([x, y]);
    }
  return out;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Chebyshev (chessboard) distance — good proxy for Go locality
function chebyshev(x1, y1, x2, y2) {
  return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));
}

// Weight multiplier: moves close to the last stone are strongly favored
function localWeight(x, y, lx, ly, l2x, l2y) {
  let w = 1.0;
  if (lx != null) {
    const d = chebyshev(x, y, lx, ly);
    if      (d === 1) w *= 10;
    else if (d === 2) w *= 5;
    else if (d === 3) w *= 2;
  }
  if (l2x != null && chebyshev(x, y, l2x, l2y) <= 2) w *= 1.5;
  return w;
}

// Prefer 3rd/4th line from edge for first 20 moves (standard Go opening principle)
function openingBonus(x, y, size, moveNum) {
  if (moveNum > 20) return 1.0;
  const d = Math.min(x, y, size - 1 - x, size - 1 - y);
  if (d === 0) return 0.02;
  if (d === 1) return 0.10;
  if (d === 2) return 3.00;
  if (d === 3) return 2.50;
  return 1.0;
}

// One-ply heuristic score for a single move
function scoreMove(g, x, y, color) {
  const opp = color === BLACK ? WHITE : BLACK;
  const tmp = g.clone();
  const res = tmp.tryMove(x, y);
  if (!res.ok) return -Infinity;
  let s = res.captured * 20;

  const og = tmp.getGroup(x, y);
  if (og && og.liberties.size === 1) s -= 18;  // self-atari penalty
  if (og && og.liberties.size >= 3) s += 3;

  for (const [nx, ny] of tmp.neighbors(x, y)) {
    if (tmp.board[nx][ny] === opp) {
      const grp = tmp.getGroup(nx, ny);
      if (grp && grp.liberties.size === 1) s += 10;  // put opponent in atari
    }
  }
  for (const [nx, ny] of g.neighbors(x, y)) {
    if (g.board[nx][ny] === color) {
      const grp = g.getGroup(nx, ny);
      if (grp && grp.liberties.size === 1) s += 25;  // rescue own group in atari
    }
  }

  let ownNb = 0;
  for (const [nx, ny] of tmp.neighbors(x, y)) {
    if (tmp.board[nx][ny] === color) ownNb++;
  }
  s += ownNb * 1.5;

  const edge = g.size - 1;
  if (x === 0 || y === 0 || x === edge || y === edge) s -= 6;

  const c = edge / 2;
  s += Math.max(0, (g.size / 2 - Math.abs(x - c) - Math.abs(y - c)) * 0.2);
  return s;
}

// ── Fast playout — random with local bias ─────────────────────────────────────
// seedX/seedY: coordinates of the last placed stone — playout stays local 70% of the time
function fastPlayout(g, maxMoves, seedX, seedY) {
  const sim = g.clone();
  const sz = sim.size;
  let lx = seedX, ly = seedY;
  let passes = 0;

  for (let i = 0; i < maxMoves; i++) {
    const cands = [];

    if (lx != null && Math.random() < 0.7) {
      for (let a = 0; a < sz * 2 && cands.length < 5; a++) {
        const nx = lx + Math.floor(Math.random() * 7) - 3;
        const ny = ly + Math.floor(Math.random() * 7) - 3;
        if (nx >= 0 && ny >= 0 && nx < sz && ny < sz && sim.board[nx][ny] === EMPTY)
          cands.push([nx, ny]);
      }
    }
    for (let a = 0; a < sz * 3 && cands.length < 8; a++) {
      const nx = Math.floor(Math.random() * sz);
      const ny = Math.floor(Math.random() * sz);
      if (sim.board[nx][ny] === EMPTY) cands.push([nx, ny]);
    }

    let moved = false;
    for (const [nx, ny] of cands) {
      if (sim.tryMove(nx, ny).ok) { passes = 0; lx = nx; ly = ny; moved = true; break; }
    }
    if (!moved) { if (++passes >= 2) break; sim.pass(); }
  }
  return sim.scoreGame().winner;
}

// ── Beginner AI — random with local bias, avoids first line ───────────────────
export function aiBeginner(g) {
  const all  = shuffle(validMoves(g));
  if (!all.length) return null;
  const edge = g.size - 1;
  const inner = all.filter(([x, y]) => x > 0 && y > 0 && x < edge && y < edge);
  const pool  = inner.length ? inner : all;

  const last = g.moves.length > 0 && !g.moves[g.moves.length - 1].pass
    ? g.moves[g.moves.length - 1] : null;
  if (last && Math.random() < 0.7) {
    const local = pool.filter(([x, y]) => chebyshev(x, y, last.x, last.y) <= 3);
    if (local.length) return local[0];
  }
  return pool[0];
}

// ── Hard AI — MCTS with local-response + opening bias ─────────────────────────
export async function aiHard(g) {
  const color = g.turn;
  const allMoves = validMoves(g);
  if (!allMoves.length) return null;

  const last  = g.moves.length > 0 && !g.moves[g.moves.length - 1].pass
    ? g.moves[g.moves.length - 1] : null;
  const prev  = g.moves.length > 1 && !g.moves[g.moves.length - 2].pass
    ? g.moves[g.moves.length - 2] : null;
  const moveNum = g.moves.length;

  // Compute combined weight: local response × opening bonus × heuristic
  const weighted = allMoves.map(([x, y]) => {
    const hs = scoreMove(g, x, y, color);
    if (hs === -Infinity) return null;
    const lw = localWeight(x, y, last?.x, last?.y, prev?.x, prev?.y);
    const ob = openingBonus(x, y, g.size, moveNum);
    return { x, y, w: lw * ob * Math.max(1, hs + 50) };
  }).filter(Boolean);

  if (!weighted.length) return [allMoves[0][0], allMoves[0][1]];

  // 90 % local candidates, 10 % random exploration
  let local = [], other = [];
  if (last) {
    for (const m of weighted) {
      (chebyshev(m.x, m.y, last.x, last.y) <= 3 ? local : other).push(m);
    }
  } else {
    other = weighted;
  }
  const pool = (local.length > 0 && Math.random() < 0.9) ? local : (other.length ? other : weighted);
  pool.sort((a, b) => b.w - a.w);
  const candidates = pool.slice(0, Math.min(15, pool.length));

  // UCB1 MCTS
  const wins = new Map(), plays = new Map();
  for (const m of candidates) { const k = m.x * g.size + m.y; wins.set(k, 0); plays.set(k, 0); }

  const totalRollouts = candidates.length * 25;
  const batchSize     = 25;
  for (let done = 0; done < totalRollouts; done += batchSize) {
    await new Promise(r => setTimeout(r, 0));
    for (let b = 0; b < batchSize && done + b < totalRollouts; b++) {
      const total = [...plays.values()].reduce((a, v) => a + v, 0) + 1;
      let bk = null, bu = -Infinity;
      for (const m of candidates) {
        const k = m.x * g.size + m.y, p = plays.get(k), w = wins.get(k);
        const u = p === 0 ? Infinity : w / p + Math.sqrt(1.5 * Math.log(total) / p);
        if (u > bu) { bu = u; bk = k; }
      }
      const mx = Math.floor(bk / g.size), my = bk % g.size;
      const tmp = g.clone();
      tmp.tryMove(mx, my);
      const winner = fastPlayout(tmp, g.size * 3, mx, my);
      plays.set(bk, plays.get(bk) + 1);
      if (winner === color) wins.set(bk, wins.get(bk) + 1);
    }
  }

  let best = candidates[0], bp = -1;
  for (const m of candidates) { const p = plays.get(m.x * g.size + m.y); if (p > bp) { bp = p; best = m; } }
  return [best.x, best.y];
}

// ── Hint system — always uses MCTS with local bias ────────────────────────────
export async function computeHintsAsync(g) {
  const color = g.turn;
  const allMoves = validMoves(g);
  if (!allMoves.length) return [];

  const last = g.moves.length > 0 && !g.moves[g.moves.length - 1].pass
    ? g.moves[g.moves.length - 1] : null;

  // Pre-rank: heuristic score weighted by local proximity
  const candidates = allMoves
    .map(([x, y]) => {
      const s = scoreMove(g, x, y, color);
      if (s === -Infinity) return null;
      const lw = localWeight(x, y, last?.x, last?.y, null, null);
      return { x, y, score: s * lw };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  if (!candidates.length) return [];

  const wins = new Map(), plays = new Map();
  candidates.forEach(m => { const k = `${m.x},${m.y}`; wins.set(k, 0); plays.set(k, 0); });

  const rollouts = Math.min(120, candidates.length * 18);
  const batch    = 20;
  for (let done = 0; done < rollouts; done += batch) {
    await new Promise(r => setTimeout(r, 0));
    for (let b = 0; b < batch && done + b < rollouts; b++) {
      const m = candidates[Math.floor(Math.random() * candidates.length)];
      const k = `${m.x},${m.y}`;
      const tmp = g.clone();
      tmp.tryMove(m.x, m.y);
      const winner = fastPlayout(tmp, Math.min(g.size * 3, 45), m.x, m.y);
      plays.set(k, plays.get(k) + 1);
      if (winner === color) wins.set(k, wins.get(k) + 1);
    }
  }

  return candidates
    .sort((a, b) => {
      const ka = `${a.x},${a.y}`, kb = `${b.x},${b.y}`;
      const pa = plays.get(ka) || 0, pb = plays.get(kb) || 0;
      const ra = pa > 0 ? wins.get(ka) / pa : 0.5;
      const rb = pb > 0 ? wins.get(kb) / pb : 0.5;
      return rb - ra;
    })
    .slice(0, 3);
}
