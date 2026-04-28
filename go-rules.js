// ── Go rules — pure logic, no DOM ─────────────────────────────────────────────
export const EMPTY = 0, BLACK = 1, WHITE = 2;
export const KOMI  = 6.5;

export class GoGame {
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
