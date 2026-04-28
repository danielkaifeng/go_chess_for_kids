import { initDB, saveGame, loadHistory, exportSGF } from './db.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const EMPTY = 0, BLACK = 1, WHITE = 2;
const KOMI  = 6.5;

// ── AI Profiles ───────────────────────────────────────────────────────────────
const AI_PROFILES = [
  { avatar: '👦', name: '小明',  title: '围棋爱好者' },
  { avatar: '👧', name: '小红',  title: '棋盘新手'   },
  { avatar: '🧒', name: '阿虎',  title: '围棋少年'   },
  { avatar: '👦', name: '天宝',  title: '棋盘小将'   },
  { avatar: '👧', name: '云霞',  title: '围棋达人'   },
  { avatar: '🧑', name: '棋圣',  title: '九段高手'   },
  { avatar: '👦', name: '小龙',  title: '围棋少年'   },
  { avatar: '👧', name: '晓燕',  title: '棋盘高手'   },
  { avatar: '🧒', name: '阿飞',  title: '围棋爱好者' },
  { avatar: '🧑', name: '云飞',  title: '棋盘达人'   },
  { avatar: '👦', name: '小虎',  title: '围棋迷'     },
  { avatar: '👧', name: '小鱼',  title: '棋盘新手'   },
  { avatar: '🧒', name: '阿强',  title: '围棋少年'   },
  { avatar: '👦', name: '天才',  title: '天才棋手'   },
  { avatar: '👧', name: '小石',  title: '围棋爱好者' },
  { avatar: '🧑', name: '阿超',  title: '棋盘高手'   },
  { avatar: '👦', name: '子云',  title: '围棋少年'   },
  { avatar: '👧', name: '晓峰',  title: '棋盘新手'   },
  { avatar: '🧒', name: '大明',  title: '围棋达人'   },
  { avatar: '🧑', name: '九段',  title: '围棋高手'   },
];

// ── Emoji tables ──────────────────────────────────────────────────────────────
const EMOJI = {
  thinking: ['🤔', '🤔', '💭', '🧐'],
  laugh:    ['😄', '😆', '😏', '😈', '😝', '🎯'],
  cry:      ['😢', '😭', '😤', '😰', '🥺'],
  pass:     ['🤷', '😶', '🙄'],
  winGame:  ['🎉', '😄', '🏆', '🥇', '🤩'],
  loseGame: ['😭', '😔', '😢', '🤝'],
  greet:    ['👋', '😊', '✌️', '🙂', '😃'],
};

const EMOJI_REPLIES = {
  '😀':['😁','😄'], '😂':['🤣','😆'], '😎':['😎','😏'],
  '🤔':['🤔','💭'], '😮':['😮','😲'], '😭':['😅','🙃'],
  '👍':['😊','👍'], '❤️':['🥰','😊'], '🎉':['🎉','😄'],
  '🤗':['🤗','😊'], '😤':['😏','😄'], '🙈':['🙈','😂'],
  '🤩':['😄','🤩'], '😴':['😅','🤫'], '🙄':['😏','😄'],
};

function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ── State ─────────────────────────────────────────────────────────────────────
let game            = null;
let difficulty      = 'beginner';
let aiThinking      = false;
let gameStartTime   = null;
let db              = null;
let currentProfile  = AI_PROFILES[0];
let emotionTimer    = null;
let boardEmotionTimer = null;
let hintComputing   = false;
let hintMoves       = [];   // [{x,y}] top-3 from MCTS, cached per turn
let hintCount       = 0;    // which hint is shown (0=none, 1,2,3)

// ── Web Audio ─────────────────────────────────────────────────────────────────
let audioCtx = null;

function getAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

// Stone placement: short noise burst through a bandpass → "tock" on wood
function playStoneSound(isAI = false) {
  try {
    const ac  = getAudio();
    const now = ac.currentTime;
    const dur = 0.07;

    const len = Math.ceil(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.25));
    }

    const src = ac.createBufferSource();
    src.buffer = buf;

    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = isAI ? 900 : 1200;
    bp.Q.value = 3.5;

    const g = ac.createGain();
    g.gain.setValueAtTime(0.55, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);

    src.connect(bp); bp.connect(g); g.connect(ac.destination);
    src.start(now);
  } catch (_) { /* silent fail */ }
}

// Capture: deeper thud — lower frequency burst
function playCaptureSound() {
  try {
    const ac  = getAudio();
    const now = ac.currentTime;
    const dur = 0.12;

    const len = Math.ceil(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.35));
    }

    const src = ac.createBufferSource();
    src.buffer = buf;

    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 350;
    bp.Q.value = 2;

    const g = ac.createGain();
    g.gain.setValueAtTime(0.7, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);

    src.connect(bp); bp.connect(g); g.connect(ac.destination);
    src.start(now);
  } catch (_) {}
}

// Emoji notification: ascending two-note "ding"
function playEmojiSound() {
  try {
    const ac  = getAudio();
    const now = ac.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc  = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t0 = now + i * 0.11;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.13, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.22);
      osc.start(t0); osc.stop(t0 + 0.22);
    });
  } catch (_) {}
}

// ── GoGame class ──────────────────────────────────────────────────────────────
class GoGame {
  constructor(size) {
    this.size   = size;
    this.board  = Array.from({ length: size }, () => new Array(size).fill(EMPTY));
    this.turn   = BLACK;
    this.captures = { [BLACK]: 0, [WHITE]: 0 };
    this.history  = [];
    this.moves    = [];
    this.consecutivePasses = 0;
    this.over   = false;
    this.result = null;
  }

  clone() {
    const g = new GoGame(this.size);
    g.board = this.board.map(r => r.slice());
    g.turn  = this.turn;
    g.captures = { ...this.captures };
    g.history  = this.history.map(s => s.slice());
    g.consecutivePasses = this.consecutivePasses;
    g.over = this.over;
    return g;
  }

  boardKey() { return this.board.flat().join(''); }

  neighbors(x, y) {
    const nb = [];
    if (x > 0)           nb.push([x-1, y]);
    if (x < this.size-1) nb.push([x+1, y]);
    if (y > 0)           nb.push([x, y-1]);
    if (y < this.size-1) nb.push([x, y+1]);
    return nb;
  }

  getGroup(x, y) {
    const color = this.board[x][y];
    if (color === EMPTY) return null;
    const visited = new Set(), stones = [], liberties = new Set();
    const stack = [[x, y]];
    while (stack.length) {
      const [cx, cy] = stack.pop();
      const key = cx * this.size + cy;
      if (visited.has(key)) continue;
      visited.add(key);
      stones.push([cx, cy]);
      for (const [nx, ny] of this.neighbors(cx, cy)) {
        const nk = nx * this.size + ny;
        if      (this.board[nx][ny] === EMPTY) liberties.add(nk);
        else if (this.board[nx][ny] === color && !visited.has(nk)) stack.push([nx, ny]);
      }
    }
    return { stones, liberties };
  }

  removeCaptured(x, y, opp) {
    let n = 0;
    for (const [nx, ny] of this.neighbors(x, y)) {
      if (this.board[nx][ny] === opp) {
        const grp = this.getGroup(nx, ny);
        if (grp.liberties.size === 0) {
          for (const [sx, sy] of grp.stones) { this.board[sx][sy] = EMPTY; n++; }
        }
      }
    }
    return n;
  }

  tryMove(x, y) {
    if (this.over)                  return { ok: false, reason: 'Game is over' };
    if (this.board[x][y] !== EMPTY) return { ok: false, reason: 'Occupied' };

    const color    = this.turn;
    const opp      = color === BLACK ? WHITE : BLACK;
    const saved    = this.board.map(r => r.slice());
    const snapshot = this.boardKey();

    this.board[x][y] = color;
    const captured   = this.removeCaptured(x, y, opp);

    if (this.getGroup(x, y).liberties.size === 0) {
      this.board = saved;
      return { ok: false, reason: 'Suicide move' };
    }
    const newKey = this.boardKey();
    if (this.history.length && newKey === this.history[this.history.length - 1]) {
      this.board = saved;
      return { ok: false, reason: 'Ko violation' };
    }

    this.history.push(snapshot);
    if (this.history.length > 8) this.history.shift();
    this.captures[color] += captured;
    this.consecutivePasses = 0;
    this.moves.push({ color, x, y });
    this.turn = opp;
    return { ok: true, captured };
  }

  pass() {
    if (this.over) return;
    this.moves.push({ color: this.turn, pass: true });
    this.consecutivePasses++;
    this.turn = this.turn === BLACK ? WHITE : BLACK;
    if (this.consecutivePasses >= 2) { this.over = true; this.result = this.scoreGame(); }
  }

  resign(color) {
    this.over = true;
    this.result = { winner: color === BLACK ? WHITE : BLACK, reason: 'resignation' };
  }

  scoreGame() {
    const sz = this.size;
    const territory = { [BLACK]: 0, [WHITE]: 0 };
    const visited   = Array.from({ length: sz }, () => new Array(sz).fill(false));

    for (let x = 0; x < sz; x++) {
      for (let y = 0; y < sz; y++) {
        if (!visited[x][y] && this.board[x][y] === EMPTY) {
          const region = [], borders = new Set(), stack = [[x, y]];
          while (stack.length) {
            const [cx, cy] = stack.pop();
            if (visited[cx][cy]) continue;
            visited[cx][cy] = true;
            if (this.board[cx][cy] === EMPTY) {
              region.push([cx, cy]);
              for (const [nx, ny] of this.neighbors(cx, cy)) if (!visited[nx][ny]) stack.push([nx, ny]);
            } else borders.add(this.board[cx][cy]);
          }
          if (borders.size === 1) territory[[...borders][0]] += region.length;
        }
      }
    }
    for (let x = 0; x < sz; x++)
      for (let y = 0; y < sz; y++)
        if (this.board[x][y] !== EMPTY) territory[this.board[x][y]]++;

    const bt = territory[BLACK] + this.captures[BLACK];
    const wt = territory[WHITE] + this.captures[WHITE] + KOMI;
    const d  = bt - wt;
    return { winner: d > 0 ? BLACK : WHITE, reason: 'score',
             margin: Math.abs(d).toFixed(1),
             blackTotal: bt.toFixed(1), whiteTotal: wt.toFixed(1) };
  }

  toSGF() {
    const c = n => String.fromCharCode(97 + n);
    let s = `(;GM[1]FF[4]CA[UTF-8]SZ[${this.size}]KM[${KOMI}]`;
    for (const mv of this.moves)
      s += mv.pass ? `;${mv.color===BLACK?'B':'W'}[]`
                   : `;${mv.color===BLACK?'B':'W'}[${c(mv.x)}${c(mv.y)}]`;
    return s + ')';
  }
}

// ── AI helpers ────────────────────────────────────────────────────────────────

function validMoves(g) {
  const out = [];
  for (let x = 0; x < g.size; x++)
    for (let y = 0; y < g.size; y++) {
      if (g.board[x][y] !== EMPTY) continue;
      const t = g.clone(); if (t.tryMove(x, y).ok) out.push([x, y]);
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

function scoreMove(g, x, y, color) {
  const opp = color === BLACK ? WHITE : BLACK;
  const tmp = g.clone();
  const res = tmp.tryMove(x, y);
  if (!res.ok) return -Infinity;
  let s = res.captured * 10;
  for (const [nx, ny] of tmp.neighbors(x, y)) {
    if (tmp.board[nx][ny] === opp) {
      const grp = tmp.getGroup(nx, ny);
      if (grp && grp.liberties.size === 1) s += 5;
    }
  }
  const og = tmp.getGroup(x, y);
  if (og && og.liberties.size === 1) s -= 8;
  const c = (g.size - 1) / 2;
  s += Math.max(0, (g.size / 2 - Math.abs(x - c) - Math.abs(y - c)) * 0.3);
  return s;
}

// Beginner: random but avoids first line
function aiBeginner(g) {
  const all  = shuffle(validMoves(g));
  if (!all.length) return null;
  const edge  = g.size - 1;
  const inner = all.filter(([x, y]) => x > 0 && y > 0 && x < edge && y < edge);
  return (inner.length ? inner : all)[0];
}

function aiMedium(g) {
  const color = g.turn;
  const moves = shuffle(validMoves(g));
  if (!moves.length) return null;
  let best = moves[0], bs = -Infinity;
  for (const [x, y] of moves) { const s = scoreMove(g, x, y, color); if (s > bs) { bs = s; best = [x, y]; } }
  return best;
}

function randomPlayout(g, maxMoves) {
  const sim = g.clone();
  let passes = 0;
  for (let i = 0; i < maxMoves; i++) {
    const moves = shuffle(validMoves(sim));
    if (!moves.length || Math.random() < 0.1) {
      if (++passes >= 2) break; sim.pass();
    } else {
      passes = 0;
      const [x, y] = moves[Math.floor(Math.random() * Math.min(10, moves.length))];
      sim.tryMove(x, y);
    }
  }
  return sim.scoreGame().winner;
}

async function aiHard(g) {
  const color = g.turn;
  const moves = validMoves(g);
  if (!moves.length) return null;
  const wins = new Map(), plays = new Map();
  const rollouts = Math.min(300, moves.length * 20);
  for (const [x, y] of moves) { const k = x*g.size+y; wins.set(k,0); plays.set(k,0); }
  for (let done = 0; done < rollouts; done += 30) {
    await new Promise(r => setTimeout(r, 0));
    for (let b = 0; b < 30 && done+b < rollouts; b++) {
      const total = [...plays.values()].reduce((a,v)=>a+v,0)+1;
      let bk = null, bu = -Infinity;
      for (const [x,y] of moves) {
        const k=x*g.size+y, p=plays.get(k), w=wins.get(k);
        const u = p===0 ? Infinity : w/p + Math.sqrt(2*Math.log(total)/p);
        if (u > bu) { bu=u; bk=k; }
      }
      const tmp = g.clone();
      tmp.tryMove(Math.floor(bk/g.size), bk%g.size);
      const winner = randomPlayout(tmp, g.size*g.size);
      plays.set(bk, plays.get(bk)+1);
      if (winner===color) wins.set(bk, wins.get(bk)+1);
    }
  }
  let bm = moves[0], bp = -1;
  for (const [x,y] of moves) { const p=plays.get(x*g.size+y); if (p>bp){bp=p; bm=[x,y];} }
  return bm;
}

// ── Hint system — always uses MCTS regardless of difficulty ──────────────────

async function computeHintsAsync(g) {
  const color = g.turn;
  const allMoves = validMoves(g);
  if (!allMoves.length) return [];

  // Fast pre-rank: top 8 by heuristic
  const candidates = allMoves
    .map(([x, y]) => ({ x, y, score: scoreMove(g, x, y, color) }))
    .filter(m => m.score > -Infinity)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  if (!candidates.length) return [];

  // MCTS refinement: 120 rollouts over the candidates
  const wins = new Map(), plays = new Map();
  candidates.forEach(m => { const k=`${m.x},${m.y}`; wins.set(k,0); plays.set(k,0); });

  const rollouts = Math.min(120, candidates.length * 18);
  const batch    = 20;
  for (let done = 0; done < rollouts; done += batch) {
    await new Promise(r => setTimeout(r, 0));
    for (let b = 0; b < batch && done+b < rollouts; b++) {
      const m = candidates[Math.floor(Math.random() * candidates.length)];
      const k = `${m.x},${m.y}`;
      const tmp = g.clone();
      tmp.tryMove(m.x, m.y);
      const winner = randomPlayout(tmp, Math.min(g.size * 3, 45));
      plays.set(k, plays.get(k)+1);
      if (winner === color) wins.set(k, wins.get(k)+1);
    }
  }

  return candidates
    .sort((a, b) => {
      const ka=`${a.x},${a.y}`, kb=`${b.x},${b.y}`;
      const pa=plays.get(ka)||0, pb=plays.get(kb)||0;
      const ra = pa > 0 ? wins.get(ka)/pa : 0.5;
      const rb = pb > 0 ? wins.get(kb)/pb : 0.5;
      return rb - ra;
    })
    .slice(0, 3);
}

function clearHints() {
  hintMoves = []; hintCount = 0; updateHintBadge();
}

function updateHintBadge() {
  const badge = document.getElementById('hint-badge');
  if (hintCount === 0) {
    badge.classList.add('hidden');
  } else {
    badge.textContent = hintCount;
    badge.classList.remove('hidden');
    badge.classList.remove('badgePop'); void badge.offsetWidth; badge.classList.add('badgePop');
  }
}

// Draw only the CURRENT hint as a plain numbered circle — no colour
function drawHints() {
  if (hintCount === 0 || !hintMoves.length) return;
  const idx = hintCount - 1;
  if (idx >= hintMoves.length) return;

  const { x, y } = hintMoves[idx];
  const cx = gridPos(x), cy = gridPos(y);
  const r  = cellSize() * 0.4;

  // Neutral semi-transparent white circle
  ctx.fillStyle   = 'rgba(255,255,255,0.80)';
  ctx.strokeStyle = 'rgba(0,0,0,0.30)';
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Number only, no colour coding
  ctx.fillStyle    = '#111';
  ctx.font         = `bold ${Math.round(r * 1.05)}px sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(hintCount, cx, cy + 1);
}

// ── Emotion helpers ───────────────────────────────────────────────────────────

function showSidebarEmotion(emoji, ms = 2800) {
  const bubble  = document.getElementById('emotion-bubble');
  const aiEmoji = document.getElementById('ai-emoji');
  bubble.textContent = emoji;
  bubble.classList.remove('hidden', 'emotion-in', 'emotion-out');
  void bubble.offsetWidth;
  bubble.classList.add('emotion-in');
  aiEmoji.textContent = emoji;
  clearTimeout(emotionTimer);
  emotionTimer = setTimeout(() => {
    bubble.classList.replace('emotion-in', 'emotion-out');
    setTimeout(() => {
      bubble.classList.add('hidden'); bubble.classList.remove('emotion-out');
      aiEmoji.textContent = currentProfile.avatar;
    }, 450);
  }, ms);
}

function showBoardEmotion(emoji) {
  const el   = document.getElementById('board-emotion');
  const rect = canvas.getBoundingClientRect();
  el.textContent = emoji;
  el.style.left  = Math.round(rect.left + rect.width  / 2) + 'px';
  el.style.top   = Math.round(rect.top  + rect.height / 2) + 'px';
  el.classList.remove('hidden', 'bemoji-in', 'bemoji-out');
  void el.offsetWidth;
  el.classList.add('bemoji-in');
  clearTimeout(boardEmotionTimer);
  boardEmotionTimer = setTimeout(() => {
    el.classList.replace('bemoji-in', 'bemoji-out');
    setTimeout(() => { el.classList.add('hidden'); el.classList.remove('bemoji-out'); }, 500);
  }, 2000);
}

function showEmotion(emoji, sidebarMs = 2800) {
  showSidebarEmotion(emoji, sidebarMs);
  showBoardEmotion(emoji);
}

function showThinkingDots(on) {
  document.getElementById('think-dots').classList.toggle('hidden', !on);
}

function addChat(from, emoji) {
  const feed = document.getElementById('chat-feed');
  const div  = document.createElement('div');
  div.className = `chat-msg ${from}`;
  div.innerHTML = `<span class="chat-avatar">${from==='ai' ? currentProfile.avatar : '🧒'}</span>
                   <span class="chat-bubble">${emoji}</span>`;
  feed.appendChild(div);
  while (feed.children.length > 6) feed.removeChild(feed.firstChild);
  feed.scrollTop = feed.scrollHeight;
}

async function aiReactToEmoji(userEmoji) {
  await new Promise(r => setTimeout(r, 700 + Math.random() * 1300));
  const reply = rnd(EMOJI_REPLIES[userEmoji] || ['😊', '🤔']);
  showEmotion(reply, 2200);
  addChat('ai', reply);
  playEmojiSound();
}

// ── AI move driver ────────────────────────────────────────────────────────────

async function doAIMove() {
  if (!game || game.over || game.turn === BLACK || aiThinking) return;
  aiThinking = true;

  const thinkMs = 1000 + Math.random() * 4000;
  showThinkingDots(true);
  showSidebarEmotion(rnd(EMOJI.thinking), thinkMs + 500);
  await new Promise(r => setTimeout(r, thinkMs));

  const capBefore = game.captures[WHITE];

  let move = null;
  if      (difficulty === 'beginner') move = aiBeginner(game);
  else if (difficulty === 'medium')   move = aiMedium(game);
  else                                move = await aiHard(game);

  if (move) {
    game.tryMove(move[0], move[1]);
    playStoneSound(true);
  } else {
    game.pass();
    const e = rnd(EMOJI.pass);
    showEmotion(e, 2200); addChat('ai', e);
  }

  if (game.captures[WHITE] > capBefore) {
    playCaptureSound();
    const e = rnd(EMOJI.laugh);
    showEmotion(e); addChat('ai', e);
  }

  showThinkingDots(false);
  aiThinking = false;
  render(); updateUI();
  if (game.over) showGameOver();
}

// ── Canvas rendering ──────────────────────────────────────────────────────────
const canvas = document.getElementById('board');
const ctx    = canvas.getContext('2d');

function getTheme() { return document.body.dataset.theme || 'classic'; }
function cellSize() { return canvas.width / (game.size + 1); }
function gridPos(n) { return Math.round(cellSize() * (n + 1)); }

function pixelToGrid(px, py) {
  const cs = cellSize();
  const x  = Math.round(px / cs - 1);
  const y  = Math.round(py / cs - 1);
  if (x < 0 || y < 0 || x >= game.size || y >= game.size) return null;
  return [x, y];
}

function hoshiPoints(sz) {
  if (sz===19) return [[3,3],[3,9],[3,15],[9,3],[9,9],[9,15],[15,3],[15,9],[15,15]];
  if (sz===13) return [[3,3],[3,9],[9,3],[9,9],[6,6]];
  if (sz===9)  return [[2,2],[2,6],[6,2],[6,6],[4,4]];
  return [];
}

function drawBoard() {
  const theme = getTheme();
  const sz  = game.size;
  const cs  = cellSize();
  const w   = canvas.width;

  const bg   = { classic:'#dcb16c', paper:'#fafafa', dark:'#2a2a2a' }[theme];
  const grid = { classic:'#7a4f2a', paper:'#333',    dark:'#666'    }[theme];
  const star = { classic:'#5a3010', paper:'#111',    dark:'#aaa'    }[theme];

  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, w);

  if (theme === 'classic') {
    ctx.save();
    for (let i = 0; i < 8; i++) {
      const x = Math.random() * w;
      ctx.strokeStyle = 'rgba(160,100,40,0.04)';
      ctx.lineWidth   = 1 + Math.random() * 2;
      ctx.beginPath(); ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x+20, w*0.3, x-20, w*0.6, x, w); ctx.stroke();
    }
    ctx.restore();
  }

  ctx.strokeStyle = grid; ctx.lineWidth = 1;
  for (let i = 0; i < sz; i++) {
    const p = gridPos(i);
    ctx.beginPath(); ctx.moveTo(gridPos(0), p); ctx.lineTo(gridPos(sz-1), p); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p, gridPos(0)); ctx.lineTo(p, gridPos(sz-1)); ctx.stroke();
  }

  for (const [hx, hy] of hoshiPoints(sz)) {
    const px = gridPos(hx), py = gridPos(hy);
    if (theme === 'paper') {
      ctx.strokeStyle = star; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(px, py, cs*0.1, 0, Math.PI*2); ctx.stroke();
    } else {
      ctx.fillStyle = star;
      ctx.beginPath(); ctx.arc(px, py, cs*0.1, 0, Math.PI*2); ctx.fill();
    }
  }

  if (cs > 20) {
    ctx.fillStyle = theme==='classic' ? 'rgba(80,40,10,0.5)'
                  : theme==='dark'    ? 'rgba(180,180,180,0.4)' : 'rgba(80,80,80,0.4)';
    ctx.font = `${Math.max(8, cs*0.36)}px monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const L = 'ABCDEFGHJKLMNOPQRST';
    for (let i = 0; i < sz; i++) {
      ctx.fillText(L[i], gridPos(i), cs*0.44);
      ctx.fillText(L[i], gridPos(i), w-cs*0.44);
      ctx.fillText(sz-i, cs*0.44, gridPos(i));
      ctx.fillText(sz-i, w-cs*0.44, gridPos(i));
    }
  }
}

function drawStones() {
  const theme = getTheme();
  const sz    = game.size;
  const cs    = cellSize();
  const r     = cs * 0.46;
  const last  = game.moves.length ? game.moves[game.moves.length-1] : null;

  for (let x = 0; x < sz; x++) {
    for (let y = 0; y < sz; y++) {
      const s = game.board[x][y];
      if (s === EMPTY) continue;
      const cx = gridPos(x), cy = gridPos(y);

      if (theme === 'paper') {
        ctx.fillStyle = s===BLACK ? '#111' : '#f0f0f0';
        ctx.strokeStyle = s===BLACK ? '#000' : '#888'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      } else {
        const gr = ctx.createRadialGradient(cx-r*.35, cy-r*.35, r*.1, cx, cy, r);
        if (s===BLACK) { gr.addColorStop(0,'#606060'); gr.addColorStop(.25,'#1a1a1a'); gr.addColorStop(1,'#000'); }
        else           { gr.addColorStop(0,'#fff');    gr.addColorStop(.4,'#e8e8e8');  gr.addColorStop(1,'#b0b0b0'); }
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
        if (theme==='dark') { ctx.strokeStyle=s===BLACK?'rgba(100,100,200,0.3)':'rgba(200,200,255,0.4)'; ctx.lineWidth=1; ctx.stroke(); }
      }

      if (last && !last.pass && last.x===x && last.y===y) {
        ctx.strokeStyle = s===BLACK ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(cx, cy, r*0.38, 0, Math.PI*2); ctx.stroke();
      }
    }
  }
}

function drawHover(x, y) {
  if (game.over || game.turn === WHITE) return;
  ctx.fillStyle = 'rgba(20,20,20,0.25)';
  ctx.beginPath(); ctx.arc(gridPos(x), gridPos(y), cellSize()*0.46, 0, Math.PI*2); ctx.fill();
}

function render(hover) {
  if (!game) return;
  drawBoard(); drawStones(); drawHints();
  if (hover) drawHover(...hover);
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function updateUI() {
  if (!game) return;
  document.getElementById('black-cap').textContent = game.captures[BLACK];
  document.getElementById('white-cap').textContent = game.captures[WHITE];
  const hintBtn = document.getElementById('btn-hint');
  hintBtn.disabled = aiThinking || game.over || game.turn === WHITE || hintComputing;
}

function applyProfile(p) {
  currentProfile = p;
  document.getElementById('ai-emoji').textContent        = p.avatar;
  document.getElementById('ai-name-display').textContent  = p.name;
  document.getElementById('ai-title-display').textContent = p.title;
  document.getElementById('ai-score-name').textContent    = p.name;
}

function showGameOver() {
  const r = game.result;
  const resultStr = r.reason === 'resignation'
    ? `${r.winner===BLACK?'Black':'White'} wins by resignation`
    : `${r.winner===BLACK?'Black':'White'} wins — B:${r.blackTotal} vs W:${r.whiteTotal} by ${r.margin}`;

  document.getElementById('final-score').textContent = resultStr;
  document.getElementById('final-score').classList.remove('hidden');

  const aiWon = r.winner === WHITE;
  const e = rnd(aiWon ? EMOJI.winGame : EMOJI.loseGame);
  showEmotion(e, 4000); addChat('ai', e);

  const code = r.reason==='resignation'
    ? (r.winner===BLACK?'B+R':'W+R')
    : (r.winner===BLACK?`B+${r.margin}`:`W+${r.margin}`);
  openModal('Game Over', resultStr, code);
}

function openModal(title, body, code) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').textContent  = body;
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('modal-save').onclick    = () => { saveCurrentGame(code); closeModal(); startNewGame(); };
  document.getElementById('modal-discard').onclick = () => { closeModal(); startNewGame(); };
}
function closeModal() { document.getElementById('modal-overlay').classList.add('hidden'); }

function resizeCanvas() {
  const sidebar = document.getElementById('sidebar');
  const availW  = window.innerWidth  - sidebar.offsetWidth - 20;
  const availH  = window.innerHeight - 20;
  canvas.width  = canvas.height = Math.max(200, Math.min(750, Math.min(availW, availH)));
  render();
}

// ── History ───────────────────────────────────────────────────────────────────
async function refreshHistory() {
  if (!db) return;
  const rows  = await loadHistory(db);
  const tbody = document.getElementById('history-body');
  if (!rows.length) { tbody.innerHTML='<tr><td colspan="6" class="no-games">No games yet.</td></tr>'; return; }
  tbody.innerHTML = rows.map(r => `
    <tr><td>${r.date}</td><td>${r.board_size}×${r.board_size}</td>
    <td>${r.difficulty}</td><td>${r.result}</td><td>${r.total_moves}</td>
    <td><button class="sgf-btn" data-id="${r.id}">SGF</button></td></tr>`).join('');
  tbody.querySelectorAll('.sgf-btn').forEach(b => b.addEventListener('click', ()=>exportSGF(db, b.dataset.id)));
}

async function saveCurrentGame(code) {
  if (!db || !game || !game.moves.length) return;
  await saveGame(db, {
    date: new Date().toISOString().slice(0,10),
    board_size: game.size, difficulty, result: code,
    total_moves: game.moves.length,
    duration_sec: gameStartTime ? Math.floor((Date.now()-gameStartTime)/1000) : 0,
    sgf: game.toSGF(),
  });
  await refreshHistory();
}

// ── Game lifecycle ────────────────────────────────────────────────────────────
function startNewGame() {
  const el = document.querySelector('#size-btns .opt-btn.active');
  game          = new GoGame(el ? parseInt(el.dataset.size) : 13);
  aiThinking    = false;
  gameStartTime = Date.now();
  applyProfile(rnd(AI_PROFILES));
  clearHints();
  hintComputing = false;
  document.getElementById('final-score').classList.add('hidden');
  document.getElementById('final-score').textContent = '';
  document.getElementById('chat-feed').innerHTML = '';
  document.getElementById('hint-btn-label').textContent = '💡 Hint';
  render(); updateUI();
  setTimeout(() => { const e=rnd(EMOJI.greet); showEmotion(e,2000); addChat('ai',e); playEmojiSound(); }, 500);
}

// ── Event listeners ───────────────────────────────────────────────────────────
canvas.addEventListener('mousemove', e => {
  if (!game || game.over || aiThinking) return;
  const rect = canvas.getBoundingClientRect();
  const pos = pixelToGrid(
    (e.clientX-rect.left) * (canvas.width/rect.width),
    (e.clientY-rect.top)  * (canvas.height/rect.height)
  );
  render(pos && game.board[pos[0]][pos[1]]===EMPTY ? pos : null);
});
canvas.addEventListener('mouseleave', () => render());

async function handlePlayerMove(x, y) {
  const capBefore = game.captures[BLACK];
  const res = game.tryMove(x, y);
  if (!res.ok) return;
  playStoneSound(false);
  clearHints();
  render(); updateUI();

  if (game.captures[BLACK] > capBefore) {
    playCaptureSound();
    const e = rnd(EMOJI.cry);
    showEmotion(e); addChat('ai', e);
  }
  if (game.over) { showGameOver(); return; }
  await doAIMove();
}

canvas.addEventListener('click', async e => {
  if (!game || game.over || aiThinking || game.turn === WHITE) return;
  const rect = canvas.getBoundingClientRect();
  const pos = pixelToGrid(
    (e.clientX-rect.left) * (canvas.width/rect.width),
    (e.clientY-rect.top)  * (canvas.height/rect.height)
  );
  if (pos) await handlePlayerMove(pos[0], pos[1]);
});

canvas.addEventListener('touchend', async e => {
  e.preventDefault();
  if (!game || game.over || aiThinking || game.turn === WHITE) return;
  const t = e.changedTouches[0];
  const rect = canvas.getBoundingClientRect();
  const pos = pixelToGrid(
    (t.clientX-rect.left) * (canvas.width/rect.width),
    (t.clientY-rect.top)  * (canvas.height/rect.height)
  );
  if (pos) await handlePlayerMove(pos[0], pos[1]);
}, { passive: false });

document.getElementById('btn-new').addEventListener('click', () => {
  if (game && game.moves.length > 5 && !game.over)
    openModal('New Game', 'Save the current game?', 'unfinished');
  else startNewGame();
});

document.getElementById('btn-pass').addEventListener('click', async () => {
  if (!game || game.over || aiThinking || game.turn === WHITE) return;
  game.pass(); clearHints(); render(); updateUI();
  if (game.over) { showGameOver(); return; }
  await doAIMove();
});

document.getElementById('btn-resign').addEventListener('click', () => {
  if (!game || game.over || aiThinking) return;
  game.resign(game.turn); clearHints(); render(); updateUI(); showGameOver();
});

// Hint button — cycles: 0→show1, 1→show2 (clears 1), 2→show3 (clears 2), 3→clear
document.getElementById('btn-hint').addEventListener('click', async () => {
  if (!game || game.over || aiThinking || game.turn === WHITE || hintComputing) return;

  if (!hintMoves.length) {
    // Compute hints with MCTS (always, regardless of difficulty)
    hintComputing = true;
    updateUI();
    const lbl = document.getElementById('hint-btn-label');
    lbl.textContent = '⏳ 计算…';
    hintMoves = await computeHintsAsync(game);
    hintComputing = false;
    lbl.textContent = '💡 Hint';
    updateUI();
    if (!hintMoves.length) return;
  }

  // Cycle: show next or clear after last
  hintCount = hintCount >= hintMoves.length ? 0 : hintCount + 1;
  updateHintBadge();
  render();
});

document.getElementById('emoji-picker').addEventListener('click', e => {
  const btn = e.target.closest('.emj');
  if (!btn) return;
  const emoji = btn.dataset.e;
  addChat('user', emoji);
  playEmojiSound();
  btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop');
  setTimeout(() => btn.classList.remove('pop'), 350);
  if (!aiThinking) aiReactToEmoji(emoji);
});

document.getElementById('size-btns').addEventListener('click', e => {
  if (!e.target.dataset.size) return;
  document.querySelectorAll('#size-btns .opt-btn').forEach(b=>b.classList.remove('active'));
  e.target.classList.add('active'); startNewGame();
});
document.getElementById('theme-btns').addEventListener('click', e => {
  if (!e.target.dataset.theme) return;
  document.querySelectorAll('#theme-btns .opt-btn').forEach(b=>b.classList.remove('active'));
  e.target.classList.add('active');
  document.body.dataset.theme = e.target.dataset.theme; render();
});
document.getElementById('diff-btns').addEventListener('click', e => {
  if (!e.target.dataset.diff) return;
  document.querySelectorAll('#diff-btns .opt-btn').forEach(b=>b.classList.remove('active'));
  e.target.classList.add('active'); difficulty = e.target.dataset.diff;
});
document.getElementById('history-toggle').addEventListener('click', () => {
  const panel = document.getElementById('history-panel');
  const arrow = document.getElementById('history-arrow');
  panel.classList.toggle('hidden');
  arrow.textContent = panel.classList.contains('hidden') ? '▼' : '▲';
  if (!panel.classList.contains('hidden')) refreshHistory();
});

window.addEventListener('resize', () => {
  resizeCanvas();
  const el = document.getElementById('board-emotion');
  if (!el.classList.contains('hidden')) {
    const rect = canvas.getBoundingClientRect();
    el.style.left = Math.round(rect.left + rect.width/2)  + 'px';
    el.style.top  = Math.round(rect.top  + rect.height/2) + 'px';
  }
});

// ── Boot ──────────────────────────────────────────────────────────────────────
(async () => {
  try { db = await initDB(); } catch (e) { console.warn('SQLite unavailable:', e); }
  resizeCanvas();
  startNewGame();
})();
