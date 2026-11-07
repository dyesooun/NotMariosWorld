# Original game assets

## Waiting Woods lobby scenery

`public/assets/sprites/lobby/waiting-woods-scenery.png` is an original 1536×1024 transparent PNG generated with the built-in imagegen tool on 2026-11-07. It is a regular three-column, two-row atlas with 512×512 cells: broadleaf oak, slender woodland tree, ruined arch; fractured column, broken wall, fern/flower/rubble cluster. `public/game/lobby-scene.js` trims cell-local transparent margins and caches sprites at logical pixel sizes, drawing without smoothing. The existing `public/assets/sprites/friendly-creatures.png` supplies its animated birds and butterflies; `whimsical_forest_3.png` supplies the distant parallax woodland, and `forest-sprites.png` supplies grass-shelf-aligned practice terrain. No existing source atlas or authored race JSON is replaced. Wind, leaves and root-anchored tree sway are cosmetic code-rendered effects.

<details>
<summary>Final generation prompt (built-in imagegen)</summary>

Use case: stylized-concept. Asset type: production transparent pixel-art sprite atlas for an original friendly woodland platform game lobby. Create ONE clean atlas with exactly THREE equal-width COLUMNS and TWO equal-height ROWS (6 cells). Each asset is isolated in its cell with ample transparent margin, nothing crossing cell borders. Top row left to right: (1) large broadleaf oak tree with clearly branching brown trunk, exposed roots, dense rounded emerald canopy built of defined leaf clusters and lime highlights; (2) elegant slender woodland tree with twisted branching trunk and a narrower blue-green canopy; (3) ancient ruined stone arch with one partially crumbled top, weathered ivory-grey masonry and moss/ivy. Bottom row left to right: (4) broken classical stone column, fractured top, fluted shaft, square base, moss; (5) low broken stone wall with stepped missing masonry and scattered stones at its foot, ivy; (6) small isolated ground cluster of ferns, wildflowers and mossy rubble. Side-on 2D platform-game view, grounded straight-on, not isometric. High fidelity cheerful 16-bit pixel art matching tiny richly shaded avatar/creature sprites: clean crisp square pixels, dark colored outlines, several deliberate shade steps, textured bark, chiseled stone cracks and defined foliage. Inviting sunlit woodland palette of emerald, jade, moss, warm bark, soft golden highlights. Consistent light from upper left and same art fidelity throughout. No scene background, no floor strip, no labels, no words, no borders or grid lines, no characters, no licensed art, no blur or smooth painted gradients. Real transparent alpha background. Strict regular 3x2 grid essential.

</details>

## Historical power HUD icons

The sticky boot, reversed arrows, ice skate, and ink cloud were original code-drawn pixel-grid icons authored for this game on 2026-11-06, with no external artwork or licensed game assets. They were subsequently removed from the power HUD at the user's request to eliminate overlap with its text. The current power slot displays text and an activation button without an icon.

## Whimsical Woods expansion

`public/assets/forest-sprites.png` is an additional original transparent PNG atlas generated with the built-in imagegen tool on 2026-10-30. It is 1254×1254 pixels. `public/game/forest-sprites.js` defines explicit crop regions and trims transparent margins; the generated rows are not perfectly uniform, so do not replace these regions with a generic grid calculation.

Terrain uses a separate grass-shelf anchor at cell-local y=103. Decorative leaves above it are not the collision surface. Raised platforms map that shelf to the physics height; ground repeats the opaque interior at a fixed scale and clips partial tiles. Plain earth backing starts within the opaque soil, below the shelf. Critters remain bottom-aligned to that same physics height.

The original colors are retained. At runtime, small forest sprites are sampled onto a two-logical-pixel grid and larger scenery onto a three-pixel grid, then enlarged without smoothing. Terrain foliage and soil are sampled separately at the shelf anchor so the lower apparent resolution does not change platform or foot alignment. The source PNG is preserved.

The row-major sprite order is:

1. Hanging vine, climbing vine, pink bells, purple-blue bluebells.
2. Golden star flowers, white daisies, red mushrooms, glowing cyan mushrooms.
3. Living-wood chest, glow moth, mushling enemy, acorn beetle enemy.
4. Forest totem, fern-crowned tiki, hanging wooden mask, mossy root platform.

The generation brief requested an isolated 4×4 production sprite atlas, true transparency, crisp chunky 16-bit pixels, dark outlines, emerald/teal moss, golden wood, coral/violet flowers, and no text or franchise characters. It specified leafy vines, four flower varieties, two mushroom clusters, a moss-roofed wooden chest with a cyan crystal latch, turquoise/lilac moth, walking coral mushroom, acorn-armored green beetle, original carved woodland faces, and a flat-topped grass/soil platform with hanging roots.

The previous synthesized **Mosslight Mountain** forest arrangement has been replaced by the user-supplied forest WAV pack described below. Runtime-synthesized biome sound effects have also been replaced by the supplied universal WAV effects.

## Supplied audio packs

The user supplied the WAV files under `public/assets/audio/`. Their bundled README/manifest files describe original procedural chiptune synthesis without third-party samples. The integrated files are 16-bit PCM at 32 kHz. Lobby, podium, and tides background loops are stereo; forest/inferno loops and all three victory stingers are mono. Every background loop is 30 seconds; victory stingers are 4.3 seconds for forest and 4.4 seconds for tides/inferno, measured from the WAV headers.

| Scene | Full background loop | Stage-clear one-shot |
| --- | --- | --- |
| Lobby | `lobby/lobby_main_loop_30s.wav` | — |
| Forest | `forest/music/forest_danger_full_loop_30s.wav` | `forest/music/forest_victory_stinger.wav` |
| Tides | `tide/music/tides_danger_full_loop_30s.wav` | `tide/music/tides_victory_stinger.wav` |
| Inferno | `hell/music/hell_danger_full_loop_30s.wav` | `hell/music/hell_victory_stinger.wav` |
| Podium / course-finished waiting | `lobby/podium_main_loop_30s.wav` | — |

Paths in this table are relative to `public/assets/audio/`. Each entire loop repeats without layering a separate danger track. A race loop stops at its exit; its matching stinger plays once before the next world starts. The shared room cutoff overrides the transition. Bundled references to separate main/danger-layer files describe pack variants that are not present in this checkout; runtime uses only the supplied full loops.

The user-supplied **Game Day Universal SFX** pack under `public/assets/audio/sfx/` contains 28 mono, 16-bit PCM WAV effects at 32 kHz. Its README and manifest describe original programmatic 8/16-bit-inspired synthesis. The game plays these files directly for all levels, including the lobby and podium, without theme overrides or runtime synthesis. Existing cues use the corresponding coin pickup, jump, death, respawn, checkpoint, enemy defeat, UI select, countdown tick/go, score popup, and power activation files; claiming a chest power uses `powerup.wav`. Unused pack sounds remain available assets and do not introduce new gameplay mechanics. Music and victory stingers remain as listed above.

## Shared avatar and creature atlas

`public/assets/sprites.png` was created with the built-in imagegen tool, using a transparent background. No external game art or Nintendo assets are used. The final asset is copied into this repository and does not depend on the generation output folder.

The atlas contains 16 sprites. Left to right, top to bottom:

1. Explorer, cat, robot, wizard
2. Slime, crab, imp, bomb
3. Coin, spikes, spring mushroom, chest
4. Bird, fish, skull, flag

The startup loading animation reuses the four first-row avatars from this atlas. Jump motion and the shared circular pixel-card background are rendered in code; no additional artwork is generated or imported.

The generated PNG is 1261×1247. `renderer.js` trims transparent margins within each authored cell at load time. Row boundaries are 0%, 29.2%, 54.5%, 76.5%, and 100%; columns use quarters. Avatar outfit colors are recolored at runtime while retaining the original shading and alpha. Animation comes from movement, flipping, bobbing, particles, and scene animation.

## Final generation prompt

> Use case: stylized-concept. Asset type: actual production sprite atlas for an original cheerful pixel-art platform game for a company game day. Create ONE transparent PNG SPRITE SHEET, a strictly regular FOUR COLUMN by FOUR ROW grid of 16 equal square cells. Each cell contains ONE isolated centered sprite, small and readable, plenty of transparent margin, no overlaps into adjacent cells. Crisp chunky 16-bit pixel art, no antialiasing blur, no text, no labels, no gridlines, no shadows outside sprites. All characters face right. Row 1 left-to-right: friendly adventurer wearing lime green tunic and small backpack; orange cat adventurer in a small scarf; cute silver robot with cyan eyes; tiny purple robed wizard with pointy hat. Row 2: lime-green slime enemy; red crab enemy; mischievous little red winged imp; round black bomb with lit fuse. Row 3: shiny gold coin; three silver ground spikes as one cluster; red capped spring mushroom; closed wooden treasure chest with gold latch. Row 4: small white seabird flying right; small turquoise fish swimming right; white pixel skull; a lime pennant flag on a pole. Production style consistent across every cell, bold clean silhouettes and dark outlines, only a small color palette, hand-placed square pixels. Transparent background is essential. Regular 4 by 4 cell layout is essential. No decorative scene or other sprites.

Environment tiles and scenery are original canvas artwork in `public/game/renderer.js`. The application mark is a small original vector in `public/assets/icon.svg`.

## Authored JSON level assets

The user-supplied `public/assets/sprites/tide/tileset/TroubleTides.json` is registered as race level 2 with the `ocean` audio theme. It references the existing `troubled_tide_1.png`, `Troubled Tides Treasure Chest Atlas.png`, and shared forest `whimsical_forest_props_2.png` atlases through project asset paths. Integration preserves the supplied artwork, cuts, placements and gameplay roles; no new images are generated or substituted. The full editable source remains under `tools/level-editor/levels/TroubleTides.json`.

Prop VFX and localized forest mist are original procedural canvas effects under `public/game/json-level/vfx.js` and `atmosphere.js`. They add no third-party images. Disappearance fragments reuse the authored sprite cut, and checkpoint banner recoloring preserves the source artwork. Fog textures are generated and cached locally at low resolution, drawn with nearest-neighbor scaling; portal colors are configured without per-frame atlas sampling.

The supplied `public/assets/sprites/forest/tileset/WhimsicalForest.json` embeds its atlas images and records the approved cuts, transformations and placements. The live renderer consumes those assets unchanged with nearest-neighbor canvas drawing. Its asset library contains eight atlases, including unused definitions; only authored placements are drawn. No new art is generated or substituted by this integration. Each additional catalog JSON can reference its own atlas images relative to the JSON file or embed them as data URLs. The old supplemental forest sprites remain available for historical fixtures and original shared assets.
