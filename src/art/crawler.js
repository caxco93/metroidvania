import { TAU, damp, stepCycle, Spring } from '../anim.js';
import { LINE, WHITE, shaded, strokeInk, polyline, dot, glow, groundShadow } from '../gfx.js';
import { Rig, leg, rotateAbout } from './rig.js';

const TONES = {
  shell: { base: '#a8375a', shade: '#671d3b' },
  plate: { base: '#6b1f3a', shade: '#3d1024' },
  horn: { base: '#d8cbb0', shade: '#9a8c74' },
  gloss: '#e0789a',
  leg: '#5f2340',
  farLeg: '#33121f',
  eye: '#ffd166',
};
const FLASH_TONES = { shell: WHITE, plate: WHITE, horn: WHITE, gloss: WHITE.base, leg: WHITE.base, farLeg: WHITE.base, eye: WHITE.base };

// Legs, rear to front: where each hip sits along the belly, how far its foot rests from the hip,
// and which way the knee points (rear legs angle back, the front leg forward).
const LEGS = [
  { hip: -3.4, reach: -2.3, bend: -1 },
  { hip: -0.4, reach: -0.6, bend: -1 },
  { hip: 2.8, reach: 1.9, bend: 1 },
];
const HIP_Y = 2.2;
const PIVOT = [-2.5, 2.5]; // the body pitches about its hind end; the feet stay planted
const THIGH = 2;
const SHIN = 2.8;
const RIDE_HEIGHT = 0.7; // how low the body is slung between the legs
const STRIDE = 1.5;
const STEP_HEIGHT = 1.2;
const GAIT_RATE = 0.34; // radians of walk cycle per unit travelled
const CHARGE_SPEED = 40; // faster than this and it lowers its horn

// A rhinoceros beetle: domed shell, armoured thorax, a long head horn and a short thorax horn.
// Walks on an alternating tripod gait, lowers its horn to charge and rocks back when struck.
export class CrawlerRig extends Rig {
  constructor(facing) {
    super(facing, new Spring(320, 14));
    this.gait = Math.random() * TAU;
    this.moving = 0;
    this.charging = 0;
    this.recoil = new Spring(240, 16);
  }

  hit() {
    this.squash.kick(-4);
    this.recoil.kick(6);
  }

  update(dt, crawler) {
    this.tick(dt, crawler.facing);
    this.recoil.update(dt);
    const speed = Math.abs(crawler.vx);
    this.gait += speed * GAIT_RATE * dt;
    this.moving = damp(this.moving, speed > 5 ? 1 : 0, 12, dt);
    this.charging = damp(this.charging, speed > CHARGE_SPEED ? 1 : 0, 10, dt);
  }

  draw(ctx, crawler) {
    const tones = crawler.flash > 0 ? FLASH_TONES : TONES;
    const ground = crawler.h / 2;
    // Head down for a charge, rocked back by a hit.
    const pitch = this.charging * 0.13 - this.recoil.value * 0.5;
    const stride = Math.abs(Math.sin(this.gait));
    const bob = RIDE_HEIGHT - stride * 0.35 * this.moving + Math.sin(this.time * 2.2) * 0.15 * (1 - this.moving);
    // Body-space point -> local space.
    const place = (x, y) => {
      const [rx, ry] = rotateAbout(x, y, PIVOT[0], PIVOT[1], pitch);
      return [rx, ry + bob];
    };

    groundShadow(ctx, crawler.cx, crawler.y + crawler.h, 7.5);
    ctx.save();
    this.enter(ctx, crawler);

    this.drawLegs(ctx, place, ground, Math.PI, 0.7, tones.farLeg);
    ctx.save();
    ctx.translate(PIVOT[0], PIVOT[1] + bob);
    ctx.rotate(pitch);
    ctx.translate(-PIVOT[0], -PIVOT[1]);
    this.drawBody(ctx, tones, crawler.flash > 0);
    ctx.restore();
    this.drawLegs(ctx, place, ground, 0, 0, tones.leg);

    ctx.restore();
  }

  // One side's three legs. The middle leg steps opposite the other two (a tripod gait), and the
  // far side (`phase` = PI) steps opposite the near side.
  drawLegs(ctx, place, ground, phase, shiftX, color) {
    LEGS.forEach(({ hip, reach, bend }, i) => {
      const [dx, dy] = stepCycle(this.gait + phase + (i === 1 ? Math.PI : 0), STRIDE * this.moving, STEP_HEIGHT * this.moving);
      const [hipX, hipY] = place(hip, HIP_Y);
      const foot = [hip + reach + dx + shiftX, ground + dy];
      leg(ctx, [hipX + shiftX, hipY], foot, THIGH, SHIN, bend, 0.75, color);
    });
  }

  drawBody(ctx, tones, flashing) {
    // Wing cases.
    shaded(ctx, () => {
      ctx.moveTo(-6.4, 2.2);
      ctx.bezierCurveTo(-7.0, -2.4, -4.2, -5.2, -0.6, -5.1);
      ctx.bezierCurveTo(1.2, -5.0, 2.3, -4.0, 2.5, -2.4);
      ctx.lineTo(2.3, 2.6);
      ctx.bezierCurveTo(-1.0, 3.5, -4.6, 3.3, -6.4, 2.2);
      ctx.closePath();
    }, tones.shell, { lightX: 0.3, lightY: -1.2 });

    // Ridges along the shell, and a streak of gloss on top.
    ctx.beginPath();
    ctx.moveTo(-5.9, 0.4);
    ctx.quadraticCurveTo(-2.4, -2.0, 2.3, -1.3);
    ctx.moveTo(-5.4, 2.0);
    ctx.quadraticCurveTo(-1.6, 0.9, 2.3, 1.0);
    strokeInk(ctx, LINE.detail);
    if (!flashing) {
      ctx.beginPath();
      ctx.moveTo(-4.5, -2.5);
      ctx.quadraticCurveTo(-2.8, -4.2, -0.4, -4.1);
      ctx.lineWidth = 0.6;
      ctx.lineCap = 'round';
      ctx.strokeStyle = tones.gloss;
      ctx.stroke();
    }

    // Thorax horn, behind the thorax plate.
    shaded(ctx, () => {
      ctx.moveTo(3.2, -3.4);
      ctx.quadraticCurveTo(5.6, -5.7, 7.6, -5.1);
      ctx.quadraticCurveTo(6.0, -3.6, 4.9, -2.7);
      ctx.closePath();
    }, tones.horn);

    shaded(ctx, () => {
      ctx.moveTo(1.9, -3.5);
      ctx.bezierCurveTo(4.0, -3.9, 5.7, -2.4, 5.8, -0.3);
      ctx.lineTo(5.5, 2.3);
      ctx.bezierCurveTo(4.2, 2.9, 2.9, 2.9, 1.9, 2.6);
      ctx.closePath();
    }, tones.plate);

    this.drawHead(ctx, tones, flashing);
  }

  drawHead(ctx, tones, flashing) {
    ctx.save();
    // The head rattles while it charges.
    ctx.translate(5.4, 0.8);
    ctx.rotate(Math.sin(this.time * 22) * 0.06 * this.charging);

    // Antenna, twitching.
    const twitch = Math.sin(this.time * 7) * 0.5;
    polyline(ctx, [[1.9, 1.0], [3.3, 1.9 + twitch]], 0.35);
    dot(ctx, 3.3, 1.9 + twitch, 0.4, tones.plate.base);

    // Head horn: sweeps forward, then up.
    shaded(ctx, () => {
      ctx.moveTo(0.2, -0.7);
      ctx.quadraticCurveTo(3.2, -1.0, 4.9, -5.2);
      ctx.quadraticCurveTo(4.7, -0.2, 2.2, 0.8);
      ctx.closePath();
    }, tones.horn);

    shaded(ctx, () => ctx.ellipse(1.0, 0.2, 1.6, 1.5, 0, 0, TAU), tones.plate);

    if (!flashing) {
      glow(ctx, 1.3, 0.1, 1.9, tones.eye, 0.55);
      dot(ctx, 1.3, 0.1, 0.5, tones.eye);
    }
    ctx.restore();
  }
}
