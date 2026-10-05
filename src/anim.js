// Small animation helpers shared by the character rigs in art/.

export const TAU = Math.PI * 2;

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => {
  const k = clamp(t, 0, 1);
  return k * k * (3 - 2 * k);
};
export const easeOut = (t) => 1 - (1 - clamp(t, 0, 1)) ** 3;

// Frame-rate independent smoothing: moves `current` toward `target`, faster for higher `rate`.
export const damp = (current, target, rate, dt) => lerp(current, target, 1 - Math.exp(-rate * dt));

// Moves `current` toward `target` by at most `maxDelta`.
export const approach = (current, target, maxDelta) =>
  current < target ? Math.min(target, current + maxDelta) : Math.max(target, current - maxDelta);

// A damped spring resting at zero. Kick it and it wobbles back; used for squash & stretch and recoil.
export class Spring {
  constructor(stiffness = 260, damping = 13) {
    this.stiffness = stiffness;
    this.damping = damping;
    this.value = 0;
    this.velocity = 0;
  }

  kick(impulse) {
    this.velocity += impulse;
  }

  reset() {
    this.value = 0;
    this.velocity = 0;
  }

  update(dt) {
    this.velocity += (-this.stiffness * this.value - this.damping * this.velocity) * dt;
    this.value += this.velocity * dt;
  }
}

// Turns a spring value into volume-preserving-ish scale factors: positive stretches tall and thin.
export function squashScale(amount, limit = 0.35) {
  const s = clamp(amount, -limit, limit);
  return { x: 1 - s * 0.7, y: 1 + s };
}

// One foot's offset through a walk cycle. For half the cycle the foot is planted and slides back
// under the body; for the other half it lifts and swings forward. Returns [dx, dy] (dy <= 0).
export function stepCycle(phase, stride, lift) {
  return [Math.cos(phase) * stride, Math.min(0, Math.sin(phase)) * lift];
}

// Two-bone inverse kinematics: where the joint sits for a limb running from (ax, ay) to (bx, by).
// `bend` (+1 / -1) picks which side the joint pokes out on. If the target is out of reach the limb
// just straightens toward it.
export function joint(ax, ay, bx, by, upper, lower, bend = 1) {
  const dx = bx - ax;
  const dy = by - ay;
  const reach = Math.hypot(dx, dy) || 0.0001;
  const dist = clamp(reach, Math.abs(upper - lower) + 0.0001, upper + lower - 0.0001);
  const along = (upper * upper - lower * lower + dist * dist) / (2 * dist);
  const out = Math.sqrt(Math.max(0, upper * upper - along * along));
  const ux = dx / reach;
  const uy = dy / reach;
  return [ax + ux * along + uy * out * bend, ay + uy * along - ux * out * bend];
}
