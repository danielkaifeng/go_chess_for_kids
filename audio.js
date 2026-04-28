// ── Web Audio — self-contained, no DOM/game dependencies ──────────────────────
let audioCtx = null;

function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

// Short noise burst through bandpass — "tock" on wood
export function playStoneSound(isAI = false) {
  try {
    const ac  = getAudio();
    const now = ac.currentTime;
    const dur = 0.07;
    const len = Math.ceil(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.25));

    const src = ac.createBufferSource(); src.buffer = buf;
    const bp  = ac.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = isAI ? 900 : 1200; bp.Q.value = 3.5;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.55, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(bp); bp.connect(g); g.connect(ac.destination);
    src.start(now);
  } catch (_) {}
}

// Deeper thud for captures
export function playCaptureSound() {
  try {
    const ac  = getAudio();
    const now = ac.currentTime;
    const dur = 0.12;
    const len = Math.ceil(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.35));

    const src = ac.createBufferSource(); src.buffer = buf;
    const bp  = ac.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = 350; bp.Q.value = 2;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.7, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(bp); bp.connect(g); g.connect(ac.destination);
    src.start(now);
  } catch (_) {}
}

// Ascending two-note "ding" for emoji
export function playEmojiSound() {
  try {
    const ac  = getAudio();
    const now = ac.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = ac.createOscillator(), gain = ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);
      osc.type = 'sine'; osc.frequency.value = freq;
      const t0 = now + i * 0.11;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.13, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.22);
      osc.start(t0); osc.stop(t0 + 0.22);
    });
  } catch (_) {}
}
