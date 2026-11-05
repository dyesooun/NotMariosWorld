# Generic tileset manifest schema

[`schema.json`](schema.json) is a standalone JSON Schema Draft 2020-12 contract for a generator producing **tileset manifests**. It supports any theme, image filename, image dimensions, frame identifiers, and number of frames. It covers platforms, chests, props, hazards, beams, backgrounds, foliage, and overhangs.

It does not describe creatures or their animations. Existing asset manifests have not been migrated, and this schema does not change the game renderer.

## Generator instructions

Give the generator the schema and the tileset image. For an existing atlas, also provide its manifest as the reference for existing cuts and stable IDs. Request a new `manifest.json` conforming to the schema; no existing manifest snapshot is embedded in the output.

```text
Generate a complete tileset manifest conforming to the supplied schema.json.
Use the actual image filename and dimensions, stable frame IDs, and accurate
source crop rectangles. For an existing atlas, preserve its supplied cuts
and IDs unless I explicitly request corrections.

sourceRectPx is relative to the full atlas image. All other frame geometry
is relative to that frame's crop, with (0,0) at its upper-left corner,
X increasing right and Y increasing down. Component coordinates also use
the parent frame's crop origin. Beam-pair offsets align separate crops
into a common assembly coordinate system and may be negative.

Provide content bounds, numeric placement anchors, walking surfaces,
solid shapes, dangerous regions, and interaction regions. Identify
separate painted components without silently changing the source cuts.
Provide terrain joins/repeating sections for platforms, repetition and
horizon data for backgrounds, and emitter/receiver/core geometry plus
compatible ON/OFF pairings for beams.

Use null for unknown geometry or unknown sets of shapes. Use [] only for
confirmed absence or a set that does not apply. Mark estimates as estimated;
do not claim measured precision without checking the image. Explain
uncertainty, source-alpha artifacts, and crop problems in notes.

Do not invent gameplay rules or level placements. Keep source metadata
separate from runtime interpretation and placement settings.
```

`atlas` describes the source image and optional grid. `frames` contains the crop and technical art measurements for each tile. Category-specific fields provide platform, background, and beam metadata. `beamPairs` identifies compatible static ON/OFF alternatives; those alternatives are not sequential animation frames.

Geometry can seed the editor's reusable asset interpretations. Logical display sizes, collision modes, chest roles, movement paths, timers, and placements remain in the editor's separate definition and placement layers, so a later artwork change does not silently change saved collision geometry.

## Validation

In PowerShell, adjust the paths to the generated manifest and schema:

```powershell
Get-Content -Raw path/to/manifest.json | Test-Json -SchemaFile path/to/schema.json
```

Schema validation checks field structure, categories, shape types, and required metadata. It cannot compare arbitrary frame-ID references with object keys or enforce sums such as `x + w` against a different field. Additional semantic/image review must check atlas/crop bounds, frame references, grid consistency, unique component/pair IDs, nondegenerate polygons, surface endpoint order, beam alignment, and actual seam quality. Passing the schema does not certify collision accuracy or gameplay behavior.
