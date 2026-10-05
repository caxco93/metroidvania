import { TILE, SCREEN_TILES_W, SCREEN_TILES_H, MAP_COLS, MAP_ROWS } from './constants.js';

export const Tile = { EMPTY: 0, SOLID: 1, SPIKE: 2 };

export class Level {
  constructor() {
    this.cols = MAP_COLS * SCREEN_TILES_W;
    this.rows = MAP_ROWS * SCREEN_TILES_H;
    // Start as solid rock; world.js carves the rooms out of it.
    this.tiles = new Uint8Array(this.cols * this.rows).fill(Tile.SOLID);
  }

  tile(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return Tile.SOLID;
    return this.tiles[ty * this.cols + tx];
  }

  isSolid(tx, ty) {
    return this.tile(tx, ty) === Tile.SOLID;
  }

  // Inclusive tile rectangle.
  fill(x0, y0, x1, y1, tile) {
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) this.tiles[ty * this.cols + tx] = tile;
    }
  }

  carve(x0, y0, x1, y1) {
    this.fill(x0, y0, x1, y1, Tile.EMPTY);
  }

  overlapsSolid(x, y, w, h) {
    const x0 = Math.floor(x / TILE);
    const x1 = Math.floor((x + w) / TILE);
    const y0 = Math.floor(y / TILE);
    const y1 = Math.floor((y + h) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) if (this.isSolid(tx, ty)) return true;
    }
    return false;
  }

  // Spikes only hurt on the lower part of their tile, so brushing the tip is forgiving.
  touchesSpike(x, y, w, h) {
    const x0 = Math.floor(x / TILE);
    const x1 = Math.floor((x + w) / TILE);
    const y0 = Math.floor(y / TILE);
    const y1 = Math.floor((y + h) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (this.tile(tx, ty) !== Tile.SPIKE) continue;
        const sx = tx * TILE + 2;
        const sy = ty * TILE + 6;
        if (x < sx + 12 && x + w > sx && y < sy + 10 && y + h > sy) return true;
      }
    }
    return false;
  }

  // Horizontal extent (in px) an enemy standing on tile (tx, ty) can patrol without
  // leaving its platform, running into a wall or a spike, capped at maxTiles each way.
  patrolRange(tx, ty, maxTiles) {
    const walkable = (x) => this.isSolid(x, ty + 1) && this.tile(x, ty) === Tile.EMPTY;
    let left = tx;
    let right = tx;
    while (tx - left < maxTiles && walkable(left - 1)) left--;
    while (right - tx < maxTiles && walkable(right + 1)) right++;
    return { minX: left * TILE, maxX: (right + 1) * TILE };
  }

  cellOf(px, py) {
    return {
      cx: Math.min(MAP_COLS - 1, Math.max(0, Math.floor(px / (SCREEN_TILES_W * TILE)))),
      cy: Math.min(MAP_ROWS - 1, Math.max(0, Math.floor(py / (SCREEN_TILES_H * TILE)))),
    };
  }
}
