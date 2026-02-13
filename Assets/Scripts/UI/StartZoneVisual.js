// StartZoneVisual.js
// Visual marker shown when player needs to return to start zone
// Uses collision-based detection for reliable player entry/exit

// @input SceneObject startZonePlane {"label": "Start Zone Plane", "hint": "Plane mesh for ground marker"}
// @input Physics.ColliderComponent zoneCollider {"label": "Zone Collider", "hint": "Trigger collider for detecting player entry (required)"}
// @input Component.ScriptComponent particlesScript {"label": "Particles Script", "hint": "Optional StartZoneParticles script for rising particle effect"}

var Constants = require("../Utils/Constants");

/**
 * StartZoneVisual Component
 * Shows when player needs to return to start (e.g., after wrong step)
 * Uses collision detection for reliable player entry/exit
 */

// State
var isActive = false;
var isPlayerInZone = false;

// Callbacks
var callbacks = {
	onPlayerEntered: null,
	onPlayerExited: null,
};

/**
 * Initializes the start zone
 * @param {vec3} gridOrigin - World position (unused, kept for compatibility)
 */
function initialize(gridOrigin) {
	if (!script.startZonePlane) return;

	// Don't override the color — use whatever is set in the editor
	// The editor's alpha/color settings are the source of truth
}

/**
 * Shows the start zone marker
 */
function show() {
	if (!script.startZonePlane) return;

	// Reset overlap state so stale flags don't carry between rounds
	isPlayerInZone = false;

	script.startZonePlane.enabled = true;
	isActive = true;

	// Start particle effect if available
	if (script.particlesScript && script.particlesScript.startEmitting) {
		script.particlesScript.startEmitting();
	}
}

/**
 * Hides the start zone marker
 */
function hide() {
	if (!script.startZonePlane) return;

	script.startZonePlane.enabled = false;
	isActive = false;

	// Stop particle effect if available
	if (script.particlesScript && script.particlesScript.stopEmitting) {
		script.particlesScript.stopEmitting();
	}
}

/**
 * Sets the zone color
 * @param {vec4} color - RGBA color
 */
function setZoneColor(color) {
	if (!script.startZonePlane) return;

	var meshVisual = script.startZonePlane.getComponent("Component.RenderMeshVisual");
	if (meshVisual && meshVisual.mainPass) {
		meshVisual.mainPass.baseColor = color;
	}
}

/**
 * Gets the world position of the start zone center
 * @returns {vec3} World position
 */
function getZoneWorldPosition() {
	if (script.startZonePlane) {
		return script.startZonePlane.getTransform().getWorldPosition();
	}
	return null;
}

/**
 * Checks if player is currently in zone
 * @returns {boolean} True if player in zone
 */
function isPlayerCurrentlyInZone() {
	return isPlayerInZone;
}

/**
 * Registers callback for player entering zone
 * @param {Function} callback - Function to call
 */
function onPlayerEntered(callback) {
	callbacks.onPlayerEntered = callback;
}

/**
 * Registers callback for player exiting zone
 * @param {Function} callback - Function to call
 */
function onPlayerExited(callback) {
	callbacks.onPlayerExited = callback;
}

/**
 * Sets up collision-based detection
 */
function setupCollisionDetection() {
	if (!script.zoneCollider) {
		print("StartZoneVisual: Warning - No Zone Collider assigned! Start zone detection will not work.");
		return;
	}

	// Register for overlap events (trigger collisions)
	script.zoneCollider.onOverlapEnter.add(function (eventArgs) {
		if (!isActive) return; // Only detect when zone is visible/active

		// Player entered zone
		if (!isPlayerInZone) {
			isPlayerInZone = true;
			// Don't override color — preserve editor settings
			if (callbacks.onPlayerEntered) {
				callbacks.onPlayerEntered();
			}
		}
	});

	script.zoneCollider.onOverlapExit.add(function (eventArgs) {
		if (!isActive) return;

		// Player exited zone
		if (isPlayerInZone) {
			isPlayerInZone = false;
			// Don't override color — preserve editor settings
			if (callbacks.onPlayerExited) {
				callbacks.onPlayerExited();
			}
		}
	});

	print("StartZoneVisual: Collision detection ready");
}

/**
 * Resets the zone state (call when starting new round)
 */
function reset() {
	isPlayerInZone = false;
}

// Hide on start and setup collision detection
script.createEvent("OnStartEvent").bind(function () {
	if (script.startZonePlane) {
		script.startZonePlane.enabled = false;
	}
	setupCollisionDetection();
});

// Export functions
script.initialize = initialize;
script.show = show;
script.hide = hide;
script.reset = reset;
script.getZoneWorldPosition = getZoneWorldPosition;
script.isPlayerCurrentlyInZone = isPlayerCurrentlyInZone;
script.onPlayerEntered = onPlayerEntered;
script.onPlayerExited = onPlayerExited;
