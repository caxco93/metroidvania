import { TILE, VIEW_W, VIEW_H, SCREEN_TILES_W, SCREEN_TILES_H, MAP_COLS, MAP_ROWS } from './constants.js';
import { Tile } from './level.js';
import { INK, FONT, PALETTE, heart, amberShard, skull } from './gfx.js';

const MAP_TILE_PX = 3;
const MAP_COLORS = { room: '#4a3b78', spike: '#c0213f', unseen: '#2a2140', line: '#8a6bbd' };

export function drawText(ctx, str, x, y, { color = '#fff', align = 'left', size = 9 } = {}) {
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = INK;
  ctx.strokeText(str, x, y);
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

export function drawPanel(ctx, x, y, w, h) {
  ctx.fillStyle = PALETTE.panel;
  ctx.fillRect(x, y, w, h);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = INK;
  ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
  ctx.strokeStyle = PALETTE.panelBorder;
  ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
  ctx.strokeStyle = INK;
  ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
}

export function drawHud(ctx, game) {
  const p = game.player;

  for (let i = 0; i < p.maxHp; i++) heart(ctx, 6 + i * 10, 5, 8, i < p.hp ? PALETTE.blood : '#2a1722');

  amberShard(ctx, 10, 22, 3.6);
  drawText(ctx, String(game.points), 17, 16);

  if (game.hasMap) drawMinimap(ctx, game);

  const boss = game.boss;
  if (boss && boss.active) {
    const w = 140;
    const x = (VIEW_W - w) / 2;
    const y = VIEW_H - 14;
    drawText(ctx, 'THE WARDEN', VIEW_W / 2, y - 12, { align: 'center' });
    ctx.fillStyle = '#1a0f26';
    ctx.fillRect(x, y, w, 6);
    ctx.fillStyle = '#9d4edd';
    ctx.fillRect(x, y, Math.max(0, (boss.hp / boss.maxHp) * w), 6);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = INK;
    ctx.strokeRect(x, y, w, 6);
  }

  if (game.toastTime > 0) {
    drawText(ctx, game.toastText, VIEW_W / 2, VIEW_H - 36, { align: 'center', color: PALETTE.amber });
  }
}

function drawMinimap(ctx, game) {
  const cw = 8;
  const ch = 5;
  const ox = VIEW_W - 6 - MAP_COLS * (cw + 1);
  const oy = 6;
  const here = game.level.cellOf(game.player.cx, game.player.cy);
  for (let cy = 0; cy < MAP_ROWS; cy++) {
    for (let cx = 0; cx < MAP_COLS; cx++) {
      const x = ox + cx * (cw + 1);
      const y = oy + cy * (ch + 1);
      const isHere = cx === here.cx && cy === here.cy;
      if (isHere && Math.floor(game.clock * 3) % 2 === 0) ctx.fillStyle = '#fff';
      else ctx.fillStyle = game.visited.has(`${cx},${cy}`) ? MAP_COLORS.room : MAP_COLORS.unseen;
      ctx.fillRect(x, y, cw, ch);
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = INK;
      ctx.strokeRect(x, y, cw, ch);
    }
  }

  if (!game.bossDefeated) {
    const [bx, by] = game.world.boss.cellKey.split(',').map(Number);
    skull(ctx, ox + bx * (cw + 1) + cw / 2, oy + by * (ch + 1) + ch / 2 - 0.4, 2.1);
  }
}

// Full-screen map: each visited screen is drawn as a miniature of its actual tiles.
export function drawMap(ctx, game) {
  const cellW = SCREEN_TILES_W * MAP_TILE_PX;
  const cellH = SCREEN_TILES_H * MAP_TILE_PX;
  const ox = (VIEW_W - MAP_COLS * cellW) / 2;
  const oy = (VIEW_H - MAP_ROWS * cellH) / 2;

  ctx.fillStyle = 'rgba(5, 3, 9, 0.96)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  drawText(ctx, 'MAP', VIEW_W / 2, oy - 26, { align: 'center', size: 14 });

  for (let cy = 0; cy < MAP_ROWS; cy++) {
    for (let cx = 0; cx < MAP_COLS; cx++) {
      const x = ox + cx * cellW;
      const y = oy + cy * cellH;
      ctx.lineWidth = 1;
      if (!game.visited.has(`${cx},${cy}`)) {
        ctx.strokeStyle = MAP_COLORS.unseen;
        ctx.strokeRect(x + 0.5, y + 0.5, cellW - 1, cellH - 1);
        continue;
      }
      // One path per colour so adjacent tiles merge without hairline seams.
      for (const [tileType, color] of [[Tile.EMPTY, MAP_COLORS.room], [Tile.SPIKE, MAP_COLORS.spike]]) {
        ctx.beginPath();
        for (let ty = 0; ty < SCREEN_TILES_H; ty++) {
          for (let tx = 0; tx < SCREEN_TILES_W; tx++) {
            if (game.level.tile(cx * SCREEN_TILES_W + tx, cy * SCREEN_TILES_H + ty) !== tileType) continue;
            ctx.rect(x + tx * MAP_TILE_PX, y + ty * MAP_TILE_PX, MAP_TILE_PX, MAP_TILE_PX);
          }
        }
        ctx.fillStyle = color;
        ctx.fill();
      }
      ctx.strokeStyle = MAP_COLORS.line;
      ctx.strokeRect(x + 0.5, y + 0.5, cellW - 1, cellH - 1);
    }
  }

  // The boss room is marked with a skull until the boss is dead (even if not yet explored).
  if (!game.bossDefeated) {
    const [bx, by] = game.world.boss.cellKey.split(',').map(Number);
    skull(ctx, ox + bx * cellW + cellW / 2, oy + by * cellH + cellH / 2 - 2, 6);
  }

  const npcCell = game.level.cellOf(game.npc.x, game.npc.y);
  if (game.visited.has(`${npcCell.cx},${npcCell.cy}`)) {
    amberShard(ctx, ox + (game.npc.x / TILE) * MAP_TILE_PX + 1.5, oy + (game.npc.y / TILE) * MAP_TILE_PX, 3);
  }
  if (Math.floor(game.clock * 3) % 2 === 0) {
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = INK;
    ctx.beginPath();
    ctx.arc(ox + (game.player.cx / TILE) * MAP_TILE_PX, oy + (game.player.cy / TILE) * MAP_TILE_PX, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  const footY = oy + MAP_ROWS * cellH + 8;
  drawText(ctx, 'white: you    amber: shop    red: spikes    skull: boss', VIEW_W / 2, footY, { align: 'center', color: PALETTE.dim });
  drawText(ctx, 'M / Esc: close', VIEW_W / 2, footY + 12, { align: 'center', color: PALETTE.dim });
}

export function drawDeathScreen(ctx, game) {
  const fade = Math.min(1, game.deathTime / 0.9);
  const gradient = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 10, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.7);
  gradient.addColorStop(0, `rgba(40, 4, 14, ${0.6 * fade})`);
  gradient.addColorStop(1, `rgba(3, 0, 6, ${0.95 * fade})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.globalAlpha = fade;
  drawText(ctx, 'YOU DIED', VIEW_W / 2, VIEW_H / 2 - 30, { align: 'center', size: 34, color: PALETTE.blood });
  ctx.globalAlpha = 1;

  if (game.deathTime > 1 && Math.floor(game.deathTime * 2) % 2 === 0) {
    drawText(ctx, 'Press E or Enter to revive', VIEW_W / 2, VIEW_H / 2 + 14, { align: 'center', size: 11, color: '#e8e4d8' });
  }
}
