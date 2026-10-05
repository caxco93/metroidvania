import { TILE, VIEW_W, VIEW_H } from './constants.js';
import { input } from './input.js';
import { sfx } from './audio.js';
import { drawText, drawPanel } from './ui.js';
import { PALETTE, amberShard } from './gfx.js';
import { MerchantRig } from './art/merchant.js';

const MAX_HEARTS = 8;

// The shopkeeper. Stands in the safe zone and turns to face the hero.
export class Npc {
  constructor(tx, ty) {
    this.w = 12;
    this.h = 16;
    this.x = tx * TILE + (TILE - this.w) / 2;
    this.y = (ty + 1) * TILE - this.h;
    this.facing = 1;
    this.rig = new MerchantRig(this.facing);
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  isNear(player) {
    return Math.abs(player.cx - this.cx) < 28 && Math.abs(player.cy - this.cy) < 20;
  }

  update(dt, game) {
    this.facing = Math.sign(game.player.cx - this.cx) || this.facing;
    this.rig.update(dt, this, this.isNear(game.player));
  }

  draw(ctx, clock, showPrompt) {
    this.rig.draw(ctx, this);
    const bob = Math.sin(clock * 3) * 1.5;
    amberShard(ctx, this.cx, this.y - 16 + bob, 3.2);
    if (showPrompt) drawText(ctx, '[E] Shop', this.cx, this.y - 32, { align: 'center' });
  }
}

export class ShopMenu {
  constructor() {
    this.index = 0;
    this.message = '';
  }

  open() {
    this.index = 0;
    this.message = 'Welcome, wanderer.';
    sfx.play('menu');
  }

  items(game) {
    return [
      {
        id: 'map',
        name: 'Map',
        cost: 12,
        desc: 'Chart the lands you explore. Open with M.',
        sold: game.hasMap,
      },
      {
        id: 'heart',
        name: 'Heart Container',
        cost: 25,
        desc: '+1 max health, fully healed.',
        sold: game.player.maxHp >= MAX_HEARTS,
      },
      { id: 'leave', name: 'Leave', cost: 0, desc: '', sold: false },
    ];
  }

  update(game) {
    const items = this.items(game);
    if (input.pressed('up')) this.move(items, -1);
    if (input.pressed('down')) this.move(items, 1);
    if (input.pressed('cancel')) return this.close(game);

    if (input.pressed('confirm')) {
      const item = items[this.index];
      if (item.id === 'leave') return this.close(game);
      this.buy(game, item);
    }
  }

  move(items, step) {
    this.index = (this.index + items.length + step) % items.length;
    sfx.play('menu');
  }

  buy(game, item) {
    if (item.sold) {
      this.message = 'Already yours.';
      sfx.play('deny');
    } else if (game.points < item.cost) {
      this.message = 'Not enough points.';
      sfx.play('deny');
    } else {
      sfx.play('buy');
      game.points -= item.cost;
      if (item.id === 'map') game.hasMap = true;
      if (item.id === 'heart') {
        game.player.maxHp += 1;
        game.player.hp = game.player.maxHp;
      }
      this.message = 'Pleasure doing business.';
    }
  }

  close(game) {
    sfx.play('menu');
    game.mode = 'play';
  }

  draw(ctx, game) {
    const items = this.items(game);
    const w = 220;
    const h = 112;
    const x = (VIEW_W - w) / 2;
    const y = (VIEW_H - h) / 2;
    drawPanel(ctx, x, y, w, h);
    drawText(ctx, 'SHOP', x + 8, y + 7, { size: 10 });
    drawText(ctx, `${game.points} pts`, x + w - 8, y + 8, { align: 'right', color: PALETTE.amber });

    items.forEach((item, i) => {
      const iy = y + 26 + i * 14;
      const selected = i === this.index;
      const color = item.sold ? PALETTE.dim : selected ? '#fff' : '#cbbfe0';
      drawText(ctx, (selected ? '> ' : '  ') + item.name, x + 8, iy, { color });
      if (item.id !== 'leave') {
        drawText(ctx, item.sold ? 'SOLD' : String(item.cost), x + w - 8, iy, { align: 'right', color });
      }
    });

    const selected = items[this.index];
    if (selected.desc) drawText(ctx, selected.desc, x + 8, y + h - 34, { color: PALETTE.dim });
    drawText(ctx, this.message, x + 8, y + h - 20, { color: PALETTE.amber });
    drawText(ctx, 'Up/Down: select   E/Enter: buy   Esc: close', x + 8, y + h - 10, { color: PALETTE.dim, size: 6.5 });
  }
}
