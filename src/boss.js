import { Enemy, Projectile } from './enemies.js';
import { spawnShards, spawnDust } from './fx.js';
import { sfx } from './audio.js';
import { WardenRig } from './art/warden.js';

const CHARGE_SPEED = 170;
const LEAP_VELOCITY = 300;
const LEAP_AIR_TIME = (2 * LEAP_VELOCITY) / 900;
const ATTACKS = ['charge', 'leap', 'volley'];
const CHARGE_DUST_INTERVAL = 0.07;
// Entrance: it stirs, rears up and roars, then slams back down. Times are in seconds.
const INTRO_WAKE = 0.5;
const INTRO_ROAR = 0.9;
const INTRO_SLAM = 0.35;
const INTRO_TIME = INTRO_WAKE + INTRO_ROAR + INTRO_SLAM;
// Where volley shots leave from: between the pincers once it has reared up (matches the art).
const MUZZLE = { x: 20, y: -5 };

// The Warden: telegraphs each attack (its shell flashes and it strikes a pose) and picks a
// random one that differs from the last. Active only once the player enters the arena.
export class Boss extends Enemy {
  constructor(tx, ty) {
    super(tx, ty, { w: 28, h: 28, hp: 18, color: '#5b3a8c', shards: 18, dropMin: 15, dropMax: 15, dropValue: 2 });
    this.maxHp = this.hp;
    this.active = false;
    this.setState('dormant', 0);
    this.lastAttack = null;
    this.dustIn = 0;
    this.rig = new WardenRig(this.facing);
  }

  // Starts the entrance; the boss only becomes active (and hittable) once it is over.
  activate() {
    this.setState('intro', INTRO_TIME);
    this.slammed = false;
  }

  get awake() {
    return this.active || this.state === 'intro';
  }

  get introPlaying() {
    return this.state === 'intro';
  }

  // wake -> roar -> slam, driven by how much of the intro has elapsed.
  get introPhase() {
    const elapsed = INTRO_TIME - this.timer;
    if (elapsed < INTRO_WAKE) return 'wake';
    return elapsed < INTRO_WAKE + INTRO_ROAR ? 'roar' : 'slam';
  }

  setState(state, time) {
    this.state = state;
    this.timer = time;
  }

  takeHit(dir, game) {
    if (!this.active) return;
    this.hp -= 1;
    this.flash = 0.1;
    this.rig.hit();
    if (this.hp <= 0) this.die(game);
    else sfx.play('hit');
  }

  die(game) {
    this.dead = true;
    sfx.play('bossDeath');
    spawnShards(game, this, this.shardCount, this.color, 8);
    game.dropPoints(this.cx, this.cy, this.dropMin, this.dropValue);
    game.onBossDefeated();
  }

  think(dt, game) {
    if (this.introPlaying) {
      this.vx = 0;
      this.updateIntro(dt, game);
      return;
    }
    if (!this.active) {
      this.vx = 0;
      return;
    }
    const p = game.player;
    this.timer -= dt;

    switch (this.state) {
      case 'idle':
        this.vx = 0;
        this.facing = Math.sign(p.cx - this.cx) || this.facing;
        if (this.timer <= 0) {
          const options = ATTACKS.filter((a) => a !== this.lastAttack);
          this.lastAttack = options[Math.floor(Math.random() * options.length)];
          this.setState('windup', 0.5);
          sfx.play('telegraph');
        }
        break;

      case 'windup':
        this.vx = 0;
        this.facing = Math.sign(p.cx - this.cx) || this.facing;
        if (this.timer <= 0) this.startAttack(game);
        break;

      case 'charge':
        this.vx = this.facing * CHARGE_SPEED;
        this.kickUpDust(dt, game);
        if (this.timer <= 0 || this.blocked) this.setState('recover', 0.9);
        break;

      case 'leap':
        this.airTime += dt;
        if (this.airTime > 0.1 && this.onGround) {
          this.vx = 0;
          this.shockwave(game);
          this.setState('recover', 0.7);
        }
        break;

      case 'volley':
        this.vx = 0;
        if (this.timer <= 0) {
          if (this.bursts > 0) {
            this.fireVolley(game);
            this.bursts -= 1;
            this.timer = 0.45;
          } else {
            this.setState('recover', 0.6);
          }
        }
        break;

      case 'recover':
        this.vx = 0;
        if (this.timer <= 0) this.setState('idle', 0.7);
        break;
    }
  }

  updateIntro(dt, game) {
    this.timer -= dt;
    this.facing = Math.sign(game.player.cx - this.cx) || this.facing;
    if (this.introPhase === 'slam' && !this.slammed) {
      this.slammed = true;
      sfx.play('slam');
      this.rig.slammed();
      spawnDust(game, this.cx, this.y + this.h, 16, 170);
    }
    if (this.timer <= 0) {
      this.active = true;
      this.setState('idle', 0.7);
    }
  }

  startAttack(game) {
    const p = game.player;
    if (this.lastAttack === 'charge') {
      this.setState('charge', 1.4);
    } else if (this.lastAttack === 'leap') {
      this.vy = -LEAP_VELOCITY;
      this.vx = Math.max(-140, Math.min(140, (p.cx - this.cx) / LEAP_AIR_TIME));
      this.airTime = 0;
      this.rig.leapt();
      this.setState('leap', 0);
    } else {
      this.bursts = 1;
      this.fireVolley(game);
      this.setState('volley', 0.45);
    }
  }

  fireVolley(game) {
    sfx.play('spit');
    this.rig.fired();
    const p = game.player;
    const x = this.cx + this.facing * MUZZLE.x;
    const y = this.cy + MUZZLE.y;
    const base = Math.atan2(p.cy - y, p.cx - x);
    for (const spread of [-0.28, 0, 0.28]) {
      const a = base + spread;
      game.projectiles.push(new Projectile(x, y, Math.cos(a) * 110, Math.sin(a) * 110, 6, '#c77dff'));
    }
  }

  // Ground shockwave: two low projectiles racing outward along the floor.
  shockwave(game) {
    sfx.play('slam');
    this.rig.slammed();
    spawnDust(game, this.cx, this.y + this.h, 16, 170);
    const y = this.y + this.h - 4;
    for (const dir of [-1, 1]) {
      game.projectiles.push(new Projectile(this.cx + dir * (this.w / 2 + 4), y, dir * 130, 0, 6, '#c77dff'));
    }
  }

  // A trail of dust from its hind legs while it charges.
  kickUpDust(dt, game) {
    this.dustIn -= dt;
    if (this.dustIn > 0) return;
    this.dustIn = CHARGE_DUST_INTERVAL;
    spawnDust(game, this.cx - this.facing * 12, this.y + this.h, 2, 30);
  }
}
