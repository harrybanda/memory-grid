// CountdownDisplay.js
// Handles the 3-2-1 countdown and phase messages on the floor

// @input Component.Text3D countdownText {"label": "Countdown Text", "hint": "Text component for countdown numbers"}
// @input SceneObject textParent {"label": "Text Parent", "hint": "Parent object for positioning text on floor"}
// Audio is handled via global.PathFinder.Audio.playCountdown()

var Constants = require("../Utils/Constants");

/**
 * CountdownDisplay Component
 * Shows countdown numbers (3, 2, 1) then "WATCH" for memorize phase
 * Can also show "GO!" when play phase begins
 */

// State
var isCountingDown = false;
var currentNumber = 0;
var animationProgress = 0;
var onCompleteCallback = null;
var pendingHideEvent = null;
var skipNextUpdate = false; // Skip first update after starting to get clean deltaTime

// Animation settings
var SCALE_START = 0.5;
var SCALE_END = 1.5;
var ANIMATION_DURATION = 0.8; // Time for each number animation

/**
 * Initializes the countdown display
 * @param {vec3} floorPosition - Position on floor for countdown
 */
function initialize(floorPosition) {
	if (script.textParent && floorPosition) {
		script.textParent.getTransform().setWorldPosition(floorPosition);
	}

	// Hide initially
	hide();

	print("CountdownDisplay: Initialized");
}

/**
 * Shows the countdown display
 */
function show() {
	if (script.countdownText) {
		script.countdownText.getSceneObject().enabled = true;
	}
	if (script.textParent) {
		script.textParent.enabled = true;
	}
}

/**
 * Hides the countdown display
 */
function hide() {
	if (script.countdownText) {
		script.countdownText.getSceneObject().enabled = false;
	}
	if (script.textParent) {
		script.textParent.enabled = false;
	}
	isCountingDown = false;
}

/**
 * Starts the countdown sequence
 * @param {Function} onComplete - Callback when countdown finishes
 */
function startCountdown(onComplete) {
	// Cancel any pending events from previous countdown
	if (pendingHideEvent) {
		pendingHideEvent.enabled = false;
		pendingHideEvent = null;
	}

	// Reset all state
	onCompleteCallback = onComplete;
	currentNumber = 3;
	animationProgress = 0;
	skipNextUpdate = true; // Skip first update to avoid stale deltaTime

	show();
	showNumber(currentNumber);

	// Enable counting AFTER setup to avoid race conditions
	isCountingDown = true;

	print("CountdownDisplay: Starting countdown from 3");
}

/**
 * Shows a specific number or message with animation
 * @param {number} num - Number to display (3, 2, 1, or 0 for WATCH)
 */
function showNumber(num) {
	if (!script.countdownText) return;

	if (num > 0) {
		script.countdownText.text = num.toString();
		// Play countdown tick for 3, 2, 1
		if (global.PathFinder && global.PathFinder.Audio) {
			global.PathFinder.Audio.playCountdown();
		}
	} else {
		// End of countdown - time to memorize, NOT move
		script.countdownText.text = "WATCH";
		// Play different sound for WATCH
		if (global.PathFinder && global.PathFinder.Audio) {
			global.PathFinder.Audio.playWatch();
		}
	}

	// Reset animation
	animationProgress = 0;
}

/**
 * Shows a custom message (like "GO!" for play phase)
 * @param {string} message - Message to display
 * @param {number} duration - How long to show (seconds)
 * @param {Function} onComplete - Optional callback when done
 */
function showMessage(message, duration, onComplete) {
	if (!script.countdownText) {
		if (onComplete) onComplete();
		return;
	}

	show();
	script.countdownText.text = message;
	animationProgress = 0;

	// No sound for custom messages like "GO!"

	// Hide after duration
	var hideDelay = script.createEvent("DelayedCallbackEvent");
	hideDelay.bind(function () {
		hide();
		if (onComplete) onComplete();
	});
	hideDelay.reset(duration || 1.0);
}

/**
 * Updates the countdown animation
 * @param {number} deltaTime - Time since last frame
 */
function update(deltaTime) {
	if (!isCountingDown) return;

	// Skip first frame after starting to avoid stale deltaTime
	if (skipNextUpdate) {
		skipNextUpdate = false;
		return;
	}

	animationProgress += deltaTime;

	// Calculate scale based on animation progress
	var t = Math.min(animationProgress / ANIMATION_DURATION, 1.0);

	// Ease out cubic for smooth deceleration
	var easeT = 1 - Math.pow(1 - t, 3);
	var scale = SCALE_START + (SCALE_END - SCALE_START) * easeT;

	// Apply scale to text
	if (script.textParent) {
		var currentScale = script.textParent.getTransform().getLocalScale();
		script.textParent.getTransform().setLocalScale(new vec3(scale, scale, scale));
	}

	// Calculate alpha (fade in quickly, stay visible)
	var alpha = Math.min(t * 3, 1.0);
	if (script.countdownText && script.countdownText.textFill) {
		var textFill = script.countdownText.textFill;
		if (textFill.color) {
			var textColor = textFill.color;
			textFill.color = new vec4(textColor.r, textColor.g, textColor.b, alpha);
		}
	}

	// Check if animation for current number is complete
	if (animationProgress >= 1.0) {
		if (currentNumber > 0) {
			// Move to next number
			currentNumber--;
			animationProgress = 0;
			showNumber(currentNumber);
		} else {
			// Countdown complete
			finishCountdown();
		}
	}
}

/**
 * Finishes the countdown and triggers callback
 */
function finishCountdown() {
	isCountingDown = false;

	// Brief delay to show "WATCH" then hide and start memorize phase
	pendingHideEvent = script.createEvent("DelayedCallbackEvent");
	pendingHideEvent.bind(function () {
		hide();
		pendingHideEvent = null;
		if (onCompleteCallback) {
			onCompleteCallback();
		}
	});
	pendingHideEvent.reset(0.8);
}

/**
 * Cancels the countdown if in progress
 */
function cancelCountdown() {
	isCountingDown = false;
	hide();
	onCompleteCallback = null;
}

/**
 * Checks if countdown is currently active
 * @returns {boolean} True if counting down
 */
function isActive() {
	return isCountingDown;
}

// Setup update event
function setupUpdateEvent() {
	var lastTime = getTime();
	var updateEvent = script.createEvent("UpdateEvent");
	updateEvent.bind(function () {
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
script.startCountdown = startCountdown;
script.showMessage = showMessage;
script.cancelCountdown = cancelCountdown;
script.isActive = isActive;

// Initialize update loop
setupUpdateEvent();
