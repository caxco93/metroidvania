// Shared drawing helpers for the ink-outlined, gothic look.
export const INK = '#07040b';
export const FONT = '"Pirata One", Georgia, serif';

export const PALETTE = {
  bgTop: '#0b0710',
  bgBottom: '#1b1027',
  arch: '#150d1f',
  rock: '#2a2036',
  rockLight: '#4a3a5e',
  rockSpeck: '#382a48',
  safeGlow: 'rgba(245, 183, 0, 0.07)',
  bone: '#d8cbb0',
  amber: '#f5b700',
  venom: '#9ef01a',
  blood: '#c0213f',
  panel: '#0b0710',
  panelBorder: '#8a6bbd',
  dim: '#8f84a3',
};

// Line weights for character art: a bold silhouette, finer lines for details inside it.
export const LINE = { outline: 0.9, detail: 0.45 };

// A tone is a base colour plus the colour of its shadow. Characters swap every tone for WHITE
// while they flash from a hit, which leaves a white silhouette inside the ink outline.
export const WHITE = { base: '#ffffff', shade: '#ffffff' };

function channels(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

export function rgba(hex, alpha) {
  return `rgba(${channels(hex).join(', ')}, ${alpha})`;
}

// Blend two #rrggbb colours.
export function mix(a, b, t) {
  const from = channels(a);
  const to = channels(b);
  return `rgb(${from.map((v, i) => Math.round(v + (to[i] - v) * t)).join(', ')})`;
}

export function mixTone(a, b, t) {
  return { base: mix(a.base, b.base, t), shade: mix(a.shade, b.shade, t) };
}

// Strokes the current path in ink.
export function strokeInk(ctx, lineWidth = LINE.outline) {
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

// Fills the current path, then outlines it in ink.
export function fillStroke(ctx, fill, lineWidth = 1.2) {
  ctx.fillStyle = fill;
  ctx.fill();
  strokeInk(ctx, lineWidth);
}

// Cel shading. `trace` adds a closed shape to the current path. The shape is filled with its shadow
// tone, then the same shape nudged toward the light is painted in the base tone (clipped to the
// silhouette), which leaves a crescent of shadow on the side away from the light. Then ink.
export function shaded(ctx, trace, tone, { lightX = 0.4, lightY = -0.9, lineWidth = LINE.outline } = {}) {
  ctx.beginPath();
  trace();
  ctx.fillStyle = tone.shade;
  ctx.fill();

  ctx.save();
  ctx.clip();
  ctx.translate(lightX, lightY);
  ctx.beginPath();
  trace();
  ctx.fillStyle = tone.base;
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  trace();
  strokeInk(ctx, lineWidth);
}

// A limb: a coloured line through `points` with an ink edge around it.
export function limb(ctx, points, width, color, edge = 0.4) {
  polyline(ctx, points, width + edge * 2, INK);
  polyline(ctx, points, width, color);
}

export function dot(ctx, x, y, radius, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

// The soft shadow a character casts on the floor under its feet.
export function groundShadow(ctx, x, y, radius, strength = 1) {
  if (strength <= 0) return;
  ctx.fillStyle = `rgba(4, 2, 8, ${0.45 * strength})`;
  ctx.beginPath();
  ctx.ellipse(x, y, radius, radius * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
}

// A soft halo of light, fading to nothing at `radius`.
export function glow(ctx, x, y, radius, color, alpha = 0.6) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, rgba(color, alpha));
  gradient.addColorStop(1, rgba(color, 0));
  dot(ctx, x, y, radius, gradient);
}

export function ellipse(ctx, x, y, rx, ry, fill, rotation = 0, lineWidth = 1.2) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2);
  fillStroke(ctx, fill, lineWidth);
}

export function polygon(ctx, points, fill, lineWidth = 1.2) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  fillStroke(ctx, fill, lineWidth);
}

export function polyline(ctx, points, width = 1.2, color = INK) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

export function heart(ctx, x, y, size, fill) {
  ctx.beginPath();
  ctx.moveTo(x + size / 2, y + size * 0.92);
  ctx.bezierCurveTo(x - size * 0.25, y + size * 0.45, x + size * 0.1, y - size * 0.15, x + size / 2, y + size * 0.3);
  ctx.bezierCurveTo(x + size * 0.9, y - size * 0.15, x + size * 1.25, y + size * 0.45, x + size / 2, y + size * 0.92);
  ctx.closePath();
  fillStroke(ctx, fill, 1);
}

export function amberShard(ctx, cx, cy, r) {
  polygon(ctx, [[cx, cy - r], [cx + r * 0.75, cy], [cx, cy + r], [cx - r * 0.75, cy]], PALETTE.amber, 0.9);
  ctx.fillStyle = '#fff3b0';
  ctx.fillRect(cx - r * 0.2, cy - r * 0.45, r * 0.3, r * 0.5);
}

// A little skull, used to mark the boss room on the map.
export function skull(ctx, cx, cy, r) {
  ellipse(ctx, cx, cy - r * 0.15, r, r * 0.9, PALETTE.bone, 0, 1);
  polygon(ctx, [[cx - r * 0.5, cy + r * 0.5], [cx + r * 0.5, cy + r * 0.5], [cx + r * 0.4, cy + r * 1.1], [cx - r * 0.4, cy + r * 1.1]], PALETTE.bone, 1);
  ctx.fillStyle = INK;
  for (const dx of [-0.42, 0.42]) {
    ctx.beginPath();
    ctx.ellipse(cx + dx * r, cy - r * 0.1, r * 0.25, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(cx, cy + r * 0.15);
  ctx.lineTo(cx - r * 0.12, cy + r * 0.42);
  ctx.lineTo(cx + r * 0.12, cy + r * 0.42);
  ctx.closePath();
  ctx.fill();
}
