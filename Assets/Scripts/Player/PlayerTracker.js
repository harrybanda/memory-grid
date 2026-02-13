// PlayerTracker.js
// Tracks player position and validates movement on the grid
// Uses collision-based detection with trigger planes

// @input SceneObject cameraObject {"label": "Camera", "hint": "The main camera with Physics.ColliderComponent"}
// @input Component.ScriptComponent gridManagerScript {"label": "Grid Manager", "hint": "Reference to GridManager script component"}
// @input Component.ScriptComponent startZoneScript {"label": "Start Zone", "hint": "Reference to StartZoneVisual script component (optional)"}

// === CENTRALIZED AUDIO SYSTEM ===
// All game audio plays through this single AudioComponent
// @input Component.AudioComponent audioPlayer {"label": "Audio Player", "hint": "Single AudioComponent for ALL game audio"}
// @input Asset.AudioTrackAsset[] stepTracks {"label": "Step Tracks", "hint": "25 progressive pitch audio files (step_01 to step_25)"}
// @input Asset.AudioTrackAsset completionTrack {"label": "Completion Track", "hint": "Audio played on path complete"}
// @input Asset.AudioTrackAsset errorTrack {"label": "Error Track", "hint": "Audio played on wrong step / game over"}
// @input Asset.AudioTrackAsset countdownTrack {"label": "Countdown Track", "hint": "Audio played on countdown ticks (3, 2, 1)"}
// @input Asset.AudioTrackAsset watchTrack {"label": "Watch Track", "hint": "Audio played on WATCH (different from countdown)"}

var Constants = require("../Utils/Constants");
var MathHelpers = require("../Utils/MathHelpers");

/**
 * PlayerTracker Component
 * Uses collision-based detection: trigger planes at tile centers detect when
 * the player walks through them, filtering out head tilts.
 */

// Tracking state
var trackingState = {
	isTracking: false,
	floorY: 0,
	pathProgress: 0,
	stepsOnPath: [],
	currentTile: null,
};

// Callbacks
var callbacks = {
	onTileEntered: null,
	onTileExited: null,
	onCorrectStep: null,
	onWrongStep: null,
	onPathCompleted: null,
	onStartZoneEntered: null,
	onStartZoneExited: null,
};

// Reference to GridManager
var GridManager = null;

// Start zone state
var startZoneState = {
	isInZone: false,
};

/**
 * Logs a message using the visual TextLogger if available
 */
function debugLog(message) {
	if (!Constants.DebugConfig.ENABLED) return;

	if (global.textLogger) {
		global.textLogger.log(message);
	} else {
		print(message);
	}
}

// ============================================
// CENTRALIZED AUDIO FUNCTIONS
// ============================================

/**
 * Plays any audio track through the single audio player
 * @param {Asset.AudioTrackAsset} track - The audio track to play
 */
function playAudio(track) {
	if (!script.audioPlayer || !track) return;

	script.audioPlayer.audioTrack = track;
	script.audioPlayer.play(1);
}

/**
 * Plays the appropriate step sound based on progress
 * @param {number} stepNumber - The step number (1-indexed, after increment)
 */
function playStepSound(stepNumber) {
	if (!script.stepTracks || script.stepTracks.length === 0) return;

	// stepNumber is 1-indexed (1 = first step), array is 0-indexed
	var trackIndex = stepNumber - 1;

	// Clamp to available tracks
	if (trackIndex < 0) trackIndex = 0;
	if (trackIndex >= script.stepTracks.length) {
		trackIndex = script.stepTracks.length - 1;
	}

	var track = script.stepTracks[trackIndex];
	playAudio(track);
}

/**
 * Plays the completion sound (final step of path)
 */
function playCompletionSound() {
	playAudio(script.completionTrack);
}

/**
 * Plays the error sound (wrong step / game over)
 */
function playErrorSound() {
	playAudio(script.errorTrack);
}

/**
 * Plays the countdown tick sound (3, 2, 1)
 */
function playCountdownSound() {
	playAudio(script.countdownTrack);
}

/**
 * Plays the watch sound (different from countdown ticks)
 */
function playWatchSound() {
	playAudio(script.watchTrack);
}

/**
 * Initializes the player tracker
 * @param {number} floorY - Y coordinate of the floor plane
 */
function initialize(floorY) {
	trackingState.floorY = floorY || 0;
	trackingState.isTracking = false;
	trackingState.currentTile = null;
	trackingState.pathProgress = 0;
	trackingState.stepsOnPath = [];

	if (script.gridManagerScript) {
		GridManager = script.gridManagerScript;

		// Register for trigger events from GridManager
		if (GridManager.onTriggerEntered) {
			GridManager.onTriggerEntered(function (gridX, gridZ) {
				handleTriggerEntered(gridX, gridZ);
			});
		}
	}

	// Register for collision callbacks from StartZoneVisual
	if (script.startZoneScript) {
		script.startZoneScript.onPlayerEntered(function () {
			handleStartZoneCollisionEnter();
		});
		script.startZoneScript.onPlayerExited(function () {
			handleStartZoneCollisionExit();
		});
	}

	debugLog("PlayerTracker ready");
}

/**
 * Handles collision-based start zone entry
 */
function handleStartZoneCollisionEnter() {
	if (!startZoneState.isInZone) {
		startZoneState.isInZone = true;
		if (callbacks.onStartZoneEntered) {
			callbacks.onStartZoneEntered();
		}
	}
}

/**
 * Handles collision-based start zone exit
 */
function handleStartZoneCollisionExit() {
	if (startZoneState.isInZone) {
		startZoneState.isInZone = false;
		if (callbacks.onStartZoneExited) {
			callbacks.onStartZoneExited();
		}
	}
}

/**
 * Handles when a tile trigger is entered
 * @param {number} gridX - Grid X coordinate
 * @param {number} gridZ - Grid Z coordinate
 */
function handleTriggerEntered(gridX, gridZ) {
	if (!trackingState.isTracking) return;

	var newGridPos = { x: gridX, z: gridZ };

	// Check if this is a different tile
	if (MathHelpers.isSameGridPosition(newGridPos, trackingState.currentTile)) {
		return;
	}

	// Update tracking state
	var previousTile = trackingState.currentTile;
	trackingState.currentTile = newGridPos;

	// Trigger callbacks
	if (previousTile && callbacks.onTileExited) {
		callbacks.onTileExited(previousTile);
	}

	if (callbacks.onTileEntered) {
		callbacks.onTileEntered(newGridPos);
	}

	debugLog("Step: (" + gridX + "," + gridZ + ")");

	// Validate the step
	validateStep(newGridPos);
}

/**
 * Validates if the player stepped on the correct tile
 * @param {Object} gridPos - The grid position stepped on
 */
function validateStep(gridPos) {
	if (!GridManager) return;

	var path = GridManager.getPath();
	if (path.length === 0) return;

	// Debug mode: stepping on the end tile instantly completes the level
	// All other tiles are treated as correct (no wrong steps possible)
	if (Constants.DebugConfig.SKIP_PATH_CHECK) {
		var endPos = path[path.length - 1];

		GridManager.markTileCorrect(gridPos.x, gridPos.z);
		trackingState.stepsOnPath.push(gridPos);

		if (MathHelpers.isSameGridPosition(gridPos, endPos)) {
			// Reached the end tile — complete the level
			trackingState.pathProgress = path.length;
			debugLog("DEBUG: Reached end tile — PATH COMPLETE!");
			playCompletionSound();
			if (callbacks.onCorrectStep) {
				callbacks.onCorrectStep(gridPos, path.length, path.length);
			}
			if (callbacks.onPathCompleted) {
				callbacks.onPathCompleted(trackingState.stepsOnPath);
			}
		} else {
			trackingState.pathProgress++;
			debugLog("DEBUG: Step " + trackingState.pathProgress + " (any tile OK)");
			playStepSound(trackingState.pathProgress);
			if (callbacks.onCorrectStep) {
				callbacks.onCorrectStep(gridPos, trackingState.pathProgress, path.length);
			}
		}
		return;
	}

	// Normal mode: validate against expected path position
	var expectedPos = path[trackingState.pathProgress];

	if (MathHelpers.isSameGridPosition(gridPos, expectedPos)) {
		// Correct step
		trackingState.stepsOnPath.push(gridPos);
		trackingState.pathProgress++;

		GridManager.markTileCorrect(gridPos.x, gridPos.z);

		debugLog("CORRECT " + trackingState.pathProgress + "/" + path.length);

		if (callbacks.onCorrectStep) {
			callbacks.onCorrectStep(gridPos, trackingState.pathProgress, path.length);
		}

		if (trackingState.pathProgress >= path.length) {
			// Path complete - play completion sound instead of step sound
			debugLog("PATH COMPLETE!");
			playCompletionSound();
			if (callbacks.onPathCompleted) {
				callbacks.onPathCompleted(trackingState.stepsOnPath);
			}
		} else {
			// Not the last step - play progressive step sound
			playStepSound(trackingState.pathProgress);
		}
	} else {
		// Wrong step
		GridManager.markTileWrong(gridPos.x, gridPos.z);

		debugLog("WRONG - expected (" + expectedPos.x + "," + expectedPos.z + ")");

		if (callbacks.onWrongStep) {
			callbacks.onWrongStep(gridPos, expectedPos);
		}
	}
}

/**
 * Starts tracking player position
 */
function startTracking() {
	trackingState.isTracking = true;
	trackingState.pathProgress = 0;
	trackingState.stepsOnPath = [];
	trackingState.currentTile = null;

	// Reset triggers right before tracking starts
	// This ensures triggers fired while walking back to start are cleared
	if (GridManager && GridManager.resetTriggers) {
		GridManager.resetTriggers();
	}

	debugLog("Tracking started");
}

/**
 * Stops tracking player position
 */
function stopTracking() {
	trackingState.isTracking = false;
}

/**
 * Resets tracking state for new game
 */
function reset() {
	trackingState.currentTile = null;
	trackingState.pathProgress = 0;
	trackingState.stepsOnPath = [];

	// Reset triggers for next round
	if (GridManager && GridManager.resetTriggers) {
		GridManager.resetTriggers();
	}
}

/**
 * Resets the start zone state so stale data doesn't carry between rounds
 * Call this before checking isPlayerInStartZone() for a new round
 */
function resetStartZoneState() {
	startZoneState.isInZone = false;
}

/**
 * Gets the current world position of the player (camera)
 */
function getCameraWorldPosition() {
	if (!script.cameraObject) {
		return new vec3(0, 0, 0);
	}
	return script.cameraObject.getTransform().getWorldPosition();
}

/**
 * Gets the player's position projected onto the floor
 */
function getFloorPosition() {
	var cameraPos = getCameraWorldPosition();
	return MathHelpers.projectToFloor(cameraPos, trackingState.floorY);
}

/**
 * Gets whether player is currently in start zone
 */
function isPlayerInStartZone() {
	return startZoneState.isInZone;
}

/**
 * Gets current grid position
 */
function getCurrentGridPosition() {
	return trackingState.currentTile;
}

/**
 * Gets current tracking state
 */
function getTrackingState() {
	return {
		isTracking: trackingState.isTracking,
		currentGridPosition: trackingState.currentTile,
		pathProgress: trackingState.pathProgress,
		totalSteps: trackingState.stepsOnPath.length,
	};
}

/**
 * Gets the current progress along the path
 */
function getPathProgress() {
	return trackingState.pathProgress;
}

/**
 * Sets the floor Y coordinate
 */
function setFloorY(y) {
	trackingState.floorY = y;
}

// Callback registration
function onTileEntered(callback) {
	callbacks.onTileEntered = callback;
}

function onTileExited(callback) {
	callbacks.onTileExited = callback;
}

function onCorrectStep(callback) {
	callbacks.onCorrectStep = callback;
}

function onWrongStep(callback) {
	callbacks.onWrongStep = callback;
}

function onPathCompleted(callback) {
	callbacks.onPathCompleted = callback;
}

function onStartZoneEntered(callback) {
	callbacks.onStartZoneEntered = callback;
}

function onStartZoneExited(callback) {
	callbacks.onStartZoneExited = callback;
}

// Export API
script.initialize = initialize;
script.startTracking = startTracking;
script.stopTracking = stopTracking;
script.reset = reset;
script.resetStartZoneState = resetStartZoneState;
script.getCameraWorldPosition = getCameraWorldPosition;
script.getFloorPosition = getFloorPosition;
script.getCurrentGridPosition = getCurrentGridPosition;
script.isPlayerInStartZone = isPlayerInStartZone;
script.getTrackingState = getTrackingState;
script.getPathProgress = getPathProgress;
script.setFloorY = setFloorY;
script.onTileEntered = onTileEntered;
script.onTileExited = onTileExited;
script.onCorrectStep = onCorrectStep;
script.onWrongStep = onWrongStep;
script.onPathCompleted = onPathCompleted;
script.onStartZoneEntered = onStartZoneEntered;
script.onStartZoneExited = onStartZoneExited;

// Audio API exports
script.playErrorSound = playErrorSound;
script.playCountdownSound = playCountdownSound;
script.playWatchSound = playWatchSound;

// Global Audio API - allows any script to play sounds through the central audio player
// Merge with existing Audio API instead of overwriting
global.PathFinder = global.PathFinder || {};
global.PathFinder.Audio = global.PathFinder.Audio || {};
global.PathFinder.Audio.playError = playErrorSound;
global.PathFinder.Audio.playCountdown = playCountdownSound;
global.PathFinder.Audio.playWatch = playWatchSound;
global.PathFinder.Audio.playStep = playStepSound;
global.PathFinder.Audio.playCompletion = playCompletionSound;
