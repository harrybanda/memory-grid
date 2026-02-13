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
 * Show the hint
 */
function show() {
	// Always reset and re-show (allows re-displaying between rounds)
	isShowing = true;
	isFading = false;
	fadeTimer = 0;

	// Reset alpha
	setTextAlpha(1.0);

	// Show container
	if (script.hintContainer) {
		script.hintContainer.enabled = true;
	}

	// Schedule auto-hide
	var hideDelay = script.createEvent("DelayedCallbackEvent");
	hideDelay.bind(function () {
		startFadeOut();
	});
	hideDelay.reset(script.displayDuration || 4.0);
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
	isShowing = false;
	isFading = false;

	if (script.hintContainer) {
		script.hintContainer.enabled = false;
	}

	// Reset alpha for next show
	setTextAlpha(1.0);
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
script.hide = hide;
script.setMessage = setMessage;
script.isShowing = isHintShowing;

// Global API
global.PathFinder = global.PathFinder || {};
global.PathFinder.LookDownHint = {
	show: show,
	hide: hide,
	setMessage: setMessage,
	isShowing: isHintShowing,
};
