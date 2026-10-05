import { TILE, GRAVITY, MAX_FALL } from './constants.js';
import { move, overlap } from './physics.js';
import { spawnShards } from './fx.js';
import { sfx } from './audio.js';
import { INK, PALETTE, shaded, dot, glow, mix, rgba } from './gfx.js';
import { CrawlerRig } from './art/crawler.js';
import { SpitterRig } from './art/spitter.js';

const HIT_FLASH = 0.12;
const HIT_STUN = 0.18;
const KNOCKBACK = 70; // deliberately small
const SPIT_WINDUP = 0.45;

// Subclasses set `this.rig`, which animates and draws them (see art/).
export class Enemy {
  constructor(tx, ty, { w, h, hp, color, shards, dropMin, dropMax, dropValue = 1 }) {
    this.w = w;
    this.h = h;
    this.x = tx * TILE + (TILE - w) / 2;
    this.y = (ty + 1) * TILE - h;
    this.vx = 0;
    this.vy = 0;
    this.hp = hp;
    this.color = color;
    this.shardCount = shards;
    this.dropMin = dropMin;
    this.dropMax = dropMax;
    this.dropValue = dropValue;
    this.flash = 0;
    this.stun = 0;
    this.dead = false;
    this.onGround = false;
    this.blocked = false;
    this.facing = -1;
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  takeHit(dir, game) {
    this.hp -= 1;
    this.flash = HIT_FLASH;
    if (this.hp <= 0) return this.die(game);
    sfx.play('hit');
    this.rig.hit();
    this.stun = HIT_STUN;
    this.vx = dir * KNOCKBACK;
  }

  die(game) {
    this.dead = true;
    sfx.play('kill');
    spawnShards(game, this, this.shardCount, this.color);
    const drops = this.dropMin + Math.floor(Math.random() * (this.dropMax - this.dropMin + 1));
    game.dropPoints(this.cx, this.cy, drops, this.dropValue);
  }

  update(dt, game) {
    this.flash = Math.max(0, this.flash - dt);
    if (this.stun > 0) {
      this.stun -= dt;
      this.vx -= this.vx * Math.min(1, 10 * dt);
    } else {
      this.think(dt, game);
    }
    this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * dt);
    const hit = move(this, game.level, dt);
    this.onGround = hit.down;
    this.blocked = hit.left || hit.right;
    this.rig.update(dt, this, game);
  }

  // Subclasses set vx (and fire projectiles etc.) here.
  think() {}

  draw(ctx) {
    this.rig.draw(ctx, this);
  }
}

// Melee enemy: patrols its platform and charges the player when they get close.
export class Crawler extends Enemy {
  constructor(tx, ty, level) {
    super(tx, ty, { w: 12, h: 10, hp: 3, color: '#a23b5a', shards: 5, dropMin: 1, dropMax: 3 });
    const range = level.patrolRange(tx, ty, 5);
    this.minX = range.minX;
    this.maxX = range.maxX;
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.facing = this.dir;
    this.rig = new CrawlerRig(this.facing);
  }

  think(dt, game) {
    const p = game.player;
    const sees =
      Math.abs(p.cy - this.cy) < 24 &&
      Math.abs(p.cx - this.cx) < 90 &&
      p.cx > this.minX - 8 &&
      p.cx < this.maxX + 8;

    let dir = this.dir;
    if (sees) dir = Math.sign(p.cx - this.cx) || dir;
    else if (this.blocked) dir = -dir;

    const atLeftEdge = this.x <= this.minX && dir < 0;
    const atRightEdge = this.x + this.w >= this.maxX && dir > 0;
    if (atLeftEdge || atRightEdge) dir = sees ? 0 : -dir;

    if (dir) {
      this.dir = dir;
      this.facing = dir;
    }
    this.vx = dir * (sees ? 55 : 28);
  }
}

// Ranged enemy: stands still, telegraphs, then spits a projectile aimed at the player.
export class Spitter extends Enemy {
  constructor(tx, ty) {
    super(tx, ty, { w: 12, h: 14, hp: 3, color: '#5b8c3a', shards: 6, dropMin: 2, dropMax: 4 });
    this.cooldown = 1 + Math.random();
    this.windup = 0;
    this.rig = new SpitterRig(this.facing);
  }

  // How far through its windup it is: 0 calm, 1 about to fire.
  get charge() {
    return this.windup > 0 ? 1 - this.windup / SPIT_WINDUP : 0;
  }

  think(dt, game) {
    const p = game.player;
    this.vx = 0;
    this.facing = Math.sign(p.cx - this.cx) || this.facing;

    if (this.windup > 0) {
      this.windup -= dt;
      if (this.windup <= 0) {
        this.fire(game);
        this.cooldown = 1.8;
      }
      return;
    }
    this.cooldown -= dt;
    const inRange = Math.abs(p.cx - this.cx) < 150 && Math.abs(p.cy - this.cy) < 56;
    if (inRange && this.cooldown <= 0) this.windup = SPIT_WINDUP;
  }

  fire(game) {
    const p = game.player;
    const dx = p.cx - this.cx;
    const dy = p.cy - this.cy;
    const dist = Math.hypot(dx, dy) || 1;
    const speed = 100;
    sfx.play('spit');
    this.rig.fired();
    game.projectiles.push(new Projectile(this.cx, this.cy - 2, (dx / dist) * speed, (dy / dist) * speed));
  }
}

export class Projectile {
  constructor(cx, cy, vx, vy, size = 5, color = PALETTE.venom) {
    this.w = size;
    this.h = size;
    this.x = cx - size / 2;
    this.y = cy - size / 2;
    this.vx = vx;
    this.vy = vy;
    this.color = color;
    this.life = 3;
    this.dead = false;
  }

  update(dt, game) {
    this.life -= dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.life <= 0 || game.level.overlapsSolid(this.x, this.y, this.w, this.h)) {
      this.dead = true;
      return;
    }
    const p = game.player;
    if (overlap(this, p) && p.hurt(this.x + this.w / 2, game)) this.dead = true;
  }

  // A glowing glob that wobbles as it flies and leaves a fading trail.
  draw(ctx) {
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;
    const radius = this.w / 2 + 0.4;
    const wobble = Math.sin(this.life * 22) * 0.14;

    glow(ctx, cx, cy, radius * 3, this.color, 0.4);
    for (let i = 3; i >= 1; i--) {
      dot(ctx, cx - this.vx * 0.014 * i, cy - this.vy * 0.014 * i, radius * (1 - i * 0.2), rgba(this.color, 0.36 - i * 0.09));
    }
    const tone = { base: this.color, shade: mix(this.color, INK, 0.45) };
    shaded(ctx, () => ctx.ellipse(cx, cy, radius * (1 + wobble), radius * (1 - wobble), 0, 0, Math.PI * 2), tone, { lightX: 0.3, lightY: -0.7, lineWidth: 0.6 });
    dot(ctx, cx - radius * 0.3, cy - radius * 0.35, radius * 0.25, 'rgba(255, 255, 255, 0.75)');
  }
}
