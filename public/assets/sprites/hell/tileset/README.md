# Hell Express — environment tileset atlas

A 16-bit-inspired pixel-art sprite atlas for a side-scrolling **Hell Express** platformer: volcanic and iron platforms, infernal station scenery, railway cargo, lava and spike hazards, a blinking vertical ceiling-to-floor beam, hanging decorations, four panoramic backgrounds, and hellish plants. The sprite image contains **no baked-in text or labels**. This environment pack contains **no enemy sprites**.

## Package contents

| File | Purpose |
| --- | --- |
| `hell_express_tileset_atlas.png` | Generated **1254 × 1254 px RGBA** atlas. |
| `manifest.json` | Machine-readable manifest with **208 explicit crop rectangles**, descriptions, usage and interaction data. |
| `manifest.txt` | UTF-8 JSON copy, with identical content to `manifest.json`. |
| `sprite-index.txt` | Human-readable one-by-one sprite descriptions, `(x, y, w, h)` crops, collision and placement tips. |
| `README.md` | This Codex-facing integration guide. |

## Atlas layout — IMPORTANT

The image is **visually gridded into rows**, but **NOT a uniform sprite grid**. It has **15 horizontal bands with 208 manually mapped rectangular cells of varying width and height**. Do **not** use `(column * tileWidth, row * tileHeight)` or an assumed 32×32/64×64 crop. **Always** use `manifest.frames[id]`.

- Upper-left origin `(0, 0)`; X increases right, Y increases down.
- All rectangles use integer **`x`, `y`, `w`, `h`** in source pixels.
- All crops are within the 1254 × 1254 image; all source bands and columns have contiguous non-overlapping rectangular cell boundaries.
- Preserve the original frame crop initially rather than auto-trimming alpha. For screen display use nearest-neighbor (`imageSmoothingEnabled = false`).
- The PNG contains significant low-alpha edge pixels; inspect pixel fringes on light and dark backgrounds.
- Neither seamless terrain joins nor animation continuity are guaranteed without a cleanup pass.

| Row | Source band | Y | H | Regions |
| ---: | --- | ---: | ---: | ---: |
| 0 | `basalt_platforms` | 0 | 95 | 13 |
| 1 | `stone_platforms` | 95 | 89 | 14 |
| 2 | `iron_platforms` | 184 | 78 | 13 |
| 3 | `floating_ledges` | 262 | 58 | 16 |
| 4 | `industrial_decor` | 320 | 87 | 14 |
| 5 | `cargo_and_pipes` | 407 | 82 | 18 |
| 6 | `train_and_gates` | 489 | 105 | 10 |
| 7 | `spikes_and_fire` | 594 | 72 | 16 |
| 8 | `lava_hazards` | 666 | 69 | 16 |
| 9 | `thorn_and_bone_hazards` | 735 | 65 | 12 |
| 10 | `vertical_beams` | 800 | 129 | 18 |
| 11 | `overhangs` | 929 | 79 | 10 |
| 12 | `backgrounds` | 1008 | 104 | 4 |
| 13 | `hell_flora` | 1112 | 73 | 18 |
| 14 | `hell_fungi` | 1185 | 69 | 16 |

## Categories

| `tile_groups[].id` | Frames | Suggested collision |
| --- | ---: | --- |
| platforms | 56 | solid_level_defined |
| decorations | 14 | none |
| hazards | 44 | hazard_trigger_level_defined |
| vertical_beam | 18 | hazard_only_when_on |
| tile_specific_props | 28 | optional_level_defined |
| overhang_decorations | 10 | none |
| background_parallax | 4 | none |
| flowers_plants | 34 | none |

Every entry in `frames` includes **source crop, row/column, band, category, display name, description, usage, render layer, collision suggestion, and anchor**. Use `tile_groups[].frame_ids` to populate a palette. `sprite-index.txt` is a full readable catalog, not merely examples.

### Platforms

`basalt_platforms`, `stone_platforms`, `iron_platforms` and `floating_ledges` contain walkable volcanic rock, slopes, iron bridge structures and stepping islands. **The source rect is not a physics hitbox.** Supply hand-authored flat or sloped colliders that match the walkable surface; avoid making sharp hanging rock tips walkable.

### Decorations and props

`industrial_decor` is for fence rails, chain barriers, hanging lamps, bells, signal lights and banners. `cargo_and_pipes` plus `train_and_gates` provide crates, barrels, coal carts, pipes, gate sprites, rail supports and a steam train. The train is one large visual **not** a sprite animation. Add collision/interactivity only where the level needs it.

### Hazard materials

`spikes_and_fire`, `lava_hazards` and `thorn_and_bone_hazards` supply damage-looking visuals. **Do not automatically turn every flame puff, smoke sprite or skull pile into a hazard.** `hazards[]` gives each candidate sprite a `hazard_kind` and defaults `damage_enabled_by_default: false`; the game author explicitly places the damaging trigger.

`animations[]` contains two **optional, inferred** non-looping visual sequences: fire/explosion and lava splash. The order is a suggested effect timeline, not proof that these generated art crops line up as a polished animation. Use in isolated explosion effects after testing.

## Vertical beam trap — 1 second ON / 1 second OFF

The beam lives in row **10** (`y = 800`, `h = 129`). It has **8 bright ON alternatives** and **10 OFF alternatives**. OFF variants include a disconnected emitter/receiver visual and dim inactive shafts. These are static **state alternatives**, not 18 consecutive animation frames.

| State | Duration | Visuals | Damage |
| --- | ---: | --- | --- |
| ON | 1000 ms | `interactives[0].states.on.frame_candidates` | Enabled |
| OFF | 1000 ms | `interactives[0].states.off.frame_candidates` | Disabled |

Use `interactives[0].default_pair` as a convenient visual pair. Begin ON, transition OFF after **1000 ms**, then return ON at **2000 ms**. Keep the collision trigger synchronized with the *logical state*, not with the color or opacity of the beam art.

The sprite includes a **ceiling emitter** and **floor receiver**. For taller rooms, preserve both caps and extend only the beam center/shaft in the rendering pipeline. The source cap split positions are **not formally annotated**; verify them before cutting. The full frame dimensions are not automatically valid collider dimensions.

```js
const beam = manifest.interactives[0];
const activeId = beam.default_pair.on_frame_id;
const inactiveId = beam.default_pair.off_frame_id;

function updateBeam(elapsedMs) {
  const on = Math.floor(elapsedMs / 1000) % 2 === 0;
  return { frameId: on ? activeId : inactiveId, damageEnabled: on };
}
```

## Background parallax

The 4 panoramas (`backgrounds_01` through `backgrounds_04`) depict a **lava lake cavern**, an **infernal rail viaduct**, a **hellish station**, and a **railway tunnel**. `parallax_layers[]` provides suggested scroll factors. Render behind gameplay, preserve aspect ratio, and **do not assume any strip loops seamlessly** (`repeat_x_verified = false`).

## JavaScript / Canvas crop example

```js
const atlas = new Image();
atlas.src = '/assets/sprites/hell/hell_express_tileset_atlas.png';

const manifest = await (
  await fetch('/assets/sprites/hell/manifest.json')
).json();

function drawFrame(ctx, frameId, x, y, scale = 1) {
  const f = manifest.frames[frameId];
  if (!f) throw new Error(`Unknown Hell Express sprite: ${frameId}`);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    atlas, f.x, f.y, f.w, f.h,
    Math.round(x), Math.round(y),
    Math.round(f.w * scale), Math.round(f.h * scale)
  );
}

const firstBasalt = manifest.tile_groups
  .find(g => g.id === 'platforms').frame_ids[0];
drawFrame(ctx, firstBasalt, 120, 200);
```

Wait for the image to load before calling `drawFrame`. If your game uses a WebGL renderer, set its sprite texture sampler to nearest-neighbor and clamp edges to avoid unintended bleed.

## Codex integration checklist

1. Copy this folder into `public/assets/sprites/hell/` or adjust the asset URLs in your loader.
2. Assert `atlas.width === 1254` and `atlas.height === 1254`; check every crop is in bounds.
3. Index **all 208** source rectangles from `manifest.frames`. Never infer a global crop size.
4. Build palettes from the eight `tile_groups`; keep layering and physics separate from the sprite crop rectangles.
5. Mark collidable walkways with appropriately shaped level colliders; add damage triggers only to selected hazard placements.
6. Wire the ON/OFF vertical beam to a monotonic simulation time, alternating every 1000 ms. Apply gameplay damage only when ON.
7. Put four parallax images behind the player, with independent slow camera factors; check seams before repeating them.
8. Use `sprite-index.txt` for a coordinate-and-description view and `manifest.json` as the source of truth for integration.
9. Review sprite boundaries and remove low-alpha fringe/stray color before shipping. This atlas was generated rather than exported from a tile editor, so some neighboring cells may need hand corrections to be pixel-perfect.

## Known caveats

- Source image was AI generated. The **grid bands and x-splits were determined from visible gaps**, not an exported authoring file, so crop boundaries are **approximate**, although all rectangles are valid and non-overlapping.
- Terrain pieces are visually related but not necessarily edge-tileable; use selected, authored joints in gameplay.
- Some cells intentionally include a cluster (e.g., small stone steps or grouped flowers) and should stay together.
- `frame.width`/`height` in source pixels **must not** be treated as guaranteed physics width/height.
- No damage behavior, parallax scrolling or animations are embedded in the PNG itself.
