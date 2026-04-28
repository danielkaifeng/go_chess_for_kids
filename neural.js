// ── Neural network AI — TensorFlow.js policy network ──────────────────────────
// tf is loaded globally via CDN in index.html
import { BLACK, WHITE, EMPTY, GoGame } from './go-rules.js';
import { validMoves, scoreMove } from './ai.js';

const TS    = 19;  // tensor grid (always 19×19; smaller boards are centred)
const NCHAN = 6;   // feature channels per intersection

let _model = null;
export const isNetworkReady = () => _model !== null;

// ── Board → feature tensor ────────────────────────────────────────────────────
export function boardToFeatures(g) {
  const data = new Float32Array(TS * TS * NCHAN);
  const sz   = g.size;
  const off  = (TS - sz) >> 1;
  const me   = g.turn;
  const them = me === BLACK ? WHITE : BLACK;

  // Pre-compute per-stone liberty count (normalised to 0–1, cap at 4)
  const libMap = new Map();
  const seen   = new Set();
  for (let x = 0; x < sz; x++) {
    for (let y = 0; y < sz; y++) {
      if (g.board[x][y] === EMPTY) continue;
      const key = x * sz + y;
      if (seen.has(key)) continue;
      const grp  = g.getGroup(x, y);
      const norm = Math.min(grp.liberties.size / 4, 1);
      for (const [gx, gy] of grp.stones) {
        seen.add(gx * sz + gy);
        libMap.set(gx * sz + gy, norm);
      }
    }
  }

  const last = g.moves.length > 0 && !g.moves[g.moves.length - 1].pass
    ? g.moves[g.moves.length - 1] : null;
  const prev = g.moves.length > 1 && !g.moves[g.moves.length - 2].pass
    ? g.moves[g.moves.length - 2] : null;

  for (let x = 0; x < sz; x++) {
    for (let y = 0; y < sz; y++) {
      const tx   = x + off;
      const ty   = y + off;
      const b    = (tx * TS + ty) * NCHAN;
      const cell = g.board[x][y];
      const lib  = libMap.get(x * sz + y) ?? 0;
      if (cell === me)   { data[b]     = 1; data[b + 2] = lib; }
      if (cell === them) { data[b + 1] = 1; data[b + 3] = lib; }
      if (last && last.x === x && last.y === y) data[b + 4] = 1;
      if (prev && prev.x === x && prev.y === y) data[b + 5] = 1;
    }
  }
  return data;
}

// ── Policy priors from trained network ───────────────────────────────────────
export async function getPolicyPriors(g, candidates) {
  if (!_model) return null;
  const feats = boardToFeatures(g);
  const xT    = tf.tensor4d(feats, [1, TS, TS, NCHAN]);
  const pT    = _model.predict(xT);
  const raw   = await pT.data();
  tf.dispose([xT, pT]);

  const off = (TS - g.size) >> 1;
  return candidates.map(m => raw[(m.x + off) * TS + (m.y + off)]);
}

// ── Model definition ──────────────────────────────────────────────────────────
function buildModel() {
  const inp = tf.input({ shape: [TS, TS, NCHAN] });
  let x = tf.layers.conv2d({ filters: 48, kernelSize: 3, padding: 'same', activation: 'relu' }).apply(inp);
  x     = tf.layers.conv2d({ filters: 64, kernelSize: 3, padding: 'same', activation: 'relu' }).apply(x);
  x     = tf.layers.conv2d({ filters: 32, kernelSize: 3, padding: 'same', activation: 'relu' }).apply(x);
  let p = tf.layers.conv2d({ filters: 4,  kernelSize: 1, activation: 'relu' }).apply(x);
  p     = tf.layers.flatten().apply(p);
  p     = tf.layers.dense({ units: TS * TS, activation: 'softmax' }).apply(p);
  return tf.model({ inputs: inp, outputs: p });
}

// ── Training position generator ───────────────────────────────────────────────
// Plays a short heuristic game to produce a mid-game board state
function syntheticPosition() {
  const SIZES = [9, 13, 13, 13, 19];
  const sz    = SIZES[Math.floor(Math.random() * SIZES.length)];
  const g     = new GoGame(sz);
  const n     = 6 + Math.floor(Math.random() * 22);
  for (let i = 0; i < n && !g.over; i++) {
    const mvs = validMoves(g);
    if (!mvs.length) { g.pass(); continue; }
    const scored = mvs
      .map(([x, y]) => ({ x, y, s: Math.max(0.1, scoreMove(g, x, y, g.turn) + 50) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 8);
    const tot = scored.reduce((a, m) => a + m.s, 0);
    let r = Math.random() * tot, chosen = scored[0];
    for (const m of scored) { r -= m.s; if (r <= 0) { chosen = m; break; } }
    g.tryMove(chosen.x, chosen.y);
  }
  return g;
}

// ── Public: build, train, and activate the network ───────────────────────────
export async function initNetwork(onStatus) {
  if (typeof tf === 'undefined') {
    console.warn('TF.js not loaded — Hard AI will use MCTS fallback');
    return;
  }
  await tf.ready();
  const m = buildModel();

  // ── Generate synthetic training corpus ──────────────────────────────────
  const N  = 250;
  const XS = [], YS = [];
  onStatus?.('🧠 Generating training data…');
  for (let i = 0; i < N; i++) {
    if (i % 50 === 0) await new Promise(r => setTimeout(r, 0));
    const g   = syntheticPosition();
    const mvs = validMoves(g);
    if (mvs.length < 3) continue;

    const scores = mvs.map(([x, y]) => Math.max(0.01, scoreMove(g, x, y, g.turn) + 50));
    const tot    = scores.reduce((a, b) => a + b, 0);
    const pol    = new Float32Array(TS * TS).fill(1e-7);
    const off    = (TS - g.size) >> 1;
    mvs.forEach(([x, y], idx) => { pol[(x + off) * TS + (y + off)] = scores[idx] / tot; });

    XS.push(boardToFeatures(g));
    YS.push(pol);
  }

  // ── Pack into tensors ─────────────────────────────────────────────────────
  const n    = XS.length;
  const xBuf = new Float32Array(n * TS * TS * NCHAN);
  XS.forEach((f, i) => xBuf.set(f, i * TS * TS * NCHAN));
  const yBuf = new Float32Array(n * TS * TS);
  YS.forEach((p, i) => yBuf.set(p, i * TS * TS));
  const xT = tf.tensor4d(xBuf, [n, TS, TS, NCHAN]);
  const yT = tf.tensor2d(yBuf, [n, TS * TS]);

  // ── Supervised training ───────────────────────────────────────────────────
  m.compile({ optimizer: tf.train.adam(0.005), loss: 'categoricalCrossentropy' });
  onStatus?.('🧠 Training neural network…');
  await m.fit(xT, yT, {
    epochs:    10,
    batchSize: 32,
    shuffle:   true,
    verbose:   0,
    callbacks: {
      onEpochEnd: async (epoch) => {
        onStatus?.(`🧠 Training: epoch ${epoch + 1}/10`);
        await new Promise(r => setTimeout(r, 0));
      },
    },
  });
  tf.dispose([xT, yT]);

  _model = m;
  onStatus?.('🧠 Neural network ready!');
}
