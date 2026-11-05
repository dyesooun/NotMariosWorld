# Level Companion

Run `npm run editor` from the project folder, then open http://127.0.0.1:10001/. This is a local tool; no schema is required and no game files are changed. `EDITOR_PORT` selects another loopback port.

## Image-first workflow

1. Expand **Add a tileset**, choose **Atlas image**, and select Automatic alpha regions or Grid. Set optional pack name, initial level tags, default role, and automatic collision generation.
2. Click **Import tileset**. Detected assets open in a review dialog; the asset drawer remains unchanged until **Done importing**. Closing the review cancels the import.
3. Use **Prev frame**, **Next frame**, the frame list, or the source-frame dropdown to visit assets. Optionally assign names, roles, level tags, and default width/height. These remain editable later.
4. In **Atlas cuts**, drag crop handles or enter exact source-pixel bounds. **Add cut (drag)** repairs missed cuts; unused cuts can be removed. Alpha separation is approximate; opaque images generally need Grid or manual cuts.
5. Switch to Body collision, Damage hitbox, or Interaction trigger. Drag the center/edge handles or draw a box. **Auto geometry** estimates bounds from visible pixels; **Clear box** removes the selected geometry. Rect editing replaces imported polygon geometry for that channel.
6. Choose **Done importing** to add the reviewed assets to the drawer. Use role/search filters and **Level** to find them.

## Characters and state sequences

Expand **Add a character** and choose **Character image**. Optionally attach **Sequence JSON**: existing forest, tide and hell creature manifests are supported. Without JSON, choose Grid (cell dimensions, margin and spacing) or automatic alpha cuts. Grid keeps untrimmed cell dimensions for animation alignment. Review cuts, collision/hitboxes, names, size and level tags before **Done importing**. No schema file is required.

Use **States and sequences** in the import review or from a placed character to edit named states, frame order (including repeated frames), FPS, loop behavior and the definition's default state. Previews play live and can be restarted, including one-shot animations. Characters appear under the **character** drawer filter and can be placed like other assets. Their metadata is included in asset-library and level JSON exports.

The Placement inspector's **Preview state** and **Restart state preview** only affect the editor session. The selected preview state and its clock are never written to placement JSON. The engine owns actual runtime state selection and transitions. Shared state definitions, the default state and sequence timing remain exported metadata.

Optional custom sequence JSON contains a `frames` map with pixel `x,y,w,h` crops and a `characters` array. Each character has `id`, `name`, `animations` (named states containing `frames`, `fps`, `loop`), and optional `defaultAnimation`, `size: {width,height}`, pixel `pivot`, normalized `collider` and `hitbox`. The editor can also author this information visually.

## Core-game roles and tags

Use **Gameplay tags** during import review, **Shared Definition → Gameplay defaults** for an asset, or **Placement → Gameplay tags** for one placed object. Gameplay roles are independent of artwork categories: any art can represent a **Coin**, **Checkpoint**, **Spawn point**, **Exit**, **Power chest**, or **Decoy chest**. Existing files without gameplay metadata retain their prior behavior. Custom tags are searchable labels; typing a role name as a custom tag does not activate it. The drawer has a **Gameplay** role filter, and its search includes custom tags.

Each role has an independent normalized **Gameplay trigger**. **Nonblocking marker** is an explicit setting that makes the marker an interaction volume in playtest while preserving the asset's stored physical geometry. Turn it off when the marker should also retain physical blocking. Foot anchors use fractions of placement width and height; `[0.5, 1]` is bottom-center. They follow rotation/flip and specify where the player's feet should respawn.

- **Coin:** **Coin units** controls its collection value (default 1). Each placed coin collects once and hides. Death restores checkpoint-protected coins and collection IDs; gains after the checkpoint reappear. Before the first checkpoint, death restores the initial coin state.
- **Checkpoint:** explicit **Checkpoint order**, or leave it blank for deterministic order by authored X position. Checkpoints advance monotonically, save collection/progress and their foot anchor, and remain reached after death. A gold marker indicates reached checkpoints in playtest.
- **Spawn point:** Select any placed asset and click **Placement → Gameplay tags → Use as level spawn**, or change its **Gameplay role** to **Spawn point**. The chosen placement is saved as the level start and marked **Level spawn** in the object list. Choose another asset to switch the start. Moving/resizing it or editing its foot anchor updates the start automatically. **Playtest** uses this asset before legacy coordinate spawns; explicit viewer-session overrides still win. Without a chosen placement, **Spawn priority** selects among tagged markers, with placement order breaking ties, then `world.spawn` or safe geometry provides a fallback. Place the foot anchor on supported safe ground.
- **Exit:** touching the trigger emits one completion event and holds the player safely. **Target level ID** is exported for future core-game integration; the local viewer does not automatically load another level.
- **Power chest:** typed enter/leave contacts carry a stable chest ID; rewards and inventory remain coordinator-controlled.
- **Decoy chest:** **Decoy trap** selects spikes or bomb. Contact triggers a lethal decoy event in playtest. A placement can supply **Chest ID override**; otherwise its stable placement ID identifies that chest.

Shared defaults and placement overrides are exported as optional `gameplay` objects. Fields include `role`, `tags`, `triggerVolume`, `nonblocking`, `coinValue`, `order`, `anchor`, `priority`, `targetLevelId`, `chestId`, and `decoyKind`. Shared and placement custom tags are combined; other placement fields override shared defaults. Gameplay metadata is saved with asset libraries and level JSON without requiring a generator schema. The existing multiplayer game remains independent of the local playtest.

## Shared metadata and storage

Cut and collision/hitbox corrections apply to every placement using the shared asset definition. Crop changes preserve logical collision until it is explicitly regenerated or edited. Placement position, size and rotation remain independent.

Metadata and drafts are stored inside the tool using IndexedDB, including imported raster images. Large images do not rely on the small localStorage quota. **Save metadata** exports a reusable asset library without level placements; **Load metadata** merges matching asset/definition IDs and updates their placed instances. **Export JSON** and **Import JSON** save/reopen complete levels. Export important work as a backup; localhost and 127.0.0.1 have separate browser databases.

Select a drawer asset and use **Delete selected asset**, or **Delete asset** in Shared Definition, to remove its reusable definition and every placed instance. Other characters sharing that atlas remain. The atlas is removed from tool storage once no definitions use it. Support links to removed platforms are cleared. **Undo** restores the asset and its placements; source images on disk are untouched. **Delete placement** removes only that instance.

The timing update clears the previous tool library and its placements once on first load, as requested. The drawer starts empty and contains only assets imported afterward; future reloads preserve those new imports. Source images on disk are untouched. Nothing writes asset metadata into the game directories.

## Placing and transforming

Choose an asset, then click the level canvas. The tool immediately switches to **Select**. Drag its center handle to move, edge/corner handles to resize, and the orange handle to rotate around its center. Shift locks corner aspect ratio or snaps rotation to 15 degrees. Artwork, collision overlays and hit testing share the same rotation/flip transform. Numeric controls remain available.

Select several objects with **Ctrl/Cmd-click** on the canvas or object list, drag a box over empty canvas space, or use **Select all** (Ctrl/Cmd+A). Ctrl/Cmd-drag on empty space adds a box selection. **Clear selection** deselects everything. A shared blue box surrounds the selection. Drag any selected object or the center handle to move the group; corner/edge handles uniformly scale sizes and spacing; the orange handle rotates every object around the group center. Shift snaps rotation to 15 degrees. Group scaling preserves proportions.

**Flip horizontal** and **Flip vertical** reflect the selection's positions and orientations around its center, including collision and trigger geometry. The group inspector also accepts movement deltas, a scale percentage, and a rotation angle. Each drag or numeric operation is one Undo step. Group transforms update ordinary placement fields in JSON; grouping is an editor selection, with no new asset definitions or engine state.

Pan with the Pan tool, middle mouse, Space-drag or Shift-drag. The wheel zooms; Start restores the initial view and Fit shows the level. Snap defaults to 5 pixels and controls movement deltas. Ctrl+D duplicates the selected placements together, preserving support links between the copies. Delete removes the selected placements; Ctrl+Z/Ctrl+Y undo/redo. Pointer cancellation or Escape restores an interrupted drag.

Preview runs live automatically. Use Pause/Resume or the optional slider to inspect a moment. Dragging handles temporarily freezes the clock and resumes on release. Reset restarts the shared clock and restores triggered platforms. Preview does not modify saved base positions.

Every placed asset has a **Movable** checkbox under Placement behavior: props, backgrounds, chests, characters, enemies, beams and platforms all support it. Set the movement axis, travel distance, full cycle duration and movement offset. Motion runs independently of beam timing, character state previews and platform vanishing. Disabling Movable stops that placement's motion while preserving those other behaviors.

Platforms can vanish after a trigger independently of movement. Enable **Vanish after trigger entry**, enter a countdown in seconds, then use **Edit trigger handles** to move/resize the blue volume or enter its local pixel coordinates. The volume follows movement, rotation, flip and size. **After vanishing** selects **Restore on respawn**, **Restore after delay** (set **Restore delay seconds**), or **Gone until Restart**. Existing files default to restoring on respawn. Timed platforms return automatically, then require leaving and re-entering the trigger before another countdown starts. Temporary platforms also reset on player respawn; permanent removal survives player deaths for that playtest run. **Restart**, loading another level, or the editor's **Reset** restores every platform.

**Simulate trigger entry** previews the countdown and timed restoration in the editor; selected hidden platforms remain faint editing ghosts. **Playtest** detects actual player entry and removes both the artwork and collision when a platform vanishes.

Beams expose **Start time seconds** (initial delay), **ON duration seconds**, **OFF duration seconds**, **Time offset seconds** (cycle phase), and initial cycle state. The beam remains off before the start time. Afterward, its cycle uses elapsed time minus start time plus offset. A distinct OFF frame is shown when configured; a single-frame beam is hidden while off.

Timing and trigger settings are per placement and exported in JSON. Trigger simulation timestamps are temporary and never saved. Enemy animation selection, support links and layering remain available.

Autosave shows **Saving…** while writes are queued, then **Saved in this tool** after the latest project and library reach IndexedDB. Let that indicator finish before reloading.

## Playable JSON level runner

Open **JSON runner** in the companion toolbar, or visit `http://127.0.0.1:10001/viewer.html`. **Load forest test** opens the supplied `public/assets/sprites/forest/tileset/WhimsicalForest.json`. **Open JSON** accepts another exported level, and **Load URL** accepts a JSON path served by the same local server. **Playtest** in the companion opens a snapshot of the current draft after saving it. Playing never edits the source JSON, asset library or level placements.

Move with **A/D** or arrow keys; jump with **Space/W/Up** and release before jumping again. **R** or **Restart** resets the simulation. The viewer supports authored solid/hazard/interaction shapes, rotations/flips, concave polygons, movement on any asset, moving-solid riders, timed beams, trigger-entry vanishing, animation sequences, fall/hazard deaths and three-second respawns. Motion, beam, temporary trigger and character-state cycles reset on respawn; permanently vanished platforms stay removed until Restart. Geometry uses the same normalized shapes and placement transforms as the editor, including explicit empty shapes. Assets with the Platform role use one-way collision in playtest: jump through from below and land on top while descending. Moving and vanishing platforms use the same rule. Other solid asset roles retain wall and ceiling collision.

Use **Collision overlays** to inspect the geometry, **Follow player** for play, **Fit level** for the whole scene, or drag/wheel to inspect freely. Clicking the canvas keeps automatic follow active. Movement/jump keys resume follow after inspecting; the camera scrolls when the player approaches a viewport edge, within the world bounds. Restart also restores follow. Optional `world.spawnPlacementId` selects a placed spawn-point asset; its transformed foot anchor supplies the start position. Tagged spawn points take precedence over legacy `world.spawn: {x,y}` coordinates. Without any authored spawn, the runtime finds supported space clear of authored hazards and reports that inference. Spawn controls override it for the viewer session without rewriting the file.

The renderer is level/biome agnostic. The forest test path belongs only to the viewer's sample-loading control; `LevelRenderer` and `LevelRuntime` accept any valid document. `LevelRuntime.setEntityState(placementId, stateName)` lets an engine select and restart a character sequence. The viewer does not invent AI transitions or multiplayer powers: authored interactions emit enter/leave contact events for the engine/coordinator. Core-game interactions are enabled only by explicit gameplay roles, and are never inferred from artwork names, custom tags or biome.

Reusable modules are `level-runtime.js` (fixed-step simulation/contact events), `runtime-geometry.js` (transformed shapes and collision), and `level-renderer.js` (canvas drawing/camera). `getStates()` returns evaluated placements for rendering; temporary trigger and character-state data live in runtime state. Existing game courses, multiplayer and scoring remain independent of this viewer.

## Output contract

Level JSON uses `not-marios-world-level`, version 2, with separate `assets`, reusable `definitions`, and `placements`. Version 1 files migrate with rotation initialized to zero, preserving IDs, dimensions and settings. Coordinates are logical pixels; rotations are degrees. Atlas cuts are source pixels; definition physics uses normalized geometry. `behavior.vanish` (or `placement.settings.vanish`) contains `triggerVolume: [x,y,width,height]` normalized to placement size and `countdownMs`. Beam timing uses `startMs`, `onMs`, `offMs`, `phaseMs` and `startState`; older files without `startMs` start immediately.

Reusable metadata uses `level-editor-asset-library`, version 1, containing assets/images and definitions without world placements. These are private tool save formats, not schemas required from an image generator.

Independent motion is `behavior.motion` or `placement.settings.motion`, with `axis`, `distance`, `periodMs` and `phaseMs`. Explicit `null` disables it. Older `type: "moving"` behavior remains supported when no independent motion override is present.

Vanishing metadata optionally adds `restoreMode: "respawn" | "timed" | "permanent"` and `restoreMs` (required and positive for timed restoration). Omitted `restoreMode` preserves the legacy respawn behavior. These settings are exported; trigger timestamps and permanent-removal tracking stay in the playtest runtime.

Run `npm run test:editor` for the companion checks.
