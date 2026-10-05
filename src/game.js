import { TILE, VIEW_W, VIEW_H } from './constants.js';
import { input } from './input.js';
import { overlap } from './physics.js';
import { Tile } from './level.js';
import { buildWorld, SAFE_ROOM, ARENA, GATE } from './world.js';
import { Player } from './player.js';
import { Crawler, Spitter } from './enemies.js';
import { Boss } from './boss.js';
import { Pickup, spawnShards } from './fx.js';
import { sfx } from './audio.js';
import { Npc, ShopMenu } from './shop.js';
import { drawHud, drawMap, drawDeathScreen } from './ui.js';
import { INK, PALETTE } from './gfx.js';

const ARCH_PERIOD = 80;
const ARCH_PARALLAX = 0.4;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = buildWorld();
    this.level = this.world.level;

    const { start, npc } = this.world;
    this.player = new Player(start.tx * TILE + 3, (start.ty + 1) * TILE - 14);
    this.npc = new Npc(npc.tx, npc.ty);
    this.shopMenu = new ShopMenu();

    this.mode = 'play'; // play | shop | map | dead
    this.deathTime = 0;
    this.clock = 0;
    this.points = 0;
    this.hasMap = false;
    this.bossDefeated = false;
    this.visited = new Set();
    this.toastText = '';
    this.toastTime = 0;
    this.cam = { x: 0, y: 0 };

    // Enemies belong to the screen they spawn on; only that screen's enemies act.
    for (const spawn of [...this.world.enemies, this.world.boss]) spawn.cellKey = this.cellKeyAt(spawn.tx * TILE, spawn.ty * TILE);
    this.activeCell = this.cellKeyAt(this.player.cx, this.player.cy);

    this.pickups = this.world.pickups.map(
      (p) => new Pickup(p.tx * TILE + TILE / 2, p.ty * TILE + TILE / 2, p.value, { scatter: false }),
    );
    this.shards = [];
    this.dust = [];
    this.spawnEnemies();
    this.snapCamera();
  }

  toast(text, seconds = 2.5) {
    this.toastText = text;
    this.toastTime = seconds;
  }

  cellKeyAt(px, py) {
    const { cx, cy } = this.level.cellOf(px, py);
    return `${cx},${cy}`;
  }

  // --- enemies ------------------------------------------------------------

  createEnemy(spawn) {
    const enemy = spawn.type === 'melee' ? new Crawler(spawn.tx, spawn.ty, this.level) : new Spitter(spawn.tx, spawn.ty);
    enemy.cellKey = spawn.cellKey;
    return enemy;
  }

  createBoss() {
    const { boss } = this.world;
    const instance = new Boss(boss.tx, boss.ty);
    instance.cellKey = boss.cellKey;
    return instance;
  }

  spawnEnemies() {
    this.enemies = this.world.enemies.map((spawn) => this.createEnemy(spawn));
    this.boss = this.bossDefeated ? null : this.createBoss();
    this.projectiles = [];
  }

  // Put back everything that lives on one screen, as if it was never visited.
  resetCell(cellKey) {
    const fresh = this.world.enemies.filter((s) => s.cellKey === cellKey).map((s) => this.createEnemy(s));
    this.enemies = this.enemies.filter((e) => e.cellKey !== cellKey).concat(fresh);
    if (this.boss && this.boss.cellKey === cellKey) {
      this.boss = this.createBoss();
      this.level.carve(GATE.x0, GATE.y0, GATE.x1, GATE.y1);
    }
    this.projectiles = [];
  }

  isActive(enemy) {
    return enemy.cellKey === this.activeCell;
  }

  dropPoints(cx, cy, count, value = 1) {
    for (let i = 0; i < count; i++) this.pickups.push(new Pickup(cx, cy, value));
  }

  // --- update -------------------------------------------------------------

  update(dt) {
    this.clock += dt;
    this.toastTime = Math.max(0, this.toastTime - dt);
    this.npc.update(dt, this); // keeps moving while the shop or map is open

    if (this.mode === 'dead') return this.updateDead(dt);
    if (this.mode === 'shop') return this.shopMenu.update(this);
    if (this.mode === 'map') {
      if (input.pressed('map') || input.pressed('cancel')) {
        sfx.play('menu');
        this.mode = 'play';
      }
      return;
    }
    if (input.pressed('map')) {
      if (this.hasMap) {
        sfx.play('menu');
        this.mode = 'map';
        return;
      }
      sfx.play('deny');
      this.toast('You need to buy the map from the shopkeeper.');
    }
    this.updatePlay(dt);
  }

  updatePlay(dt) {
    const p = this.player;
    p.update(dt, this);
    this.updateActiveCell();

    if (this.npc.isNear(p) && input.pressed('interact')) {
      this.mode = 'shop';
      this.shopMenu.open();
      return;
    }

    for (const e of this.enemies) if (this.isActive(e)) e.update(dt, this);
    if (this.boss && this.isActive(this.boss)) this.boss.update(dt, this);
    for (const list of [this.projectiles, this.pickups, this.shards, this.dust]) {
      for (const item of list) item.update(dt, this);
    }

    this.resolveCombat();
    if (this.level.touchesSpike(p.x, p.y, p.w, p.h)) p.hurt(p.cx, this, { knockback: false });
    if (this.mode === 'dead') return;

    this.enemies = this.enemies.filter((e) => !e.dead);
    this.projectiles = this.projectiles.filter((e) => !e.dead);
    this.pickups = this.pickups.filter((e) => !e.dead);
    this.shards = this.shards.filter((e) => !e.dead);
    this.dust = this.dust.filter((e) => !e.dead);

    this.updateBossTrigger();
    if (this.inRoom(SAFE_ROOM)) p.hp = p.maxHp;

    this.visited.add(this.activeCell);
    this.updateCamera(dt);
  }

  updateActiveCell() {
    const key = this.cellKeyAt(this.player.cx, this.player.cy);
    if (key === this.activeCell) return;
    this.resetCell(this.activeCell);
    this.activeCell = key;
  }

  // Everything the player's horns can hit.
  targets() {
    const list = this.enemies.filter((e) => !e.dead && this.isActive(e));
    if (this.boss && this.boss.active && !this.boss.dead && this.isActive(this.boss)) list.push(this.boss);
    return list;
  }

  resolveCombat() {
    const p = this.player;
    const box = p.attackBox();
    if (box) {
      for (const e of this.targets()) {
        if (p.hitSet.has(e) || !overlap(box, e)) continue;
        p.hitSet.add(e);
        e.takeHit(Math.sign(e.cx - p.cx) || p.facing, this);
        if (p.attackDir === 'down') p.pogo();
      }
      for (const proj of this.projectiles) {
        if (overlap(box, proj)) proj.dead = true;
      }
      if (p.attackDir === 'down' && this.level.touchesSpike(box.x, box.y, box.w, box.h)) p.pogo();
    }

    for (const e of this.targets()) {
      if (overlap(p, e)) p.hurt(e.cx, this);
    }
  }

  inRoom(room) {
    const p = this.player;
    return (
      p.cx >= room.x0 * TILE && p.cx < (room.x1 + 1) * TILE && p.cy >= room.y0 * TILE && p.cy < (room.y1 + 1) * TILE
    );
  }

  // True once the player's whole body is inside the room, not just their centre.
  fullyInRoom(room) {
    const p = this.player;
    return (
      p.x >= room.x0 * TILE &&
      p.x + p.w <= (room.x1 + 1) * TILE &&
      p.y >= room.y0 * TILE &&
      p.y + p.h <= (room.y1 + 1) * TILE
    );
  }

  // The gate only shuts once the player is completely past it; closing it on a player
  // who is still standing in the doorway would crush them back out.
  updateBossTrigger() {
    if (!this.boss || this.boss.active || !this.fullyInRoom(ARENA)) return;
    this.boss.activate();
    sfx.play('gate');
    this.level.fill(GATE.x0, GATE.y0, GATE.x1, GATE.y1, Tile.SOLID);
    this.toast('The Warden awakens!');
  }

  onBossDefeated() {
    this.bossDefeated = true;
    this.boss = null;
    this.level.carve(GATE.x0, GATE.y0, GATE.x1, GATE.y1);
    this.toast('The Warden is defeated! Prototype complete.', 6);
  }

  // The player bursts apart and a death screen waits for a button press to revive.
  killPlayer() {
    this.mode = 'dead';
    this.deathTime = 0;
    sfx.play('death');
    spawnShards(this, this.player, 8, '#f4f0e6');
    spawnShards(this, this.player, 5, '#c2163a');
  }

  updateDead(dt) {
    this.deathTime += dt;
    for (const list of [this.shards, this.dust]) {
      for (const item of list) item.update(dt, this);
    }
    this.shards = this.shards.filter((s) => !s.dead);
    this.dust = this.dust.filter((d) => !d.dead);
    if (this.deathTime > 1 && input.pressed('revive')) this.revive();
  }

  revive() {
    sfx.play('revive');
    this.player.reset();
    this.level.carve(GATE.x0, GATE.y0, GATE.x1, GATE.y1);
    this.spawnEnemies();
    this.activeCell = this.cellKeyAt(this.player.cx, this.player.cy);
    this.snapCamera();
    this.mode = 'play';
  }

  // --- camera -------------------------------------------------------------

  cameraTarget() {
    const { cx, cy } = this.level.cellOf(this.player.cx, this.player.cy);
    return { x: cx * VIEW_W, y: cy * VIEW_H };
  }

  snapCamera() {
    Object.assign(this.cam, this.cameraTarget());
  }

  // Camera shows one screen at a time and glides to the next when the player crosses over.
  updateCamera(dt) {
    const target = this.cameraTarget();
    const k = 1 - Math.exp(-dt * 12);
    this.cam.x += (target.x - this.cam.x) * k;
    this.cam.y += (target.y - this.cam.y) * k;
  }

  // --- drawing ------------------------------------------------------------

  draw() {
    const ctx = this.ctx;
    // Logical coordinates are VIEW_W x VIEW_H; the canvas backing store is whatever
    // the display needs, so everything renders at native resolution.
    const scale = this.canvas.width / VIEW_W;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    this.drawBackground(ctx);

    ctx.save();
    ctx.translate(-this.cam.x, -this.cam.y);
    this.drawSafeRoomGlow(ctx);
    this.drawTiles(ctx);
    this.npc.draw(ctx, this.clock, this.mode === 'play' && this.npc.isNear(this.player));
    for (const list of [this.pickups, this.shards, this.dust, this.enemies]) {
      for (const item of list) item.draw(ctx);
    }
    if (this.boss) this.boss.draw(ctx);
    for (const proj of this.projectiles) proj.draw(ctx);
    if (this.mode !== 'dead') this.player.draw(ctx);
    ctx.restore();

    drawHud(ctx, this);
    if (this.mode === 'shop') this.shopMenu.draw(ctx, this);
    if (this.mode === 'map') drawMap(ctx, this);
    if (this.mode === 'dead') drawDeathScreen(ctx, this);
  }

  // Dark gradient with slowly-scrolling gothic arches behind everything.
  drawBackground(ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    gradient.addColorStop(0, PALETTE.bgTop);
    gradient.addColorStop(1, PALETTE.bgBottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    const offset = -((this.cam.x * ARCH_PARALLAX) % ARCH_PERIOD);
    ctx.beginPath();
    for (let ax = offset - ARCH_PERIOD; ax < VIEW_W + ARCH_PERIOD; ax += ARCH_PERIOD) {
      const left = ax + 12;
      const right = ax + ARCH_PERIOD - 12;
      const mid = ax + ARCH_PERIOD / 2;
      ctx.moveTo(left, VIEW_H);
      ctx.lineTo(left, 90);
      ctx.quadraticCurveTo(left, 45, mid, 22);
      ctx.quadraticCurveTo(right, 45, right, 90);
      ctx.lineTo(right, VIEW_H);
      ctx.closePath();
    }
    ctx.fillStyle = PALETTE.arch;
    ctx.fill();
  }

  drawSafeRoomGlow(ctx) {
    const r = SAFE_ROOM;
    ctx.fillStyle = PALETTE.safeGlow;
    ctx.fillRect(r.x0 * TILE, r.y0 * TILE, (r.x1 - r.x0 + 1) * TILE, (r.y1 - r.y0 + 1) * TILE);
  }

  drawTiles(ctx) {
    const x0 = Math.max(0, Math.floor(this.cam.x / TILE));
    const y0 = Math.max(0, Math.floor(this.cam.y / TILE));
    const x1 = Math.min(this.level.cols - 1, x0 + VIEW_W / TILE + 1);
    const y1 = Math.min(this.level.rows - 1, y0 + VIEW_H / TILE + 1);
    const solid = (tx, ty) => this.level.tile(tx, ty) === Tile.SOLID;

    // Rock is one merged path (no seams between tiles), then outlined only where it
    // borders open space.
    const rock = new Path2D();
    const outline = new Path2D();
    const ridge = new Path2D();
    const specks = new Path2D();
    const spikes = [];
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const x = tx * TILE;
        const y = ty * TILE;
        const tile = this.level.tile(tx, ty);
        if (tile === Tile.SPIKE) spikes.push([x, y]);
        if (tile !== Tile.SOLID) continue;

        rock.rect(x, y, TILE, TILE);
        if (!solid(tx, ty - 1)) {
          outline.moveTo(x, y);
          outline.lineTo(x + TILE, y);
          ridge.rect(x, y + 1, TILE, 2);
        }
        if (!solid(tx, ty + 1)) {
          outline.moveTo(x, y + TILE);
          outline.lineTo(x + TILE, y + TILE);
        }
        if (!solid(tx - 1, ty)) {
          outline.moveTo(x, y);
          outline.lineTo(x, y + TILE);
        }
        if (!solid(tx + 1, ty)) {
          outline.moveTo(x + TILE, y);
          outline.lineTo(x + TILE, y + TILE);
        }
        // Deterministic speckle so the rock isn't flat.
        const h = (tx * 73856093) ^ (ty * 19349663);
        if ((h & 3) === 0) specks.rect(x + ((h >> 3) & 7) + 3, y + ((h >> 6) & 7) + 4, 2, 1.5);
      }
    }

    ctx.fillStyle = PALETTE.rock;
    ctx.fill(rock);
    ctx.fillStyle = PALETTE.rockSpeck;
    ctx.fill(specks);
    ctx.fillStyle = PALETTE.rockLight;
    ctx.fill(ridge);
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK;
    ctx.stroke(outline);

    for (const [x, y] of spikes) this.drawSpikes(ctx, x, y);
  }

  // Bone-white thorns.
  drawSpikes(ctx, x, y) {
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const sx = x + 0.5 + i * 5;
      ctx.moveTo(sx, y + TILE);
      ctx.lineTo(sx + 2.5, y + 4);
      ctx.lineTo(sx + 5, y + TILE);
    }
    ctx.fillStyle = PALETTE.bone;
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
}
