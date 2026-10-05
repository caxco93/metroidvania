import { TAU, clamp, damp, lerp, stepCycle, Spring } from '../anim.js';
import { INK, LINE, WHITE, shaded, strokeInk, polygon, dot, glow, groundShadow, mixTone } from '../gfx.js';
import { Rig, leg, rotateAbout } from './rig.js';

const TONES = {
  shell: { base: '#5b3a8c', shade: '#34205a' },
  dormant: { base: '#34264d', shade: '#1f1631' },
  tell: { base: '#ffd166', shade: '#c9862c' }, // the shell flashes toward this before an attack
  plate: { base: '#2f1d4a', shade: '#180e29' },
  jaw: { base: '#e3d7bd', shade: '#9d8f76' },
  farJaw: { base: '#a8997e', shade: '#6b6050' },
  gloss: '#9a76d6',
  leg: '#3f2966',
  farLeg: '#1e1333',
  eye: '#ff4d6d',
  orb: '#c77dff',
};
const FLASH_TONES = {
  shell: WHITE, dormant: WHITE, tell: WHITE, plate: WHITE, jaw: WHITE, farJaw: WHITE,
  gloss: WHITE.base, leg: WHITE.base, farLeg: WHITE.base, eye: WHITE.base, orb: WHITE.base,
};

// Body attitude for each behaviour, eased between as the boss changes state.
// pitch: radians, positive is head down. crouch: how far the body sinks. rear: front legs off
// the ground (0..1). jaw: how wide the pincers gape. eye: how brightly the eye burns.
const POSES = {
  dormant: { pitch: 0.06, crouch: 1.8, rear: 0, jaw: 0.03, eye: 0 },
  idle: { pitch: 0, crouch: 0, rear: 0, jaw: 0.22, eye: 0.7 },
  windupCharge: { pitch: 0.16, crouch: 1, rear: 0, jaw: 0.6, eye: 1 },
  windupLeap: { pitch: 0.04, crouch: 2.6, rear: 0, jaw: 0.3, eye: 1 },
  windupVolley: { pitch: -0.3, crouch: 0, rear: 1, jaw: 0.75, eye: 1 },
  charge: { pitch: 0.1, crouch: 0.5, rear: 0, jaw: 0.5, eye: 1 },
  leap: { pitch: 0, crouch: 0, rear: 0, jaw: 0.45, eye: 1 },
  volley: { pitch: -0.3, crouch: 0, rear: 1, jaw: 0.75, eye: 1 },
  recover: { pitch: 0.08, crouch: 1.2, rear: 0, jaw: 0.1, eye: 0.35 },
  introWake: { pitch: 0.04, crouch: 1.2, rear: 0, jaw: 0.15, eye: 0.5 },
  introRoar: { pitch: -0.35, crouch: 0, rear: 1, jaw: 1, eye: 1 },
  introSlam: { pitch: 0.1, crouch: 2.2, rear: 0, jaw: 0.3, eye: 1 },
};
const POSE_EASE = 14;

// Local space, feet at y = GROUND. The body pitches about PIVOT (between its hind legs) while
// the feet stay planted.
const GROUND = 14;
const PIVOT = [-7, 9];
const LEGS = [
  { hip: [-8.5, 7], reach: -3.6, bend: -1 },
  { hip: [-1.5, 8.2], reach: -1.2, bend: -1 },
  { hip: [6.5, 7.2], reach: 3, bend: 1 },
];
const THIGH = 5.5;
const SHIN = 7.5;
const STRIDE = 4;
const STEP_HEIGHT = 3;
const GAIT_RATE = 0.11;
const FAR_SIDE_SHIFT = 2.2;
const JAW_PIVOTS = { upper: [14.4, 1.4], lower: [14.4, 5.6] };
const ORB = [23.5, 3.5]; // where volley shots gather, between the jaw tips

// The Warden: a hulking stag beetle. Each attack has its own tell (it paws the ground before a
// charge, crouches before a leap, rears up and gathers light before a volley) and it slumps,
// panting, while it recovers.
export class WardenRig extends Rig {
  constructor(facing) {
    super(facing, new Spring(200, 11));
    this.recoil = new Spring(240, 14);
    this.pose = { ...POSES.dormant };
    this.gait = 0;
    this.moving = 0;
    this.airborne = 0;
    this.tell = 0;
    this.orb = 0;
    this.shake = 0;
  }

  // --- events -------------------------------------------------------------

  hit() {
    this.shake = 1;
  }

  leapt() {
    this.squash.kick(6);
  }

  slammed() {
    this.squash.kick(-9);
  }

  fired() {
    this.recoil.kick(26);
    this.orb = 0.2;
  }

  // --- update -------------------------------------------------------------

  update(dt, boss) {
    this.tick(dt, boss.facing);
    this.recoil.update(dt);
    this.shake = Math.max(0, this.shake - dt * 5);
    if (boss.introPlaying && boss.introPhase === 'roar') this.shake = 0.45;

    const target = POSES[this.poseName(boss)];
    for (const key of Object.keys(target)) this.pose[key] = damp(this.pose[key], target[key], POSE_EASE, dt);

    const speed = Math.abs(boss.vx);
    const inAir = boss.state === 'leap' && !boss.onGround;
    this.gait += speed * GAIT_RATE * dt;
    this.moving = damp(this.moving, speed > 5 && !inAir ? 1 : 0, 12, dt);
    this.airborne = damp(this.airborne, inAir ? 1 : 0, 16, dt);
    this.tell = damp(this.tell, boss.state === 'windup' ? 1 : 0, 40, dt);

    const gathering = boss.state === 'volley' || (boss.state === 'windup' && boss.lastAttack === 'volley');
    this.orb = damp(this.orb, gathering ? 1 : 0, 7, dt);
  }

  poseName(boss) {
    if (boss.introPlaying) return { wake: 'introWake', roar: 'introRoar', slam: 'introSlam' }[boss.introPhase];
    if (!boss.active) return 'dormant';
    if (boss.state === 'windup') return { charge: 'windupCharge', leap: 'windupLeap', volley: 'windupVolley' }[boss.lastAttack];
    return boss.state;
  }

  // --- drawing ------------------------------------------------------------

  draw(ctx, boss) {
    const flashing = boss.flash > 0;
    const tones = flashing ? FLASH_TONES : TONES;
    const pawing = boss.state === 'windup' && boss.lastAttack === 'charge';

    // Breathing: slow asleep, quick and heavy while recovering.
    const [rate, depth] = !boss.awake ? [0.9, 0.4] : boss.state === 'recover' ? [7, 0.9] : [1.7, 0.5];
    const breath = Math.sin(this.time * rate) * depth;
    const jitter = Math.sin(this.time * 90) * this.shake * 1.2;

    const pitch = this.pose.pitch + clamp(boss.vy * 0.0011, -0.3, 0.3) * this.airborne;
    const offsetX = jitter - this.recoil.value - (pawing ? 1.5 : 0);
    const offsetY = this.pose.crouch + breath - Math.abs(Math.sin(this.gait)) * 0.8 * this.moving;
    // Body-space point -> local space (the body is pitched about PIVOT, then shifted).
    const place = ([x, y]) => {
      const [rx, ry] = rotateAbout(x, y, PIVOT[0], PIVOT[1], pitch);
      return [rx + offsetX, ry + offsetY];
    };

    groundShadow(ctx, boss.cx, boss.y + boss.h, 17, 1 - this.airborne * 0.6);
    ctx.save();
    this.enter(ctx, boss);

    this.drawLegs(ctx, place, pawing, Math.PI, FAR_SIDE_SHIFT, tones.farLeg);

    ctx.save();
    ctx.translate(PIVOT[0] + offsetX, PIVOT[1] + offsetY);
    ctx.rotate(pitch);
    ctx.translate(-PIVOT[0], -PIVOT[1]);
    this.drawBody(ctx, boss, tones, flashing);
    ctx.restore();

    this.drawLegs(ctx, place, pawing, 0, 0, tones.leg);
    ctx.restore();
  }

  drawLegs(ctx, place, pawing, phase, shiftX, color) {
    LEGS.forEach(({ hip, reach, bend }, i) => {
      const [hipX, hipY] = place(hip);
      const [dx, dy] = stepCycle(this.gait + phase + (i === 1 ? Math.PI : 0), STRIDE * this.moving, STEP_HEIGHT * this.moving);
      let foot = [hip[0] + reach + dx, GROUND + dy];

      // Hind leg scrapes the floor before a charge.
      if (pawing && i === 0) foot[0] += Math.sin(this.time * 16 + phase) * 2.2;
      // Front legs paw the air when it rears up.
      if (i === 2) {
        const raised = [hipX + 5, hipY + 2.5 + Math.sin(this.time * 9 + phase) * 1.2];
        foot = [lerp(foot[0], raised[0], this.pose.rear), lerp(foot[1], raised[1], this.pose.rear)];
      }
      // In the air every leg tucks up under the body.
      const tucked = [hipX + reach * 0.5, hipY + 5.5];
      foot = [lerp(foot[0], tucked[0], this.airborne), lerp(foot[1], tucked[1], this.airborne)];

      const knee = leg(ctx, [hipX + shiftX, hipY], [foot[0] + shiftX, foot[1]], THIGH, SHIN, bend, 2, color);
      dot(ctx, knee[0], knee[1], 0.9, INK);
    });
  }

  drawBody(ctx, boss, tones, flashing) {
    // A hard-edged flash: it spends most of its time fully lit or fully dark, not in between.
    const pulse = clamp(0.5 + Math.sin(this.time * 30) * 3, 0, 1) * this.tell;
    const resting = boss.awake ? tones.shell : tones.dormant;
    const shell = flashing ? tones.shell : mixTone(resting, tones.tell, pulse);

    // Wing cases.
    shaded(ctx, () => {
      ctx.moveTo(-14.6, 6.6);
      ctx.bezierCurveTo(-15.6, -3.8, -9.2, -11.6, -1.6, -11.3);
      ctx.bezierCurveTo(2.0, -11.1, 4.7, -8.7, 5.1, -5.0);
      ctx.lineTo(4.7, 8.6);
      ctx.bezierCurveTo(-2.0, 10.8, -10.0, 10.2, -14.6, 6.6);
      ctx.closePath();
    }, shell, { lightX: 0.6, lightY: -2.2, lineWidth: 1.2 });

    ctx.beginPath();
    ctx.moveTo(-13.9, 1.6);
    ctx.quadraticCurveTo(-6, -4.8, 4.9, -2.8);
    ctx.moveTo(-14.2, 5.0);
    ctx.quadraticCurveTo(-5, 0.8, 4.8, 2.2);
    ctx.moveTo(-12.2, 8.0);
    ctx.quadraticCurveTo(-4, 6.4, 4.7, 6.6);
    strokeInk(ctx, LINE.detail * 1.4);
    if (!flashing && boss.awake) {
      ctx.beginPath();
      ctx.moveTo(-10.6, -5.2);
      ctx.quadraticCurveTo(-6.6, -9.7, -1.2, -9.6);
      ctx.lineWidth = 1.1;
      ctx.lineCap = 'round';
      ctx.strokeStyle = tones.gloss;
      ctx.stroke();
    }

    // A crest of spikes along the thorax, behind the plate.
    for (const spike of [[[4.9, -7.2], [5.9, -10.6], [7.0, -7.6]], [[7.4, -7.4], [8.9, -10.0], [9.5, -6.6]], [[9.8, -5.8], [11.6, -7.8], [11.4, -4.4]]]) {
      polygon(ctx, spike, tones.plate.base, 0.8);
    }
    shaded(ctx, () => {
      ctx.moveTo(3.9, -7.5);
      ctx.bezierCurveTo(8.0, -8.5, 11.7, -5.0, 11.9, -0.6);
      ctx.lineTo(11.5, 7.2);
      ctx.bezierCurveTo(8.6, 9.0, 5.6, 9.0, 3.9, 8.4);
      ctx.closePath();
    }, tones.plate, { lightX: 0.5, lightY: -1.6, lineWidth: 1.2 });

    // Pincers: the far one first, then the head over both roots, then the near one.
    let gape = this.pose.jaw + Math.sin(this.time * 1.7) * 0.04;
    if (boss.state === 'charge') gape += Math.sin(this.time * 26) * 0.25;
    this.drawJaw(ctx, JAW_PIVOTS.lower, gape, -1, tones.farJaw);
    shaded(ctx, () => ctx.ellipse(13, 3.4, 3.6, 4.4, 0, 0, TAU), tones.plate, { lineWidth: 1.2 });
    this.drawJaw(ctx, JAW_PIVOTS.upper, gape, 1, tones.jaw);

    this.drawEye(ctx, tones, flashing);
    if (!flashing && this.orb > 0.03) {
      const swell = this.orb * (1 + Math.sin(this.time * 20) * 0.08);
      glow(ctx, ORB[0], ORB[1], 8 * swell, tones.orb, 0.75);
      dot(ctx, ORB[0], ORB[1], 2.4 * swell, tones.orb);
      dot(ctx, ORB[0], ORB[1], 1.1 * swell, '#ffffff');
    }
  }

  // One pincer, hinged at `pivot`. `side`: 1 for the upper pincer, -1 mirrors it into the lower.
  drawJaw(ctx, pivot, gape, side, tone) {
    ctx.save();
    ctx.translate(...pivot);
    ctx.scale(1, side);
    ctx.rotate(-gape);
    shaded(ctx, () => {
      ctx.moveTo(-0.5, -1.7);
      ctx.bezierCurveTo(4.5, -3.6, 9.5, -3.2, 12.6, 0.9);
      ctx.bezierCurveTo(10.6, -0.4, 9.2, -0.7, 8.0, -0.5);
      ctx.lineTo(7.4, 1.3);
      ctx.lineTo(6.2, -0.3);
      ctx.bezierCurveTo(4.2, 0.2, 2.0, 0.8, -0.5, 1.5);
      ctx.closePath();
    }, tone, { lightX: 0.2, lightY: -0.7 * side, lineWidth: 1 });
    ctx.restore();
  }

  drawEye(ctx, tones, flashing) {
    const [x, y] = [13.9, 2];
    const brightness = this.pose.eye;
    if (flashing) return;
    if (brightness < 0.08) {
      // Asleep: a closed lid.
      ctx.beginPath();
      ctx.moveTo(x - 1.3, y);
      ctx.quadraticCurveTo(x, y + 0.9, x + 1.3, y);
      strokeInk(ctx, 0.6);
      return;
    }
    glow(ctx, x, y, 5.5, tones.eye, 0.7 * brightness);
    ctx.fillStyle = tones.eye;
    ctx.beginPath();
    ctx.ellipse(x, y, 1.25, 1.6 * lerp(0.45, 1, brightness), 0, 0, TAU);
    ctx.fill();
    strokeInk(ctx, 0.5);
    dot(ctx, x + 0.2, y, 0.45, INK);
  }
}
