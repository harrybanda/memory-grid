// TileTrigger.js
// Trigger plane that detects when the player walks into a tile
// Attach this script to a trigger collider prefab

// @input int gridX = 0 {"label": "Grid X", "hint": "X coordinate of the tile this trigger leads to"}
// @input int gridZ = 0 {"label": "Grid Z", "hint": "Z coordinate of the tile this trigger leads to"}
// @input string direction = "forward" {"label": "Direction", "hint": "Which direction this trigger faces (forward, back, left, right)"}

/**
 * TileTrigger Component
 *
 * This script should be attached to a prefab containing:
 * - A Physics.ColliderComponent (Box or convex mesh)
 * - The collider should be set as a TRIGGER (not solid)
 *
 * When the camera's collider enters this trigger, it fires an event
 * that PlayerTracker listens for.
 */

// Reference to the collider component on this object
var collider = null;

// Track if we've already triggered (prevent double-fires)
var hasTriggered = false;

// Callback function set by GridManager
var onTriggerCallback = null;

/**
 * Initializes the trigger with tile information
 * Called by GridManager when spawning triggers
 * @param {number} x - Grid X coordinate
 * @param {number} z - Grid Z coordinate
 * @param {string} dir - Direction this trigger faces
 * @param {Function} callback - Function to call when triggered
 */
function setup(x, z, dir, callback) {
	script.gridX = x;
	script.gridZ = z;
	script.direction = dir;
	onTriggerCallback = callback;
	hasTriggered = false;
}

/**
 * Resets the trigger so it can fire again
 * Called when starting a new round or resetting the game
 */
function resetTrigger() {
	hasTriggered = false;
}

/**
 * Called when another collider enters this trigger
 * @param {CollisionEnterEventArgs} eventArgs - Collision event data
 */
function onOverlapEnter(eventArgs) {
	if (hasTriggered) return;

	// Only accept overlaps from the actual camera collider.
	// This prevents child UI/interactable colliders from triggering tiles early.
	if (!isCameraColliderOverlap(eventArgs)) {
		return;
	}

	// Mark as triggered to prevent double-fires
	hasTriggered = true;

	// Fire the callback with tile coordinates
	if (onTriggerCallback) {
		onTriggerCallback({
			x: script.gridX,
			z: script.gridZ,
			direction: script.direction,
		});
	}
}

/**
 * Extracts the collider that entered this trigger from overlap event args.
 * @param {Object} eventArgs
 * @returns {Physics.ColliderComponent|null}
 */
function getOtherColliderFromEvent(eventArgs) {
	if (!eventArgs) return null;

	// Lens overlap events expose the incoming collider via eventArgs.overlap.collider.
	if (eventArgs.overlap && eventArgs.overlap.collider) {
		return eventArgs.overlap.collider;
	}

	// Fallbacks for compatibility with different runtime wrappers.
	if (eventArgs.collider) return eventArgs.collider;
	if (eventArgs.otherCollider) return eventArgs.otherCollider;

	return null;
}

/**
 * True when the overlap came from a collider on a Camera SceneObject.
 * @param {Object} eventArgs
 * @returns {boolean}
 */
function isCameraColliderOverlap(eventArgs) {
	var otherCollider = getOtherColliderFromEvent(eventArgs);
	if (!otherCollider || !otherCollider.getSceneObject) return false;

	var otherObj = otherCollider.getSceneObject();
	if (!otherObj || !otherObj.getComponent) return false;

	// Require the collider to be on the camera object itself.
	// Child objects (e.g., popup UI) should not pass this check.
	return !!otherObj.getComponent("Component.Camera");
}

/**
 * Sets up collision detection on this trigger
 */
function setupCollisionDetection() {
	// Try to find collider component
	collider = script.getSceneObject().getComponent("Physics.ColliderComponent");

	if (!collider) {
		print("TileTrigger: Warning - No ColliderComponent found on " + script.getSceneObject().name);
		return;
	}

	// Register for overlap events (trigger collisions)
	collider.onOverlapEnter.add(onOverlapEnter);
}

// Initialize on script start
var onStartEvent = script.createEvent("OnStartEvent");
onStartEvent.bind(function () {
	setupCollisionDetection();
});

// Export API
script.setup = setup;
script.resetTrigger = resetTrigger;
script.getGridX = function () {
	return script.gridX;
};
script.getGridZ = function () {
	return script.gridZ;
};
