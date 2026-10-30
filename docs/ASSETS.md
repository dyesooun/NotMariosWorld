# Original game assets

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

The forest music, **Mosslight Mountain**, is an original score synthesized in `public/game/audio.js`: a 32-beat melody, plucked square-wave arpeggios, triangle bass, and quiet bell overtones. No sampled soundtrack is required.

## Shared avatar and creature atlas

`public/assets/sprites.png` was created with the built-in imagegen tool, using a transparent background. No external game art or Nintendo assets are used. The final asset is copied into this repository and does not depend on the generation output folder.

The atlas contains 16 sprites. Left to right, top to bottom:

1. Explorer, cat, robot, wizard
2. Slime, crab, imp, bomb
3. Coin, spikes, spring mushroom, chest
4. Bird, fish, skull, flag

The generated PNG is 1261×1247. `renderer.js` trims transparent margins within each authored cell at load time. Row boundaries are 0%, 29.2%, 54.5%, 76.5%, and 100%; columns use quarters. Avatar outfit colors are recolored at runtime while retaining the original shading and alpha. Animation comes from movement, flipping, bobbing, particles, and scene animation.

## Final generation prompt

> Use case: stylized-concept. Asset type: actual production sprite atlas for an original cheerful pixel-art platform game for a company game day. Create ONE transparent PNG SPRITE SHEET, a strictly regular FOUR COLUMN by FOUR ROW grid of 16 equal square cells. Each cell contains ONE isolated centered sprite, small and readable, plenty of transparent margin, no overlaps into adjacent cells. Crisp chunky 16-bit pixel art, no antialiasing blur, no text, no labels, no gridlines, no shadows outside sprites. All characters face right. Row 1 left-to-right: friendly adventurer wearing lime green tunic and small backpack; orange cat adventurer in a small scarf; cute silver robot with cyan eyes; tiny purple robed wizard with pointy hat. Row 2: lime-green slime enemy; red crab enemy; mischievous little red winged imp; round black bomb with lit fuse. Row 3: shiny gold coin; three silver ground spikes as one cluster; red capped spring mushroom; closed wooden treasure chest with gold latch. Row 4: small white seabird flying right; small turquoise fish swimming right; white pixel skull; a lime pennant flag on a pole. Production style consistent across every cell, bold clean silhouettes and dark outlines, only a small color palette, hand-placed square pixels. Transparent background is essential. Regular 4 by 4 cell layout is essential. No decorative scene or other sprites.

Environment tiles and scenery are original canvas artwork in `public/game/renderer.js`. The application mark is a small original vector in `public/assets/icon.svg`.
