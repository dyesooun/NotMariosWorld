# Troubled Tides — enemy sprite atlas

16-bit-style pixel art for a side-scrolling platformer, following the fixed grid and JSON contract of the supplied Hell Express example.

## Files

| File | Purpose |
| --- | --- |
| `troubled-tides-enemies.png` | **Actual production atlas** — transparent PNG, 1536 × 1280 pixels. |
| `manifest.json` | Detailed machine-readable manifest: cells, per-frame coordinates, descriptions, animations, collision proposals and projectile events. |
| `manifest.txt` | Byte-for-byte duplicate of `manifest.json`, UTF-8 JSON text. |
| `sprite-guide.txt` | Plain-text descriptions, exact crops, trim bounds and animation membership for all 40 sprites. |
| `troubled-tides-enemies-preview.png` | Checkerboard + guide lines for humans only. **Never cut production sprites from this file.** |

## Fixed atlas grid

- **8 columns × 5 rows = 40 frames**, each **192 × 256 px**, RGBA, with no space between cells.
- Coordinate origin: `(0, 0)` at the top left; X grows right and Y grows down.
- To crop column `c` and row `r` (zero-based): `x = c * 192`, `y = r * 256`, `width = 192`, `height = 256`.
- The actual crop rectangles for every individual sprite are in `manifest.json` at `frames[frameId]`.
- `trim` lists approximate visible content bounds **within the source cell** as `[left,top,right,bottom]` with exclusive right/bottom. Don't use trim without compensating draw offsets.

## Enemy and effect rows

| Row | Entity | Classification | Start Y | End Y |
|---:|---|---|---:|---:|
| 0 | Reef Crab | Land / fast claw attacker | 0 | 255 |
| 1 | Drowned Anchorite | Land / heavy anchor melee | 256 | 511 |
| 2 | Stormwing | Flying / dive attacker | 512 | 767 |
| 3 | Brine Cannon | Projectile-based / stationary | 768 | 1023 |
| 4 | Brine Orb | Projectile effect / flight + impact | 1024 | 1279 |

## Frame poses by column

| Column | Reef Crab | Drowned Anchorite | Stormwing | Brine Cannon | Brine Orb |
|---:|---|---|---|---|---|
| 0 | Idle A | Idle A | Hover A | Idle A | Flight 1 |
| 1 | Idle B | Idle B | Hover B | Idle B | Flight 2 |
| 2 | Scuttle 1 | Walk 1 | Hover C | Idle C | Flight 3 |
| 3 | Scuttle 2 | Walk 2 | Flap / bank | Muzzle charge | Flight 4 |
| 4 | Charge | Anchor windup | Dive setup | Orb leaves barrel | Splash start |
| 5 | Claw strike | Anchor slam | Diving strike | Smoke recovery | Large splash |
| 6 | Hurt | Recovery / hurt | Hurt / flinch | Recoil / hurt | Bubbles |
| 7 | Collapsed / dead | Fallen / dead | Wing-level recovery | Destroyed | Fading ring |

Detailed one-line descriptions of all **40 individual frames** are in `manifest.json > frames > [frame_id] > description`, with `when_to_use`, exact `x/y/w/h`, `row/col`, `trim`, and state hints.

## Animation / combat mapping

**Reef Crab (land #1)** — Scuttles along a platform and follows the player. Run loops over cells `1,2,3,2` (9 fps); claws strike on cell `5` in the non-looping `claw_strike` sequence. Use `damage_active_indices: [1]` to gate the attack hitbox. Has distinct hurt and collapsed frames.

**Drowned Anchorite (land #2)** — Slow-moving heavyweight. `walk` is `1,2,3,2` at 5 fps. `slam` is `4,5,6` at 6 fps: raise anchor, impact water burst, recover. Activate the slam hitbox only on animation index `1`. Its cell 7 is a defeated pose.

**Stormwing (flying #1)** — Loops an 8-step hover cycle and dives using cells `3,4,5` (9 fps). Disable gravity; use a flying AI/movement controller. The 7th cell is a pull-up/recovery pose, **not a corpse**: play your game's existing particle death effect before removing this entity.

**Brine Cannon (projectile-based #1)** — Stationary ranged enemy with an idle animation and a three-frame charge/fire/recover sequence `3,4,5`. Spawn **one** independent `brine_orb` at fire animation index `1`. The painted orb inside cannon cell 4 is muzzle feedback only. Spawn the actual projectile at the proposed muzzle offset, tuning this in-game.

**Brine Orb (separate projectile)** — Cells `0..3` are the 12 fps looping flight sequence. On hitting the player or terrain, remove damaging collision and play cells `4..7` as a one-shot impact (12 fps), then despawn. The impact is visual unless you explicitly implement area-of-effect damage.

## Minimal browser Canvas drawing example

```js
import manifest from './manifest.json' with { type: 'json' };

const enemyAtlas = new Image();
enemyAtlas.src = '/assets/sprites/troubled-tides/troubled-tides-enemies.png';

// x, y are the destination's top-left in canvas pixels.
function drawFrame(ctx, id, x, y, scale = 1) {
  const f = manifest.frames[id];
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(enemyAtlas,
    f.x, f.y, f.w, f.h,
    Math.round(x), Math.round(y), f.w * scale, f.h * scale);
}

// Call after the PNG has loaded.
const idleFrame = manifest.enemies[0].animations.idle.frames[0];
drawFrame(ctx, idleFrame, 100, 120, 0.5);
```

To render at a stable world-space pivot `(worldX, worldY)` (rather than top-left), calculate `topLeftX = worldX - pivot_px[0] * scale` and `topLeftY = worldY - pivot_px[1] * scale`. When mirroring a sprite horizontally, keep its world-space pivot fixed and mirror hitboxes/spawn offsets too.

## Codex integration checklist

1. Put the atlas and manifest at your desired project asset path. Update the example URL if needed.
2. Parse the JSON and register exactly **40** frames using `frames[frame_id].x/y/w/h` — do not run image analysis to guess cuts.
3. Associate each enemy row with its entity ID, role, physics and `animations` object.
4. Drive named animations at the supplied FPS and respect `loop`. Indices for combat events are zero-based **indices into the animation sequence**, not atlas columns.
5. Connect `damage_active_indices` to damage windows and `spawn_projectile_at_index` to the cannon's one-time projectile spawn.
6. Keep all animation frames untrimmed to maintain stable pivots. If you trim, compensate offsets using the per-frame `trim` rectangle.
7. Move the independent orb with the engine's projectile entity; don't confuse its movement with sprite animation. Transition to `impact` on collision and despawn when complete.
8. Use nearest-neighbor sampling, disable smoothing/antialiasing, tune hitboxes and spawn offsets in your actual scene scale.
9. Body contact is harmless. Stop attack damage once an enemy dies; avoid relying on a nonexistent Stormwing corpse pose.

## Limitations

This is a game-art integration asset, not executable AI or physics. FPS values, hitboxes, pivots and timing are **starter suggestions**, not engine-validated values. Poses were generated as a cohesive sprite sheet; motion cycles may need pixel alignment/transition tuning to feel seamless. Transparency is preserved and cells are standardized, but artistic silhouettes vary in size by pose. 
