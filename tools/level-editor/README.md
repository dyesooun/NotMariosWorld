# Level Companion

Run `npm run editor` from the project folder, then open http://127.0.0.1:10001/. This is a local tool; no schema is required and no game files are changed. `EDITOR_PORT` selects another loopback port.

## Enemy detection ranges

The editor's **Ranges** toolbar toggle is enabled by default. Select one or more enemy placements to show their world-aligned detection rectangles; when an asset is selected without placement selection, all instances of that definition are shown. The overlay uses each placement's resolved detection range, the runtime's player-feet ±140 px gate, and labels creature ranges as requiring the same supporting platform. It is editor-only and never changes exported level data or live gameplay.

## Image-first workflow

1. Expand **Add a tileset**, choose **Atlas image**, and select Automatic alpha regions or Grid. Set optional pack name, initial level tags, default role, and automatic collision generation.
2. Click **Import tileset**. Detected assets open in a review dialog; the asset drawer remains unchanged until **Done importing**. Closing the review cancels the import.
3. Use **Prev frame**, **Next frame**, the frame list, or the source-frame dropdown to visit assets. Optionally assign names, roles, level tags, and default width/height. These remain editable later.
4. In **Atlas cuts**, drag crop handles or enter exact source-pixel bounds. **Add cut (drag)** repairs missed cuts; unused cuts can be removed. Alpha separation is approximate; opaque images generally need Grid or manual cuts.
5. Switch to Body collision, Damage hitbox, or Interaction trigger. Drag the center/edge handles or draw a box. **Auto geometry** estimates bounds from visible pixels; **Clear box** removes the selected geometry. Rect editing replaces imported polygon geometry for that channel.
6. Choose **Done importing** to add the reviewed assets to the drawer. Use role/search filters and **Level** to find them.

## Replacing an atlas image

Open **Asset metadata** and select the existing **Atlas**. Choose a **Replacement image**, select how to handle its cuts, then click **Replace atlas image**. This replaces the shared image in the editor's saved project; it does not overwrite a PNG on disk or modify a production level JSON.

- **Keep cut pixel coordinates** preserves each existing crop rectangle exactly. Use this for artwork revised on the same canvas/layout. A different image size is allowed when every existing cut still fits; otherwise replacement is rejected without changing your project.
- **Scale cuts to image size** keeps the same relative cut layout when an atlas has been resized. Source crop coordinates scale to the new image dimensions. Use this only when the tile arrangement is still the same; otherwise adjust the crops manually afterward.

Both options retain the atlas/frame/definition identities, animation references, authored collision and hitboxes, gameplay settings, and every placement's world position, size, rotation, flips and behavior. Source-image measurements are marked unresolved after replacement; your authored logical collision outlines are retained. All placements sharing that atlas show the new art. Review **Atlas cuts**, **Body collision**, and **Damage hitbox** afterward as needed. Moving a cut changes which pixels are drawn; it does not move the placed object.

The replacement is one **Undo** step, and **Redo** restores it. Imported images are embedded in the tool's IndexedDB data and JSON exports, so the replacement PNG's filename may differ from the old one. Export the level JSON to keep a backup or update a live catalog level. Importing the new image through **Add a tileset** creates another atlas instead of replacing the existing one.

## Characters and state sequences

Expand **Add a character** and choose **Character image**. Optionally attach **Sequence JSON**: existing forest, tide and hell creature manifests are supported. Without JSON, choose Grid (cell dimensions, margin and spacing) or automatic alpha cuts. Grid keeps untrimmed cell dimensions for animation alignment. Review cuts, collision/hitboxes, names, size and level tags before **Done importing**. No schema file is required.

Use **States and sequences** in the import review or from a placed character to edit named states, frame order (including repeated frames), FPS, loop behavior and the definition's default state. Previews play live and can be restarted, including one-shot animations. Characters appear under the **character** drawer filter and can be placed like other assets. Their metadata is included in asset-library and level JSON exports.

The Placement inspector's **Preview state** and **Restart state preview** only affect the editor session. The selected preview state and its clock are never written to placement JSON. The engine owns actual runtime state selection and transitions. Shared state definitions, the default state and sequence timing remain exported metadata.

Optional custom sequence JSON contains a `frames` map with pixel `x,y,w,h` crops and a `characters` array. Each character has `id`, `name`, `animations` (named states containing `frames`, `fps`, `loop`), and optional `defaultAnimation`, `size: {width,height}`, pixel `pivot`, normalized `collider` and `hitbox`. The editor can also author this information visually.

## Creature, shooter and projectile behavior

Character atlases can include both `enemies`/`characters` and a separate `projectiles` list. Import allocates stable definitions and links a shooter's `projectile_id` to its projectile asset. All animation frames and authored sequence names are retained.

Select the asset, open **Shared Definition → Runtime behavior**, and configure its actor type and animation mappings. Use **States and sequences** to edit the frames, speed and loop flag of each animation:

| Actor type | Functional animation slots |
| --- | --- |
| Creature | Idle, Moving, Player detected, optional Attack, Dead |
| Shooter | Idle, Shooting, Player detected, Dead |
| Projectile | Flight and optional Impact |

Map each slot to an existing sequence. Import recognizes common names such as `run`/`walk` for Moving, `fire` for Shooting, and `death` for Dead. Missing artwork remains **Not assigned**; the tool does not generate frames or run unrelated attack/hurt abilities from an atlas. A missing detected animation uses the normal action without an extra cue; a missing death animation removes the defeated actor immediately.

For ground creatures, use **Pick support platforms** in the Placement inspector, then click the platform tiles on the level to add/remove them while keeping the creature selected. Selected supports are highlighted. Finish with **Done** or **Escape**; remove individual entries or return to automatic support inference from the inspector. Assign adjoining tiles to let the creature span their seams and patrol the chain. Only the connected, visible support run is used: gaps over 8 pixels or height changes over 8 pixels split a chain, and moving/vanishing platforms can disconnect it. Chasing requires the player to stand on that same connected support chain. Old single-platform exports remain supported. Picker mode is temporary; support assignments participate in undo/autosave/export. Authored placement motion remains independent. Stationary shooters face and aim toward eligible nearby players. Non-damaging Player detected artwork plays once before chasing/shooting and replays after detection is lost and acquired again.

Enable **Flying creature** in shared runtime behavior, or on an individual placement, for flying actors such as owls. They remain alive and visible and keep their last connected patrol path/altitude when their current support platform vanishes. This setting is separate from **Uses gravity**; gravity being disabled does not automatically make an actor a flying creature. Existing detection, melee and stomp rules still apply, and restarting clears the cached patrol path.

To configure melee, select an **Attack animation** in **Shared Definition → Runtime behavior**. Set **Attack range** (horizontal body-edge gap; default 64 pixels) and **Attack cooldown** (default 1500 milliseconds after a completed attack); placements can override these values. The creature faces the player and pauses movement while playing its attack once, then resumes and attacks again after the cooldown while the player remains detected and close enough. Older files can reuse Player detected as the attack only when that sequence already has explicit damage frames; this fallback attacks at close range instead of swinging on distant detection.

Open **States and sequences**, choose the attack sequence, and enable **Damage active** on the ordered frames that should hurt the player. Draw the attack region under **Asset metadata → Edit mode → Damage hitbox**. The editor stores the active frames as zero-based `damage_active_indices`; reordering or removing frames remaps them, and clearing every checkbox stores an explicit harmless `[]`. **Lethal attacks** enables/disables melee damage; authoring a damage rectangle or enabling a damage frame enables it. Damage still requires both explicit active frames and an authored hitbox or hazard shapes, and missing configuration is reported in the inspector. Body contact remains harmless. Export/replace the configured level JSON, restart the game server and refresh player tabs to publish changes to the live race.

For a shooter, select its **Projectile asset** and **Fire on frame** in its shooting sequence. The UI uses frame numbers starting at 1; exported `spawn_projectile_at_index` starts at 0. The projectile spawns once when that frame is reached, including when a simulation update advances over it. Spawn offsets are measured relative to the actor's visual pivot and follow its orientation. Projectile flight and optional impact animation play independently of the shooter. The existing default tuning remains 120 pixels/second, a 16×16 collision body, a 4.8-second firing interval and a 3-second lifetime.

The JSON runner and live game choose actor states automatically. Touching creature bodies is harmless; projectile hits and active authored melee hits kill instantly, with no health system. Melee uses the currently mapped sequence's explicit `damage_active_indices` and authored hazard shapes/hitbox; missing or empty damage windows cause no damage. Attack artwork outside the mapped sequences does not run automatically. Stomping from above still defeats creatures and bounces the player, using the body collider independently of melee timing. Dead actors stop dealing attack damage, play their death sequence once and disappear. Player respawn/restart restores actor cycles and clears fired projectiles. Choosing **Preview state** in the editor only changes the editing preview, and does not save a runtime state into a placement.

Shooters without an assigned spawn offset use the forward edge at half their visual height. The spawn offset fields show this effective default (usually X `0.5`, Y `-0.5` for a bottom-center pivot). Explicit offsets remain relative to the pivot; `0, 0` places the shot at the pivot and can overlap supporting terrain. Adjust the offsets to match the artwork's mouth or weapon.

Select a shooter placement, or its asset in the drawer, to see the cyan **Projectile spawn** crosshair on the canvas. A dotted line connects its visual pivot to the spawn point. Editing **Projectile spawn offset X/Y** moves the marker, following flips, rotations, size and preview movement with the same calculation as the game. The marker remains visible with **Ranges** off and is never exported or drawn during gameplay.

Shooters aim at the player's head position when the projectile is fired. Shots then travel straight along that direction; the muzzle offsets control where they start.

## Core-game roles and tags

Use **Gameplay tags** during import review, **Shared Definition → Gameplay defaults** for an asset, or **Placement → Gameplay tags** for one placed object. Gameplay roles are independent of artwork categories: any art can represent a **Coin**, **Checkpoint**, **Spawn point**, **Exit**, **Power chest**, or **Decoy chest**. Existing files without gameplay metadata retain their prior behavior. Custom tags are searchable labels; typing a role name as a custom tag does not activate it. The drawer has a **Gameplay** role filter, and its search includes custom tags.

Each role has an independent normalized **Gameplay trigger**. **Nonblocking marker** is an explicit setting that makes the marker an interaction volume in playtest while preserving the asset's stored physical geometry. Turn it off when the marker should also retain physical blocking. Foot anchors use fractions of placement width and height; spawn points and checkpoints default to `[0.5, 0.5]`, placing the player's feet at the banner's midpoint before landing. They follow rotation/flip. Explicit custom anchors are preserved; for an older draft with a bottom anchor, set **Foot anchor Y** to `0.5` to use the midpoint.

- **Coin:** **Coin units** controls its collection value (default 1). Each placed coin collects once and hides. Collected coins and their points survive every death, including before the first checkpoint. Coins stay hidden until Restart or a new run; their collection burst does not replay on respawn.
- **Checkpoint:** explicit **Checkpoint order**, or leave it blank for deterministic order by authored X position. Checkpoints advance monotonically, save collection/progress and their foot anchor, and remain reached after death. A gold marker indicates reached checkpoints in playtest.
- **Spawn point:** Select any placed asset and click **Placement → Gameplay tags → Use as level spawn**, or change its **Gameplay role** to **Spawn point**. The chosen placement is saved as the level start and marked **Level spawn** in the object list. Choose another asset to switch the start. Moving/resizing it or editing its foot anchor updates the start automatically. **Playtest** uses this asset before legacy coordinate spawns; explicit viewer-session overrides still win. Without a chosen placement, **Spawn priority** selects among tagged markers, with placement order breaking ties, then `world.spawn` or safe geometry provides a fallback. Place the foot anchor on supported safe ground.
- **Exit:** touching the trigger emits one completion event and holds the player safely. **Target level ID** is exported for future core-game integration; the local viewer does not automatically load another level.
- **Power chest:** typed enter/leave contacts carry a stable chest ID; rewards and inventory remain coordinator-controlled.
- **Decoy chest:** **Decoy trap** selects spikes or bomb. Contact triggers a lethal decoy event in playtest. A placement can supply **Chest ID override**; otherwise its stable placement ID identifies that chest.

Shared defaults and placement overrides are exported as optional `gameplay` objects. Fields include `role`, `tags`, `triggerVolume`, `nonblocking`, `coinValue`, `order`, `anchor`, `priority`, `targetLevelId`, `chestId`, and `decoyKind`. Shared and placement custom tags are combined; other placement fields override shared defaults. Gameplay metadata is saved with asset libraries and level JSON without requiring a generator schema. The live game now consumes configured level JSON through the same generic runtime; chest rewards and inventory remain owned by the multiplayer coordinator.

## Shared metadata and storage

Cut and collision/hitbox corrections apply to every placement using the shared asset definition. Crop changes preserve logical collision until it is explicitly regenerated or edited. Placement position, size and rotation remain independent.

Metadata and drafts are stored inside the tool using IndexedDB, including imported raster images. Large images do not rely on the small localStorage quota. **Save metadata** exports a reusable asset library without level placements; **Load metadata** merges matching asset/definition IDs and updates their placed instances. **Export JSON** and **Import JSON** save/reopen complete levels. Export important work as a backup; localhost and 127.0.0.1 have separate browser databases.

The asset drawer retains all imported assets when you open a different level, create a new level or reload the editor. Opening a level replaces the world and placements and defaults the Level filter to **All levels**; other library assets remain available to place. The opened level's metadata takes precedence for matching asset/definition IDs. Incompatible shared references reject the open without changing your current draft. Search and the optional role/tag filters still let you narrow the library manually.

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

**Simulate trigger entry** previews the countdown and timed restoration in the editor; selected hidden platforms remain faint editing ghosts. **Playtest** detects actual player entry and removes both the artwork and collision when a platform vanishes. Platforms blink increasingly quickly during the countdown. Timed platforms disappear with a pixel poof; platforms restored on player death break apart. New vanishing behaviors default to a three-second warning; existing authored countdowns are retained. Collision remains active until the countdown ends.

Beams expose **Start time seconds** (initial delay), **ON duration seconds**, **OFF duration seconds**, **Time offset seconds** (cycle phase), and initial cycle state. The beam remains off before the start time. Afterward, its cycle uses elapsed time minus start time plus offset. A distinct OFF frame is shown when configured; a single-frame beam is hidden while off.

Timing and trigger settings are per placement and exported in JSON. Trigger simulation timestamps are temporary and never saved. Enemy animation selection, support links and layering remain available.

### Prop VFX and atmosphere

**Prop VFX defaults** in Shared Definition and **Prop VFX** in Placement control cosmetic effects shared with the JSON runner and live game. Effects are automatic by default and can be enabled/disabled per asset or placement. Coins shimmer and burst on collection. Checkpoint banners have subtle blue beams and become gold when reached; reached colors survive death. Moving platforms shed small motes. Active beams glow/spark, while inactive beams suppress their effects. Choose **Hazard VFX type** for mushroom spores, thorn motes, spike glints, or generic danger particles; Automatic uses the name and tags when they are descriptive. This categorization does not change the hitbox or lethal behavior.

Moving and vanishing platforms get floating motes automatically. Set **Prop effects → Enabled** to add these motes to a stationary floating platform as well.

Effect visibility is tuned about 60% stronger than the initial pass, with brighter particles/glows, larger bursts and clearer warning blinks. Automatic forest mist defaults to 24% opacity; custom mist opacity stays at its authored value. Gameplay timing and restoration behavior are unchanged.

Fog cards render over all authored background/prop layers and below the player and UI. Their soft texture has a fuller core to remain visible against pale forest artwork; card boundaries still fade to transparent. Changing an asset's layer cannot put it in front of the fog pass.

For beams and assets with the Exit gameplay role, set **Glow color source → Custom color**, then choose **Beam glow color** or **Exit portal glow color**. This uses a configured color rather than sampling the atlas every frame. Shared defaults are stored in `definition.vfx`; placement overrides in `placement.vfx`. Save metadata retains asset defaults; Export JSON also retains placement overrides.

The **Atmosphere** inspector tab configures localized drifting fog cards. Automatic gives forest-biome documents sparse mist pockets, leaving clear space between them. Choose Custom fog cards to tune **Mist color**, **Mist opacity percent**, and individual cards' X/Y, width/height, drift amplitude and speed. **Add fog card at view center** places a card in the current viewport; **Use sparse forest pockets** supplies a starting arrangement. Clear fog cards keeps an explicitly empty list, and Off disables mist. Cards use logical world coordinates and have no collision. Changes are Undo-backed and exported as `world.atmosphere`; draft edits never replace production JSON automatically.

Autosave shows **Saving…** while writes are queued, then **Saved in this tool** after the latest project and library reach IndexedDB. Let that indicator finish before reloading.

## Playable JSON level runner

Open **JSON runner** in the companion toolbar, or visit `http://127.0.0.1:10001/viewer.html`. **Load forest test** opens the supplied `public/assets/sprites/forest/tileset/WhimsicalForest.json`. **Open JSON** accepts another exported level, and **Load URL** accepts a JSON path served by the same local server. **Playtest** in the companion opens a snapshot of the current draft after saving it. Playing never edits the source JSON, asset library or level placements.

Move with **A/D** or arrow keys; jump with **Space/W/Up** and release before jumping again. **R** or **Restart** resets the simulation. The viewer supports authored solid/hazard/interaction shapes, rotations/flips, concave polygons, movement on any asset, moving-solid riders, timed beams, trigger-entry vanishing, animation sequences, fall/hazard deaths and three-second respawns. Motion, beam, temporary trigger and character-state cycles reset on respawn; permanently vanished platforms stay removed until Restart. Geometry uses the same normalized shapes and placement transforms as the editor, including explicit empty shapes. Assets with the Platform role use one-way collision in playtest: jump through from below and land on top while descending. Moving and vanishing platforms use the same rule. Other solid asset roles retain wall and ceiling collision.

Enable **God mode** in the playtest toolbar to ignore hazards, beams, decoy traps, melee attacks and projectiles. Falling below the world returns you immediately to the latest checkpoint or spawn without adding a death or rolling back collected coins/progress. Enabling it during a respawn countdown returns you to play immediately. It defaults to off on page load, stays selected through Restart and loading levels in the same tab, and can be turned off to restore normal deaths. This is a viewer-only setting; it is never exported or applied to live races.

Use **Collision overlays** to inspect the geometry, **Follow player** for play, **Fit level** for the whole scene, or drag/wheel to inspect freely. Clicking the canvas keeps automatic follow active. Movement/jump keys resume follow after inspecting; the camera scrolls when the player approaches a viewport edge, within the world bounds. Restart also restores follow. Optional `world.spawnPlacementId` selects a placed spawn-point asset; its transformed foot anchor supplies the start position. Tagged spawn points take precedence over legacy `world.spawn: {x,y}` coordinates. Without any authored spawn, the runtime finds supported space clear of authored hazards and reports that inference. Spawn controls override it for the viewer session without rewriting the file.

The renderer is level/biome agnostic. The editor modules reexport the shared implementation under `public/game/json-level/`, also used by the live game. Export and replace a JSON listed in `public/game/level-catalog.json` to publish an authored course after restarting the server and refreshing tabs. The forest test path belongs only to the viewer's sample-loading control; `LevelRenderer` and `LevelRuntime` accept any valid document. `LevelRuntime.setEntityState(placementId, stateName)` lets an engine select and restart a character sequence. The viewer automatically runs the four mapped creature/shooter states and separate projectile sequences. Multiplayer powers remain coordinator-owned; authored interactions emit enter/leave contact events. Core-game interactions are enabled only by explicit gameplay roles, and are never inferred from artwork names, custom tags or biome.

Reusable modules are `level-runtime.js` (fixed-step simulation/contact events), `runtime-geometry.js` (transformed shapes and collision), and `level-renderer.js` (canvas drawing/camera). `getStates()` returns evaluated placements for rendering; temporary trigger and character-state data live in runtime state. The live game uses these shared modules for catalog JSON courses and adds its existing score/report/power coordinator bridge. Playing in the viewer remains an independent local session.

## Output contract

Level JSON uses `not-marios-world-level`, version 2, with separate `assets`, reusable `definitions`, and `placements`. Version 1 files migrate with rotation initialized to zero, preserving IDs, dimensions and settings. Coordinates are logical pixels; rotations are degrees. Atlas cuts are source pixels; definition physics uses normalized geometry. `behavior.vanish` (or `placement.settings.vanish`) contains `triggerVolume: [x,y,width,height]` normalized to placement size and `countdownMs`. Beam timing uses `startMs`, `onMs`, `offMs`, `phaseMs` and `startState`; older files without `startMs` start immediately.

Reusable metadata uses `level-editor-asset-library`, version 1, containing assets/images and definitions without world placements. These are private tool save formats, not schemas required from an image generator.

Independent motion is `behavior.motion` or `placement.settings.motion`, with `axis`, `distance`, `periodMs` and `phaseMs`. Explicit `null` disables it. Older `type: "moving"` behavior remains supported when no independent motion override is present.

Vanishing metadata optionally adds `restoreMode: "respawn" | "timed" | "permanent"` and `restoreMs` (required and positive for timed restoration). Omitted `restoreMode` preserves the legacy respawn behavior. These settings are exported; trigger timestamps and permanent-removal tracking stay in the playtest runtime.

Run `npm run test:editor` for the companion checks.
