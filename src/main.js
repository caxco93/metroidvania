import { VIEW_W, VIEW_H } from './constants.js';
import { Game } from './game.js';
import { input } from './input.js';

const canvas = document.getElementById('game');
const game = new Game(canvas);

// Size the backing store to the displayed size so nothing is upscaled.
function resize() {
  const width = Math.round(canvas.clientWidth * (window.devicePixelRatio || 1));
  canvas.width = width;
  canvas.height = Math.round((width * VIEW_H) / VIEW_W);
}
window.addEventListener('resize', resize);
resize();

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 1 / 30);
  last = now;
  game.update(dt);
  game.draw();
  input.endFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
