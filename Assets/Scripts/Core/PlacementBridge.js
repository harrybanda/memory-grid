// PlacementBridge.js
// Bridges the Surface Placement package with our game system
// Attach this script to the objectVisuals object that the Example script controls

// @input Component.ScriptComponent gameStateManager {"label": "Game State Manager", "hint": "Reference to GameStateManager script (optional - will use global API if not set)"}
// @input vec3 gridOffset {"label": "Grid Offset", "hint": "Offset from placement position to grid origin (in cm)"}

/**
 * PlacementBridge Component
 * Detects when the Surface Placement package has completed placement
 * and notifies the GameStateManager with the placement position
 */

var hasPlacementCompleted = false;
var lastEnabledState = false;
var isMonitoring = false;

/**
 * Called when the script initializes
 */
function onAwake() {
	// Wait for OnStartEvent so Example.ts has time to disable objectVisuals first
	script.createEvent("OnStartEvent").bind(onStart);
}

/**
 * Called after all scripts have initialized
 */
function onStart() {
	// Wait a frame to ensure Example.ts has disabled objectVisuals
	var delayEvent = script.createEvent("DelayedCallbackEvent");
	delayEvent.bind(function () {
		startMonitoring();
	});
	delayEvent.reset(0.1); // Wait 100ms to ensure Example.ts has run
}

/**
 * Starts monitoring for enabled state changes
 */
function startMonitoring() {
	var currentEnabled = script.getSceneObject().enabled;

	// If already enabled, placement has already completed
	if (currentEnabled && !hasPlacementCompleted) {
		onPlacementCompleted();
		return;
	}

	// Otherwise, start monitoring for future enable
	lastEnabledState = currentEnabled;
	isMonitoring = true;
	script.createEvent("UpdateEvent").bind(onUpdate);
}

/**
 * Called every frame to check for enabled state changes
 */
function onUpdate() {
	if (!isMonitoring) return;

	var currentEnabled = script.getSceneObject().enabled;

	// Detect when object becomes enabled (placement completed)
	if (currentEnabled && !lastEnabledState && !hasPlacementCompleted) {
		onPlacementCompleted();
	}

	lastEnabledState = currentEnabled;
}

/**
 * Called when the Surface Placement package completes placement
 * The Example script enables objectVisuals and sets its transform
 */
function onPlacementCompleted() {
	hasPlacementCompleted = true;

	var transform = script.getSceneObject().getTransform();
	var worldPosition = transform.getWorldPosition();
	var worldRotation = transform.getWorldRotation();

	// Calculate grid origin with optional offset
	var gridOrigin = worldPosition;
	if (script.gridOffset) {
		var offset = worldRotation.multiplyVec3(script.gridOffset);
		gridOrigin = new vec3(worldPosition.x + offset.x, worldPosition.y + offset.y, worldPosition.z + offset.z);
	}

	var floorY = worldPosition.y;

	// Hint is shown by GameStateManager at the right time
	// (after intro sequence on Level 1, or immediately on Level 2+)

	// Show exit button now that placement is complete
	if (global.PathFinder && global.PathFinder.PalmExit) {
		global.PathFinder.PalmExit.show();
	}

	// Notify GameStateManager
	if (script.gameStateManager && script.gameStateManager.onGridPlaced) {
		script.gameStateManager.onGridPlaced(gridOrigin, floorY);
	} else if (global.PathFinder && global.PathFinder.GameStateManager && global.PathFinder.GameStateManager.onGridPlaced) {
		global.PathFinder.GameStateManager.onGridPlaced(gridOrigin, floorY);
	}
}

/**
 * Resets the placement bridge to allow re-placement
 * Call this if you want to allow the user to re-place the grid
 */
function resetPlacement() {
	hasPlacementCompleted = false;
	lastEnabledState = script.getSceneObject().enabled;
	isMonitoring = true;
}

/**
 * Gets the current placement state
 * @returns {boolean} True if placement has been completed
 */
function isPlacementCompleted() {
	return hasPlacementCompleted;
}

/**
 * Gets the world position of the placed surface
 * @returns {vec3} World position or null if not placed
 */
function getPlacementPosition() {
	if (!hasPlacementCompleted) return null;
	return script.getSceneObject().getTransform().getWorldPosition();
}

/**
 * Gets the world rotation of the placed surface
 * @returns {quat} World rotation or null if not placed
 */
function getPlacementRotation() {
	if (!hasPlacementCompleted) return null;
	return script.getSceneObject().getTransform().getWorldRotation();
}

// Export functions
script.resetPlacement = resetPlacement;
script.isPlacementCompleted = isPlacementCompleted;
script.getPlacementPosition = getPlacementPosition;
script.getPlacementRotation = getPlacementRotation;

// Global API for other scripts to access
global.PathFinder = global.PathFinder || {};
global.PathFinder.Placement = {
	reset: function () {
		resetPlacement();
		// Disable objectVisuals so Example.ts can re-enable on next placement
		script.getSceneObject().enabled = false;
	},
	isCompleted: isPlacementCompleted,
	getPosition: getPlacementPosition,
	getRotation: getPlacementRotation,
};

// Initialize (registers for OnStartEvent)
onAwake();
