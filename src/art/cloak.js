import { TILE } from '../constants.js';
import { lerp } from '../anim.js';
import { strokeInk, polyline } from '../gfx.js';

const SEGMENTS = 6;
const SEGMENT_LENGTH = 1.1;
const GRAVITY = 260;
const DRAG = 4.5; // air resistance: makes the cloak lag behind and billow
const DRIFT = 70; // gentle pull to the wearer's back so it never hangs through their front
const FLUTTER = 34;
const TELEPORT_DISTANCE = 30;
const WIDTH_AT_COLLAR = 1.1;
const WIDTH_AT_HEM = 2.3;
const FLOOR_CLEARANCE = 1.1; // keeps the ribbon's thickness above the ground
const CONSTRAINT_PASSES = 3;

// A cape simulated as a chain of points hanging from a collar. Each point is pulled by gravity and
// slowed by drag, then pulled back to a fixed distance from the point above it, so the cape trails
// behind a running wearer and streams upward when they fall. Drawn as a ribbon that widens to a
// tattered hem.
export class Cloak {
  constructor() {
    this.points = null;
    this.behind = -1;
  }

  reset() {
    this.points = null;
  }

  // (anchorX, anchorY): world position of the collar. `behind`: -1 or 1, the wearer's back side.
  update(dt, anchorX, anchorY, behind, time, level) {
    this.behind = behind;
    const jumped = this.points && Math.hypot(anchorX - this.points[0].x, anchorY - this.points[0].y) > TELEPORT_DISTANCE;
    if (!this.points || jumped) this.hangFrom(anchorX, anchorY);

    const points = this.points;
    points[0].x = anchorX;
    points[0].y = anchorY;

    const drag = Math.exp(-DRAG * dt);
    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      const flutter = Math.sin(time * 3.1 + i * 0.9) * FLUTTER * (i / SEGMENTS);
      p.vx = (p.vx + (behind * DRIFT + flutter) * dt) * drag;
      p.vy = (p.vy + GRAVITY * dt) * drag;
      p.prevX = p.x;
      p.prevY = p.y;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    for (let pass = 0; pass < CONSTRAINT_PASSES; pass++) {
      for (let i = 1; i < points.length; i++) {
        const above = points[i - 1];
        const p = points[i];
        const dx = p.x - above.x;
        const dy = p.y - above.y;
        const k = SEGMENT_LENGTH / (Math.hypot(dx, dy) || 0.0001);
        p.x = above.x + dx * k;
        p.y = above.y + dy * k;
        this.restOnFloor(p, level);
      }
    }

    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      p.vx = (p.x - p.prevX) / dt;
      p.vy = (p.y - p.prevY) / dt;
    }
  }

  hangFrom(x, y) {
    this.points = [];
    for (let i = 0; i <= SEGMENTS; i++) {
      const py = y + i * SEGMENT_LENGTH;
      this.points.push({ x, y: py, prevX: x, prevY: py, vx: 0, vy: 0 });
    }
  }

  // The hem drapes on the ground instead of sinking into it.
  restOnFloor(p, level) {
    const tx = Math.floor(p.x / TILE);
    const ty = Math.floor((p.y + FLOOR_CLEARANCE) / TILE);
    if (level.isSolid(tx, ty) && !level.isSolid(tx, ty - 1)) p.y = ty * TILE - FLOOR_CLEARANCE;
  }

  draw(ctx, tone) {
    if (!this.points) return;
    const points = this.points;
    const last = points.length - 1;

    // Offset every point sideways to get the two edges of the ribbon.
    const outer = [];
    const inner = [];
    for (let i = 0; i <= last; i++) {
      const before = points[Math.max(0, i - 1)];
      const after = points[Math.min(last, i + 1)];
      const tx = after.x - before.x;
      const ty = after.y - before.y;
      const length = Math.hypot(tx, ty) || 0.0001;
      // Unit normal pointing to the wearer's back side when the cloak hangs straight down.
      const nx = (ty / length) * this.behind;
      const ny = (-tx / length) * this.behind;
      const half = lerp(WIDTH_AT_COLLAR, WIDTH_AT_HEM, (i / last) ** 0.8);
      outer.push([points[i].x + nx * half, points[i].y + ny * half]);
      inner.push([points[i].x - nx * half, points[i].y - ny * half]);
    }

    const trace = () => {
      ctx.beginPath();
      ctx.moveTo(...outer[0]);
      this.curveThrough(ctx, outer);
      this.traceHem(ctx, outer[last], inner[last], points[last], points[last - 1]);
      this.curveThrough(ctx, [...inner].reverse());
      ctx.closePath();
    };

    trace();
    ctx.fillStyle = tone.base;
    ctx.fill();

    // The half nearest the body is in shadow.
    ctx.save();
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i <= last; i++) ctx.lineTo(points[i].x, points[i].y);
    for (let i = last; i >= 0; i--) ctx.lineTo(...inner[i]);
    ctx.closePath();
    ctx.fillStyle = tone.shade;
    ctx.fill();
    ctx.restore();

    // A fold running down the lit half.
    const fold = points.map((p, i) => [lerp(p.x, outer[i][0], 0.5), lerp(p.y, outer[i][1], 0.5)]).slice(1);
    polyline(ctx, fold, 0.35, tone.shade);

    trace();
    strokeInk(ctx);
  }

  // Smooth line through a run of points (quadratic curves through the midpoints).
  curveThrough(ctx, run) {
    for (let i = 1; i < run.length - 1; i++) {
      const [x, y] = run[i];
      const [nx, ny] = run[i + 1];
      ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
    }
    ctx.lineTo(...run[run.length - 1]);
  }

  // A ragged hem: two tails with notches between them.
  traceHem(ctx, from, to, end, beforeEnd) {
    const dx = end.x - beforeEnd.x;
    const dy = end.y - beforeEnd.y;
    const length = Math.hypot(dx, dy) || 0.0001;
    const alongX = dx / length;
    const alongY = dy / length;
    const tatters = [[0.2, 1.3], [0.4, -0.3], [0.6, 1.7], [0.8, -0.2]];
    for (const [across, out] of tatters) {
      ctx.lineTo(lerp(from[0], to[0], across) + alongX * out, lerp(from[1], to[1], across) + alongY * out);
    }
    ctx.lineTo(...to);
  }
}
