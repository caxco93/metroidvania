import { TAU, damp, lerp } from '../anim.js';
import { INK, LINE, shaded, strokeInk, polyline, dot, glow, groundShadow } from '../gfx.js';
import { Rig } from './rig.js';

const TONES = {
  robe: { base: '#3b2563', shade: '#221340' },
  hood: { base: '#2e1b50', shade: '#190e2e' },
  wing: { base: '#b9aadb', shade: '#7f6fa8' },
  farWing: { base: '#8d7fb3', shade: '#5c4f80' },
  ruff: { base: '#e4dcf0', shade: '#a99cc4' },
  wingMark: '#3b2563',
  trim: '#f5b700',
  eye: '#ffd23f',
  flame: '#ffb52e',
  wood: '#7a5636',
  face: '#0b0710',
};

// Local space, feet at y = GROUND.
const GROUND = 8;
const SHOULDER = [-1.2, -1.8];
const HEAD = [0.4, -5.6];
const HOOK = [7.6, -7]; // where the lantern hangs from the crook
const FLUTTER_EVERY = 4.5;
const FLUTTER_TIME = 0.5;

// The shopkeeper: a hooded moth leaning on a crook with a lantern. Its wings hang like a cape and
// shiver now and then; it turns to watch the hero and perks up (wings and antennae lift) when
// they come close.
export class MerchantRig extends Rig {
  constructor(facing) {
    super(facing);
    this.greet = 0;
    this.blinkIn = 1.5;
  }

  update(dt, npc, near) {
    this.tick(dt, npc.facing);
    this.greet = damp(this.greet, near ? 1 : 0, 6, dt);
    this.blinkIn -= dt;
    if (this.blinkIn < -0.14) this.blinkIn = 2 + Math.random() * 3.5;
  }

  draw(ctx, npc) {
    const breath = Math.sin(this.time * 1.8) * 0.25;
    // A quick shiver through the wings every few seconds.
    const sinceFlutter = this.time % FLUTTER_EVERY;
    const flutter = sinceFlutter < FLUTTER_TIME ? Math.sin(sinceFlutter * 38) * 0.12 * (1 - sinceFlutter / FLUTTER_TIME) : 0;
    const wingLift = Math.sin(this.time * 1.8 + 1) * 0.03 + flutter + this.greet * 0.2;

    groundShadow(ctx, npc.cx, npc.y + npc.h, 8.5);
    this.drawLanternLight(ctx, npc);

    ctx.save();
    this.enter(ctx, npc);
    this.drawWing(ctx, TONES.farWing, wingLift * 0.8, -0.82);
    this.drawWing(ctx, TONES.wing, wingLift, 1);
    this.drawCrook(ctx);
    this.drawRobe(ctx);
    this.drawRuff(ctx, breath);
    this.drawAntennae(ctx, breath);
    this.drawHead(ctx, breath);
    ctx.restore();
  }

  // One wing, hinged at the shoulder. `mirror` flips (and shrinks) it for the far side.
  drawWing(ctx, tone, lift, mirror) {
    ctx.save();
    ctx.translate(SHOULDER[0] * mirror, SHOULDER[1]);
    ctx.scale(mirror, 1);
    ctx.rotate(lift);
    shaded(ctx, () => {
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-3.0, -4.6, -8.2, -5.2, -9.4, -2.4);
      ctx.bezierCurveTo(-9.8, 1.6, -8.0, 6.6, -4.4, 9.5);
      ctx.bezierCurveTo(-3.0, 7.0, -1.2, 4.0, 0, 0);
      ctx.closePath();
    }, tone, { lightX: 0.3, lightY: -1.2 });

    // Veins, a band, and an eye-spot.
    ctx.beginPath();
    ctx.moveTo(-0.8, 0.2);
    ctx.quadraticCurveTo(-5.0, -2.6, -8.6, -2.0);
    ctx.moveTo(-0.9, 1.2);
    ctx.quadraticCurveTo(-5.0, 2.6, -6.6, 6.6);
    strokeInk(ctx, LINE.detail);
    dot(ctx, -5.7, 0.9, 1.7, TONES.wingMark);
    dot(ctx, -5.7, 0.9, 0.9, TONES.trim);
    dot(ctx, -5.5, 0.7, 0.35, INK);
    ctx.restore();
  }

  // The warm pool of light around the lantern, drawn in world space behind everything.
  drawLanternLight(ctx, npc) {
    const [x, y] = this.toWorld(npc, 0, HOOK[0], HOOK[1] + 3);
    const flicker = 0.9 + Math.sin(this.time * 11) * 0.05 + Math.sin(this.time * 23) * 0.05;
    glow(ctx, x, y, 22 * flicker, TONES.flame, 0.22);
  }

  drawCrook(ctx) {
    // Staff, curling over into a hook.
    ctx.beginPath();
    ctx.moveTo(4.9, GROUND);
    ctx.lineTo(5.3, -6.6);
    ctx.quadraticCurveTo(5.6, -9.4, 7.0, -8.6);
    ctx.quadraticCurveTo(7.8, -8.0, HOOK[0], HOOK[1]);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.lineWidth = 0.75;
    ctx.strokeStyle = TONES.wood;
    ctx.stroke();

    // Lantern, swinging gently from the hook.
    ctx.save();
    ctx.translate(...HOOK);
    ctx.rotate(Math.sin(this.time * 1.6) * 0.13);
    polyline(ctx, [[0, 0], [0, 1.4]], 0.4);
    ctx.beginPath();
    ctx.rect(-1.3, 1.9, 2.6, 3);
    ctx.fillStyle = TONES.flame;
    ctx.fill();
    strokeInk(ctx, 0.6);
    dot(ctx, 0, 3.5, 0.75, '#fff3c4');
    polyline(ctx, [[-1.5, 1.8], [1.5, 1.8]], 0.7);
    polyline(ctx, [[0, 1.9], [0, 4.9]], 0.3);
    ctx.restore();
  }

  drawRobe(ctx) {
    shaded(ctx, () => {
      ctx.moveTo(-2.9, -2.6);
      ctx.quadraticCurveTo(-4.7, 2.5, -5.0, GROUND);
      ctx.lineTo(4.4, GROUND);
      ctx.quadraticCurveTo(4.3, 2.5, 2.9, -2.6);
      ctx.closePath();
    }, TONES.robe, { lightX: 0.8, lightY: -0.6 });

    // Gold trim above the hem and a seam down the front.
    polyline(ctx, [[-4.7, GROUND - 1.2], [4.2, GROUND - 1.2]], 0.5, TONES.trim);
    polyline(ctx, [[0.9, -1.4], [1.1, GROUND - 1.5]], LINE.detail);

    // The sleeve gripping the crook.
    shaded(ctx, () => ctx.ellipse(4.4, 1.2, 1.5, 1.2, 0.3, 0, TAU), TONES.robe);
  }

  // A fluffy collar, as moths have.
  drawRuff(ctx, breath) {
    for (const x of [-2.9, 2.9, -1.5, 1.6, 0]) {
      shaded(ctx, () => ctx.arc(x, -2.3 + breath * 0.5 + Math.abs(x) * 0.12, 1.45, 0, TAU), TONES.ruff, { lightY: -0.5, lineWidth: 0.6 });
    }
  }

  // Feathery antennae: a curved stem with barbs down both sides.
  drawAntennae(ctx, breath) {
    const sway = Math.sin(this.time * 1.3) * 0.5;
    const perk = this.greet * 1.2;
    const stems = [
      { from: [-0.6, -9.8], bend: [-1.4, -12.6], tip: [-3.6 + sway, -14.2 - perk] },
      { from: [1.6, -9.4], bend: [2.8, -12.4], tip: [5.4 + sway, -13.8 - perk] },
    ];
    for (const { from, bend, tip } of stems) {
      const y = breath;
      for (const [width, color] of [[1.0, INK], [0.45, TONES.ruff.base]]) {
        ctx.beginPath();
        ctx.moveTo(from[0], from[1] + y);
        ctx.quadraticCurveTo(bend[0], bend[1] + y, tip[0], tip[1] + y);
        for (let i = 1; i <= 5; i++) {
          // A point along the stem, and a barb across it.
          const t = i / 5.5;
          const u = 1 - t;
          const px = u * u * from[0] + 2 * u * t * bend[0] + t * t * tip[0];
          const py = u * u * from[1] + 2 * u * t * bend[1] + t * t * tip[1] + y;
          const barb = lerp(1.5, 0.6, t);
          ctx.moveTo(px - barb, py - barb * 0.3);
          ctx.lineTo(px + barb, py + barb * 0.3);
        }
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.strokeStyle = color;
        ctx.stroke();
      }
    }
  }

  drawHead(ctx, breath) {
    ctx.save();
    ctx.translate(HEAD[0], HEAD[1] + breath);
    // A hood with a drooping point at the back.
    shaded(ctx, () => {
      ctx.moveTo(-3.8, 1.0);
      ctx.bezierCurveTo(-4.2, -2.4, -3.0, -4.8, -1.6, -5.0);
      ctx.bezierCurveTo(1.4, -4.6, 3.8, -2.6, 3.7, 0.4);
      ctx.bezierCurveTo(3.6, 2.4, 2.0, 3.6, 0, 3.6);
      ctx.bezierCurveTo(-2.0, 3.6, -3.6, 2.8, -3.8, 1.0);
      ctx.closePath();
    }, TONES.hood);

    ctx.beginPath();
    ctx.ellipse(0.7, 0.5, 2.4, 2.3, 0, 0, TAU);
    ctx.fillStyle = TONES.face;
    ctx.fill();
    strokeInk(ctx, LINE.detail);

    const open = this.blinkIn < 0 ? 0.12 : 1;
    for (const x of [-0.2, 1.9]) {
      glow(ctx, x, 0.3, 2.2, TONES.eye, 0.5 * open);
      ctx.fillStyle = TONES.eye;
      ctx.beginPath();
      ctx.ellipse(x, 0.3, 0.5, 0.8 * open, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}
