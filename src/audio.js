// Sound effects synthesized with the Web Audio API: no audio files.
// The AudioContext is created on the first key press, since browsers block audio before a gesture.
let ctx = null;
let master = null;
let noiseBuffer = null;
let lastPickupAt = 0;

function ensureContext() {
  if (!ctx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    ctx = new AudioContextClass();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);

    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

window.addEventListener('keydown', ensureContext);

// A pitched blip that glides from `freq` to `to`.
function tone({ freq, to = freq, dur = 0.1, type = 'square', vol = 0.25, delay = 0 }) {
  if (!ensureContext()) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// A burst of filtered noise whose filter sweeps from `from` to `to`.
function noise({ dur = 0.1, vol = 0.25, filter = 'lowpass', from = 2000, to = from, delay = 0 }) {
  if (!ensureContext()) return;
  const t = ctx.currentTime + delay;
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer;
  const biquad = ctx.createBiquadFilter();
  biquad.type = filter;
  biquad.frequency.setValueAtTime(from, t);
  biquad.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  source.connect(biquad).connect(gain).connect(master);
  source.start(t);
  source.stop(t + dur + 0.02);
}

const SOUNDS = {
  jump: () => tone({ freq: 220, to: 460, dur: 0.12, type: 'sine', vol: 0.2 }),
  land: () => noise({ dur: 0.08, vol: 0.2, from: 500, to: 150 }),
  attack: () => noise({ dur: 0.13, vol: 0.22, filter: 'bandpass', from: 1000, to: 4000 }),
  pogo: () => tone({ freq: 300, to: 700, dur: 0.1, vol: 0.2 }),
  climb: () => tone({ freq: 240, to: 380, dur: 0.14, type: 'triangle', vol: 0.2 }),
  hit: () => {
    noise({ dur: 0.09, vol: 0.3, filter: 'bandpass', from: 1200, to: 500 });
    tone({ freq: 200, to: 90, dur: 0.1, vol: 0.2 });
  },
  kill: () => {
    noise({ dur: 0.3, vol: 0.3, from: 2500, to: 200 });
    tone({ freq: 220, to: 50, dur: 0.3, type: 'sawtooth', vol: 0.2 });
  },
  hurt: () => {
    tone({ freq: 420, to: 80, dur: 0.3, type: 'sawtooth', vol: 0.3 });
    noise({ dur: 0.15, vol: 0.25, from: 3000, to: 300 });
  },
  pickup: () => {
    // Quick successive pickups climb in pitch.
    const now = performance.now();
    const streak = now - lastPickupAt < 200 ? 1 : 0;
    lastPickupAt = now;
    const base = 880 + Math.random() * 120 + streak * 200;
    tone({ freq: base, to: base * 1.5, dur: 0.07, type: 'triangle', vol: 0.15 });
  },
  spit: () => {
    tone({ freq: 520, to: 180, dur: 0.16, vol: 0.15 });
    noise({ dur: 0.1, vol: 0.12, filter: 'highpass', from: 3000, to: 1500 });
  },
  telegraph: () => tone({ freq: 110, to: 260, dur: 0.45, type: 'sawtooth', vol: 0.14 }),
  slam: () => {
    noise({ dur: 0.45, vol: 0.45, from: 600, to: 60 });
    tone({ freq: 100, to: 35, dur: 0.45, type: 'sine', vol: 0.4 });
  },
  bossDeath: () => {
    noise({ dur: 1.1, vol: 0.4, from: 3000, to: 80 });
    [260, 200, 150, 100].forEach((f, i) => tone({ freq: f, to: f * 0.4, dur: 0.5, type: 'sawtooth', vol: 0.22, delay: i * 0.18 }));
  },
  gate: () => noise({ dur: 0.5, vol: 0.35, from: 300, to: 60 }),
  death: () => {
    tone({ freq: 330, to: 40, dur: 1.1, type: 'sawtooth', vol: 0.3 });
    noise({ dur: 0.6, vol: 0.25, from: 2000, to: 100 });
  },
  revive: () => [330, 440, 660].forEach((f, i) => tone({ freq: f, dur: 0.18, type: 'triangle', vol: 0.22, delay: i * 0.09 })),
  menu: () => tone({ freq: 700, dur: 0.04, vol: 0.12 }),
  buy: () => [660, 880, 1320].forEach((f, i) => tone({ freq: f, dur: 0.1, type: 'triangle', vol: 0.2, delay: i * 0.06 })),
  deny: () => tone({ freq: 170, to: 120, dur: 0.18, vol: 0.2 }),
};

export const sfx = {
  play(name) {
    SOUNDS[name]();
  },
};
