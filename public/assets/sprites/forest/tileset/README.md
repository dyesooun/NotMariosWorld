# Whimsical Overgrowth Forest — tileset atlas

Pixel-art environment atlas for a 2D side-scrolling platformer. The sheet contains mossy walkable terrain, twisted roots and woodwork, forest props, organic hazards, a timed vertical energy beam, dangling overgrowth, painted parallax backgrounds, and dense flowers/plants. **This documentation is only for the environment tileset, not the enemy atlas.** No descriptions or labels are baked into the source image.

## Included files

| File | Intended use |
| --- | --- |
| `tileset.png` | **Source RGBA atlas**, **1254 × 1254 px**, stored alongside these docs. |
| `manifest.json` | UTF-8 **JSON** with explicit crop rectangles, sprite names, placement/collision hints and beam behavior. |
| `README.md` | This integration guide and category index. |

## Atlas layout (irregular rectangular bands)

**This atlas is NOT a fixed-size grid** like the enemy reference sheet. It has **13 horizontal bands** containing **170 manually mapped regions**, with **variable cell widths and row heights**. Never calculate `x = column * tileWidth` or `y = row * tileHeight` from one global cell size.

- Upper-left origin `(0, 0)`, X rightward, Y downward; every source rectangle uses **`x`, `y`, `w`, `h`** in pixels.
- Crop only with `manifest.frames[frameId]`, e.g. `ctx.drawImage(img, f.x, f.y, f.w, f.h, ...)`.
- No rotations, authored sprite extrusion or fixed padding; keep the full rectangular crop (do not alpha-trim automatically).
- Render with smoothing/antialiasing **off** (`nearest` filtering). Use integer display scales when practical.
- `row` identifies the source's **horizontal band**; `col` identifies a region **within that band**. Neither implies a standard `cell_width` or `cell_height`.

| Band (0-based) | Source Y / height | Regions | Contents |
| --- | --- | ---: | --- |
| 0 | 0 / 90 px | 14 | moss platforms |
| 1 | 90 / 90 px | 15 | stone platforms |
| 2 | 180 / 77 px | 12 | root log platforms |
| 3 | 257 / 65 px | 16 | floating islands |
| 4 | 322 / 81 px | 13 | woodland structures |
| 5 | 403 / 76 px | 15 | containers and props |
| 6 | 479 / 71 px | 12 | hazards |
| 7 | 550 / 186 px | 14 | vertical beams |
| 8 | 736 / 103 px | 9 | large forest props |
| 9 | 839 / 100 px | 12 | overhangs |
| 10 | 939 / 116 px | 4 | backgrounds |
| 11 | 1055 / 84 px | 17 | flowers and plants |
| 12 | 1139 / 81 px | 17 | fungi and groundcover |

## Tile categories and usage

Every entry below has its own documented **`frames[frameId]`** rectangle and description. The `tile_groups` array collects IDs for discovery and palette construction.

| Category (`tile_groups[].id`) | Regions | Intended use | Suggested collision |
| --- | ---: | --- | --- |
| `platforms` | 57 | Moss, stone, root and floating platforms | `solid_level_defined` |
| `decorations` | 13 | Fences, signs, lanterns and forest-built details | `none` |
| `hazards` | 12 | Bramble spikes, toxic mushrooms and pools | `hazard_trigger_level_defined` |
| `vertical_beam` | 14 | Vertical magic trap, static ON/OFF variants | `hazard_only_when_on` |
| `tile_specific_props` | 24 | Containers, carts, logs, hollows, landmarks | `optional_level_defined` |
| `overhang_decorations` | 12 | Hanging foliage, flowering vines, lanterns | `none` |
| `background_parallax` | 4 | Painted forest scenery strips | `none` |
| `flowers_plants` | 34 | Flowers, reeds, bushes, fungi and pond flora | `none` |

### Sprite IDs, dimensions and descriptions

To find **each sprite's exact crop**, read `manifest.frames[frameId]`. A typical record contains:

```json
{
  "x": 0,
  "y": 0,
  "w": 188,
  "h": 90,
  "row": 0,
  "col": 0,
  "band": "moss_platforms",
  "category": "platforms",
  "pose": "static",
  "display_name": "Flowered Grass Block",
  "description": "Overgrown forest terrain piece depicting flowered grass block; may be used as a standalone platform or hand-placed terrain accent.",
  "usage": "Place in walkable terrain layer and separately author solid collider/top walking surface.",
  "render_layer": "terrain",
  "suggested_collision": "solid_level_defined",
  "anchor": "top_left",
  "verified_seamless": false
}
```

For example, the record above belongs to `frames.moss_platforms_01_flowered_grass_block`. The width and height **are the source crop dimensions**, not an in-game collider size. Note that the original artwork can contain several small objects within one listed region.

## Hazard sprites

- `hazards[]` provides one record per hazard visual, with its `frame_id`, `hazard_kind`, and suggested `damage_sources`.
- The source includes brambles/thorns, spike-like palisades, toxic fungal growth and poisonous-looking pools. Do not treat every decorative mushroom elsewhere in the sheet as a hazard by default.
- Damage triggers are **game-level authoring work**: the PNG stores no damage physics. Set each hazard's `damage_enabled_by_default` to `false` until a level explicitly configures its damage collider.
- Define a trigger inside the depicted dangerous portion, not across the entire untrimmed crop.

## Vertical magic beam — ON/OFF every second

The vertical beam source sits in **band 7** (Y = **550–735**, height **186 px**). There are **five OFF visuals** and **nine active color variants**. They are **static state alternatives**, not a frame-by-frame transition animation.

| State | Frame IDs | Duration | Damaging collision |
| --- | --- | ---: | --- |
| ON | `interactives[0].states.on.frame_candidates` | **1000 ms** | Enabled |
| OFF | `interactives[0].states.off.frame_candidates` | **1000 ms** | Disabled |

Recommended runtime sequence: **ON → OFF → ON**, looping every **2000 ms**. `manifest.interactives[0].animations.blink` contains the state order, durations and start state. Use one compatible OFF sprite and one compatible ON sprite—these sets are not one-to-one pairs.

The beam is **vertical from ceiling to floor**, including top emitter and floor receiver. The available full source crop is only 186 px high. For ceilings of different heights, **split out caps and repeat/tile a center energy strip in your art pipeline** instead of assuming the complete 186 px image can be stretched arbitrarily without distortion. Keep gameplay collision independent of the artwork.

## Background parallax

Four wide scenic strips are listed in `parallax_layers[]`. Render **behind** the player and walkable terrain; keep their original aspect ratios. The suggested scroll factors are examples; tune visually to the camera. They are **not confirmed seamless horizontally**, so do not blindly repeat them without checking joins.

## JavaScript Canvas cropping example

```js
// Existing image location; change if your project uses another path.
const atlas = new Image();
atlas.src = '/assets/sprites/forest/tileset/tileset.png';

// Load `manifest.json` with your bundler or fetch it from the assets directory:
const manifest = await (await fetch('/assets/sprites/forest/tileset/manifest.json')).json();

function drawSprite(ctx, frameId, x, y, scale = 1) {
  const f = manifest.frames[frameId];
  if (!f) throw new Error(`Unknown forest tile: ${frameId}`);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    atlas,
    f.x, f.y, f.w, f.h,
    Math.round(x), Math.round(y),
    Math.round(f.w * scale), Math.round(f.h * scale)
  );
}

// Draw one moss-covered terrain visual (walkable physics added separately).
drawSprite(ctx, 'moss_platforms_01_flowered_grass_block', 100, 200, 1);
```

### Simple beam state wiring

```js
const beamDef = manifest.interactives.find(x => x.id === 'forest_vertical_beam');
const onFrame = beamDef.states.on.frame_candidates[3]; // blue example
const offFrame = beamDef.states.off.frame_candidates[0];

function getBeamState(elapsedMs) {
  return Math.floor(elapsedMs / 1000) % 2 === 0 ? 'on' : 'off';
}

function renderBeam(ctx, x, y, elapsedMs) {
  const state = getBeamState(elapsedMs);
  drawSprite(ctx, state === 'on' ? onFrame : offFrame, x, y);
  return { damageEnabled: state === 'on' };
}
```

The example demonstrates the timer only; the actual actor should own collider state, persist its phase across ticks, and disable damage **as soon as** the state switches OFF. The demo does **not** scale the beam to a different ceiling height.

## Integration checklist for Codex

1. Load the atlas and `manifest.json` from `/assets/sprites/forest/tileset/` (or change the URLs in your loader).
2. Verify `atlas.width === 1254`, `atlas.height === 1254`, and that every `frames` crop is inside bounds.
3. Register **all 170 explicit rectangles**, grouped via `tile_groups`; do not infer coordinates from an assumed uniform tile size.
4. Keep cropped regions untrimmed. Choose each sprite's placement anchor from `frames[*].anchor` if your engine supports it.
5. Configure platform physics, hazard triggers, prop colliders, and canopy/foreground depth independently from image rectangles.
6. Implement the 1-second ON/1-second OFF vertical beam using `interactives[0]` and couple the hazard collider to the logical ON state.
7. Draw the four parallax strip regions on slow-scrolling background layers; test for visible joins before attempting horizontal repeat.
8. Inspect extracted sprites over both dark and light backgrounds and manually clean color fringe, mis-cut edges or seams before production use.

## Art/runtime cautions

- **Cropping is manually mapped, approximate—not pixel-perfect certified.** The atlas's variable-size cells are not a guaranteed standardized tileset grid.
- The generated source image has visible stray red/green/magenta color and partially transparent edge contamination in some regions. Production cleanup is recommended.
- Some mapped cells contain multiple visual elements; do not use alpha-based autodetection to split or trim them.
- No terrain joins are guaranteed tileable; colliders and terrain topology must be defined in code or level data.
- There are **no creature or projectile assets** in these files.

## Generic generation schema

The reusable tileset generation contract is [`../../schema.json`](../../schema.json), with instructions in [`../../README.md`](../../README.md). It supports arbitrary tileset images, dimensions, frame IDs, and frame counts. It does not embed this forest manifest or define creature data.

Use the existing PNG and manifest as references when generating a new manifest with measured geometry. The current manifest retains its original format; it has not been converted to the generic schema. Runtime interpretation and level placement remain separate from source-art metadata.
