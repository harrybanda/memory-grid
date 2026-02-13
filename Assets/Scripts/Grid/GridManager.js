// GridManager.js
// Manages grid creation, tile states, and visual updates

// @input SceneObject gridParent {"label": "Grid Parent", "hint": "Parent object for all grid tiles"}
// @input Asset.Material tileMaterial {"label": "Tile Material", "hint": "Material for grid tiles"}
// @input Asset.ObjectPrefab tilePrefab {"label": "Tile Prefab", "hint": "Prefab for individual tiles (include 'Arrow' child for direction hints)"}
// @input bool scaleTiles = true {"label": "Scale Tiles", "hint": "Scale tiles to TILE_SIZE (50cm). Disable if prefab is already sized."}
// @input Asset.ObjectPrefab triggerPrefab {"label": "Trigger Prefab", "hint": "Prefab with ColliderComponent (trigger) for tile entry detection"}

var Constants = require("../Utils/Constants");
var MathHelpers = require("../Utils/MathHelpers");
var PathGenerator = require("./PathGenerator");
var AnimationManager = require("../Utils/AnimationManager");

/**
 * GridManager Component
 * Handles grid creation, path management, and tile state updates
 */

// Grid state
var gridConfig = {
	rows: Constants.GridConfig.DEFAULT_ROWS,
	columns: Constants.GridConfig.DEFAULT_COLUMNS,
	tileSize: Constants.GridConfig.TILE_SIZE,
	tileGap: Constants.GridConfig.TILE_GAP,
	origin: null,
	tiles: [],
	tileObjects: [],
	triggerObjects: [], // Trigger plane objects for collision detection
	arrowOriginalRotations: [], // Store original arrow rotations per tile
};

// Callback for when a trigger is entered
var onTriggerEnteredCallback = null;

// Current path data
var pathData = {
	path: [],
	isRevealed: false,
};

// Initialization flag
var isInitialized = false;

/**
 * Updates subtle alpha pulse on tiles.
 * Can pulse default white tiles only, or all tile states via config.
 * Dimmed tiles are intentionally excluded so intro/countdown visuals stay stable.
 */
function updateIdlePulse() {
	if (!isInitialized) return;
	if (!script.gridParent || !script.gridParent.enabled) return;

	var cfg = Constants.GridConfig;
	if (!cfg.IDLE_PULSE_ENABLED) return;

	var speed = cfg.IDLE_PULSE_SPEED;
	var pulseAllTiles = cfg.IDLE_PULSE_ALL_TILES === true;
	if (speed <= 0) return;

	var minAlpha = Math.max(0, Math.min(1, cfg.IDLE_PULSE_MIN_ALPHA));
	var maxAlpha = Math.max(0, Math.min(1, cfg.IDLE_PULSE_MAX_ALPHA));
	if (maxAlpha <= minAlpha) return;

	var alphaRange = maxAlpha - minAlpha;
	var phaseTime = getTime() * speed * Math.PI * 2;

	for (var z = 0; z < gridConfig.rows; z++) {
		for (var x = 0; x < gridConfig.columns; x++) {
			var tileData = gridConfig.tiles[z][x];
			if (!tileData) continue;

			var isDefaultTile = tileData.state === "default";
			if (!isDefaultTile && !pulseAllTiles) continue;

			var targetBaseAlpha = isDefaultTile ? cfg.DEFAULT_ALPHA : cfg.VISIBLE_ALPHA;
			var allowedDistanceFromBase = Math.max(Math.abs(targetBaseAlpha - minAlpha), Math.abs(maxAlpha - targetBaseAlpha)) + 0.03;

			var tileObject = gridConfig.tileObjects[z][x];
			if (!tileObject) continue;

			var meshVisual = tileObject.getComponent("Component.RenderMeshVisual");
			if (!meshVisual || !meshVisual.mainPass) continue;

			var color = meshVisual.mainPass.baseColor;

			// Only pulse tiles near their expected gameplay alpha.
			// Skip dimmed tiles used during intro/countdown states.
			if (Math.abs(color.a - targetBaseAlpha) > allowedDistanceFromBase) continue;

			var phaseOffset = x * 0.45 + z * 0.73;
			var pulse01 = (Math.sin(phaseTime + phaseOffset) + 1) * 0.5;
			var pulseAlpha = minAlpha + pulse01 * alphaRange;

			meshVisual.mainPass.baseColor = new vec4(color.r, color.g, color.b, pulseAlpha);
		}
	}
}

function setupIdlePulseUpdate() {
	var updateEvent = script.createEvent("UpdateEvent");
	updateEvent.bind(function () {
		updateIdlePulse();
	});
}

/**
 * Initializes the grid at the specified origin position
 * Grid is offset forward from placement point for better visibility
 * @param {vec3} originPosition - World position for grid origin (placement point)
 * @param {number} rows - Number of rows (optional, uses default)
 * @param {number} columns - Number of columns (optional, uses default)
 */
function initialize(originPosition, rows, columns) {
	gridConfig.origin = originPosition;
	gridConfig.rows = rows || Constants.GridConfig.DEFAULT_ROWS;
	gridConfig.columns = columns || Constants.GridConfig.DEFAULT_COLUMNS;

	// Clear any existing tiles
	clearGrid();

	// Create the grid tiles
	createGrid();

	// Start with grid dimmed (only start tile will be bright initially)
	dimGridBackground();

	isInitialized = true;

	print("GridManager: Initialized " + gridConfig.rows + "x" + gridConfig.columns + " grid");
}

/**
 * Creates the visual grid of tiles
 */
function createGrid() {
	gridConfig.tiles = [];
	gridConfig.tileObjects = [];
	gridConfig.triggerObjects = [];

	for (var z = 0; z < gridConfig.rows; z++) {
		gridConfig.tiles[z] = [];
		gridConfig.tileObjects[z] = [];
		gridConfig.triggerObjects[z] = [];

		for (var x = 0; x < gridConfig.columns; x++) {
			// Calculate tile world position
			var tileWorldPos = MathHelpers.gridToWorld(x, z, gridConfig.origin, gridConfig.tileSize, gridConfig.tileGap);

			// Create tile data
			var tileData = {
				gridX: x,
				gridZ: z,
				worldPosition: tileWorldPos,
				state: "default", // default, path, correct, wrong, start, end
				isPathTile: false,
				pathIndex: -1,
			};

			gridConfig.tiles[z][x] = tileData;

			// Create visual tile object
			var tileObject = createTileObject(tileData);
			gridConfig.tileObjects[z][x] = tileObject;

			// Create trigger plane for collision detection
			if (script.triggerPrefab) {
				var triggerObject = createTriggerPlane(tileData, tileObject);
				gridConfig.triggerObjects[z][x] = triggerObject;
			} else {
				gridConfig.triggerObjects[z][x] = null;
			}
		}
	}
}

/**
 * Creates a trigger plane for collision-based tile detection
 * The trigger keeps its prefab size and rotation - only position is set to tile center
 * @param {Object} tileData - Tile data containing position info
 * @param {SceneObject} tileObject - The parent tile object
 * @returns {SceneObject} The created trigger object
 */
function createTriggerPlane(tileData, tileObject) {
	if (!script.triggerPrefab) return null;

	// Instantiate trigger prefab as child of the tile
	var triggerObject = script.triggerPrefab.instantiate(tileObject);

	if (triggerObject) {
		// Position at tile center - size and rotation are kept from the prefab
		var transform = triggerObject.getTransform();
		transform.setLocalPosition(new vec3(0, 0, 0));

		// Get the TileTrigger script component and set it up
		var triggerScript = triggerObject.getComponent("Component.ScriptComponent");
		if (triggerScript && triggerScript.setup) {
			triggerScript.setup(tileData.gridX, tileData.gridZ, "center", function (data) {
				handleTriggerEntered(data);
			});
		}
	}

	return triggerObject;
}

/**
 * Handles when a trigger plane is entered
 * @param {Object} data - Trigger data {x, z, direction}
 */
function handleTriggerEntered(data) {
	if (onTriggerEnteredCallback) {
		onTriggerEnteredCallback(data.x, data.z);
	}
}

/**
 * Creates a single tile SceneObject
 * @param {Object} tileData - Tile data containing position info
 * @returns {SceneObject} The created tile object
 */
function createTileObject(tileData) {
	var tileObject = null;

	if (script.tilePrefab) {
		// Instantiate from prefab
		tileObject = script.tilePrefab.instantiate(script.gridParent);
	} else {
		// Create a basic box if no prefab assigned
		tileObject = createBasicTile();
	}

	if (tileObject) {
		var transform = tileObject.getTransform();

		// Calculate LOCAL position relative to grid parent (not world position)
		// This ensures tiles align with the parent's rotation
		var totalTileSize = gridConfig.tileSize + gridConfig.tileGap;
		var halfTile = gridConfig.tileSize / 2;

		// Calculate grid dimensions to center horizontally
		var gridWidth = gridConfig.columns * totalTileSize - gridConfig.tileGap;
		var offsetX = -gridWidth / 2;

		// ANCHOR START TILE at placement center, grid extends AWAY from player
		// Start tile is at gridZ = rows - 1 (front-center of grid)
		// Placement point = where user pinched = local origin (0,0,0)
		// +Z is toward player, so grid extends into -Z (away from player)
		var startGridZ = gridConfig.rows - 1;

		var localX = tileData.gridX * totalTileSize + halfTile + offsetX;
		var localY = 0; // On the floor plane
		// Start tile at small positive Z (just in front of placement), grid extends to -Z
		var localZ = halfTile + (tileData.gridZ - startGridZ) * totalTileSize;

		transform.setLocalPosition(new vec3(localX, localY, localZ));

		// Scale tiles if enabled (for 1-unit base prefabs)
		if (script.scaleTiles) {
			var scale = new vec3(gridConfig.tileSize, Constants.GridConfig.TILE_HEIGHT, gridConfig.tileSize);
			transform.setLocalScale(scale);
		}

		// Clone the material so each tile can have independent color
		var meshVisual = tileObject.getComponent("Component.RenderMeshVisual");
		if (meshVisual && meshVisual.mainMaterial) {
			var clonedMaterial = meshVisual.mainMaterial.clone();
			meshVisual.mainMaterial = clonedMaterial;
		}

		// Set initial color
		setTileColor(tileObject, Constants.GridConfig.COLORS.TILE_DEFAULT);

		// Store reference to grid position
		tileObject.gridX = tileData.gridX;
		tileObject.gridZ = tileData.gridZ;

		// Find and hide arrow child (if exists in prefab)
		var arrowChild = findChildByName(tileObject, "Arrow");
		if (arrowChild) {
			// Store original rotation for later use
			var originalRot = arrowChild.getTransform().getLocalRotation();
			tileObject.arrowOriginalRotation = originalRot.toEulerAngles();
			arrowChild.enabled = false;
		}
	}

	return tileObject;
}

/**
 * Finds a child object by name (case-insensitive)
 * @param {SceneObject} parent - Parent object to search
 * @param {string} name - Name to search for
 * @returns {SceneObject} Child object or null
 */
function findChildByName(parent, name) {
	var childCount = parent.getChildrenCount();
	var lowerName = name.toLowerCase();

	for (var i = 0; i < childCount; i++) {
		var child = parent.getChild(i);
		if (child.name.toLowerCase() === lowerName) {
			return child;
		}
	}
	return null;
}

/**
 * Creates a basic tile when no prefab is provided
 * @returns {SceneObject} Basic tile object
 */
function createBasicTile() {
	print("GridManager: Warning - No tile prefab assigned. Please assign a tile prefab.");
	return null;
}

/**
 * Sets the color of a tile object
 * @param {SceneObject} tileObject - The tile to color
 * @param {vec4} color - RGBA color value
 */
function setTileColor(tileObject, color) {
	if (!tileObject) return;

	var meshVisual = tileObject.getComponent("Component.RenderMeshVisual");
	if (meshVisual && meshVisual.mainPass) {
		meshVisual.mainPass.baseColor = color;
	}
}

/**
 * Clears all tiles from the grid
 */
function clearGrid() {
	// Clear arrows first
	hideAllArrows();

	// Destroy tile objects
	for (var z = 0; z < gridConfig.tileObjects.length; z++) {
		for (var x = 0; x < gridConfig.tileObjects[z].length; x++) {
			var tileObject = gridConfig.tileObjects[z][x];
			if (tileObject) {
				tileObject.destroy();
			}
		}
	}

	// Trigger objects are children of tiles, so they're destroyed with the tiles
	// But clear the array anyway
	gridConfig.tiles = [];
	gridConfig.tileObjects = [];
	gridConfig.triggerObjects = [];
	pathData.path = [];
}

/**
 * Generates a new random path
 * @param {number} pathLength - Desired path length
 * @returns {Array} The generated path
 */
function generateNewPath(pathLength) {
	pathData.path = PathGenerator.generatePathFromBottom(gridConfig.rows, gridConfig.columns, pathLength);

	print("GridManager: Requested " + pathLength + " tiles, generated " + pathData.path.length);

	// Mark tiles as path tiles
	for (var i = 0; i < pathData.path.length; i++) {
		var pos = pathData.path[i];
		var tile = gridConfig.tiles[pos.z][pos.x];
		tile.isPathTile = true;
		tile.pathIndex = i;

		// Mark start and end
		if (i === 0) {
			tile.state = "start";
		} else if (i === pathData.path.length - 1) {
			tile.state = "end";
		} else {
			tile.state = "path";
		}
	}

	return pathData.path;
}

/**
 * Reveals the path visually
 * Path tiles shown in green, start in yellow, end in blue
 * @param {boolean} withArrows - Whether to show direction arrows (default: true)
 */
function revealPath(withArrows) {
	// Default to showing arrows if not specified
	var showArrows = withArrows !== false;

	pathData.isRevealed = true;

	for (var i = 0; i < pathData.path.length; i++) {
		var pos = pathData.path[i];
		var tileObject = gridConfig.tileObjects[pos.z][pos.x];

		// Start tile yellow, end tile blue, middle tiles green
		if (i === 0) {
			setTileColor(tileObject, Constants.GridConfig.COLORS.TILE_START);
		} else if (i === pathData.path.length - 1) {
			setTileColor(tileObject, Constants.GridConfig.COLORS.TILE_END);
		} else {
			setTileColor(tileObject, Constants.GridConfig.COLORS.TILE_PATH);
		}

		// Show arrow pointing to next tile (skip last tile)
		if (showArrows && i < pathData.path.length - 1) {
			var nextPos = pathData.path[i + 1];
			showArrowOnTile(tileObject, pos, nextPos);
		}
	}
}

/**
 * Hides the path (returns middle tiles to default, keeps start/end visible)
 * Start and end tiles stay yellow so player knows where to begin and finish
 */
function hidePath() {
	pathData.isRevealed = false;

	// Reset all tiles to default
	for (var z = 0; z < gridConfig.rows; z++) {
		for (var x = 0; x < gridConfig.columns; x++) {
			var tileObject = gridConfig.tileObjects[z][x];
			setTileColor(tileObject, Constants.GridConfig.COLORS.TILE_DEFAULT);
		}
	}

	// Keep start and end tiles visible in yellow
	if (pathData.path.length > 0) {
		var startPos = pathData.path[0];
		var endPos = pathData.path[pathData.path.length - 1];

		var startTile = gridConfig.tileObjects[startPos.z][startPos.x];
		var endTile = gridConfig.tileObjects[endPos.z][endPos.x];

		setTileColor(startTile, Constants.GridConfig.COLORS.TILE_START);
		setTileColor(endTile, Constants.GridConfig.COLORS.TILE_END);
	}

	// Hide all direction arrows
	hideAllArrows();
}

/**
 * Reveals the path sequentially, one tile at a time
 * Start tile is already visible - this reveals the rest progressively
 * @param {Function} onComplete - Callback when all tiles are revealed
 */
function revealPathSequential(onComplete) {
	if (pathData.path.length === 0) {
		if (onComplete) onComplete();
		return;
	}

	pathData.isRevealed = true;
	var currentIndex = 0;
	var delay = Constants.IntroConfig.TILE_REVEAL_DELAY;

	function revealNextTile() {
		if (currentIndex >= pathData.path.length) {
			// All tiles revealed - brief delay then complete
			var completeDelay = script.createEvent("DelayedCallbackEvent");
			completeDelay.bind(function () {
				if (onComplete) onComplete();
			});
			completeDelay.reset(Constants.IntroConfig.POST_REVEAL_DELAY);
			return;
		}

		var pos = pathData.path[currentIndex];
		var tileObject = gridConfig.tileObjects[pos.z][pos.x];

		// Set color based on tile type
		if (currentIndex === 0) {
			// Start tile - yellow
			setTileColor(tileObject, Constants.GridConfig.COLORS.TILE_START);
		} else if (currentIndex === pathData.path.length - 1) {
			// End tile - blue
			setTileColor(tileObject, Constants.GridConfig.COLORS.TILE_END);
		} else {
			// Path tile - green
			setTileColor(tileObject, Constants.GridConfig.COLORS.TILE_PATH);
		}
		setTileAlpha(tileObject, Constants.GridConfig.VISIBLE_ALPHA);

		// Store the target scale before animation
		var targetScale = tileObject.getTransform().getLocalScale();

		// Animate tile with bounce-out effect
		AnimationManager.bounceReveal(tileObject, {
			endScale: targetScale,
			duration: 0.4,
			overshoot: 1.2,
		});

		// Play progressive step sound during reveal
		if (global.PathFinder && global.PathFinder.Audio) {
			global.PathFinder.Audio.playStep(currentIndex + 1);
		}

		// Show arrow pointing to next tile (except on last tile)
		if (currentIndex < pathData.path.length - 1) {
			var nextPos = pathData.path[currentIndex + 1];
			showArrowOnTile(tileObject, pos, nextPos);
		}

		currentIndex++;

		// Schedule next tile reveal
		var delayEvent = script.createEvent("DelayedCallbackEvent");
		delayEvent.bind(revealNextTile);
		delayEvent.reset(delay);
	}

	// Start the sequence
	revealNextTile();
}

/**
 * Dims the grid (reduces alpha for all tiles)
 * Used before countdown
 */
function dimGrid() {
	setGridAlpha(0.3);
}

/**
 * Shows the grid at full visibility
 */
function showGrid() {
	if (script.gridParent) {
		script.gridParent.enabled = true;
	}
	setGridAlpha(Constants.GridConfig.DEFAULT_ALPHA);
}

/**
 * Hides the entire grid (for exiting game)
 */
function hideGrid() {
	if (script.gridParent) {
		script.gridParent.enabled = false;
	}
}

/**
 * Sets the alpha value for all grid tiles
 * @param {number} alpha - Alpha value 0-1
 */
function setGridAlpha(alpha) {
	for (var z = 0; z < gridConfig.tileObjects.length; z++) {
		for (var x = 0; x < gridConfig.tileObjects[z].length; x++) {
			var tileObject = gridConfig.tileObjects[z][x];
			if (tileObject) {
				var meshVisual = tileObject.getComponent("Component.RenderMeshVisual");
				if (meshVisual && meshVisual.mainPass) {
					var color = meshVisual.mainPass.baseColor;
					meshVisual.mainPass.baseColor = new vec4(color.r, color.g, color.b, alpha);
				}
			}
		}
	}
}

/**
 * Dims all grid tiles to background opacity
 * Used to show faint grid outline while focusing on path
 */
function dimGridBackground() {
	var dimAlpha = Constants.GridConfig.DIMMED_ALPHA;
	for (var z = 0; z < gridConfig.tileObjects.length; z++) {
		for (var x = 0; x < gridConfig.tileObjects[z].length; x++) {
			var tileObject = gridConfig.tileObjects[z][x];
			if (tileObject) {
				setTileAlpha(tileObject, dimAlpha);
			}
		}
	}
}

/**
 * Sets the alpha of a single tile
 * @param {SceneObject} tileObject - Tile to modify
 * @param {number} alpha - Alpha value 0-1
 */
function setTileAlpha(tileObject, alpha) {
	if (!tileObject) return;
	var meshVisual = tileObject.getComponent("Component.RenderMeshVisual");
	if (meshVisual && meshVisual.mainPass) {
		var color = meshVisual.mainPass.baseColor;
		meshVisual.mainPass.baseColor = new vec4(color.r, color.g, color.b, alpha);
	}
}

/**
 * Shows only the start tile brightly, keeps rest dimmed
 * This is the initial state after grid placement - creates focal point
 */
function showOnlyStartTile() {
	if (pathData.path.length === 0) return;

	// Dim entire grid
	dimGridBackground();

	// Show start tile bright yellow
	var startPos = pathData.path[0];
	var startTile = gridConfig.tileObjects[startPos.z][startPos.x];
	setTileColor(startTile, Constants.GridConfig.COLORS.TILE_START);
	setTileAlpha(startTile, Constants.GridConfig.VISIBLE_ALPHA);
}

/**
 * Shows the start tile with arrow pointing to first path direction
 * Used during countdown to guide player attention
 */
function showStartTileWithArrow() {
	if (pathData.path.length < 2) return;

	var startPos = pathData.path[0];
	var nextPos = pathData.path[1];
	var startTile = gridConfig.tileObjects[startPos.z][startPos.x];

	// Show arrow on start tile pointing to next tile
	showArrowOnTile(startTile, startPos, nextPos);
}

/**
 * Gets the total grid size in centimeters
 * @returns {number} Total size of the grid
 */
function getGridSize() {
	var totalTileSize = gridConfig.tileSize + gridConfig.tileGap;
	return Math.max(gridConfig.columns, gridConfig.rows) * totalTileSize;
}

/**
 * Shows the arrow on a tile, rotated to point toward the next tile
 * @param {SceneObject} tileObject - The tile containing the arrow child
 * @param {Object} currentPos - Current tile position {x, z}
 * @param {Object} nextPos - Next tile position {x, z}
 */
function showArrowOnTile(tileObject, currentPos, nextPos) {
	var arrowChild = findChildByName(tileObject, "Arrow");
	if (!arrowChild) return;

	// Calculate direction vector to next tile
	var dx = nextPos.x - currentPos.x;
	var dz = nextPos.z - currentPos.z;

	// Calculate Y rotation angle using atan2
	// Use atan2(-dz, dx) to align with grid orientation where +Z is toward player
	var angleRadians = Math.atan2(-dz, dx);

	// Use stored original X and Z rotation to keep arrow flat on tile
	// Only change Y rotation to point toward next tile
	var origEuler = tileObject.arrowOriginalRotation;
	if (origEuler) {
		var newRotation = quat.fromEulerAngles(origEuler.x, angleRadians, origEuler.z);
		arrowChild.getTransform().setLocalRotation(newRotation);
	}

	arrowChild.enabled = true;
}

/**
 * Hides all direction arrows on all tiles
 */
function hideAllArrows() {
	for (var z = 0; z < gridConfig.tileObjects.length; z++) {
		for (var x = 0; x < gridConfig.tileObjects[z].length; x++) {
			var tileObject = gridConfig.tileObjects[z][x];
			if (tileObject) {
				var arrowChild = findChildByName(tileObject, "Arrow");
				if (arrowChild) {
					arrowChild.enabled = false;
				}
			}
		}
	}
}

/**
 * Marks a tile as correctly stepped on
 * @param {number} gridX - Grid X coordinate
 * @param {number} gridZ - Grid Z coordinate
 */
function markTileCorrect(gridX, gridZ) {
	if (!isValidTilePosition(gridX, gridZ)) return;

	var tileObject = gridConfig.tileObjects[gridZ][gridX];
	gridConfig.tiles[gridZ][gridX].state = "correct";
	setTileColor(tileObject, Constants.GridConfig.COLORS.TILE_CORRECT);
}

/**
 * Marks a tile as incorrectly stepped on
 * @param {number} gridX - Grid X coordinate
 * @param {number} gridZ - Grid Z coordinate
 */
function markTileWrong(gridX, gridZ) {
	if (!isValidTilePosition(gridX, gridZ)) return;

	var tileObject = gridConfig.tileObjects[gridZ][gridX];
	gridConfig.tiles[gridZ][gridX].state = "wrong";
	setTileColor(tileObject, Constants.GridConfig.COLORS.TILE_WRONG);
}

/**
 * Resets all tile states to default
 */
function resetTileStates() {
	// Hide all arrows first to ensure clean slate
	hideAllArrows();

	for (var z = 0; z < gridConfig.rows; z++) {
		for (var x = 0; x < gridConfig.columns; x++) {
			gridConfig.tiles[z][x].state = "default";
			gridConfig.tiles[z][x].isPathTile = false;
			gridConfig.tiles[z][x].pathIndex = -1;

			var tileObject = gridConfig.tileObjects[z][x];
			setTileColor(tileObject, Constants.GridConfig.COLORS.TILE_DEFAULT);
		}
	}

	pathData.path = [];
	pathData.isRevealed = false;
}

/**
 * Checks if grid coordinates are valid
 * @param {number} gridX - X coordinate
 * @param {number} gridZ - Z coordinate
 * @returns {boolean} True if valid
 */
function isValidTilePosition(gridX, gridZ) {
	return MathHelpers.isValidGridPosition(gridX, gridZ, gridConfig.rows, gridConfig.columns);
}

/**
 * Gets tile data at the specified grid position
 * @param {number} gridX - X coordinate
 * @param {number} gridZ - Z coordinate
 * @returns {Object} Tile data or null
 */
function getTileAt(gridX, gridZ) {
	if (!isValidTilePosition(gridX, gridZ)) return null;
	return gridConfig.tiles[gridZ][gridX];
}

/**
 * Gets the current path
 * @returns {Array} Current path array
 */
function getPath() {
	return pathData.path;
}

/**
 * Gets grid configuration
 * @returns {Object} Grid configuration
 */
function getGridConfig() {
	return {
		rows: gridConfig.rows,
		columns: gridConfig.columns,
		tileSize: gridConfig.tileSize,
		tileGap: gridConfig.tileGap,
		origin: gridConfig.origin,
	};
}

/**
 * Checks if grid is initialized
 * @returns {boolean} Initialization state
 */
function isGridInitialized() {
	return isInitialized;
}

/**
 * Gets the start position of the current path
 * @returns {Object} Start position {x, z} or null
 */
function getPathStartPosition() {
	if (pathData.path.length === 0) return null;
	return pathData.path[0];
}

/**
 * Gets the world position of the start tile
 * @returns {vec3} World position of start tile center, or null
 */
function getStartTileWorldPosition() {
	if (!script.gridParent || pathData.path.length === 0) return null;

	var startGridPos = pathData.path[0];
	var tileObject = gridConfig.tileObjects[startGridPos.z][startGridPos.x];

	if (tileObject) {
		return tileObject.getTransform().getWorldPosition();
	}

	return null;
}

/**
 * Gets the world position of the start zone
 * (Area where player should stand before starting)
 * @returns {vec3} World position of start zone
 */
function getStartZoneWorldPosition() {
	if (!gridConfig.origin) return null;

	var startGridPos = getPathStartPosition();
	if (!startGridPos) {
		// If no path yet, use center of bottom edge
		startGridPos = { x: Math.floor(gridConfig.columns / 2), z: 0 };
	}

	// Get the world position of the start tile
	var startTileWorld = MathHelpers.gridToWorld(startGridPos.x, startGridPos.z, gridConfig.origin, gridConfig.tileSize, gridConfig.tileGap);

	// Offset backwards (negative Z) by the start zone offset
	return new vec3(startTileWorld.x, startTileWorld.y, startTileWorld.z - Constants.PlayerConfig.START_ZONE_OFFSET);
}

/**
 * Converts a world position to grid coordinates
 * Takes into account the gridParent's transform (rotation/position)
 * @param {vec3} worldPos - World position to convert
 * @returns {Object} Grid position {x, z} or null if outside grid
 */
function worldPositionToGrid(worldPos) {
	if (!script.gridParent || !isInitialized) return null;

	// Convert world position to local position relative to gridParent
	var parentTransform = script.gridParent.getTransform();
	var parentWorldPos = parentTransform.getWorldPosition();
	var parentWorldRot = parentTransform.getWorldRotation();

	// Get the inverse rotation to transform world to local
	var invRot = parentWorldRot.invert();

	// Translate to parent origin, then rotate to local space
	var relativePos = new vec3(worldPos.x - parentWorldPos.x, worldPos.y - parentWorldPos.y, worldPos.z - parentWorldPos.z);
	var localPos = invRot.multiplyVec3(relativePos);

	// Calculate grid position from local coordinates
	var totalTileSize = gridConfig.tileSize + gridConfig.tileGap;
	var gridWidth = gridConfig.columns * totalTileSize - gridConfig.tileGap;
	var offsetX = -gridWidth / 2;
	var halfTile = gridConfig.tileSize / 2;
	var startGridZ = gridConfig.rows - 1;

	// X: reverse the centering offset
	var adjustedX = localPos.x - offsetX;
	var gridX = Math.floor(adjustedX / totalTileSize);

	// Z: reverse the start-anchored positioning
	// localZ = halfTile + (gridZ - startGridZ) * totalTileSize
	// So: gridZ = startGridZ + floor((localZ - halfTile) / totalTileSize)
	var adjustedZ = localPos.z - halfTile;
	var gridZ = startGridZ + Math.floor(adjustedZ / totalTileSize);

	return { x: gridX, z: gridZ };
}

/**
 * Gets the grid parent SceneObject
 * @returns {SceneObject} The grid parent
 */
function getGridParent() {
	return script.gridParent;
}

/**
 * Registers a callback for trigger entry events
 * @param {Function} callback - Function(gridX, gridZ) called when a trigger is entered
 */
function onTriggerEntered(callback) {
	onTriggerEnteredCallback = callback;
}

/**
 * Resets all triggers so they can fire again
 * Call this when starting a new round
 */
function resetTriggers() {
	for (var z = 0; z < gridConfig.triggerObjects.length; z++) {
		for (var x = 0; x < gridConfig.triggerObjects[z].length; x++) {
			var triggerObject = gridConfig.triggerObjects[z][x];
			if (triggerObject) {
				var triggerScript = triggerObject.getComponent("Component.ScriptComponent");
				if (triggerScript && triggerScript.resetTrigger) {
					triggerScript.resetTrigger();
				}
			}
		}
	}
}

/**
 * Gets the world position of a specific tile
 * @param {number} gridX - Grid X coordinate
 * @param {number} gridZ - Grid Z coordinate
 * @returns {vec3} World position of tile center, or null if invalid
 */
function getTileWorldPosition(gridX, gridZ) {
	if (!isValidTilePosition(gridX, gridZ)) return null;

	var tileObject = gridConfig.tileObjects[gridZ][gridX];
	if (tileObject) {
		return tileObject.getTransform().getWorldPosition();
	}
	return null;
}

// Export functions on script (for SceneObject component scripts)
script.initialize = initialize;
script.generateNewPath = generateNewPath;
script.revealPath = revealPath;
script.revealPathSequential = revealPathSequential;
script.hidePath = hidePath;
script.dimGrid = dimGrid;
script.showGrid = showGrid;
script.hideGrid = hideGrid;
script.setGridAlpha = setGridAlpha;
script.dimGridBackground = dimGridBackground;
script.showOnlyStartTile = showOnlyStartTile;
script.showStartTileWithArrow = showStartTileWithArrow;
script.getGridSize = getGridSize;
script.markTileCorrect = markTileCorrect;
script.markTileWrong = markTileWrong;
script.resetTileStates = resetTileStates;
script.getTileAt = getTileAt;
script.getPath = getPath;
script.getGridConfig = getGridConfig;
script.isGridInitialized = isGridInitialized;
script.getPathStartPosition = getPathStartPosition;
script.getStartTileWorldPosition = getStartTileWorldPosition;
script.getStartZoneWorldPosition = getStartZoneWorldPosition;
script.clearGrid = clearGrid;
script.worldPositionToGrid = worldPositionToGrid;
script.getGridParent = getGridParent;
script.getTileWorldPosition = getTileWorldPosition;
script.onTriggerEntered = onTriggerEntered;
script.resetTriggers = resetTriggers;

// Initialize idle pulse animation loop
setupIdlePulseUpdate();
