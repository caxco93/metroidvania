import { approach, joint, Spring, squashScale } from '../anim.js';
import { limb } from '../gfx.js';

const TURN_SPEED = 22; // how fast the turn-around flip plays
const MIN_FLIP = 0.2;

// What every character rig shares: a clock, a smoothed facing (so turning around is a quick flip
// rather than a snap) and a squash & stretch spring.
//
// A rig holds the animation state for one character and draws it. The gameplay object reports
// events to it (hit, fired, landed...) and the rig reads the rest from that object's state.
//
// Rigs draw in the character's local space: origin at the centre of its hitbox, +x the way it
// faces, so its feet are at y = body.h / 2.
export class Rig {
  constructor(facing = 1, spring = new Spring()) {
    this.time = Math.random() * 10; // so identical creatures don't move in unison
    this.side = facing;
    this.squash = spring;
  }

  tick(dt, facing) {
    this.time += dt;
    this.side = approach(this.side, facing, TURN_SPEED * dt);
    this.squash.update(dt);
  }

  // Horizontal scale for the current facing. Never quite zero mid-flip, so the sprite stays visible.
  get flip() {
    return Math.abs(this.side) < MIN_FLIP ? MIN_FLIP * (this.side < 0 ? -1 : 1) : this.side;
  }

  // Enters local space. Squash & stretch and `lean` (radians) pivot about the feet.
  enter(ctx, body, lean = 0) {
    const feet = body.h / 2;
    const scale = squashScale(this.squash.value);
    ctx.translate(body.cx, body.cy);
    ctx.scale(this.flip, 1);
    ctx.translate(0, feet);
    ctx.rotate(lean);
    ctx.scale(scale.x, scale.y);
    ctx.translate(0, -feet);
  }

  // Where a local point ends up in the world: the same transform as enter().
  toWorld(body, lean, x, y) {
    const feet = body.h / 2;
    const scale = squashScale(this.squash.value);
    const sx = x * scale.x;
    const sy = (y - feet) * scale.y;
    const cos = Math.cos(lean);
    const sin = Math.sin(lean);
    return [body.cx + (sx * cos - sy * sin) * this.flip, body.cy + feet + sx * sin + sy * cos];
  }
}

// Rotates the point (x, y) about (pivotX, pivotY).
export function rotateAbout(x, y, pivotX, pivotY, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = x - pivotX;
  const dy = y - pivotY;
  return [pivotX + dx * cos - dy * sin, pivotY + dx * sin + dy * cos];
}

// A two-segment leg from hip to foot. `bend` (+1 / -1) picks which way the knee points.
// Returns the knee position.
export function leg(ctx, hip, foot, upper, lower, bend, width, color) {
  const knee = joint(hip[0], hip[1], foot[0], foot[1], upper, lower, bend);
  limb(ctx, [hip, knee, foot], width, color, width * 0.38);
  return knee;
}
