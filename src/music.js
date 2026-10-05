import { onAudioReady } from './audio.js';

// Generative ambience synthesized with the Web Audio API, like the sound effects: a low drone, slow
// pads moving through a D minor progression (ending on the A major dominant for the eerie pull),
// sparse bell notes from the harmonic minor scale, and a faint wind. All of it sits in a long reverb.
const LEVEL = 0.4;
const CHORD_SECONDS = 8;
const LOOKAHEAD = 1.2;
const TICK_MS = 300;

// MIDI note numbers.
const DRONE = [26, 38];
const CHORDS = [
  [50, 57, 65], // Dm
  [46, 53, 62], // Bb
  [43, 50, 58], // Gm
  [45, 52, 61], // A
];
const BELL_SCALE = [62, 64, 65, 67, 69, 70, 73, 74, 76, 77, 79, 81]; // D harmonic minor
const BELL_LOW = 4.5; // seconds between bells, at least
const BELL_SPREAD = 5;

const midiToHz = (note) => 440 * 2 ** ((note - 69) / 12);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

let ctx = null;
let bus = null;
let dry = null;
let reverb = null;
let noiseBuffer = null;
let started = false;
let muted = false;
let nextChordAt = 0;
let chordIndex = 0;
let nextBellAt = 0;
let bellIndex = 4;

// A few seconds of decaying stereo noise makes a convincing cathedral tail.
function makeImpulse(seconds) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2.5;
  }
  return impulse;
}

function buildGraph(audio) {
  ctx = audio.ctx;
  bus = ctx.createGain();
  bus.gain.value = muted ? 0 : LEVEL;
  bus.connect(audio.master);

  dry = ctx.createGain();
  dry.gain.value = 0.6;
  dry.connect(bus);
  reverb = ctx.createConvolver();
  reverb.buffer = makeImpulse(4.5);
  const wet = ctx.createGain();
  wet.gain.value = 1;
  reverb.connect(wet).connect(bus);

  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
}

// A slow oscillator that wobbles `param` by +/- `depth`.
function modulate(param, rate, depth) {
  const lfo = ctx.createOscillator();
  const amount = ctx.createGain();
  lfo.frequency.value = rate;
  amount.gain.value = depth;
  lfo.connect(amount).connect(param);
  lfo.start();
}

function startDrone() {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 260;
  modulate(filter.frequency, 0.05, 140);
  const gain = ctx.createGain();
  gain.gain.value = 0.2;
  filter.connect(gain);
  gain.connect(dry);
  gain.connect(reverb);

  for (const note of DRONE) {
    for (const detune of [-6, 6]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = midiToHz(note);
      osc.detune.value = detune;
      osc.connect(filter);
      osc.start();
    }
  }
}

function startWind() {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer;
  source.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 500;
  filter.Q.value = 4;
  modulate(filter.frequency, 0.037, 250);
  const gain = ctx.createGain();
  gain.gain.value = 0.05;
  modulate(gain.gain, 0.08, 0.035);
  source.connect(filter).connect(gain).connect(reverb);
  source.start();
}

// One chord: each note is a pair of detuned saws, swelling in slowly and fading out over the next chord.
function playChord(notes, time) {
  const attack = 2.5;
  const release = 3.5;
  for (const note of notes) {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.035, time + attack);
    gain.gain.setValueAtTime(0.035, time + CHORD_SECONDS - 0.5);
    gain.gain.linearRampToValueAtTime(0.0001, time + CHORD_SECONDS + release);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    filter.connect(gain);
    gain.connect(dry);
    gain.connect(reverb);
    for (const detune of [-7, 7]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = midiToHz(note);
      osc.detune.value = detune;
      osc.connect(filter);
      osc.start(time);
      osc.stop(time + CHORD_SECONDS + release + 0.1);
    }
  }
}

// A cold, glassy bell: a sine with an inharmonic partner, ringing out into the reverb.
function playBell(note, time) {
  const hz = midiToHz(note);
  const decay = 5;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(0.09, time + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + decay);
  gain.connect(reverb);
  const quiet = ctx.createGain();
  quiet.gain.value = 0.25;
  gain.connect(quiet).connect(dry);

  for (const [ratio, level] of [[1, 1], [3.5, 0.3]]) {
    const osc = ctx.createOscillator();
    const partial = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = hz * ratio;
    partial.gain.value = level;
    osc.connect(partial).connect(gain);
    osc.start(time);
    osc.stop(time + decay + 0.1);
  }
}

// Wander along the scale in small steps so the bells sound like a tune that keeps losing its way.
function nextBellNote() {
  const step = pick([-2, -1, -1, 1, 1, 2]);
  bellIndex = Math.max(0, Math.min(BELL_SCALE.length - 1, bellIndex + step));
  return BELL_SCALE[bellIndex];
}

function schedule() {
  const horizon = ctx.currentTime + LOOKAHEAD;
  while (nextChordAt < horizon) {
    playChord(CHORDS[chordIndex], nextChordAt);
    chordIndex = (chordIndex + 1) % CHORDS.length;
    nextChordAt += CHORD_SECONDS;
  }
  while (nextBellAt < horizon) {
    playBell(nextBellNote(), nextBellAt);
    nextBellAt += BELL_LOW + Math.random() * BELL_SPREAD;
  }
}

function begin(audio) {
  buildGraph(audio);
  startDrone();
  startWind();
  nextChordAt = ctx.currentTime + 0.1;
  nextBellAt = ctx.currentTime + 3;
  schedule();
  setInterval(schedule, TICK_MS);
  // Don't let the scheduler fall behind (and then burst) while the tab is hidden.
  document.addEventListener('visibilitychange', () => (document.hidden ? ctx.suspend() : ctx.resume()));
}

export const music = {
  // Starts as soon as the browser lets audio play (the first key press).
  start() {
    if (started) return;
    started = true;
    onAudioReady(begin);
  },

  toggleMute() {
    muted = !muted;
    if (bus) bus.gain.setTargetAtTime(muted ? 0 : LEVEL, ctx.currentTime, 0.3);
  },
};
