// ── Orchestrator — state, events, lifecycle ───────────────────────────────────
import { initDB, saveGame, loadHistory, exportSGF } from './db.js';
import { GoGame, BLACK, WHITE, EMPTY } from './go-rules.js';
import { aiHard, aiNeural, computeHintsAsync } from './ai.js';
import { initNetwork, getPolicyPriors, isNetworkReady } from './neural.js';
import { playStoneSound, playCaptureSound, playEmojiSound } from './audio.js';
import { initRenderer, setRenderGame, render, resizeCanvas, pixelToGrid } from './render.js';
import {
  AI_PROFILES, EMOJI, EMOJI_REPLIES, rnd,
  applyProfile, showSidebarEmotion, showEmotion, showThinkingDots,
  addChat, updateHintBadge, updateUI, openModal, closeModal,
} from './ui.js';

// ── State ─────────────────────────────────────────────────────────────────────
let game          = null;
let difficulty    = 'beginner';
let aiThinking    = false;
let gameStartTime = null;
let db            = null;
let hintComputing = false;
let hintMoves     = [];
let hintCount     = 0;

const canvas = document.getElementById('board');
const ctx    = canvas.getContext('2d');
initRenderer(canvas, ctx);

// ── Hint helpers ──────────────────────────────────────────────────────────────
function clearHints() {
  hintMoves = []; hintCount = 0; updateHintBadge(0);
}

// ── Emoji reaction ────────────────────────────────────────────────────────────
async function aiReactToEmoji(userEmoji) {
  await new Promise(r => setTimeout(r, 1000 + Math.random() * 500));
  const reply = rnd(EMOJI_REPLIES[userEmoji] || ['😊', '🤔']);
  showEmotion(reply, 2200);
  addChat('ai', reply);
  playEmojiSound();
}

// ── AI move driver ────────────────────────────────────────────────────────────
async function doAIMove() {
  if (!game || game.over || game.turn === BLACK || aiThinking) return;
  aiThinking = true;

  const thinkMs = 500 + Math.random() * 1500;
  showThinkingDots(true);
  showSidebarEmotion(rnd(EMOJI.thinking), thinkMs + 500);
  await new Promise(r => setTimeout(r, thinkMs));

  const capBefore = game.captures[WHITE];

  const move = difficulty === 'beginner'
    ? await aiHard(game)
    : await aiNeural(game, isNetworkReady() ? getPolicyPriors : null);

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
  render(null, hintMoves, hintCount); updateUI(game, aiThinking, hintComputing);
  if (game.over) showGameOver();
}

// ── Game-over flow ────────────────────────────────────────────────────────────
function showGameOver() {
  const r = game.result;
  const resultStr = r.reason === 'resignation'
    ? `${r.winner === BLACK ? 'Black' : 'White'} wins by resignation`
    : `${r.winner === BLACK ? 'Black' : 'White'} wins — B:${r.blackTotal} vs W:${r.whiteTotal} by ${r.margin}`;

  document.getElementById('final-score').textContent = resultStr;
  document.getElementById('final-score').classList.remove('hidden');

  const aiWon = r.winner === WHITE;
  const e = rnd(aiWon ? EMOJI.winGame : EMOJI.loseGame);
  showEmotion(e, 4000); addChat('ai', e);

  const code = r.reason === 'resignation'
    ? (r.winner === BLACK ? 'B+R' : 'W+R')
    : (r.winner === BLACK ? `B+${r.margin}` : `W+${r.margin}`);

  openModal(
    'Game Over', resultStr,
    () => { saveCurrentGame(code); startNewGame(); },
    () => startNewGame(),
  );
}

// ── History ───────────────────────────────────────────────────────────────────
async function refreshHistory() {
  if (!db) return;
  const rows  = await loadHistory(db);
  const tbody = document.getElementById('history-body');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="no-games">No games yet.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr><td>${r.date}</td><td>${r.board_size}×${r.board_size}</td>
    <td>${r.difficulty}</td><td>${r.result}</td><td>${r.total_moves}</td>
    <td><button class="sgf-btn" data-id="${r.id}">SGF</button></td></tr>`).join('');
  tbody.querySelectorAll('.sgf-btn').forEach(
    b => b.addEventListener('click', () => exportSGF(db, b.dataset.id))
  );
}

async function saveCurrentGame(code) {
  if (!db || !game || !game.moves.length) return;
  await saveGame(db, {
    date: new Date().toISOString().slice(0, 10),
    board_size: game.size, difficulty, result: code,
    total_moves: game.moves.length,
    duration_sec: gameStartTime ? Math.floor((Date.now() - gameStartTime) / 1000) : 0,
    sgf: game.toSGF(),
  });
  await refreshHistory();
}

// ── Game lifecycle ────────────────────────────────────────────────────────────
function startNewGame() {
  const el      = document.querySelector('#size-btns .opt-btn.active');
  game          = new GoGame(el ? parseInt(el.dataset.size) : 13);
  aiThinking    = false;
  gameStartTime = Date.now();
  setRenderGame(game);
  applyProfile(rnd(AI_PROFILES));
  clearHints();
  hintComputing = false;
  document.getElementById('final-score').classList.add('hidden');
  document.getElementById('final-score').textContent = '';
  document.getElementById('chat-feed').innerHTML = '';
  document.getElementById('hint-btn-label').textContent = '💡 Hint';
  render(null, hintMoves, hintCount); updateUI(game, aiThinking, hintComputing);
  setTimeout(() => {
    const e = rnd(EMOJI.greet); showEmotion(e, 2000); addChat('ai', e); playEmojiSound();
  }, 500);
}

// ── Event listeners ───────────────────────────────────────────────────────────
canvas.addEventListener('mousemove', e => {
  if (!game || game.over || aiThinking) return;
  const rect = canvas.getBoundingClientRect();
  const pos  = pixelToGrid(
    (e.clientX - rect.left) * (canvas.width  / rect.width),
    (e.clientY - rect.top)  * (canvas.height / rect.height),
  );
  render(pos && game.board[pos[0]][pos[1]] === EMPTY ? pos : null, hintMoves, hintCount);
});
canvas.addEventListener('mouseleave', () => render(null, hintMoves, hintCount));

async function handlePlayerMove(x, y) {
  const capBefore = game.captures[BLACK];
  const res = game.tryMove(x, y);
  if (!res.ok) return;
  playStoneSound(false);
  clearHints();
  render(null, hintMoves, hintCount); updateUI(game, aiThinking, hintComputing);

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
  const pos  = pixelToGrid(
    (e.clientX - rect.left) * (canvas.width  / rect.width),
    (e.clientY - rect.top)  * (canvas.height / rect.height),
  );
  if (pos) await handlePlayerMove(pos[0], pos[1]);
});

canvas.addEventListener('touchend', async e => {
  e.preventDefault();
  if (!game || game.over || aiThinking || game.turn === WHITE) return;
  const t    = e.changedTouches[0];
  const rect = canvas.getBoundingClientRect();
  const pos  = pixelToGrid(
    (t.clientX - rect.left) * (canvas.width  / rect.width),
    (t.clientY - rect.top)  * (canvas.height / rect.height),
  );
  if (pos) await handlePlayerMove(pos[0], pos[1]);
}, { passive: false });

document.getElementById('btn-new').addEventListener('click', () => {
  if (game && game.moves.length > 5 && !game.over)
    openModal('New Game', 'Save the current game?',
      () => { saveCurrentGame('unfinished'); startNewGame(); },
      () => startNewGame(),
    );
  else startNewGame();
});

document.getElementById('btn-pass').addEventListener('click', async () => {
  if (!game || game.over || aiThinking || game.turn === WHITE) return;
  game.pass(); clearHints();
  render(null, hintMoves, hintCount); updateUI(game, aiThinking, hintComputing);
  if (game.over) { showGameOver(); return; }
  await doAIMove();
});

document.getElementById('btn-resign').addEventListener('click', () => {
  if (!game || game.over || aiThinking) return;
  game.resign(game.turn); clearHints();
  render(null, hintMoves, hintCount); updateUI(game, aiThinking, hintComputing);
  showGameOver();
});

document.getElementById('btn-hint').addEventListener('click', async () => {
  if (!game || game.over || aiThinking || game.turn === WHITE || hintComputing) return;

  if (!hintMoves.length) {
    hintComputing = true;
    updateUI(game, aiThinking, hintComputing);
    const lbl = document.getElementById('hint-btn-label');
    lbl.textContent = '⏳ 计算…';
    hintMoves = await computeHintsAsync(game);
    hintComputing = false;
    lbl.textContent = '💡 Hint';
    updateUI(game, aiThinking, hintComputing);
    if (!hintMoves.length) return;
  }

  hintCount = hintCount >= hintMoves.length ? 0 : hintCount + 1;
  updateHintBadge(hintCount);
  render(null, hintMoves, hintCount);
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
  document.querySelectorAll('#size-btns .opt-btn').forEach(b => b.classList.remove('active'));
  e.target.classList.add('active'); startNewGame();
});

document.getElementById('theme-btns').addEventListener('click', e => {
  if (!e.target.dataset.theme) return;
  document.querySelectorAll('#theme-btns .opt-btn').forEach(b => b.classList.remove('active'));
  e.target.classList.add('active');
  document.body.dataset.theme = e.target.dataset.theme;
  render(null, hintMoves, hintCount);
});

document.getElementById('diff-btns').addEventListener('click', e => {
  if (!e.target.dataset.diff) return;
  document.querySelectorAll('#diff-btns .opt-btn').forEach(b => b.classList.remove('active'));
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
  render(null, hintMoves, hintCount);
  const el = document.getElementById('board-emotion');
  if (!el.classList.contains('hidden')) {
    const rect = canvas.getBoundingClientRect();
    el.style.left = Math.round(rect.left + rect.width  / 2) + 'px';
    el.style.top  = Math.round(rect.top  + rect.height / 2) + 'px';
  }
});

// ── Boot ──────────────────────────────────────────────────────────────────────
(async () => {
  try { db = await initDB(); } catch (e) { console.warn('SQLite unavailable:', e); }
  resizeCanvas();
  startNewGame();

  // Train the neural network in the background; update sidebar status while training
  const nnEl = document.getElementById('nn-status');
  initNetwork(msg => { if (nnEl) nnEl.textContent = msg; })
    .then(() => { if (nnEl) nnEl.textContent = ''; })
    .catch(err => { console.warn('Neural network init failed:', err); if (nnEl) nnEl.textContent = ''; });
})();
