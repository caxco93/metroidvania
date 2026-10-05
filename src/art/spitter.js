import { TAU, clamp, damp, lerp, smoothstep, Spring } from '../anim.js';
import { WHITE, shaded, polygon, dot, glow, groundShadow, mix, mixTone } from '../gfx.js';
import { Rig, leg } from './rig.js';

const TONES = {
  abdomen: { base: '#5f9440', shade: '#33561f' },
  swollen: { base: '#d6f58a', shade: '#8fbf3c' }, // the abdomen at full windup
  carapace: { base: '#3a5529', shade: '#1d2f15' },
  fang: { base: '#e3d7bd', shade: '#a39779' },
  leg: '#3d5f28',
  farLeg: '#1e3015',
  knee: '#7fb04f',
  mark: '#d9cdea',
  markHot: '#ffe45c',
  eye: '#ff4d6d',
  venom: '#b6f23a',
};
const FLASH_TONES = {
  abdomen: WHITE, swollen: WHITE, carapace: WHITE, fang: WHITE,
  leg: WHITE.base, farLeg: WHITE.base, knee: WHITE.base, mark: WHITE.base, markHot: WHITE.base, eye: WHITE.base, venom: WHITE.base,
};

// Local space, feet at y = GROUND. The body hangs between the legs at BODY; the abdomen rides
// high behind it.
const GROUND = 7;
const BODY = [0.8, 2.4];
const ABDOMEN = [-4.3, -3.6];
const ABDOMEN_ROOT = [-1.4, -1.2]; // where the abdomen joins the body; it swells from here

// Legs, rear to front: hip (relative to the body), where the foot is planted, knee direction.
const LEGS = [
  { hip: [-1.7, 0.2], foot: -7.2, bend: -1 },
  { hip: [-0.5, 0.7], foot: -3.6, bend: -1 },
  { hip: [1.1, 0.7], foot: 5.0, bend: 1 },
  { hip: [2.3, 0.2], foot: 8.6, bend: 1 },
];
const THIGH = 4.6;
const SHIN = 6.2;
const FAR_SIDE_SHIFT = 1.3;

const TAP_EVERY = 3.2;
const TAP_TIME = 0.4;

// A venomous spider that stays put and spits. It watches the hero, taps a leg when idle, then
// crouches back and swells before each shot and lunges forward as it fires.
export class SpitterRig extends Rig {
  constructor(facing) {
    super(facing, new Spring(300, 12));
    this.lunge = new Spring(220, 11);
    this.aim = 0;
    this.swell = 0; // the spitter's windup (0 calm .. 1 about to fire), eased back down after a shot
  }

  hit() {
    this.squash.kick(-4);
    this.lunge.kick(-18);
  }

  fired() {
    this.squash.kick(-3);
    this.lunge.kick(34);
  }

  update(dt, spitter, game) {
    this.tick(dt, spitter.facing);
    this.lunge.update(dt);
    this.swell = spitter.windup > 0 ? smoothstep(spitter.charge) : damp(this.swell, 0, 14, dt);

    // Tilt to keep the hero in sight.
    const hero = game.player;
    const pitch = Math.atan2(hero.cy - spitter.cy, Math.abs(hero.cx - spitter.cx) + 20);
    this.aim = damp(this.aim, clamp(pitch * 0.6, -0.3, 0.3), 5, dt);
  }

  draw(ctx, spitter) {
    const flashing = spitter.flash > 0;
    const tones = flashing ? FLASH_TONES : TONES;
    const swell = this.swell;

    const breath = Math.sin(this.time * 1.9) * 0.4;
    const tremble = swell * Math.sin(this.time * 70) * 0.25;
    // Crouch back and down to wind up; lunge forward on firing.
    const bodyX = BODY[0] - swell * 1.5 + this.lunge.value + tremble;
    const bodyY = BODY[1] + breath * (1 - swell) + swell * 0.9;

    groundShadow(ctx, spitter.cx, spitter.y + spitter.h, 8);
    ctx.save();
    this.enter(ctx, spitter);

    this.drawLegs(ctx, bodyX, bodyY, FAR_SIDE_SHIFT, tones.farLeg, null, false);

    // Back to front: abdomen, near legs, then the head over the roots of the legs.
    const enterBody = () => {
      ctx.save();
      ctx.translate(bodyX, bodyY);
      ctx.rotate(this.aim);
    };
    enterBody();
    this.drawAbdomen(ctx, tones, swell, flashing);
    ctx.restore();

    this.drawLegs(ctx, bodyX, bodyY, 0, tones.leg, tones.knee, true);

    enterBody();
    shaded(ctx, () => ctx.ellipse(0, 0, 3.3, 2.5, 0, 0, TAU), tones.carapace);
    this.drawFace(ctx, tones, swell, flashing);
    ctx.restore();
    ctx.restore();
  }

  drawLegs(ctx, bodyX, bodyY, shiftX, color, kneeColor, taps) {
    LEGS.forEach(({ hip, foot, bend }, i) => {
      // The near front leg taps the ground now and then.
      const tapping = taps && i === LEGS.length - 1 && this.swell < 0.05;
      const tap = tapping ? Math.max(0, Math.sin(clamp((this.time % TAP_EVERY) / TAP_TIME, 0, 1) * Math.PI * 2)) : 0;
      const knee = leg(ctx, [bodyX + hip[0] + shiftX, bodyY + hip[1]], [foot + shiftX, GROUND - tap * 1.6], THIGH, SHIN, bend, 0.8, color);
      if (kneeColor) dot(ctx, knee[0], knee[1], 0.42, kneeColor);
    });
  }

  drawAbdomen(ctx, tones, swell, flashing) {
    ctx.save();
    ctx.translate(...ABDOMEN_ROOT);
    ctx.scale(1 + swell * 0.2, 1 + swell * 0.2);
    ctx.translate(ABDOMEN[0] - ABDOMEN_ROOT[0], ABDOMEN[1] - ABDOMEN_ROOT[1]);
    ctx.rotate(-0.3);

    const tone = flashing ? tones.abdomen : mixTone(tones.abdomen, tones.swollen, swell);
    if (!flashing && swell > 0) glow(ctx, 0, 0, 7.5, tones.venom, 0.35 * swell);
    shaded(ctx, () => ctx.ellipse(0, 0, 5, 4.4, 0, 0, TAU), tone, { lightX: 0.6, lightY: -1.1 });

    if (!flashing) {
      // Hourglass marking; it heats up as the venom builds.
      ctx.fillStyle = mix(tones.mark, tones.markHot, swell);
      ctx.beginPath();
      ctx.moveTo(-1.5, -2.3);
      ctx.lineTo(1.5, -2.3);
      ctx.lineTo(0.35, 0);
      ctx.lineTo(1.5, 2.3);
      ctx.lineTo(-1.5, 2.3);
      ctx.lineTo(-0.35, 0);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.beginPath();
      ctx.ellipse(-1.6, -2.6, 2.2, 0.9, -0.5, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawFace(ctx, tones, swell, flashing) {
    // Fangs part as it winds up, with a bead of venom swelling between them.
    const spread = swell * 0.45;
    for (const [x, rotation] of [[1.5, -spread], [2.6, spread]]) {
      ctx.save();
      ctx.translate(x, 1.3);
      ctx.rotate(rotation);
      polygon(ctx, [[-0.55, 0], [0.55, 0], [0.25, 2.5]], tones.fang.base, 0.4);
      ctx.restore();
    }
    if (!flashing && swell > 0.05) {
      glow(ctx, 2.9, 3.0, 3.6 * swell, tones.venom, 0.7);
      dot(ctx, 2.9, 3.0, 1.3 * swell, tones.venom);
    }

    if (!flashing) {
      const stare = lerp(0.45, 0.9, swell);
      for (const [x, y, r] of [[2.0, -0.9, 0.7], [2.9, -0.1, 0.5], [1.0, -1.3, 0.45], [2.3, 0.7, 0.35]]) {
        glow(ctx, x, y, r * 2.6, tones.eye, stare);
        dot(ctx, x, y, r, tones.eye);
      }
    }
  }
}
