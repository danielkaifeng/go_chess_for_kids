# Go · 围棋 — Go Chess for Kids

A browser-based Go (围棋) game designed for young players learning the ancient game. Features a friendly AI opponent powered by Monte Carlo Tree Search and a TensorFlow.js neural network, with emoji reactions, multiple themes, and game history.

## Play Now

Open `index.html` in any modern browser — no installation or build step required.

Or serve locally to avoid WASM CORS restrictions:

```bash
python -m http.server 8080
# then open http://localhost:8080
```

## Features

- **Two AI Difficulty Levels**
  - **Easy** — MCTS (Monte Carlo Tree Search) with ~375 rollouts: strategic and approachable
  - **Hard** — Neural Network AI: a TensorFlow.js policy network trains on startup and guides a PUCT-based search with ~700 rollouts
- **Three Board Sizes**: 9×9 (beginner), 13×13 (standard), 19×19 (full)
- **Three Visual Themes**: Classic wood, Paper, Dark
- **Hint System**: Request up to 3 AI-suggested moves ranked by quality
- **Emoji Chat**: React to moves; the AI responds with its own emoji
- **Game History**: All games saved locally via SQLite (WebAssembly); SGF export
- **Sound Effects**: Synthesized stone-on-wood sounds via Web Audio API
- **Mobile & Tablet Friendly**: Full touch support

## How to Play

### Basic Rules

1. Black moves first; players alternate placing stones on intersections
2. A stone (or group) is **captured** when all its adjacent empty points (liberties) are surrounded by the opponent
3. **Pass** if you have no useful move; two consecutive passes end the game
4. Score = territory + captures; White receives **6.5 komi** to compensate for going second

### Controls

| Action | How |
|--------|-----|
| Place stone | Click or tap an intersection |
| Pass | Press **Pass** button |
| Resign | Press **Resign** button |
| Hint | Press **Hint** — shows 1, 2, or 3 suggested moves |
| New Game | Press **New Game** (prompts to save if game in progress) |
| Export SGF | Click **SGF** in the History panel |

## AI Design

### Easy Mode — MCTS (Monte Carlo Tree Search)

Uses a flat UCB1 bandit over 15 pre-filtered candidate moves with ~375 random playouts each. The heuristic scorer understands:

- Capturing and rescuing groups in atari
- Opening principles: 3rd/4th-line star point preference
- Local response: strongly prefers moves near recent activity

### Hard Mode — TensorFlow.js Neural Network + PUCT

On page load, a small convolutional network trains for ~5–8 seconds using synthetic game positions. The heuristic AI generates the training signal — the network learns to approximate good moves — then guides a stronger PUCT-based MCTS search:

**Board input features** (19×19×6 tensor, smaller boards centred with zero-padding):

| Channel | Feature |
|---------|---------|
| 0 | Own stones |
| 1 | Opponent stones |
| 2 | Own group liberty count (normalised) |
| 3 | Opponent group liberty count (normalised) |
| 4 | Last move indicator |
| 5 | Second-to-last move indicator |

**Network architecture:**

```
Input [1 × 19 × 19 × 6]
→ Conv2D(48 filters, 3×3, relu)
→ Conv2D(64 filters, 3×3, relu)
→ Conv2D(32 filters, 3×3, relu)
→ Conv2D(4 filters, 1×1, relu)   ← policy head
→ Flatten → Dense(361, softmax)
```

**PUCT selection formula** (AlphaGo-style):

```
score(a) = Q(a) + C_puct × P(a) × √N / (1 + n(a))
```

Where `P(a)` is the neural network policy prior, `N` is the parent visit count, and `n(a)` is the child visit count. `C_puct = 2.5`.

## Technology Stack

| Component | Technology |
|-----------|-----------|
| Game logic | Vanilla JavaScript (ES Modules) |
| Rendering | HTML5 Canvas API |
| Easy AI | MCTS with UCB1 bandit |
| Hard AI | TensorFlow.js CNN + PUCT MCTS |
| Persistence | sql.js (SQLite compiled to WebAssembly) |
| Audio | Web Audio API (synthesized, no audio files) |
| Build | None — open `index.html` directly |

## Project Structure

```
go-game/
├── index.html      # App shell; loads CDN scripts and ES modules
├── go-rules.js     # Go game logic: board, captures, ko, scoring, SGF export
├── ai.js           # MCTS utilities, heuristics, Easy AI (aiHard), Hard AI (aiNeural)
├── neural.js       # TensorFlow.js network: board encoding, training, inference
├── game.js         # Orchestrator: state, events, AI driver, lifecycle
├── render.js       # Canvas renderer: board, stones, hover, hint markers
├── ui.js           # Sidebar UI, AI personas, emoji system, chat feed
├── db.js           # SQLite persistence via sql.js
├── audio.js        # Web Audio API sound synthesis
└── style.css       # Three themes (Classic/Paper/Dark), responsive layout
```

## Browser Compatibility

| Browser | Minimum Version |
|---------|----------------|
| Chrome / Edge | 80+ |
| Firefox | 75+ |
| Safari | 14+ |

Requires: ES Modules, HTML5 Canvas, Web Audio API, WebAssembly, localStorage

## License

MIT — free to use, modify, and distribute.
