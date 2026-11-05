# Local level companion

Run from the repository root with Node.js 22 or later:

```sh
npm run editor
```

Open **http://127.0.0.1:10001/**. `EDITOR_PORT` selects a different port. This read-only HTTP server binds to `127.0.0.1`; it runs independently of the game server. No build step, account, external service, or extra dependency is needed.

The initial document is a blank **14200 × 600** forest level. The bundled forest tileset and creature atlases are loaded without modifying their source files. Existing forest tileset metadata uses an explicit legacy adapter; its missing geometry and beam alignments are marked as estimates. Future tilesets must follow [`public/assets/sprites/schema.json`](../../public/assets/sprites/schema.json).

## Authoring

- Search/filter the palette, choose an asset, then click the canvas to place it.
- Use **Select** to drag objects. Edit exact position, dimensions, facing, and layer in **Placement**. Higher layers draw later; backgrounds default to layer -20.
- Press Enter or leave a field to apply its value. Invalid values are rejected while preserving the previous valid document.
- Use **Pan**, middle-drag, Shift-drag, or Space-drag to move the camera. The mouse wheel zooms around the pointer; Shift-wheel pans horizontally. **Start** restores the starting view; **Fit** shows the full level.
- **Snap** controls the placement/drag grid. Set it to 1 for individual pixels. **Grid** toggles its display.
- Change **Platform motion** to **Moving** for axis, travel amplitude, cycle duration, and phase. Travel is sinusoidal around the saved base position. Timing fields use milliseconds.
- Beam placements expose independent ON/OFF durations, phase, and initial state. Their appearance and dangerous overlay use the same preview state.
- Enemy and projectile placements expose their supplied animation sequences. Enemy support-platform links and behavior parameters are exported for later integration.
- **Preview**, **Reset**, and the timeline control animation and timer previews. Preview never modifies saved placement coordinates and does not simulate gameplay, attacks, gravity, or a playable character.
- Use the object list to select overlapping objects. Double-click an entry to center the camera. Duplicate/Delete controls and Ctrl+D/Delete shortcuts are available. Ctrl+Z/Ctrl+Y undo/redo document edits.

## Reusable interpretations

**Shared Definition** edits the selected asset type, including before any placement exists. It shows how many placements reference it. Names, visual mappings, default sizes, physics, and behavior defaults belong here. Instance positions, sizes, facing, layers, and timing overrides belong in **Placement**.

Changing a visual source preserves existing placement IDs, transforms, and collision geometry. Shared art offsets/scales align replacement artwork independently of collision. Default-size edits affect new placements; existing sizes remain explicit. Selecting a static frame replaces that definition's animation mapping; advanced visual JSON supports rebinding complete sequences and event metadata.

Collision geometry is assigned automatically from manifest measurements where available. Unknown geometry receives editable defaults marked **estimated**. Confirmed empty shape arrays remain empty. Creature hitboxes are estimates from the supplied creature manifest, not measured guarantees.

**Colliders** draws solid geometry in green, interaction regions in blue, danger in red, and walking surfaces in yellow. Body/damage rectangle fields use normalized `[x,y,width,height]` fractions of placement size. Editing a rectangle replaces its imported shape collection. Advanced physics JSON supports normalized polygons and walking surfaces.

## Files and schema imports

**Export JSON** downloads the level document. **Import JSON** validates the document and its images before replacing the current draft. Browser autosave is best-effort and belongs to the current origin; `localhost` and `127.0.0.1` have separate drafts. Export important work. Large embedded images may exceed browser autosave capacity; export remains available.

Choose **Manifest JSON** and **Atlas image**, then click **Import tileset**. The importer checks the repository schema, crop bounds, geometry, grid extents, referenced frames, and beam pair states. It also checks actual image dimensions. Invalid imports leave the project unchanged. Custom raster images are embedded as data URLs in exported JSON so they can be reopened locally. Bundled forest images retain their repository-local URLs.

The small schema evaluator supports the validation keywords used by the packaged schema and rejects unsupported future keywords. It is not a general JSON Schema implementation. Visual seams, alpha quality, and physical accuracy still require artwork review.

## Level JSON contract

The exported document uses `format: "not-marios-world-level"` and `version: 1`:

| Section | Responsibility |
| --- | --- |
| `world` | Logical width, height, background color; origin upper-left, X right, Y down |
| `assets` | Atlas source, dimensions, exact source-pixel crops, retained source manifests/metadata |
| `definitions` | Stable reusable IDs, visual frame/animation references, default logical size, normalized physics and behavior defaults |
| `placements` | Stable instance IDs, `definitionId`, logical `x/y/width/height`, numeric layer, facing, optional preview animation, and behavior overrides |

The generic tileset schema describes source assets; it is separate from this level-document format. Source image pixels are converted into normalized reusable geometry during catalog construction. The future renderer should resolve each placement's definition, merge its behavior overrides, and then apply the placement transform. No source geometry is re-inferred during export.

Original source metadata, including terrain joins and beam cap/core regions, remains available for later renderer work. The editor currently scales complete terrain/beam frames rather than constructing seamless terrain strips or variable-height segmented beams. ON/OFF alignment offsets are applied in preview. Game integration, route reachability checks, attack simulation, and changing the live race layouts are outside this companion implementation.

## Checks

```sh
npm run test:editor
```

These checks cover schema/catalog ingestion, the bundled forest contract, normalization and estimates, document round trips, definition independence, history, preview timing, and the separate local HTTP server.
