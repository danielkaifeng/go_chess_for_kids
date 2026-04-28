# CLAUDE.md — Go · 围棋 for Kids

## Project overview

Browser-based Go (围棋) game. **No build step, no npm, no server.** Open `index.html` directly or serve with `python -m http.server 8080`.

GitHub: https://github.com/danielkaifeng/go_chess_for_kids

## Architecture

```
go-rules.js   Pure game logic (board, captures, ko, scoring, SGF)
ai.js         MCTS utilities + Easy AI (aiHard) + Hard AI (aiNeural)
neural.js     TensorFlow.js CNN — board encoding, warmup training, policy priors
game.js       Orchestrator — state machine, event wiring, AI driver
render.js     HTML5 Canvas renderer
ui.js         Sidebar, AI personas (20 named characters), emoji chat
db.js         SQLite via sql.js (WASM) — game history, SGF export
audio.js      Web Audio API — synthesized stone/capture sounds
style.css     Three themes: classic / paper / dark
index.html    App shell — loads TF.js and sql.js from CDN, then ES modules
```

**Dependency order (no circular imports):**
```
go-rules.js ← ai.js ← neural.js
                 ↑          ↑
             game.js ────────┘
```

## AI design

### Easy (`aiHard` in ai.js)
UCB1 flat MCTS — 15 candidates, ~375 rollouts per move.

### Hard (`aiNeural` in ai.js + neural.js)
PUCT MCTS — 20 candidates, ~700 rollouts. Neural policy priors from a TF.js CNN trained on startup (~5–8 s). Falls back to UCB1 if TF.js not loaded.

### Both levels share these pre-MCTS overrides (run in order):
1. **Opening book** (`openingMove`) — plays star-point / hoshi moves instantly for the first `size` total moves; corners before edges before tengen.
2. **Atari escape** (`findAtariEscape`) — if any own group has 1 liberty, immediately returns the escape move with the most resulting liberties. No MCTS needed.

### Liberty key format
`getGroup()` returns `liberties` as a `Set<number>` where each key = `x * size + y`. Decode: `x = Math.floor(key / size), y = key % size`. Stones are `Array<[x, y]>`.

## Key constants and identifiers

| Symbol | Location | Value / purpose |
|--------|----------|-----------------|
| `BLACK=1, WHITE=2, EMPTY=0` | go-rules.js | Stone colours |
| `KOMI=6.5` | go-rules.js | White compensation |
| `STAR_POINTS` | ai.js | Hoshi coords per board size |
| `TS=19, NCHAN=6` | neural.js | Tensor grid size, feature channels |
| `C_PUCT=2.5` | ai.js `aiNeural` | PUCT exploration constant |
| `AI_PROFILES` | ui.js | 20 Chinese-named AI personas |
| `difficulty` | game.js state | `'beginner'` → Easy, `'hard'` → Hard |

## Coding conventions

- **ES modules throughout** — always use `import`/`export`, never `require`.
- **No build tooling** — do not add npm packages, bundlers, or TypeScript.
- **TF.js is a CDN global** — `tf` is set by the `<script src="...tf.min.js">` tag; never `import * as tf` at the module level.
- **sql.js is a CDN global** — same pattern as TF.js.
- **Canvas redraws on every state change** — call `render(hover, hintMoves, hintCount)` after any board mutation.
- **AI functions are async** — `aiHard` and `aiNeural` both `await` event-loop yields (`setTimeout(0)`) in MCTS batches to keep the UI responsive.
- **No comments on obvious code** — only add a comment when the WHY is non-obvious (e.g. the liberty key encoding, PUCT formula, ko detection).

## How to test changes

```bash
python -m http.server 8080
# open http://localhost:8080
```

Manual checklist:
- [ ] Easy AI plays star points in opening (instant, no thinking delay)
- [ ] Easy AI escapes atari before playing elsewhere
- [ ] Hard AI shows "🧠 Training…" status for ~5–8 s, then plays
- [ ] Hard AI escapes atari reliably
- [ ] Hint button shows 1–3 numbered suggestions
- [ ] SGF export works (History panel → SGF button)
- [ ] All three themes render correctly
- [ ] 9×9 / 13×13 / 19×19 board sizes work

## Git workflow

```bash
git add <files>
git commit -m "feat/fix/refactor: short description"
git push origin main
```

Remote: https://github.com/danielkaifeng/go_chess_for_kids
