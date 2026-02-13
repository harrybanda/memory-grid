// HostManager.js
// Manages the robot host avatar with billboard behavior and dialogue

// @input SceneObject hostObject {"label": "Host Object", "hint": "SceneObject for the host avatar (placeholder or 3D model)"}
// @input SceneObject cameraObject {"label": "Camera", "hint": "Main camera for billboard behavior"}
// @input Component.Text subtitleText {"label": "Subtitle Text", "hint": "Optional text component for subtitles"}

// @ui {"widget": "separator"}
// @ui {"widget": "label", "label": "Host Position Offset"}
// @input float forwardDistance = 150 {"label": "Forward Distance (cm)", "hint": "How far in front of the camera the host appears"}
// @input float heightOffset = 150 {"label": "Height Offset (cm)", "hint": "Height above the floor"}
// @input float lateralOffset = 0 {"label": "Lateral Offset (cm)", "hint": "Left/right offset (negative = left, positive = right)"}
// @input float followEasing = 0.08 {"label": "Follow Easing", "hint": "How smoothly the host follows the camera (0.01 = very smooth, 1.0 = instant)"}

var Constants = require("../Utils/Constants");
var DialogueLines = require("../Utils/DialogueLines");

/**
 * HostManager Component
 * Controls the robot host that guides players through the game
 * Audio is played via global.PathFinder.Audio (AudioManager)
 */

// State
var isVisible = false;
var isPlayingDialogue = false;
var currentDialogue = null;
var dialogueTimer = 0;
var onDialogueCompleteCallback = null;
var usingAudioPlayback = false; // True if audio is playing, false if using timer fallback

// Scale animation state (for smooth show/hide)
var currentScaleEvent = null;

// Auto-hide timer: hides the host after dialogue ends, unless a new dialogue starts
var autoHideEvent = null;

// Billboard settings
var billboardEnabled = true;

// Floor Y stored from initialize (keeps host at consistent height)
var hostFloorY = 0;

// Talking animation: gentle floating/bobbing while speaking (applied on top of follow position)
var talkingAnimation = {
	time: 0,
	BOB_SPEED: 1, // Up/down oscillations per second
	BOB_HEIGHT: 1.5, // cm up/down amplitude
	SWAY_SPEED: 0.8, // Side-to-side oscillations per second
	SWAY_AMOUNT: 0.5, // cm left/right amplitude
};

function isSceneObjectValid(sceneObject) {
	return sceneObject && !sceneObject.isDestroyed;
}

function hasValidScriptContext() {
	try {
		return isSceneObjectValid(script.getSceneObject());
	} catch (e) {
		return false;
	}
}

function createSafeEvent(eventType) {
	if (!hasValidScriptContext()) return null;
	try {
		return script.createEvent(eventType);
	} catch (e) {
		print("HostManager: Failed to create " + eventType + " - " + e);
		return null;
	}
}

function createSafeDelayedEvent(callback, delay) {
	var evt = createSafeEvent("DelayedCallbackEvent");
	if (!evt) {
		if (callback) callback();
		return null;
	}

	evt.bind(callback || function () {});
	evt.reset(delay || 0);
	return evt;
}

/**
 * Initializes the host at a position in front of the user
 * @param {vec3} floorPosition - Position on floor where grid is placed
 */
function initialize(floorPosition) {
	if (!isSceneObjectValid(script.hostObject)) {
		print("HostManager: No host object assigned");
		return;
	}

	// Store floor Y for consistent height (host stays at floor + heightOffset)
	hostFloorY = floorPosition.y;

	// Snap to initial target position so the object is in the right spot
	var targetPos = getTargetPosition();
	if (targetPos) {
		script.hostObject.getTransform().setWorldPosition(targetPos);
	}

	// Start fully hidden (no animation)
	cancelScaleAnimation();
	script.hostObject.enabled = false;
	isVisible = false;

	// Ensure scale is at zero so first show() scales in from nothing
	script.hostObject.getTransform().setLocalScale(new vec3(0, 0, 0));

	// Clear subtitles
	if (script.subtitleText) {
		script.subtitleText.text = "";
	}

	print("HostManager: Initialized");
}

/**
 * Computes the target world position for the host:
 * fixed distance in front of camera, at floor height + offset.
 * Uses horizontal forward only so looking up/down doesn't change distance.
 * @returns {vec3} Target world position, or null if no camera
 */
function getTargetPosition() {
	if (!isSceneObjectValid(script.cameraObject)) return null;

	var forwardDist = script.forwardDistance !== undefined ? script.forwardDistance : Constants.HostConfig.DISTANCE_FROM_USER;
	var heightOff = script.heightOffset !== undefined ? script.heightOffset : Constants.HostConfig.HEIGHT_OFFSET;
	var lateralOff = script.lateralOffset || 0;

	var cameraPos = script.cameraObject.getTransform().getWorldPosition();
	var cameraForward = script.cameraObject.getTransform().forward;

	// Normalize forward on XZ plane (ignore pitch so looking up/down doesn't change distance)
	var fwdX = cameraForward.x;
	var fwdZ = cameraForward.z;
	var fwdLen = Math.sqrt(fwdX * fwdX + fwdZ * fwdZ);
	if (fwdLen > 0.001) {
		fwdX /= fwdLen;
		fwdZ /= fwdLen;
	}

	// Right vector (perpendicular to forward on XZ plane)
	var rightX = -fwdZ;
	var rightZ = fwdX;

	return new vec3(cameraPos.x + fwdX * forwardDist + rightX * lateralOff, hostFloorY + heightOff, cameraPos.z + fwdZ * forwardDist + rightZ * lateralOff);
}

/**
 * Cancels any in-progress scale animation
 */
function cancelScaleAnimation() {
	if (currentScaleEvent) {
		currentScaleEvent.enabled = false;
		currentScaleEvent = null;
	}
}

/**
 * Shows the host with a smooth scale-in
 */
function show() {
	if (!isSceneObjectValid(script.hostObject)) return;
	if (isVisible) return;

	cancelScaleAnimation();

	isVisible = true;
	script.hostObject.enabled = true;

	// Snap to current target position so host appears in front of camera instantly
	var targetPos = getTargetPosition();
	if (targetPos) {
		script.hostObject.getTransform().setWorldPosition(targetPos);
	}

	var transform = script.hostObject.getTransform();
	var targetScale = Constants.HostConfig.PLACEHOLDER_SIZE;

	// Start from current scale (handles interrupting a scale-out gracefully)
	var startScale = transform.getLocalScale().x;
	if (startScale < 0.01) startScale = 0;

	var progress = targetScale > 0 ? startScale / targetScale : 0;

	currentScaleEvent = createSafeEvent("UpdateEvent");
	if (!currentScaleEvent) {
		transform.setLocalScale(new vec3(targetScale, targetScale, targetScale));
		return;
	}

	currentScaleEvent.bind(function () {
		if (!isSceneObjectValid(script.hostObject)) {
			currentScaleEvent.enabled = false;
			currentScaleEvent = null;
			return;
		}

		progress += getDeltaTime() * 2.5; // ~0.4 second scale-in
		var t = Math.min(progress, 1.0);

		// Ease-out cubic (smooth deceleration)
		var easeT = 1 - Math.pow(1 - t, 3);
		var scale = targetScale * easeT;

		transform.setLocalScale(new vec3(scale, scale, scale));

		if (t >= 1.0) {
			currentScaleEvent.enabled = false;
			currentScaleEvent = null;
		}
	});

	print("HostManager: Scale-in");
}

/**
 * Hides the host with a smooth scale-out, then disables the object
 */
function hide() {
	if (!isSceneObjectValid(script.hostObject)) return;
	if (!isVisible) return;

	// Cancel any pending auto-hide timer
	if (autoHideEvent) {
		autoHideEvent.enabled = false;
		autoHideEvent = null;
	}

	cancelScaleAnimation();

	isVisible = false;

	// Clear subtitles immediately
	if (script.subtitleText) {
		script.subtitleText.text = "";
	}

	var transform = script.hostObject.getTransform();
	var startScale = transform.getLocalScale().x;

	// If already at zero, just disable
	if (startScale < 0.01) {
		script.hostObject.enabled = false;
		return;
	}

	var progress = 0;

	currentScaleEvent = createSafeEvent("UpdateEvent");
	if (!currentScaleEvent) {
		script.hostObject.enabled = false;
		return;
	}

	currentScaleEvent.bind(function () {
		if (!isSceneObjectValid(script.hostObject)) {
			currentScaleEvent.enabled = false;
			currentScaleEvent = null;
			return;
		}

		progress += getDeltaTime() * 3.0; // ~0.33 second scale-out
		var t = Math.min(progress, 1.0);

		// Ease-in quadratic (accelerates into nothing)
		var easeT = t * t;
		var scale = startScale * (1 - easeT);

		transform.setLocalScale(new vec3(scale, scale, scale));

		if (t >= 1.0) {
			script.hostObject.enabled = false;
			currentScaleEvent.enabled = false;
			currentScaleEvent = null;
		}
	});

	print("HostManager: Scale-out");
}

/**
 * Updates the host: follow camera, bobbing animation, billboard rotation
 * @param {number} deltaTime - Time since last frame
 */
function update(deltaTime) {
	// Update dialogue timer even when hidden (for callbacks to fire)
	// Only use timer if not using audio playback (audio has its own completion callback)
	if (isPlayingDialogue && currentDialogue && !usingAudioPlayback) {
		dialogueTimer -= deltaTime;

		if (dialogueTimer <= 0) {
			finishDialogue();
		}
	}

	if (!isVisible) return;
	if (!isSceneObjectValid(script.hostObject) || !isSceneObjectValid(script.cameraObject)) return;

	// 1. Compute where the host should be (fixed distance in front of camera)
	var targetPos = getTargetPosition();
	if (!targetPos) return;

	// 2. Smoothly lerp toward target (frame-rate independent easing)
	var currentPos = script.hostObject.getTransform().getWorldPosition();
	var easing = script.followEasing || 0.08;
	var lerpFactor = 1 - Math.pow(1 - easing, deltaTime * 60);

	var newX = currentPos.x + (targetPos.x - currentPos.x) * lerpFactor;
	var newY = currentPos.y + (targetPos.y - currentPos.y) * lerpFactor;
	var newZ = currentPos.z + (targetPos.z - currentPos.z) * lerpFactor;

	// 3. Add bobbing/sway offset if speaking
	if (isPlayingDialogue) {
		talkingAnimation.time += deltaTime;

		var bobY = Math.sin(talkingAnimation.time * talkingAnimation.BOB_SPEED * Math.PI * 2) * talkingAnimation.BOB_HEIGHT;
		var swayAmount = Math.sin(talkingAnimation.time * talkingAnimation.SWAY_SPEED * Math.PI * 2) * talkingAnimation.SWAY_AMOUNT;

		// Sway perpendicular to camera-host direction (always left/right from player's view)
		var camPos = script.cameraObject.getTransform().getWorldPosition();
		var dx = newX - camPos.x;
		var dz = newZ - camPos.z;
		var len = Math.sqrt(dx * dx + dz * dz);

		if (len > 0.01) {
			// Right vector = perpendicular to forward on XZ plane
			newX += (-dz / len) * swayAmount;
			newZ += (dx / len) * swayAmount;
		}

		newY += bobY;
	}

	script.hostObject.getTransform().setWorldPosition(new vec3(newX, newY, newZ));

	// 4. Billboard: always face the camera
	if (billboardEnabled) {
		updateBillboard();
	}
}

/**
 * Updates billboard rotation to face camera
 */
function updateBillboard() {
	if (!isSceneObjectValid(script.hostObject) || !isSceneObjectValid(script.cameraObject)) return;

	var hostTransform = script.hostObject.getTransform();
	var cameraPos = script.cameraObject.getTransform().getWorldPosition();
	var hostPos = hostTransform.getWorldPosition();

	// Calculate direction to camera (horizontal only)
	var dirX = cameraPos.x - hostPos.x;
	var dirZ = cameraPos.z - hostPos.z;

	// Calculate Y rotation angle
	var angle = Math.atan2(dirX, dirZ);

	// Apply rotation (only Y axis for billboard)
	var rotation = quat.fromEulerAngles(0, angle, 0);
	hostTransform.setWorldRotation(rotation);
}

/**
 * Plays a dialogue line
 * @param {Object} dialogue - Dialogue object with id, text, duration
 * @param {Function} onComplete - Callback when dialogue finishes
 */
function playDialogue(dialogue, onComplete) {
	if (!dialogue) return;

	currentDialogue = dialogue;
	isPlayingDialogue = true;
	onDialogueCompleteCallback = onComplete;

	// Cancel any pending auto-hide from a previous dialogue in a chain
	if (autoHideEvent) {
		autoHideEvent.enabled = false;
		autoHideEvent = null;
	}

	// Always show the host when speaking (it follows the camera, so always visible)
	show();

	// Show subtitle (skip for sfxOnly)
	if (script.subtitleText) {
		script.subtitleText.text = dialogue.sfxOnly ? "" : dialogue.text;
	}

	// Reset talking animation timer for fresh bobbing
	talkingAnimation.time = 0;

	// Try to play audio via AudioManager
	var audioPlayed = false;
	if (global.PathFinder && global.PathFinder.Audio) {
		audioPlayed = global.PathFinder.Audio.play(dialogue.id, function () {
			// Audio finished - complete dialogue
			finishDialogue();
		});
	}

	if (audioPlayed) {
		// Audio is playing - completion handled by AudioManager callback
		usingAudioPlayback = true;
		dialogueTimer = 0; // Don't use timer
		print("[HOST AUDIO]: " + dialogue.id);
	} else {
		// No audio available - use timer fallback
		usingAudioPlayback = false;
		dialogueTimer = dialogue.duration;
		// Log to console as placeholder
		DialogueLines.logHostDialogue(dialogue);
	}
}

/**
 * Plays dialogue by ID string
 * @param {string} dialogueId - ID from DialogueLines
 * @param {Function} onComplete - Callback when dialogue finishes
 */
function playDialogueById(dialogueId, onComplete) {
	var dialogue = DialogueLines.getDialogueById(dialogueId);
	if (dialogue) {
		playDialogue(dialogue, onComplete);
	} else {
		print("HostManager: Unknown dialogue ID - " + dialogueId);
		if (onComplete) onComplete();
	}
}

/**
 * Plays the shortened welcome sequence (first-time players)
 * Welcome → brief pause → Explain Goal
 * Level announcement is played separately after this completes.
 * @param {Function} onComplete - Callback when sequence finishes
 */
function playWelcomeSequence(onComplete) {
	playDialogue(DialogueLines.Dialogue.WELCOME, function () {
		createSafeDelayedEvent(function () {
			playDialogue(DialogueLines.Dialogue.EXPLAIN_GOAL, function () {
				if (onComplete) onComplete();
			});
		}, 0.5);
	});
}

/**
 * Plays level announcement
 * @param {number} level - Level number (1-11)
 * @param {Function} onComplete - Callback when dialogue finishes
 */
function playLevelAnnouncement(level, onComplete) {
	var dialogue = DialogueLines.getLevelDialogue(level);
	playDialogue(dialogue, onComplete);
}

/**
 * Plays a success response
 * @param {boolean} firstTry - Whether completed on first try
 * @param {Function} onComplete - Callback when dialogue finishes
 */
function playSuccessResponse(firstTry, onComplete) {
	// Handle optional firstTry parameter (for backwards compatibility)
	if (typeof firstTry === "function") {
		onComplete = firstTry;
		firstTry = false;
	}
	var dialogue = DialogueLines.getRandomSuccessDialogue(firstTry);
	playDialogue(dialogue, onComplete);
}

/**
 * Plays a failure response
 * @param {number} retryCount - Number of retries on this level
 * @param {Function} onComplete - Callback when dialogue finishes
 */
function playFailResponse(retryCount, onComplete) {
	// Handle optional retryCount parameter (for backwards compatibility)
	if (typeof retryCount === "function") {
		onComplete = retryCount;
		retryCount = 1;
	}
	var dialogue = DialogueLines.getRandomFailDialogue(retryCount);
	playDialogue(dialogue, onComplete);
}

/**
 * Plays level up announcement
 * @param {number} newLevel - The level just reached
 * @param {Function} onComplete - Callback when dialogue finishes
 */
function playLevelUp(newLevel, onComplete) {
	var dialogue = DialogueLines.getLevelUpDialogue(newLevel);
	playDialogue(dialogue, onComplete);
}

/**
 * Plays game completion dialogue
 * @param {boolean} flawless - Whether completed without retries
 * @param {Function} onComplete - Callback when dialogue finishes
 */
function playGameComplete(flawless, onComplete) {
	var dialogue = DialogueLines.getGameCompleteDialogue(flawless);
	playDialogue(dialogue, onComplete);
}

/**
 * Finishes current dialogue
 */
function finishDialogue() {
	// Host script can be torn down while audio callback is still pending (e.g. exit flow).
	// In that case, avoid creating events and just finalize state safely.
	if (!hasValidScriptContext()) {
		isPlayingDialogue = false;
		usingAudioPlayback = false;
		talkingAnimation.time = 0;
		currentDialogue = null;
		var destroyedCallback = onDialogueCompleteCallback;
		onDialogueCompleteCallback = null;
		if (destroyedCallback) {
			destroyedCallback();
		}
		return;
	}

	isPlayingDialogue = false;
	usingAudioPlayback = false;

	// Reset bobbing timer (position is handled by continuous follow in update)
	talkingAnimation.time = 0;

	// Schedule auto-hide after a grace period
	// If another playDialogue() starts before this fires (chained dialogues), it gets cancelled
	if (autoHideEvent) {
		autoHideEvent.enabled = false;
		autoHideEvent = null;
	}
	autoHideEvent = createSafeDelayedEvent(function () {
		autoHideEvent = null;
		hide();
	}, 1.0); // 1 second grace — longer than the 0.5s pause between chained lines

	// Clear subtitle
	if (script.subtitleText) {
		script.subtitleText.text = "";
	}

	var callback = onDialogueCompleteCallback;
	currentDialogue = null;
	onDialogueCompleteCallback = null;

	if (callback) {
		callback();
	}
}

/**
 * Skips current dialogue and stops audio if playing
 */
function skipDialogue() {
	if (isPlayingDialogue) {
		// Stop audio if playing via AudioManager
		if (usingAudioPlayback && global.PathFinder && global.PathFinder.Audio) {
			global.PathFinder.Audio.stop();
		}
		dialogueTimer = 0;
		finishDialogue();
	}
}

/**
 * Sets billboard behavior on/off
 * @param {boolean} enabled - Whether to enable billboard
 */
function setBillboardEnabled(enabled) {
	billboardEnabled = enabled;
}

/**
 * Instantly snaps host to current target position (in front of camera)
 * Normally the follow handles this smoothly, but this forces an immediate snap.
 */
function repositionToCamera() {
	if (!isSceneObjectValid(script.hostObject)) return;

	var targetPos = getTargetPosition();
	if (targetPos) {
		script.hostObject.getTransform().setWorldPosition(targetPos);
	}
}

/**
 * Checks if host is currently visible
 * @returns {boolean} True if visible
 */
function isHostVisible() {
	return isVisible;
}

/**
 * Checks if dialogue is playing
 * @returns {boolean} True if playing
 */
function isDialoguePlaying() {
	return isPlayingDialogue;
}

// Setup update event
function setupUpdateEvent() {
	var lastTime = getTime();
	var updateEvent = createSafeEvent("UpdateEvent");
	if (!updateEvent) return;

	updateEvent.bind(function () {
		if (!hasValidScriptContext()) {
			updateEvent.enabled = false;
			return;
		}

		var currentTime = getTime();
		var deltaTime = currentTime - lastTime;
		lastTime = currentTime;
		update(deltaTime);
	});
}

// Export functions
script.initialize = initialize;
script.show = show;
script.hide = hide;
script.playDialogue = playDialogue;
script.playDialogueById = playDialogueById;
script.playWelcomeSequence = playWelcomeSequence;
script.playLevelAnnouncement = playLevelAnnouncement;
script.playSuccessResponse = playSuccessResponse;
script.playFailResponse = playFailResponse;
script.playLevelUp = playLevelUp;
script.playGameComplete = playGameComplete;
script.skipDialogue = skipDialogue;
script.setBillboardEnabled = setBillboardEnabled;
script.repositionToCamera = repositionToCamera;
script.isHostVisible = isHostVisible;
script.isDialoguePlaying = isDialoguePlaying;

// Hide the host object immediately so it's never visible before initialize() is called
if (script.hostObject) {
	script.hostObject.getTransform().setLocalScale(new vec3(0, 0, 0));
	script.hostObject.enabled = false;
}

// Initialize update loop
setupUpdateEvent();
