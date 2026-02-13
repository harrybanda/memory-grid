# Collider-Based Vertical Activation System

Technical documentation for solving inaccurate positional detection in Spectacles walking-based games.

## Scope

**This system is designed for grid-based location detection only.** It is not a universal solution for all position-detection scenarios.

| Use case | Fit |
|----------|-----|
| **Grid-based experiences** — Structured layouts with square tiles, precise "which tile am I on?" detection | ✅ Ideal |
| **Open-world zones** — Large regions, irregular shapes, sparse triggers (e.g. cave entrance, forest boundary) | ❌ Not ideal |
| **Continuous position** — Smooth tracking of movement across space | ❌ Not designed for |

The approach relies on a **tightly packed grid** with small gaps between adjacent tiles. Narrow triggers centered on each tile, combined with predictable tile spacing, prevent accidental activation from leaning. In open-world scenarios, zones are typically larger, fewer, and irregularly placed; position-based detection or large volumetric triggers are often more appropriate.

**Use this when:** You need accurate detection of where a player is standing within a structured grid of square tiles (e.g. memory games, floor puzzles, step sequences).

**Consider alternatives when:** You have large open areas, sparse zone boundaries, or need continuous positional data rather than discrete tile entry events.

---

## 1. Problem Overview

### Spectacles Positional Tracking Limitations

Snap Spectacles provide **Device Tracking (World Mode)** for 6DOF head pose: the camera's position and rotation in world space. They do **not** provide:

- Foot position
- Body/hip position
- Skeletal tracking
- Separate limb tracking

Any "body position" must be derived from head/camera data. In walking-based games, developers typically project the camera position onto the floor plane to approximate where the player is standing. This projection is the root of the problem.

### Why Leaning Breaks Naive Implementations

When a user leans forward, backward, or sideways:

1. **Head translates** — The camera moves 15–40 cm without the feet moving.
2. **Projected "foot" position shifts** — A straight vertical projection (camera X,Z → floor Y) treats the head position as the standing position. Leaning moves that projection by the full lean distance.
3. **False tile activation** — In a 50 cm tile grid, leaning 25 cm forward can shift the projected point from one tile into an adjacent tile, triggering activation without the player stepping.

Head tilt (rotation-only) is less harmful for projection-based approaches, but head translation during natural movement—leaning to look, bending to see a low tile, adjusting balance—is frequent and unavoidable.

### Why Tight Spatial Grids Increase Error Sensitivity

- **Tile size vs. tracking noise** — Smaller tiles mean smaller margins. A 50 cm tile leaves ~25 cm from edge to center; 10–15 cm of lean or drift crosses the threshold.
- **Adjacent tile density** — In a 5×5 grid with 55 cm center-to-center spacing, multiple tiles are within one lean of the current position. Any position jitter or lean can hop between tiles.
- **No physical confirmation** — Position-based systems have no ground truth. The system trusts that the reported camera position accurately reflects where the player intends to stand.

---

## 2. Why Traditional Approaches Fail

### Position Delta Checks

**Idea:** Only register a new tile when the projected position has moved by some threshold.

**Problems:**
- Requires a "previous position" and a movement threshold. Too low → jitter from tracking noise. Too high → missed steps when the player takes smaller steps.
- Leaning still shifts the projected position; a single lean can cross multiple tiles.
- Does not distinguish "real step" from "lean + drift."

### Distance Threshold Checks

**Idea:** Activate a tile when the projected foot position is within X cm of the tile center.

**Problems:**
- Same projection issue: the "foot" position is inferred from head position, so leaning moves it.
- Tight thresholds (e.g. 20 cm) miss steps when the player doesn't hit the center. Loose thresholds cause overlap between adjacent tiles and double-triggers.
- No physical constraint: the check is purely mathematical on noisy data.

### Raycasting

**Idea:** Cast a ray downward from the camera to detect which tile the "feet" are over.

**Problems:**
- Ray origin is the camera. Leaning moves the ray origin; the ray hits a different tile.
- Ray direction (straight down) assumes the player is upright. Tilting the head tilts the ray, shifting the floor intersection.
- Still derived from head pose—same fundamental limitation.

### Summary

All of these methods rely on **estimated** position derived from head/camera data. They cannot distinguish:

- Intended movement (stepping into a tile)
- Unintended movement (leaning, tilting, tracking drift)

The only reliable signal is **physical intersection**: the head (camera) must actually pass through a volume in space. That requires collision detection.

---

## 3. The Collider-Based Vertical Activation System

### Concept

In **grid-based layouts**—where tiles are uniformly sized and spaced—instead of inferring position and checking distance:

1. **Define a zone per tile** — A trigger collider at each tile center.
2. **Attach a collider to the camera** — A small collider representing the player's head.
3. **Use physics overlap events** — Tile activation occurs only when the camera collider **enters** the tile trigger.

Activation is binary: intersection occurred or it did not. No thresholds, no projection, no estimation.

### Why Vertical "Poles" (or Planes) Work

The trigger shape is a **narrow vertical volume** at each tile center:

- **Narrow footprint (X, Z)** — The trigger occupies a slim region (e.g. 40 cm wide × 5 cm deep). The player must physically walk the camera into that region. Leaning from the center of one tile does not move the head 55 cm into the center of an adjacent tile.
- **Tall (Y)** — The collider extends from floor to well above head height (e.g. 60 cm tall). It works for different user heights without per-user calibration.
- **Centered** — Placed at the tile center so that stepping "into" the tile means stepping into the trigger.

Geometrically, think of it as a vertical plane or pole through the center of each tile. Walking forward brings the camera collider through that plane; leaning rotates the head in place but does not translate it enough to cross into another tile's trigger.

### Why Intersection Beats Estimated Position

| Approach           | Activation condition          | Robust to lean? |
|--------------------|-------------------------------|-----------------|
| Position-based     | Projected point in tile bounds | No              |
| Collider-based     | Physical overlap of volumes     | Yes             |

Intersection is a **binary, physics-driven** event. The runtime reports overlap when the collider volumes actually intersect. There is no intermediate "estimated position" to misinterpret.

### How It Simulates Walking Into a Zone

Walking produces **translation** of the camera. The collider moves through space and eventually penetrates the trigger volume. Leaning produces **small translation** (typically &lt; 30 cm); in a grid with 55 cm tile spacing, that rarely crosses from one tile's trigger into another's.

Head tilt (rotation only) produces **no translation** of the collider center. The collider stays in place; no new overlaps occur.

---

## 4. Implementation Breakdown

### Tile Prefab Structure

Each tile has:

1. **Visual** — Mesh and material for rendering (box, plane, etc.).
2. **Trigger child** — A separate object with `Physics.ColliderComponent` set as a **Trigger** (not solid).

The trigger is a **child** of the tile so it moves and rotates with the tile. It is positioned at local origin (tile center).

### Trigger Prefab Requirements

- **ColliderComponent** — Box or convex mesh collider.
- **Is Trigger** — Set to true (non-solid overlap detection).
- **Shape** — Vertical plane or narrow box. Example dimensions:
  - **Width:** 40 cm (narrow enough to require stepping in)
  - **Height:** 60 cm (covers seated to tall users)
  - **Depth:** 5 cm (thin to avoid overlapping adjacent tiles)
- **TileTrigger script** — Listens for `onOverlapEnter`, validates that the overlapping collider is on the Camera object, then invokes a callback with tile coordinates.

### Camera Collider Setup

- Add **Physics.ColliderComponent** to the Camera SceneObject.
- Use a small shape: sphere (radius ~5–10 cm) or box (e.g. 10 cm³).
- Body type: **Dynamic** or **Kinematic** (must participate in collision/overlap).
- **Single collider** — Avoid extra colliders on camera children (UI, interactables). `TileTrigger` filters overlaps to only accept colliders on the object that has a `Camera` component; child colliders are ignored.

### Collider Filtering: Camera-Only Overlaps

Child objects of the camera (UI panels, buttons, hand visuals) may have their own colliders. Those can overlap tile triggers when the user looks at them, causing false activations.

**Solution:** In `TileTrigger.onOverlapEnter`, inspect the overlapping collider's SceneObject. Only process overlaps where that object has a `Component.Camera` (i.e. the collider is on the camera itself, not a child).

```javascript
// Only accept overlaps from the camera object
return !!otherObj.getComponent("Component.Camera");
```

### Recommended Collider Sizing Strategy

1. **Tile size** — 50 cm with 5 cm gap (55 cm center-to-center) works well for Spectacles FOV.
2. **Trigger width** — 60–80% of tile size (e.g. 40 cm for 50 cm tiles). Enough to catch natural steps; narrow enough to avoid accidental overlap from leaning.
3. **Trigger height** — 150–180 cm from floor to cover standing users.
4. **Trigger depth** — 5–10 cm. Minimize overlap with neighboring triggers.
5. **Camera collider** — 10 cm sphere or equivalent. Represents head; small enough to avoid spanning multiple triggers.

### Tuning Considerations

- **False negatives (missed steps):** Widen the trigger or increase camera collider size.
- **False positives (phantom triggers):** Narrow the trigger, reduce camera collider size, or add stricter validation (e.g. minimum time between triggers).
- **Adjacent double-trigger:** Ensure triggers do not overlap. Gaps between tiles help; keep trigger depth small.

### Performance Implications

- **One trigger per tile** — 25 triggers for a 5×5 grid. Lens Studio's physics engine handles this efficiently.
- **Overlap events** — Fired only when overlaps begin/end; no per-frame distance checks.
- **Reset on new round** — Each trigger has a `hasTriggered` flag. Call `resetTrigger()` when starting a new round so triggers can fire again.

---

## 5. Accuracy Improvements

### Why This Increases Stability

1. **Physical gate** — Activation requires the camera to cross a boundary. Leaning rarely produces sufficient translation.
2. **No threshold tuning** — No magic numbers for "minimum step distance" or "tile entry radius."
3. **Consistent across users** — Height is handled by the vertical extent of the trigger, not by custom offsets.
4. **Robust to tracking drift** — Small position noise does not cause a binary overlap event by itself; the collider must actually enter the volume.

### Tradeoffs and Limitations

- **Head as proxy for body** — We still use head position. The system assumes the player walks normally (head moves with steps). Running or unusual movement may change behavior.
- **Edge cases** — Very fast movement could theoretically pass through a narrow trigger without registering. In practice, 40 cm width and walking speed make this rare.
- **Start zone** — The same collider-based approach applies to a "start zone" (e.g. a box trigger) for detecting when the player returns before the next round.

---

## 6. Reusing This Pattern

### When This Pattern Fits

This approach is **purpose-built for grid-based systems** where:

- Layout is a structured grid of square (or uniformly sized) tiles
- Detection must be precise: which specific tile the player is standing on
- Tiles are closely spaced with predictable gaps
- False activations from leaning are unacceptable

**Good fits:**
- Grid-based movement (Memory Grid, floor puzzles, stepping games)
- Step sequences or rhythm games with spatial steps on a tile grid
- Memory or path-following games with discrete tile positions
- Any experience requiring accurate "tile under feet" detection in a structured layout

### When to Use Alternatives

This pattern is **not ideal** when:

- **Open-world layouts** — Sparse regions, irregular boundaries, large areas (e.g. detecting "player entered cave")
- **Few, large zones** — Position-based detection or broad volumetric triggers may suffice
- **Continuous position tracking** — You need smooth movement data, not discrete entry events
- **Non-grid layouts** — Arbitrary polygon boundaries, organic shapes, or overlapping regions

For large open areas or irregular zones, consider position projection with generous thresholds, larger trigger volumes, or other spatial detection methods.

### Implementation Checklist

1. Create a trigger prefab with `Physics.ColliderComponent` (trigger mode).
2. Size it as a narrow vertical volume (width × height × depth) per zone.
3. Attach a script that listens for `onOverlapEnter` and validates the overlapping collider (e.g. camera-only).
4. Add a collider to the Camera SceneObject.
5. Spawn one trigger instance per zone, or parent triggers to zone objects.
6. Wire overlap callbacks to your game logic (e.g. `PlayerTracker.handleTriggerEntered`).

### Key Files in This Project

| File | Role |
|------|------|
| `Assets/Scripts/Grid/TileTrigger.js` | Trigger component; overlap handling, camera-only filter |
| `Assets/Scripts/Grid/GridManager.js` | Spawns triggers per tile, wires callbacks |
| `Assets/Scripts/Player/PlayerTracker.js` | Consumes trigger events, validates steps against path |
| `Assets/Scripts/UI/StartZoneVisual.js` | Same pattern for start-zone entry/exit |
