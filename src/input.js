const BINDINGS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  jump: ['Space', 'KeyZ', 'KeyK'],
  attack: ['KeyX', 'KeyJ'],
  interact: ['KeyE'],
  confirm: ['Enter', 'KeyE', 'Space'],
  cancel: ['Escape', 'KeyQ'],
  revive: ['Enter', 'KeyE'],
  map: ['KeyM'],
  mute: ['KeyN'],
};

const heldKeys = new Set();
const pressedKeys = new Set();
const boundKeys = new Set(Object.values(BINDINGS).flat());

window.addEventListener('keydown', (e) => {
  if (boundKeys.has(e.code)) e.preventDefault();
  if (!heldKeys.has(e.code)) pressedKeys.add(e.code);
  heldKeys.add(e.code);
});
window.addEventListener('keyup', (e) => heldKeys.delete(e.code));
window.addEventListener('blur', () => heldKeys.clear());

export const input = {
  held: (action) => BINDINGS[action].some((k) => heldKeys.has(k)),
  pressed: (action) => BINDINGS[action].some((k) => pressedKeys.has(k)),
  axis: () => (input.held('right') ? 1 : 0) - (input.held('left') ? 1 : 0),
  // Call once per frame, after update, so "pressed" only lasts one frame.
  endFrame: () => pressedKeys.clear(),
};
