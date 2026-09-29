// LookDownHint.js
// Shows a hint text in front of the user after floor placement
// Text is parented to camera and auto-hides after a few seconds

// @input SceneObject cameraObject {"label": "Camera", "hint": "Main camera to parent hint to"}
// @input SceneObject hintContainer {"label": "Hint Container", "hint": "Container with hint text UI"}
// @input Component.Text hintText {"label": "Hint Text", "hint": "Text component for the hint message"}
// @input string hintMessage = "Look at the yellow tile below" {"label": "Hint Message"}
// @input vec3 hintOffset = {0, -10, 50} {"label": "Hint Offset", "hint": "Local offset from camera (X, Y, Z in cm)"}
// @input float displayDuration = 4.0 {"label": "Display Duration", "hint": "Seconds to show the hint"}
// @input float fadeOutDuration = 0.5 {"label": "Fade Out Duration", "hint": "Seconds to fade out"}

var isShowing = false;
var fadeTimer = 0;
var isFading = false;
var originalAlpha = 1.0;

// Incremented on every show/hide; a fade timer only acts if its token is still current
var showToken = 0;

/**
 * Initialize the hint system
 */
function initialize() {
	// Hide hint at start
	if (script.hintContainer) {
		script.hintContainer.enabled = false;
	}

	// Parent hint to camera
	if (script.hintContainer && script.cameraObject) {
		script.hintContainer.setParent(script.cameraObject);

		var tr = script.hintContainer.getTransform();
		tr.setLocalPosition(script.hintOffset);
		tr.setLocalRotation(quat.quatIdentity());
	}

	// Set hint message
	if (script.hintText) {
		script.hintText.text = script.hintMessage || "Look at the yellow tile below";

		// Store original alpha
		try {
			originalAlpha = script.hintText.textFill.color.a;
		} catch (e) {
			originalAlpha = 1.0;
		}
	}
}

/**
 * Show the default hint message
 */
function show() {
	showFor(getDefaultMessage(), script.displayDuration || 4.0);
}

/**
 * Show a message, fading it out after the given seconds (0 or less keeps it up until hide())
 * Each call invalidates earlier fade timers so they can't fade a newer message early
 * @param {string} text - Message to show
 * @param {number} seconds - Seconds before fading out
 */
function showFor(text, seconds) {
	showToken++;
	var token = showToken;

	// Always reset and re-show (allows re-displaying between rounds)
	isShowing = true;
	isFading = false;
	fadeTimer = 0;

	setMessage(text);

	// Reset alpha
	setTextAlpha(1.0);

	// Show container
	if (script.hintContainer) {
		script.hintContainer.enabled = true;
	}

	// Schedule auto-hide
	if (seconds > 0) {
		var hideDelay = script.createEvent("DelayedCallbackEvent");
		hideDelay.bind(function () {
			if (token === showToken) {
				startFadeOut();
			}
		});
		hideDelay.reset(seconds);
	}
}

function getDefaultMessage() {
	return script.hintMessage || "Look at the yellow tile below";
}

/**
 * Start fade out animation
 */
function startFadeOut() {
	if (!isShowing) return;
	isFading = true;
	fadeTimer = 0;
}

/**
 * Hide the hint immediately
 */
function hide() {
	showToken++;
	isShowing = false;
	isFading = false;

	if (script.hintContainer) {
		script.hintContainer.enabled = false;
	}

	// Reset alpha and message for next show, so mode text never leaks into Classic
	setTextAlpha(1.0);
	setMessage(getDefaultMessage());
}

/**
 * Update fade animation
 */
function update(deltaTime) {
	if (!isFading) return;

	fadeTimer += deltaTime;
	var fadeDuration = script.fadeOutDuration || 0.5;
	var progress = Math.min(fadeTimer / fadeDuration, 1.0);

	// Fade out
	var alpha = 1.0 - progress;
	setTextAlpha(alpha);

	// Hide when fade complete
	if (progress >= 1.0) {
		hide();
	}
}

/**
 * Set text alpha
 */
function setTextAlpha(alpha) {
	if (!script.hintText) return;

	try {
		var color = script.hintText.textFill.color;
		script.hintText.textFill.color = new vec4(color.r, color.g, color.b, alpha);
	} catch (e) {}
}

/**
 * Check if hint is currently showing
 */
function isHintShowing() {
	return isShowing;
}

/**
 * Update hint message
 */
function setMessage(message) {
	if (script.hintText) {
		script.hintText.text = message;
	}
}

// Initialize on start
script.createEvent("OnStartEvent").bind(function () {
	initialize();
});

// Update every frame for fade animation
script.createEvent("UpdateEvent").bind(function (eventData) {
	update(eventData.getDeltaTime());
});

// Script API
script.show = show;
script.showFor = showFor;
script.hide = hide;
script.setMessage = setMessage;
script.isShowing = isHintShowing;

// Global API
global.PathFinder = global.PathFinder || {};
global.PathFinder.LookDownHint = {
	show: show,
	showFor: showFor,
	hide: hide,
	setMessage: setMessage,
	isShowing: isHintShowing,
};
