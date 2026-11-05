# Hell Express — enemy sprite atlas

Pixel-art enemy sprites for a 2D side-scrolling platformer, packaged for Codex integration.

## Included assets

| File | Usage |
| --- | --- |
| `hell-express-enemies.png` | **Use this atlas**; transparent RGBA, 1536 × 1280 px |
| `manifest.txt` | Machine-readable UTF-8 JSON manifest (stored as `.txt` as requested) |
| `manifest.json` | Exact duplicate for engines/scripts expecting `.json` |
| `hell-express-enemies-preview.png` | Checkerboard preview only; **do not crop sprites from it** |

## Fixed grid

- **8 columns × 5 rows = 40 frames.** Each frame is exactly **192 × 256 px**.
- Top-left origin `(0,0)`; X increases to the right, Y down. Coordinates are **pixels, not normalized UVs**.
- Cell at `(column, row)` has rectangle `(x=column*192, y=row*256, width=192, height=256)`.
- No packed/rotated frames, padding or inter-cell spacing. Alpha outside the painted creatures is transparent.
- **Row 0:** Ember Hound, land chaser.
- **Row 1:** Slag Minotaur, land heavy melee.
- **Row 2:** Cinder Imp, flying enemy.
- **Row 3:** Infernal Cannon, projectile-based enemy.
- **Row 4:** Fireball projectile flight frames `0–3`, impact frames `4–7`.

## Sprite index within each enemy row

| Index | Ember Hound | Slag Minotaur | Cinder Imp | Infernal Cannon |
| --- | --- | --- | --- | --- |
| 0 | Idle A | Idle A | Hover A | Idle A |
| 1 | Idle B / run | Idle B / walk | Hover B | Idle B |
| 2 | Run | Walk | Hover C | Idle C |
| 3 | Run | Walk | Hover D | Muzzle flash |
| 4 | Charge | Hammer windup | Hover E / dive startup | Firing, fireball visible |
| 5 | Bite/lunge | Hammer slam | Dive attack | Recovery |
| 6 | Hurt | Hurt | Hurt | Hurt |
| 7 | Dead | Dead | Dead | Destroyed |

Precise named animation sequences, frame rates, one-shot flags, damage frames, projectile spawn frames, and per-sprite crop rectangles are in `manifest.txt` under `enemies[*].animations`, `projectiles[*].animations` and `frames`.

## Recommended behavior

- **Ember Hound (land #1):** platform patrol → chase → lunge/bite; deals contact damage while alive.
- **Slag Minotaur (land #2):** slow platform patrol → windup → ground slam; activate the hammer hitbox on the impact frame only.
- **Cinder Imp (flying #1):** hover/wave along a flight path → pursue → dive; gravity disabled.
- **Infernal Cannon (projectile #1):** mostly stationary; fire animation spawns a **separate `fireball` entity** once on the specified frame. The fireball loops its four flight frames, then plays a one-shot impact and despawns.

The hitboxes and pivots are intentionally **recommendations**. Tune them in your existing collision, physics and damage systems; artwork is not responsible for gameplay logic. Never spawn a second projectile merely because the atlas fire pose contains a painted fireball.

## Minimal JavaScript cropping example

```js
import manifest from './manifest.json' with { type: 'json' };

const enemyAtlas = new Image();
enemyAtlas.src = '/assets/sprites/hell-express/hell-express-enemies.png';

function drawFrame(ctx, frameId, x, y, scale = 1) {
  const f = manifest.frames[frameId];
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    enemyAtlas,
    f.x, f.y, f.w, f.h,
    Math.round(x), Math.round(y), f.w * scale, f.h * scale
  );
}

// Render a particular stage in the Ember Hound run cycle:
const animation = manifest.enemies[0].animations.run;
drawFrame(ctx, animation.frames[0], 100, 200, 0.5);
```

When using the recommended pivots, `(x, y)` should be interpreted as the entity's **sprite top-left**; to render by a world-space pivot `(px, py)`, use `x = px - pivot_x * scale`, `y = py - pivot_y * scale`. Mirror the whole canvas/object for left-facing enemies, with the pivot held constant. Use nearest-neighbor filtering at integer scale where possible. Do not trim individual animation frames unless you also compensate their offsets.

## Integration checklist for Codex

1. Import the atlas and parse `manifest.txt` as JSON (or import `manifest.json`).
2. Register all 40 frames using the explicit `frames` coordinates; no auto-detection.
3. Register each `enemies[*].animations` action in array order at its specified `fps`, respecting `loop`.
4. Keep all sprites in one enemy animation at the manifest's constant `pivot_px`.
5. Apply physics based on enemy `type`; flying enemies do not use ground gravity.
6. Hook damage windows to `damage_active_indices`, and cannon projectile spawning to `spawn_projectile_at_index`.
7. On projectile collision, switch from `flight` to `impact` and then remove the projectile.
8. Test hitboxes and pivots in-game; treat the suggested values as initial estimates.

## Important limitations

These are original game-art sprites, not a physics implementation. Poses were generated as a cohesive illustrative sheet; movement loops are useful gameplay starting points, but **not guaranteed to be seamless or subpixel-aligned**. This package provides fixed cuts, consistent alpha/background cleanup, separate fireball VFX and explicit integration metadata so Codex can wire them without guessing coordinates.
