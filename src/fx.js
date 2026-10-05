import { GRAVITY, MAX_FALL } from './constants.js';
import { move, overlap } from './physics.js';
import { amberShard, dot, strokeInk } from './gfx.js';
import { sfx } from './audio.js';

const SHARD_WHITE_TIME = 0.08;
const SHARD_FADE_TIME = 0.7;
const SHARD_BOUNCE = 0.45;
const SHARD_ROLL_FRICTION = 1.4;

// A piece of a dead enemy: tumbles through the air, bounces, rolls along the floor, fades out.
// It collides as a square but is drawn as a jagged fragment of shell.
export class Shard {
  constructor(x, y, size, vx, vy, color) {
    this.x = x;
    this.y = y;
    this.w = size;
    this.h = size;
    this.vx = vx;
    this.vy = vy;
    this.color = color;
    this.outline = jaggedOutline(size / 2);
    this.angle = Math.random() * Math.PI;
    this.spin = (Math.random() - 0.5) * 16;
    this.age = 0;
    this.life = 2.4 + Math.random() * 0.8;
    this.dead = false;
  }

  update(dt, game) {
    this.age += dt;
    if (this.age >= this.life) {
      this.dead = true;
      return;
    }
    this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * dt);
    const hit = move(this, game.level, dt);

    if (hit.down) {
      this.vy = Math.abs(hit.impactVy) > 50 ? -hit.impactVy * SHARD_BOUNCE : 0;
    }
    if (hit.left || hit.right) this.vx = -hit.impactVx * 0.5;

    const rolling = hit.down && this.vy === 0;
    if (rolling) {
      this.vx *= Math.exp(-SHARD_ROLL_FRICTION * dt);
      this.spin = this.vx / (this.w / 2); // rolls without slipping
    }
    this.angle += this.spin * dt;
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, (this.life - this.age) / SHARD_FADE_TIME);
    ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
    ctx.rotate(this.angle);
    ctx.beginPath();
    this.outline.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = this.age < SHARD_WHITE_TIME ? '#fff' : this.color;
    ctx.fill();
    strokeInk(ctx, 0.7);
    ctx.restore();
  }
}

// An irregular four- or five-sided shape around the origin.
function jaggedOutline(radius) {
  const corners = 4 + Math.floor(Math.random() * 2);
  const points = [];
  for (let i = 0; i < corners; i++) {
    const angle = ((i + Math.random() * 0.6) / corners) * Math.PI * 2;
    const reach = radius * (0.7 + Math.random() * 0.6);
    points.push([Math.cos(angle) * reach, Math.sin(angle) * reach]);
  }
  return points;
}

export function spawnShards(game, entity, count, color, maxSize = 5) {
  for (let i = 0; i < count; i++) {
    const size = 3 + Math.floor(Math.random() * (maxSize - 2));
    const x = entity.x + Math.random() * (entity.w - size);
    const y = entity.y + Math.random() * (entity.h - size);
    const vx = (x + size / 2 - entity.cx) * 5 + (Math.random() - 0.5) * 60;
    const vy = -80 - Math.random() * 120;
    game.shards.push(new Shard(x, y, size, vx, vy, color));
  }
}

// A puff of dust kicked up by a hard landing or a charge: drifts, swells and fades.
export class Dust {
  constructor(x, y, vx, vy, radius) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.radius = radius;
    this.age = 0;
    this.life = 0.35 + Math.random() * 0.25;
    this.dead = false;
  }

  update(dt) {
    this.age += dt;
    if (this.age >= this.life) this.dead = true;
    const drag = Math.exp(-4 * dt);
    this.vx *= drag;
    this.vy *= drag;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  draw(ctx) {
    const k = this.age / this.life;
    ctx.globalAlpha = (1 - k) * 0.45;
    dot(ctx, this.x, this.y, this.radius * (0.6 + k), '#b9aacb');
    ctx.globalAlpha = 1;
  }
}

// `spread`: how fast the puffs fly apart sideways.
export function spawnDust(game, x, y, count, spread = 40) {
  for (let i = 0; i < count; i++) {
    const vx = (Math.random() - 0.5) * spread;
    const vy = -6 - Math.random() * 14;
    game.dust.push(new Dust(x + (Math.random() - 0.5) * 6, y - Math.random() * 1.5, vx, vy, 1.4 + Math.random() * 1.4));
  }
}

// Points dropped by enemies. They bounce out, settle, and get pulled in when the player is near.
export class Pickup {
  constructor(cx, cy, value, { scatter = true } = {}) {
    this.w = 5;
    this.h = 5;
    this.x = cx - this.w / 2;
    this.y = cy - this.h / 2;
    this.value = value;
    this.vx = scatter ? (Math.random() - 0.5) * 120 : 0;
    this.vy = scatter ? -100 - Math.random() * 80 : 0;
    this.age = scatter ? 0 : 1;
    this.dead = false;
  }

  update(dt, game) {
    const p = game.player;
    this.age += dt;

    const dx = p.cx - (this.x + this.w / 2);
    const dy = p.cy - (this.y + this.h / 2);
    const dist = Math.hypot(dx, dy);
    const magnetized = this.age > 0.5 && dist < 36;

    if (magnetized) {
      this.vx = (dx / dist) * 160;
      this.vy = (dy / dist) * 160;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    } else {
      this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * dt);
      const hit = move(this, game.level, dt);
      if (hit.down) {
        this.vy = Math.abs(hit.impactVy) > 60 ? -hit.impactVy * 0.4 : 0;
        this.vx *= Math.exp(-8 * dt);
      }
      if (hit.left || hit.right) this.vx = -hit.impactVx * 0.5;
    }

    const reach = { x: p.x - 2, y: p.y - 2, w: p.w + 4, h: p.h + 4 };
    if (this.age > 0.25 && overlap(this, reach)) {
      game.points += this.value;
      this.dead = true;
      sfx.play('pickup');
    }
  }

  draw(ctx) {
    amberShard(ctx, this.x + this.w / 2, this.y + this.h / 2, 3.4);
  }
}
