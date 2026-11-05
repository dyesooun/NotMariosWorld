# Whimsical Overgrowth Forest — enemy sprite atlas

Pixel-art enemy sprite pack for a 2D side-scrolling platformer. Inspired by the supplied Hell Express layout, with four distinct forest enemies plus separate projectile visual effects. No writing, grid lines, labels, or descriptions are baked into the atlas image.

## Included files

| File | Intended use |
| --- | --- |
| `whimsical-overgrowth-forest-enemies.png` | **Production RGBA atlas**, transparent background, **1536 × 1280 px** |
| `manifest.txt` | UTF-8 JSON manifest with explicit frame rectangles, sequences, and game-behavior hints; parse it as JSON |
| `manifest.json` | Identical copy for code/import pipelines requiring `.json` |
| `whimsical-overgrowth-forest-enemies-preview.png` | Optional checkerboard preview only; **not** a source for cropping |

## Atlas layout (fixed grid)

- **8 columns × 5 rows = 40 sprites**; every frame is **192 × 256 source pixels**.
- Origin at the upper left `(0, 0)`. X increases right, Y increases downward.
- Pixel rectangle for column `c`, row `r`: `x = c * 192`, `y = r * 256`, `w = 192`, `h = 256`.
- All frames are **untrimmed**, with **no spacing, padding, extrusion, or rotated frames**.
- Draw with image smoothing **off**, using `nearest` filtering. Flip right-facing enemy sprites horizontally to face left.

| Row (0-based) | Creature | Type | Behavior |
| --- | --- | --- | --- |
| 0 | Brambleback Boar | Ground #1 | Fast patrol/chase, close-range tusk lunge |
| 1 | Sporecap Troll | Ground #2 | Slow heavy melee, telegraphed ground slam |
| 2 | Leafwing Owl | Flying | Wingbeat hover loop; dive attack; gravity disabled |
| 3 | Snapvine Pod | Ranged/projectile | Rooted shooter; releases a separate Glowseed Orb |
| 4 | Glowseed Orb FX | Projectile/effects | Flight loop 0–3; impact one-shot 4–7 |

## Column-by-column sprite usage

Each row uses column indices `0–7`. Exact per-frame descriptions also appear in `manifest.frames[frameId].description`.

| Col | Boar (row 0) | Troll (row 1) | Owl (row 2) | Snapvine (row 3) | Glowseed (row 4) |
| --- | --- | --- | --- | --- | --- |
| 0 | Idle A | Idle A | Hover A | Idle A | Flight A |
| 1 | Idle B | Idle B | Hover B | Idle B | Flight B |
| 2 | Run A | Walk A | Hover C | Idle C | Flight C |
| 3 | Run B | Walk B | Hover D | Fire windup | Flight D |
| 4 | Charge windup | Slam windup | Dive windup | Projectile release | Impact start |
| 5 | Tusk lunge | Ground slam | Dive strike | Recovery | Impact expand |
| 6 | Hurt | Hurt | Hurt | Hurt | Impact scatter |
| 7 | Defeated | Defeated | Defeated | Defeated | Impact dissipate |

## Animations and events

All indexes are zero-based *within the named animation sequence*, not row columns.

| Enemy | Animation | Row columns, in playback order | FPS | Loop? | Gameplay event |
| --- | --- | --- | --- | --- | --- |
| Brambleback Boar | idle | 0, 1 | 3 | Yes | — |
| Brambleback Boar | run | 1, 2, 3, 2 | 10 | Yes | — |
| Brambleback Boar | lunge | 4, 5, 3 | 8 | No | Melee damage at sequence index `1` (column 5) |
| Sporecap Troll | idle | 0, 1 | 3 | Yes | — |
| Sporecap Troll | walk | 1, 2, 3, 0 | 5 | Yes | — |
| Sporecap Troll | slam | 4, 5, 0 | 5 | No | Ground-slam damage at sequence index `1` (column 5) |
| Leafwing Owl | hover | 0, 1, 2, 3 | 9 | Yes | — |
| Leafwing Owl | dive | 4, 5, 3 | 9 | No | Dive damage at sequence index `1` (column 5) |
| Snapvine Pod | idle | 0, 1, 2 | 3 | Yes | — |
| Snapvine Pod | fire | 3, 4, 5 | 8 | No | Spawn **one** Glowseed at sequence index `1` (column 4) |
| Glowseed Orb | flight | 0, 1, 2, 3 | 12 | Yes | Move until collision or timeout |
| Glowseed Orb | impact | 4, 5, 6, 7 | 12 | No | Despawn when complete |

Each enemy also has a single-frame `hurt` animation (column 6) and `death` animation (column 7). See `manifest.json` for the complete array-based definitions, exact frame IDs, suggested collision boxes, pivots, and projectile offsets.

## Behavior wiring for Codex

1. **Brambleback Boar:** patrol along valid platforms, detect player within range, run toward them, then telegraph and lunge. Body contact can deal damage while alive. Only enable the lunge hitbox on the designated attack frame.
2. **Sporecap Troll:** slower platform patrol, approach player, wind up with frame 4, then ground-slam at frame 5. Restrict the slam damage to a localized forward/ground attack region.
3. **Leafwing Owl:** follow a flight path without gravity, animate the wingbeat hover, then dip/dive at a target and return to hover. Use the dive damage frame only as specified.
4. **Snapvine Pod:** stand rooted to a platform; at regular cooldowns, face/aim toward player and play `fire`. On the specified release frame, spawn one independently simulated `glowseed` projectile at `spawn_offset_from_pivot_px`, accounting for left/right sprite flipping. The drawn orb in the release sprite is *only* a visual cue.
5. **Glowseed Orb:** travel according to the shooter's facing vector; animate `flight` in a loop. On a collision, deactivate damaging collision, play one `impact`, and despawn at animation completion. Do not spawn a second orb when an art frame depicts one.

## JavaScript canvas cropping example

```js
import manifest from './manifest.json' with { type: 'json' };

const atlas = new Image();
atlas.src = '/assets/sprites/forest/whimsical-overgrowth-forest-enemies.png';

function drawFrame(ctx, frameId, x, y, scale = 1) {
  const f = manifest.frames[frameId];
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(atlas, f.x, f.y, f.w, f.h,
    Math.round(x), Math.round(y), f.w * scale, f.h * scale);
}

// Play first Brambleback Boar running pose (at your entity's sprite top-left).
const boar = manifest.enemies.find(e => e.id === 'brambleback_boar');
drawFrame(ctx, boar.animations.run.frames[0], 100, 200, 1);
```

To draw around a world-space pivot `(px, py)`, compute the top-left as `x = px - pivot_x * scale` and `y = py - pivot_y * scale` before drawing. When mirroring, mirror around the pivot so the collider remains in place.

## Integration checklist

1. Copy the PNG into your game's assets; load `manifest.json` or parse `manifest.txt` as JSON.
2. Register **40 exact rectangles** from `frames[*]`, never using sprite-content detection.
3. Register all `enemies[*].animations` and `projectiles[*].animations` with their listed frame IDs, FPS, and loop flags.
4. Keep a constant per-entity pivot during animation; never re-center individual source frames based on trim.
5. Keep flying and projectile motion separate from ground physics.
6. Trigger attack damage at `damage_active_indices`; spawn a Glowseed on `spawn_projectile_at_index` exactly once.
7. On projectile impact, stop movement/damage, animate the visual burst, and despawn.
8. Tune collision boxes, movement speeds, damage, hit timings, and visuals during gameplay tests.

## Art/runtime cautions

- Collision boxes and pivots are **recommended first estimates**, not measured physics guarantees.
- These illustrated frames are visually coordinated, but **not guaranteed** perfectly seamless between every pose.
- Image background is transparent (RGBA). The preview uses a checkerboard purely for inspection.
- Keep the 192 × 256 source rectangle untrimmed in game unless offsets are maintained; optional `trim` is `[left, top, right_exclusive, bottom_exclusive]` within one cell.
