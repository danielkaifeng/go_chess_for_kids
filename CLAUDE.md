# CLAUDE.md — Go · 围棋 for Kids

## Project overview

Browser-based Go (围棋) game. **No build step, no npm, no server.** Open `index.html` directly or serve with `python -m http.server 8080`.

GitHub: https://github.com/danielkaifeng/go_chess_for_kids

## Architecture

```
go-rules.js   Pure game logic (board, captures, ko, scoring, SGF)
ai.js         MCTS utilities + Easy AI (aiHard) + Hard AI (aiNeural)
game.js       Orchestrator — state machine, event wiring, AI driver
render.js     HTML5 Canvas renderer
ui.js         Sidebar, AI personas (20 named characters), emoji chat
audio.js      Web Audio API — synthesized stone/capture sounds
style.css     Three themes: classic / paper / dark
index.html    App shell — loads ES modules, no CDN dependencies
```

**Dependency order (no circular imports):**
```
go-rules.js ← ai.js
                 ↑
             game.js
```

## AI design

### Easy (`aiHard` in ai.js)
UCB1 flat MCTS — 15 candidates, ~375 rollouts per move.

### Hard (`aiNeural` in ai.js)
RAVE-enhanced MCTS — 20 candidates, ~600 rollouts. RAVE/AMAF tracks every
candidate position that appears during rollouts and uses it as additional
evidence (`beta`-blended with tree Q-value). Equivalent to ~2× more rollouts
vs plain UCB1 at the same compute cost. No external dependencies.

Key constants: `K_RAVE=1000`, `C_UCB=0.5`, `beta = sqrt(K/(3n+K))`.

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
| `STAR_POINTS` | ai.js | Hoshi coords per board size (9/13/19) |
| `K_RAVE=1000, C_UCB=0.5` | ai.js `aiNeural` | RAVE blend / UCB exploration |
| `AI_PROFILES` | ui.js | 20 Chinese-named AI personas |
| `difficulty` | game.js state | `'beginner'` → Easy, `'hard'` → Hard |

## Coding conventions

- **ES modules throughout** — always use `import`/`export`, never `require`.
- **No build tooling** — do not add npm packages, bundlers, or TypeScript.
- **No CDN globals** — TF.js and sql.js have been removed; plain JS only.
- **Board is always 13×13** — `new GoGame(13)` is hardcoded in `startNewGame`.
- **Canvas redraws on every state change** — call `render(hover, hintMoves, hintCount)` after any board mutation.
- **AI functions are async** — `aiHard` and `aiNeural` both `await` event-loop yields (`setTimeout(0)`) in MCTS batches to keep the UI responsive.
- **No comments on obvious code** — only add a comment when the WHY is non-obvious (e.g. the liberty key encoding, RAVE beta formula, ko detection).

## How to test changes

```bash
python -m http.server 8080
# open http://localhost:8080
```

Manual checklist:
- [ ] Easy AI plays star points in opening (instant, no thinking delay)
- [ ] Easy AI escapes atari before playing elsewhere
- [ ] Hard AI responds faster than Easy (no training delay)
- [ ] Hard AI escapes atari reliably
- [ ] Hint button shows 1–3 numbered suggestions
- [ ] All three themes render correctly

## Git workflow

```bash
git add <files>
git commit -m "feat/fix/refactor: short description"
git push origin main
```

Remote: https://github.com/danielkaifeng/go_chess_for_kids
