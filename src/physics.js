import { TILE } from './constants.js';

const EPS = 0.001;

export function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Moves an AABB body ({x, y, w, h, vx, vy}) against solid tiles, one axis at a time.
// Zeroes velocity on the colliding axis and reports which sides were hit, plus the
// velocity the body had on impact (useful for bouncing).
export function move(body, level, dt) {
  const hit = { left: false, right: false, up: false, down: false, impactVx: 0, impactVy: 0 };

  body.x += body.vx * dt;
  if (body.vx !== 0) {
    forEachSolidTile(body, level, (tx) => {
      if (body.vx > 0) {
        body.x = Math.min(body.x, tx * TILE - body.w);
        hit.right = true;
      } else {
        body.x = Math.max(body.x, (tx + 1) * TILE);
        hit.left = true;
      }
    });
    if (hit.left || hit.right) {
      hit.impactVx = body.vx;
      body.vx = 0;
    }
  }

  body.y += body.vy * dt;
  if (body.vy !== 0) {
    forEachSolidTile(body, level, (tx, ty) => {
      if (body.vy > 0) {
        body.y = Math.min(body.y, ty * TILE - body.h);
        hit.down = true;
      } else {
        body.y = Math.max(body.y, (ty + 1) * TILE);
        hit.up = true;
      }
    });
    if (hit.up || hit.down) {
      hit.impactVy = body.vy;
      body.vy = 0;
    }
  }

  return hit;
}

function forEachSolidTile(body, level, fn) {
  const x0 = Math.floor(body.x / TILE);
  const x1 = Math.floor((body.x + body.w - EPS) / TILE);
  const y0 = Math.floor(body.y / TILE);
  const y1 = Math.floor((body.y + body.h - EPS) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (level.isSolid(tx, ty)) fn(tx, ty);
    }
  }
}
