import { TAU, clamp, damp, lerp, smoothstep, easeOut, stepCycle, joint } from '../anim.js';
import { INK, LINE, WHITE, shaded, limb, strokeInk, polygon, groundShadow } from '../gfx.js';
import { Cloak } from './cloak.js';
import { Rig } from './rig.js';

const TONES = {
  shell: { base: '#f4f0e6', shade: '#b9b1a5' },
  cloak: { base: '#c2163a', shade: '#7a0c26' },
  limb: '#ddd5c6',
  foot: '#9a9184',
};
const FLASH_TONES = { shell: WHITE, cloak: WHITE, limb: WHITE.base, foot: WHITE.base };

// Local space: origin at the centre of the hitbox, +x is the way the hero faces, feet at y = FEET.
const FEET = 7;
const CLOAK_ANCHOR = [-2.4, 1.6];
const SHOULDER = [1.5, 1.9];
const HIPS = [[1.1, 5], [-1.1, 5]]; // near leg, far leg
const ARM_BONE = 2.25;

const FLASH_INTERVAL = 0.07;
const STRIDE_RATE = 0.17; // radians of run cycle per unit travelled
const ARM_RECOVERY = 0.16;

// Animation state and drawing for the hero: a white beetle with two horns and a red cloak.
// The Player reports events (jumped, landed, struck...); everything else is read from its state.
export class HeroRig extends Rig {
  constructor() {
    super();
    this.cloak = new Cloak();
    this.reset();
  }

  reset() {
    this.side = 1;
    this.stride = 0;
    this.runBlend = 0;
    this.airBlend = 0;
    this.lean = 0;
    this.swing = null;
    this.blinkIn = 2;
    this.cloak.reset();
    this.squash.reset();
  }

  // --- events -------------------------------------------------------------

  jumped() {
    this.squash.kick(5);
  }

  landed(impactSpeed) {
    this.squash.kick(-clamp(impactSpeed * 0.022, 0.5, 8));
  }

  bounced() {
    this.squash.kick(4);
  }

  flinched() {
    this.squash.kick(-4);
  }

  // strike: { dir: 'side' | 'up' | 'down', facing, duration, reach, width }
  struck(strike) {
    this.swing = { ...strike, t: 0 };
  }

  // The strike was cut short (knocked back, or grabbed a ledge).
  strikeInterrupted() {
    this.swing = null;
  }

  // --- update -------------------------------------------------------------

  update(dt, hero, level) {
    this.tick(dt, hero.facing);

    const grounded = hero.onGround && hero.state === 'normal';
    const speed = Math.abs(hero.vx);
    this.runBlend = damp(this.runBlend, grounded && speed > 10 ? 1 : 0, 18, dt);
    this.airBlend = damp(this.airBlend, grounded || hero.state === 'climb' ? 0 : 1, 20, dt);
    if (grounded) this.stride += speed * STRIDE_RATE * dt;

    if (this.swing) {
      this.swing.t += dt;
      if (this.swing.t > this.swing.duration + ARM_RECOVERY) this.swing = null;
    }

    this.blinkIn -= dt;
    if (this.blinkIn < -0.12) this.blinkIn = 2.5 + Math.random() * 3;

    this.lean = damp(this.lean, this.targetLean(hero), 16, dt);

    const [anchorX, anchorY] = this.toWorld(hero, this.lean, ...CLOAK_ANCHOR);
    this.cloak.update(dt, anchorX, anchorY, -hero.facing, this.time, level);
  }

  targetLean(hero) {
    if (hero.stun > 0) return -0.45;
    if (this.swing && this.swing.t < this.swing.duration) return { side: 0.24, up: -0.14, down: 0.5 }[this.swing.dir];
    if (hero.state === 'climb') return 0.3 * (1 - hero.climb.slide);
    return 0.13 * this.runBlend + clamp(hero.vx * hero.facing * 0.0012, -0.1, 0.12) * this.airBlend;
  }

  // --- pose ---------------------------------------------------------------

  // Where every moving part is this frame, in local space.
  pose(hero) {
    const run = this.runBlend;
    const air = this.airBlend;
    const climbing = hero.state === 'climb';
    const stunned = hero.stun > 0;
    const striking = this.swing && this.swing.t < this.swing.duration;

    const breath = Math.sin(this.time * 2.4);
    const bob = lerp(breath * 0.22, -Math.abs(Math.sin(this.stride)) * 0.7, run) * (1 - air);

    let headTilt = -0.04 * run + clamp(hero.vy * 0.0006, -0.16, 0.14) * air;
    if (striking) headTilt = { side: 0.1, up: -0.32, down: 0.3 }[this.swing.dir];
    if (stunned) headTilt = -0.25;

    let eyeOpen = 1;
    if (this.blinkIn < 0) eyeOpen = 0.12;
    if (striking) eyeOpen = 0.7;
    if (stunned) eyeOpen = 0.3;

    return {
      bob,
      feet: this.feet(hero, climbing, stunned),
      hand: this.hand(hero, bob, climbing, stunned),
      armOut: Boolean(this.swing) || climbing || stunned || (air > 0.5 && hero.vy > 0),
      head: { x: 0.9 + 0.3 * run, y: -2.7 + bob * 1.25, tilt: headTilt },
      eyeOpen,
      // The cloak's hem sways at rest, streams back on the run and lifts in a fall.
      hem: {
        sway: Math.sin(this.time * 3.5) * 0.15 + Math.sin(this.stride * 2) * 0.3 * run,
        trail: 0.9 * run + clamp(hero.vx * hero.facing * 0.01, -0.6, 1) * air,
        lift: clamp(hero.vy * 0.006, -0.5, 1.6) * air,
      },
    };
  }

  feet(hero, climbing, stunned) {
    const stand = [[1.5, FEET], [-1.5, FEET]];
    if (climbing) {
      const dangle = [[1.2, FEET - 0.5], [-1.5, FEET + 0.2]];
      return stand.map((foot, i) => [lerp(dangle[i][0], foot[0], hero.climb.slide), lerp(dangle[i][1], foot[1], hero.climb.slide)]);
    }
    if (stunned) return [[2.7, FEET - 1], [-2.1, FEET - 0.2]];

    const [nearX, nearY] = stepCycle(this.stride, 2.5, 1.9);
    const [farX, farY] = stepCycle(this.stride + Math.PI, 2.5, 1.9);
    const running = [[0.3 + nearX, FEET + nearY], [-0.3 + farX, FEET + farY]];

    // Rising: legs tucked. Falling: legs spread and paddling.
    const paddle = Math.sin(this.time * 14) * 0.3;
    const airborne = hero.vy < 0
      ? [[1.3, FEET - 1.1], [-1.7, FEET - 0.4]]
      : [[2.3, FEET - 0.3 + paddle], [-2.3, FEET - 0.9 - paddle]];

    return stand.map((foot, i) => {
      const groundX = lerp(foot[0], running[i][0], this.runBlend);
      const groundY = lerp(foot[1], running[i][1], this.runBlend);
      return [lerp(groundX, airborne[i][0], this.airBlend), lerp(groundY, airborne[i][1], this.airBlend)];
    });
  }

  hand(hero, bob, climbing, stunned) {
    const [shoulderX, shoulderY] = [SHOULDER[0], SHOULDER[1] + bob];
    const rest = [2.5 + Math.cos(this.stride + Math.PI) * 1.5 * this.runBlend, 4.7 + bob];
    const airborne = hero.vy < 0 ? [2.9, 4.2] : [3.5, 0.9];
    let hand = [lerp(rest[0], airborne[0], this.airBlend), lerp(rest[1], airborne[1], this.airBlend)];

    if (stunned) hand = [3.4, -0.6];
    if (climbing) {
      // Reach for the top of the ledge, which sinks from head height to foot height as we rise.
      const ledgeY = hero.climb.toY + hero.h - hero.cy;
      hand = [4.7, clamp(ledgeY - 0.3, -2.4, FEET - 1)];
    }
    if (this.swing) {
      // Sweep the claw across the strike direction, then let the arm fall back.
      const { dir, t, duration } = this.swing;
      const base = { side: 0, up: -Math.PI / 2, down: Math.PI / 2 }[dir];
      const angle = base + lerp(-1.0, 0.45, easeOut(t / duration));
      const thrust = [shoulderX + Math.cos(angle) * ARM_BONE * 2, shoulderY + Math.sin(angle) * ARM_BONE * 2];
      const settle = smoothstep((t - duration) / ARM_RECOVERY);
      hand = [lerp(thrust[0], hand[0], settle), lerp(thrust[1], hand[1], settle)];
    }
    return hand;
  }

  // --- drawing ------------------------------------------------------------

  draw(ctx, hero) {
    const flashing = hero.invuln > 0 && Math.floor(this.time / FLASH_INTERVAL) % 2 === 0;
    const tones = flashing ? FLASH_TONES : TONES;
    const pose = this.pose(hero);

    groundShadow(ctx, hero.cx, hero.y + hero.h, 5.5, 1 - this.airBlend);
    this.cloak.draw(ctx, tones.cloak);

    ctx.save();
    this.enter(ctx, hero, this.lean);
    this.drawLeg(ctx, HIPS[1], pose.feet[1], pose.bob, tones);
    this.drawTorso(ctx, pose.bob, tones);
    this.drawLeg(ctx, HIPS[0], pose.feet[0], pose.bob, tones);
    this.drawCloakBody(ctx, pose, tones);
    this.drawHead(ctx, pose, tones, flashing);
    if (pose.armOut) this.drawArm(ctx, pose, tones); // otherwise it stays under the cloak
    ctx.restore();

    if (this.swing) this.drawSlash(ctx, hero);
  }

  drawLeg(ctx, [hipX, hipY], [footX, footY], bob, tones) {
    limb(ctx, [[hipX, hipY + bob], [footX, footY - 0.45]], 0.75, tones.limb, 0.3);
    ctx.beginPath();
    ctx.ellipse(footX + 0.35, footY - 0.5, 0.85, 0.5, 0, 0, TAU);
    ctx.fillStyle = tones.foot;
    ctx.fill();
    strokeInk(ctx, 0.4);
  }

  drawTorso(ctx, bob, tones) {
    shaded(ctx, () => ctx.ellipse(0.1, 3.0 + bob, 2.9, 2.9, 0, 0, TAU), tones.shell);
    // Belly plates.
    ctx.beginPath();
    ctx.moveTo(-2.2, 3.7 + bob);
    ctx.quadraticCurveTo(0.2, 4.6 + bob, 2.5, 3.6 + bob);
    ctx.moveTo(-1.6, 4.9 + bob);
    ctx.quadraticCurveTo(0.2, 5.5 + bob, 1.9, 4.8 + bob);
    strokeInk(ctx, LINE.detail);
  }

  drawArm(ctx, pose, tones) {
    const shoulder = [SHOULDER[0], SHOULDER[1] + pose.bob];
    const [handX, handY] = pose.hand;
    const elbow = joint(shoulder[0], shoulder[1], handX, handY, ARM_BONE, ARM_BONE, -1);
    limb(ctx, [shoulder, elbow, pose.hand], 0.8, tones.limb, 0.3);

    // A claw, pointing the way the forearm does. It extends while striking.
    const dx = handX - elbow[0];
    const dy = handY - elbow[1];
    const length = Math.hypot(dx, dy) || 1;
    const [ux, uy] = [dx / length, dy / length];
    const reach = this.swing ? 2.6 : 1.3;
    polygon(
      ctx,
      [[handX - uy * 0.6, handY + ux * 0.6], [handX + ux * reach, handY + uy * reach], [handX + uy * 0.6, handY - ux * 0.6]],
      tones.shell.base,
      0.4,
    );
  }

  // The cloak wraps the body like a bell, open down the front where the white shell shows. The long
  // simulated tail hangs from under it at the back.
  drawCloakBody(ctx, pose, tones) {
    const b = pose.bob;
    const { sway, trail, lift } = pose.hem;
    const hemY = 5.5 + b - lift;
    shaded(ctx, () => {
      ctx.moveTo(2.5, 0.5 + b); // front of the neck
      ctx.quadraticCurveTo(1.5, 2.4 + b, 0.9 - trail * 0.3, hemY - 0.4 + sway); // front edge
      ctx.lineTo(-0.2 - trail * 0.5, hemY - 1.4);
      ctx.lineTo(-1.5 - trail * 0.7, hemY + 0.1 - sway);
      ctx.lineTo(-2.7 - trail * 0.9, hemY - 1.2);
      ctx.lineTo(-4.2 - trail, hemY + 0.4 + sway); // back corner of the hem
      ctx.quadraticCurveTo(-5.2 - trail * 0.5, 2.4 + b, -3.3, 0.3 + b); // back
      ctx.quadraticCurveTo(-0.2, 1.6 + b, 2.5, 0.5 + b); // neckline
      ctx.closePath();
    }, tones.cloak);
  }

  drawHead(ctx, pose, tones, flashing) {
    ctx.save();
    ctx.translate(pose.head.x, pose.head.y);
    ctx.rotate(pose.head.tilt);

    // Horns first, so the skull hides their roots.
    shaded(ctx, () => {
      ctx.moveTo(-3.0, -1.8);
      ctx.quadraticCurveTo(-5.8, -5.2, -3.4, -9.6);
      ctx.quadraticCurveTo(-3.2, -5.6, -0.4, -3.0);
      ctx.closePath();
    }, tones.shell);
    shaded(ctx, () => {
      ctx.moveTo(3.7, -2.1);
      ctx.quadraticCurveTo(6.8, -5.6, 4.7, -10.2);
      ctx.quadraticCurveTo(4.1, -6.0, 1.0, -3.2);
      ctx.closePath();
    }, tones.shell);

    shaded(ctx, () => {
      ctx.moveTo(-4.5, -0.3);
      ctx.bezierCurveTo(-4.6, -3.2, -2.6, -4.1, 0.2, -4.0);
      ctx.bezierCurveTo(3.0, -3.9, 4.9, -2.6, 4.8, -0.1);
      ctx.bezierCurveTo(4.7, 2.2, 3.2, 3.7, 0.6, 3.8);
      ctx.bezierCurveTo(-2.4, 3.9, -4.4, 2.4, -4.5, -0.3);
      ctx.closePath();
    }, tones.shell, { lightX: 0.5, lightY: -0.9 });

    if (!flashing) {
      ctx.fillStyle = INK;
      for (const [x, y, rx, ry] of [[1.3, 0.3, 1.2, 1.8], [3.65, 0.2, 0.8, 1.55]]) {
        ctx.beginPath();
        ctx.ellipse(x, y, rx, Math.max(0.15, ry * pose.eyeOpen), 0.08, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // A blade of light thrown out along the strike, sized to the real hit area.
  drawSlash(ctx, hero) {
    const { dir, facing, t, duration, reach, width } = this.swing;
    const k = t / duration;
    if (k > 1.3) return;

    const angle = { side: facing > 0 ? 0 : Math.PI, up: -Math.PI / 2, down: Math.PI / 2 }[dir];
    const start = 8;
    const half = width / 2 + 1.2;

    ctx.save();
    ctx.translate(hero.cx, hero.cy);
    ctx.rotate(angle);
    ctx.scale(lerp(0.45, 1, easeOut(k / 0.4)), lerp(1, 0.5, smoothstep((k - 0.4) / 0.9)));
    ctx.globalAlpha = 1 - smoothstep((k - 0.5) / 0.8);

    ctx.beginPath();
    ctx.moveTo(start, -half);
    ctx.quadraticCurveTo(2 * reach - start, 0, start, half); // leading edge, peaking at `reach`
    ctx.quadraticCurveTo(2 * (reach - 7) - start, 0, start, -half); // trailing edge
    ctx.closePath();
    const gradient = ctx.createLinearGradient(start, 0, reach, 0);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
    gradient.addColorStop(0.6, '#ffffff');
    ctx.fillStyle = gradient;
    ctx.fill();
    strokeInk(ctx, 0.6);
    ctx.restore();
  }
}
