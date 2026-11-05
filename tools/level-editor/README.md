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

## Shared metadata and storage

Cut and collision/hitbox corrections apply to every placement using the shared asset definition. Crop changes preserve logical collision until it is explicitly regenerated or edited. Placement position, size and rotation remain independent.

Metadata and drafts are stored inside the tool using IndexedDB, including imported raster images. Large images do not rely on the small localStorage quota. **Save metadata** exports a reusable asset library without level placements; **Load metadata** merges matching asset/definition IDs and updates their placed instances. **Export JSON** and **Import JSON** save/reopen complete levels. Export important work as a backup; localhost and 127.0.0.1 have separate browser databases.

Select a drawer asset and use **Delete selected asset**, or **Delete asset** in Shared Definition, to remove its reusable definition and every placed instance. Other characters sharing that atlas remain. The atlas is removed from tool storage once no definitions use it. Support links to removed platforms are cleared. **Undo** restores the asset and its placements; source images on disk are untouched. **Delete placement** removes only that instance.

The timing update clears the previous tool library and its placements once on first load, as requested. The drawer starts empty and contains only assets imported afterward; future reloads preserve those new imports. Source images on disk are untouched. Nothing writes asset metadata into the game directories.

## Placing and transforming

Choose an asset, then click the level canvas. The tool immediately switches to **Select**. Drag its center handle to move, edge/corner handles to resize, and the orange handle to rotate around its center. Shift locks corner aspect ratio or snaps rotation to 15 degrees. Artwork, collision overlays and hit testing share the same rotation/flip transform. Numeric controls remain available.

Select several objects with **Ctrl/Cmd-click** on the canvas or object list, drag a box over empty canvas space, or use **Select all** (Ctrl/Cmd+A). Ctrl/Cmd-drag on empty space adds a box selection. **Clear selection** deselects everything. A shared blue box surrounds the selection. Drag any selected object or the center handle to move the group; corner/edge handles uniformly scale sizes and spacing; the orange handle rotates every object around the group center. Shift snaps rotation to 15 degrees. Group scaling preserves proportions.

**Flip horizontal** and **Flip vertical** reflect the selection's positions and orientations around its center, including collision and trigger geometry. The group inspector also accepts movement deltas, a scale percentage, and a rotation angle. Each drag or numeric operation is one Undo step. Group transforms update ordinary placement fields in JSON; grouping is an editor selection, with no new asset definitions or engine state.

Pan with the Pan tool, middle mouse, Space-drag or Shift-drag. The wheel zooms; Start restores the initial view and Fit shows the level. Snap controls movement deltas. Ctrl+D duplicates the selected placements together, preserving support links between the copies. Delete removes the selected placements; Ctrl+Z/Ctrl+Y undo/redo. Pointer cancellation or Escape restores an interrupted drag.

Preview runs live automatically. Use Pause/Resume or the optional slider to inspect a moment. Dragging handles temporarily freezes the clock and resumes on release. Reset restarts the shared clock and restores triggered platforms. Preview does not modify saved base positions.

Every placed asset has a **Movable** checkbox under Placement behavior: props, backgrounds, chests, characters, enemies, beams and platforms all support it. Set the movement axis, travel distance, full cycle duration and movement offset. Motion runs independently of beam timing, character state previews and platform vanishing. Disabling Movable stops that placement's motion while preserving those other behaviors.

Platforms can vanish after a trigger independently of movement. Enable **Vanish after trigger entry**, enter a countdown in seconds, then use **Edit trigger handles** to move/resize the blue volume or enter its local pixel coordinates. The volume follows the platform's movement, rotation, flip and size. **Simulate trigger entry** starts the countdown; after it expires, the platform vanishes and has no collision overlay. A selected vanished platform remains a faint editing ghost. Reset restores it. This is an editor preview without a player; the future renderer will detect actual player entry.

Beams expose **Start time seconds** (initial delay), **ON duration seconds**, **OFF duration seconds**, **Time offset seconds** (cycle phase), and initial cycle state. The beam remains off before the start time. Afterward, its cycle uses elapsed time minus start time plus offset. A distinct OFF frame is shown when configured; a single-frame beam is hidden while off.

Timing and trigger settings are per placement and exported in JSON. Trigger simulation timestamps are temporary and never saved. Enemy animation selection, support links and layering remain available.

Autosave shows **Saving…** while writes are queued, then **Saved in this tool** after the latest project and library reach IndexedDB. Let that indicator finish before reloading.

## Output contract

Level JSON uses `not-marios-world-level`, version 2, with separate `assets`, reusable `definitions`, and `placements`. Version 1 files migrate with rotation initialized to zero, preserving IDs, dimensions and settings. Coordinates are logical pixels; rotations are degrees. Atlas cuts are source pixels; definition physics uses normalized geometry. `behavior.vanish` (or `placement.settings.vanish`) contains `triggerVolume: [x,y,width,height]` normalized to placement size and `countdownMs`. Beam timing uses `startMs`, `onMs`, `offMs`, `phaseMs` and `startState`; older files without `startMs` start immediately.

Reusable metadata uses `level-editor-asset-library`, version 1, containing assets/images and definitions without world placements. These are private tool save formats, not schemas required from an image generator.

Independent motion is `behavior.motion` or `placement.settings.motion`, with `axis`, `distance`, `periodMs` and `phaseMs`. Explicit `null` disables it. Older `type: "moving"` behavior remains supported when no independent motion override is present.

Run `npm run test:editor` for the companion checks.
