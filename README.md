# Metroidvania

A barebones metroidvania prototype set in a gothic bug world. You play a white beetle with two
horns and a red cloak.

**Play it:** https://games.caxco93.com/metroidvania/

Plain HTML5 canvas and JavaScript: no dependencies, no build step, no asset files. The art is
drawn procedurally and the sound effects are synthesized with the Web Audio API.

## Run locally

The game uses ES modules, so it needs a web server rather than opening the file directly:

```sh
python3 -m http.server
```

Then open http://localhost:8000.

## Controls

| Action | Keys |
| --- | --- |
| Move | Arrows or WASD |
| Jump | Space, Z or K |
| Attack | X or J. Hold Up to strike upward; hold Down in the air to strike downward |
| Interact / buy / revive | E (Enter also works in menus) |
| Map | M (once bought) |
| Mute / unmute music | N |

Push toward a ledge while falling beside it to pull yourself up. A downward strike bounces you
off enemies and spikes.

## What's in it

- A 5x2 grid of screens with a safe zone, a shopkeeper, a secret room and a boss arena.
- A melee enemy, a ranged enemy, spikes and a boss with three telegraphed attacks.
- Enemies drop points; the shop sells the map and extra hearts.
- Enemies only act on the screen you are in, and reset when you leave it.

## Code layout

- `index.html`: the page and canvas.
- `src/`: gameplay. `game.js` is the main loop, `world.js` the level layout, `player.js`,
  `enemies.js` and `boss.js` the actors.
- `src/art/`: one "rig" per character, holding its animation state and drawing. Gameplay classes
  report events to their rig (jumped, hit, fired) and contain no drawing code.
- `src/gfx.js`, `src/anim.js`: shared drawing and animation helpers.
- `src/audio.js`: synthesized sound effects.
