// ── Canvas rendering — depends on go-rules.js constants only ──────────────────
import { BLACK, WHITE, EMPTY } from './go-rules.js';

let canvas, ctx, _game;

export function initRenderer(canvasEl, context) { canvas = canvasEl; ctx = context; }
export function setRenderGame(g) { _game = g; }

export function getTheme() { return document.body.dataset.theme || 'classic'; }
export function cellSize() { return canvas.width / (_game.size + 1); }
export function gridPos(n) { return Math.round(cellSize() * (n + 1)); }

export function pixelToGrid(px, py) {
  const cs = cellSize();
  const x  = Math.round(px / cs - 1);
  const y  = Math.round(py / cs - 1);
  if (x < 0 || y < 0 || x >= _game.size || y >= _game.size) return null;
  return [x, y];
}

function hoshiPoints(sz) {
  if (sz === 19) return [[3,3],[3,9],[3,15],[9,3],[9,9],[9,15],[15,3],[15,9],[15,15]];
  if (sz === 13) return [[3,3],[3,9],[9,3],[9,9],[6,6]];
  if (sz ===  9) return [[2,2],[2,6],[6,2],[6,6],[4,4]];
  return [];
}

function drawBoard() {
  const theme = getTheme();
  const sz  = _game.size;
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
  const sz    = _game.size;
  const cs    = cellSize();
  const r     = cs * 0.46;
  const last  = _game.moves.length ? _game.moves[_game.moves.length - 1] : null;

  for (let x = 0; x < sz; x++) {
    for (let y = 0; y < sz; y++) {
      const s = _game.board[x][y];
      if (s === EMPTY) continue;
      const cx = gridPos(x), cy = gridPos(y);

      if (theme === 'paper') {
        ctx.fillStyle   = s === BLACK ? '#111' : '#f0f0f0';
        ctx.strokeStyle = s === BLACK ? '#000' : '#888'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      } else {
        const gr = ctx.createRadialGradient(cx-r*.35, cy-r*.35, r*.1, cx, cy, r);
        if (s === BLACK) { gr.addColorStop(0,'#606060'); gr.addColorStop(.25,'#1a1a1a'); gr.addColorStop(1,'#000'); }
        else             { gr.addColorStop(0,'#fff');    gr.addColorStop(.4,'#e8e8e8');  gr.addColorStop(1,'#b0b0b0'); }
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
        if (theme === 'dark') {
          ctx.strokeStyle = s===BLACK ? 'rgba(100,100,200,0.3)' : 'rgba(200,200,255,0.4)';
          ctx.lineWidth = 1; ctx.stroke();
        }
      }

      if (last && !last.pass && last.x === x && last.y === y) {
        ctx.strokeStyle = s === BLACK ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(cx, cy, r*0.38, 0, Math.PI*2); ctx.stroke();
      }
    }
  }
}

function drawHover(x, y) {
  if (_game.over || _game.turn === WHITE) return;
  ctx.fillStyle = 'rgba(20,20,20,0.25)';
  ctx.beginPath(); ctx.arc(gridPos(x), gridPos(y), cellSize()*0.46, 0, Math.PI*2); ctx.fill();
}

// hintMoves: [{x,y}], hintCount: 0-3
function drawHints(hintMoves, hintCount) {
  if (!hintCount || !hintMoves || !hintMoves.length) return;
  const idx = hintCount - 1;
  if (idx >= hintMoves.length) return;

  const { x, y } = hintMoves[idx];
  const cx = gridPos(x), cy = gridPos(y);
  const r  = cellSize() * 0.4;

  ctx.fillStyle   = 'rgba(255,255,255,0.80)';
  ctx.strokeStyle = 'rgba(0,0,0,0.30)';
  ctx.lineWidth   = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  ctx.fillStyle    = '#111';
  ctx.font         = `bold ${Math.round(r * 1.05)}px sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(hintCount, cx, cy + 1);
}

export function render(hover, hintMoves, hintCount) {
  if (!_game) return;
  drawBoard(); drawStones(); drawHints(hintMoves, hintCount);
  if (hover) drawHover(...hover);
}

export function resizeCanvas() {
  const sidebar = document.getElementById('sidebar');
  const availW  = window.innerWidth  - sidebar.offsetWidth - 20;
  const availH  = window.innerHeight - 20;
  canvas.width  = canvas.height = Math.max(200, Math.min(750, Math.min(availW, availH)));
}
