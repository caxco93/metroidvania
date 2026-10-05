import { TILE, GRAVITY, MAX_FALL } from './constants.js';
import { input } from './input.js';
import { move } from './physics.js';
import { Tile } from './level.js';
import { sfx } from './audio.js';
import { spawnDust } from './fx.js';
import { HeroRig } from './art/hero.js';

const SPEED = 95;
const JUMP_VELOCITY = 320;
const JUMP_CUT_VELOCITY = 120;
const POGO_VELOCITY = 250;
const COYOTE_TIME = 0.1;
const JUMP_BUFFER = 0.1;

// The horn strike: long and narrow.
const ATTACK_TIME = 0.14;
const ATTACK_COOLDOWN = 0.3;
const ATTACK_LENGTH = 34;
const ATTACK_WIDTH = 10;

const INVULN_TIME = 1.4;
const STUN_TIME = 0.25; // no control while being flung
const FLING_X = 140;
const FLING_Y = 140;
const HARD_LANDING = 180; // impact speed that raises dust

const CLIMB_TIME = 0.22;

export class Player {
  constructor(x, y) {
    this.w = 10;
    this.h = 14;
    this.spawn = { x, y };
    this.maxHp = 5;
    this.rig = new HeroRig();
    this.reset();
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  reset() {
    this.x = this.spawn.x;
    this.y = this.spawn.y;
    this.vx = 0;
    this.vy = 0;
    this.hp = this.maxHp;
    this.facing = 1;
    this.state = 'normal'; // normal | climb
    this.onGround = false;
    this.jumping = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.invuln = 0;
    this.stun = 0;
    this.attackTime = 0;
    this.attackCooldown = 0;
    this.attackDir = 'side'; // side | up | down
    this.hitSet = new Set();
    this.pogoed = false;
    this.climb = null;
    this.rig.reset();
  }

  update(dt, game) {
    this.tickTimers(dt);
    if (this.state === 'climb') this.updateClimb(dt);
    else this.updateMovement(dt, game);
    this.rig.update(dt, this, game.level);
  }

  tickTimers(dt) {
    this.invuln = Math.max(0, this.invuln - dt);
    this.stun = Math.max(0, this.stun - dt);
    this.attackTime = Math.max(0, this.attackTime - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.coyote = Math.max(0, this.coyote - dt);
  }

  updateMovement(dt, game) {
    const level = game.level;
    const dir = input.axis();
    const locked = game.playerLocked;
    const canAct = this.stun <= 0 && !locked;

    if (locked) {
      this.vx = 0;
    } else if (canAct) {
      this.vx = dir * SPEED;
      if (dir) this.facing = dir;
    } else {
      this.vx -= this.vx * Math.min(1, 3 * dt);
    }

    if (input.pressed('jump')) this.jumpBuffer = JUMP_BUFFER;
    if (canAct && this.jumpBuffer > 0 && this.coyote > 0) {
      this.vy = -JUMP_VELOCITY;
      this.jumpBuffer = 0;
      this.coyote = 0;
      this.jumping = true;
      sfx.play('jump');
      this.rig.jumped();
    }
    // Releasing jump early cuts the jump short (variable height).
    if (this.jumping && !input.held('jump') && this.vy < -JUMP_CUT_VELOCITY) this.vy = -JUMP_CUT_VELOCITY;
    if (this.vy >= 0) this.jumping = false;

    if (canAct && input.pressed('attack') && this.attackCooldown <= 0) this.startAttack();

    this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * dt);
    const hit = move(this, level, dt);
    const wasOnGround = this.onGround;
    this.onGround = hit.down;
    if (this.onGround && !wasOnGround) this.land(hit.impactVy, game);
    if (this.onGround) {
      this.coyote = COYOTE_TIME;
      this.jumping = false;
    }

    // Falling alongside a ledge while pushing into it: pull up automatically.
    if (!this.onGround && this.vy >= 0 && canAct && dir !== 0) {
      const ledge = this.findLedge(level, dir);
      if (ledge) this.startClimb(ledge);
    }
  }

  land(impactSpeed, game) {
    this.rig.landed(impactSpeed);
    if (impactSpeed > HARD_LANDING) {
      sfx.play('land');
      spawnDust(game, this.cx, this.y + this.h, 5);
    }
  }

  startAttack() {
    if (input.held('up')) this.attackDir = 'up';
    else if (input.held('down') && !this.onGround) this.attackDir = 'down';
    else this.attackDir = 'side';
    this.attackTime = ATTACK_TIME;
    this.attackCooldown = ATTACK_COOLDOWN;
    this.hitSet = new Set();
    this.pogoed = false;
    sfx.play('attack');
    this.rig.struck({
      dir: this.attackDir,
      facing: this.facing,
      duration: ATTACK_TIME,
      reach: this.w / 2 - 2 + ATTACK_LENGTH,
      width: ATTACK_WIDTH,
    });
  }

  attackBox() {
    if (this.attackTime <= 0) return null;
    const len = ATTACK_LENGTH;
    const half = ATTACK_WIDTH / 2;
    switch (this.attackDir) {
      case 'up': return { x: this.cx - half, y: this.y - len + 2, w: ATTACK_WIDTH, h: len };
      case 'down': return { x: this.cx - half, y: this.y + this.h - 2, w: ATTACK_WIDTH, h: len };
      default: return { x: this.facing > 0 ? this.x + this.w - 2 : this.x - len + 2, y: this.cy - half, w: len, h: ATTACK_WIDTH };
    }
  }

  // Bounce off an enemy or spikes with a downward strike (once per swing).
  pogo() {
    if (this.pogoed) return;
    this.pogoed = true;
    sfx.play('pogo');
    this.rig.bounced();
    this.vy = -POGO_VELOCITY;
    this.jumping = false;
  }

  // Ledge: a solid tile beside the player with open air above it, near head height.
  findLedge(level, side) {
    const probeX = side > 0 ? this.x + this.w + 1 : this.x - 1;
    const tx = Math.floor(probeX / TILE);
    const ty = Math.floor((this.y + 6) / TILE);
    const top = ty * TILE;
    if (!level.isSolid(tx, ty) || level.tile(tx, ty - 1) !== Tile.EMPTY) return null;
    if (this.y < top - 6 || this.y > top + 4) return null;
    return { tx, ty, side };
  }

  startClimb({ tx, ty, side }) {
    this.facing = side;
    this.vx = 0;
    this.vy = 0;
    this.jumping = false;
    this.jumpBuffer = 0;
    this.attackTime = 0;
    this.rig.strikeInterrupted();
    this.state = 'climb';
    sfx.play('climb');
    this.climb = {
      t: 0,
      rise: 0,
      slide: 0,
      fromX: side > 0 ? tx * TILE - this.w : (tx + 1) * TILE,
      fromY: ty * TILE,
      toX: tx * TILE + (TILE - this.w) / 2,
      toY: ty * TILE - this.h,
    };
    this.x = this.climb.fromX;
    this.y = this.climb.fromY;
  }

  // Rises first, then slides onto the ledge.
  updateClimb(dt) {
    const c = this.climb;
    c.t += dt;
    const k = Math.min(1, c.t / CLIMB_TIME);
    c.rise = Math.min(1, k / 0.6);
    c.slide = Math.max(0, (k - 0.4) / 0.6);
    this.y = c.fromY + (c.toY - c.fromY) * c.rise;
    this.x = c.fromX + (c.toX - c.fromX) * c.slide;
    if (k >= 1) {
      this.state = 'normal';
      this.vx = 0;
      this.vy = 0;
    }
  }

  // knockback: false is used by spikes, which hurt without changing velocity or control.
  hurt(fromX, game, { knockback = true } = {}) {
    if (this.invuln > 0 || game.mode === 'dead') return false;
    this.hp -= 1;
    if (this.hp <= 0) {
      game.killPlayer();
      return true;
    }
    sfx.play('hurt');
    this.rig.flinched();
    this.invuln = INVULN_TIME;
    if (knockback) {
      this.stun = STUN_TIME;
      this.state = 'normal';
      this.attackTime = 0;
      this.rig.strikeInterrupted();
      this.vx = (this.cx < fromX ? -1 : 1) * FLING_X;
      this.vy = -FLING_Y;
    }
    return true;
  }

  draw(ctx) {
    this.rig.draw(ctx, this);
  }
}
