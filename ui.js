// ── UI helpers — DOM manipulation, AI personas, emoji tables ──────────────────

// ── AI Profiles ───────────────────────────────────────────────────────────────
export const AI_PROFILES = [
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

export const EMOJI = {
  thinking: ['🤔', '🤔', '💭', '🧐'],
  laugh:    ['😄', '😆', '😏', '😈', '😝', '🎯'],
  cry:      ['😢', '😭', '😤', '😰', '🥺'],
  pass:     ['🤷', '😶', '🙄'],
  winGame:  ['🎉', '😄', '🏆', '🥇', '🤩'],
  loseGame: ['😭', '😔', '😢', '🤝'],
  greet:    ['👋', '😊', '✌️', '🙂', '😃'],
};

export const EMOJI_REPLIES = {
  '😀':['😁','😄'], '😂':['🤣','😆'], '😎':['😎','😏'],
  '🤔':['🤔','💭'], '😮':['😮','😲'], '😭':['😅','🙃'],
  '👍':['😊','👍'], '❤️':['🥰','😊'], '🎉':['🎉','😄'],
  '🤗':['🤗','😊'], '😤':['😏','😄'], '🙈':['🙈','😂'],
  '🤩':['😄','🤩'], '😴':['😅','🤫'], '🙄':['😏','😄'],
};

export function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ── AI persona ─────────────────────────────────────────────────────────────────
let currentProfile = AI_PROFILES[0];
let emotionTimer      = null;
let boardEmotionTimer = null;

export function applyProfile(p) {
  currentProfile = p;
  document.getElementById('ai-emoji').textContent        = p.avatar;
  document.getElementById('ai-name-display').textContent  = p.name;
  document.getElementById('ai-title-display').textContent = p.title;
  document.getElementById('ai-score-name').textContent    = p.name;
}

export function getCurrentProfile() { return currentProfile; }

// ── Emotion display ────────────────────────────────────────────────────────────
export function showSidebarEmotion(emoji, ms = 2800) {
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

export function showBoardEmotion(emoji) {
  const el     = document.getElementById('board-emotion');
  const canvas = document.getElementById('board');
  const rect   = canvas.getBoundingClientRect();
  el.textContent = emoji;
  el.style.left  = Math.round(rect.left + rect.width  / 2) + 'px';
  el.style.top   = Math.round(rect.top  + rect.height / 3) + 'px';
  el.classList.remove('hidden', 'bemoji-in', 'bemoji-out');
  void el.offsetWidth;
  el.classList.add('bemoji-in');
  clearTimeout(boardEmotionTimer);
  boardEmotionTimer = setTimeout(() => {
    el.classList.replace('bemoji-in', 'bemoji-out');
    setTimeout(() => { el.classList.add('hidden'); el.classList.remove('bemoji-out'); }, 3000);
  }, 5000);
}

export function showEmotion(emoji, sidebarMs = 2800) {
  showSidebarEmotion(emoji, sidebarMs);
  showBoardEmotion(emoji);
}

export function showThinkingDots(on) {
  document.getElementById('think-dots').classList.toggle('hidden', !on);
}

export function addChat(from, emoji) {
  const feed = document.getElementById('chat-feed');
  const div  = document.createElement('div');
  div.className = `chat-msg ${from}`;
  div.innerHTML = `<span class="chat-avatar">${from === 'ai' ? currentProfile.avatar : '🧒'}</span>
                   <span class="chat-bubble">${emoji}</span>`;
  feed.appendChild(div);
  while (feed.children.length > 6) feed.removeChild(feed.firstChild);
  feed.scrollTop = feed.scrollHeight;
}

// ── Hint badge ─────────────────────────────────────────────────────────────────
export function updateHintBadge(hintCount) {
  const badge = document.getElementById('hint-badge');
  if (!hintCount) {
    badge.classList.add('hidden');
  } else {
    badge.textContent = hintCount;
    badge.classList.remove('hidden');
    badge.classList.remove('badgePop'); void badge.offsetWidth; badge.classList.add('badgePop');
  }
}

// ── Score / captures display ───────────────────────────────────────────────────
export function updateUI(game, aiThinking, hintComputing) {
  if (!game) return;
  const BLACK = 1, WHITE = 2;
  document.getElementById('black-cap').textContent = game.captures[BLACK];
  document.getElementById('white-cap').textContent = game.captures[WHITE];
  const hintBtn = document.getElementById('btn-hint');
  hintBtn.disabled = aiThinking || game.over || game.turn === WHITE || hintComputing;
}

// ── Modals ─────────────────────────────────────────────────────────────────────
export function openModal(title, body, onSave, onDiscard) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').textContent  = body;
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('modal-save').onclick    = () => { onSave();    closeModal(); };
  document.getElementById('modal-discard').onclick = () => { onDiscard(); closeModal(); };
}

export function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}
