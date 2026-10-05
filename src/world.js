import { Level, Tile } from './level.js';

// All coordinates are in tiles. The world is 5x2 screens of 20x12 tiles:
//
//   top row    [secret] [ T1 ][ T2 ][ T3 ][ T4 ]  <- drop shaft into the boss arena
//   bottom row [ SAFE ] [ R1 ][ R2 ][ R3 ][BOSS]
//                          ^ shaft up to the top row
//
// The safe zone (shop) is walled off and enemies never patrol into it.
export const SAFE_ROOM = { x0: 1, y0: 13, x1: 18, y1: 19 };
export const ARENA = { x0: 81, y0: 13, x1: 98, y1: 19 };
export const GATE = { x0: 79, y0: 17, x1: 80, y1: 19 };

export function buildWorld() {
  const level = new Level();
  const { carve, fill } = bind(level);

  // Rooms and corridors.
  carve(SAFE_ROOM.x0, SAFE_ROOM.y0, SAFE_ROOM.x1, SAFE_ROOM.y1);
  carve(19, 18, 20, 19); // safe zone door
  carve(21, 13, 78, 19); // bottom corridor
  carve(GATE.x0, GATE.y0, GATE.x1, GATE.y1); // boss gate (closes during the fight)
  carve(ARENA.x0, ARENA.y0, ARENA.x1, ARENA.y1);
  carve(21, 1, 98, 10); // top corridor
  carve(1, 1, 18, 10); // secret room
  carve(19, 8, 20, 10); // secret room door
  carve(33, 11, 37, 12); // shaft between the two corridors
  carve(89, 11, 92, 12); // drop shaft into the boss arena

  // Shaft steps (3 tiles apart so they're jumpable, and ledge-grabbable).
  fill(33, 17, 35, 17, Tile.SOLID);
  fill(35, 14, 37, 14, Tile.SOLID);

  // Bottom corridor obstacles. Spikes are kept sparse: singles, or a pair at most.
  fill(27, 19, 27, 19, Tile.SPIKE);
  fill(47, 17, 49, 19, Tile.SOLID);
  fill(53, 19, 53, 19, Tile.SPIKE);
  fill(65, 19, 66, 19, Tile.SPIKE);

  // Top corridor obstacles.
  fill(28, 10, 28, 10, Tile.SPIKE);
  fill(47, 8, 49, 10, Tile.SOLID);
  fill(63, 10, 64, 10, Tile.SPIKE);
  fill(71, 9, 72, 10, Tile.SOLID);

  // Secret room: a spike pair guarding a stash.
  fill(9, 10, 10, 10, Tile.SPIKE);

  // Boss arena platforms.
  fill(83, 16, 85, 16, Tile.SOLID);
  fill(95, 16, 97, 16, Tile.SOLID);

  const stash = [];
  for (let tx = 2; tx <= 6; tx++) {
    stash.push({ tx, ty: 10, value: 1 });
  }
  for (let tx = 3; tx <= 5; tx++) {
    stash.push({ tx, ty: 9, value: 1 });
  }

  return {
    level,
    start: { tx: 4, ty: 19 },
    npc: { tx: 10, ty: 19 },
    boss: { tx: 90, ty: 19 },
    pickups: stash,
    // Enemies stay at least ~8 tiles from doorways (safe zone door, secret door, boss gate).
    enemies: [
      // bottom corridor
      { type: 'melee', tx: 31, ty: 19 },
      { type: 'melee', tx: 43, ty: 19 },
      { type: 'ranged', tx: 57, ty: 19 },
      { type: 'melee', tx: 68, ty: 19 }, // past the spikes, so the screen's entrance is clear
      { type: 'ranged', tx: 70, ty: 19 },
      // top corridor
      { type: 'ranged', tx: 44, ty: 10 },
      { type: 'melee', tx: 55, ty: 10 },
      { type: 'melee', tx: 68, ty: 10 },
      { type: 'ranged', tx: 75, ty: 10 },
      { type: 'ranged', tx: 82, ty: 10 },
      { type: 'melee', tx: 96, ty: 10 },
    ],
  };
}

function bind(level) {
  return {
    carve: level.carve.bind(level),
    fill: level.fill.bind(level),
  };
}
