# Original game assets

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
