// SpaceReminder.js
// Shows a message before floor placement ("Make sure you have enough open space around you before placing the grid on the floor.")
// Displays for a few seconds, then fades out and calls a callback (e.g. to show floor placement)

var AnimationManager = require("../Utils/AnimationManager");

// @input SceneObject cameraObject {"label": "Camera", "hint": "Main camera to parent reminder to"}
// @input SceneObject reminderContainer {"label": "Reminder Container", "hint": "Container with text UI (Text or Text3D component)"}
// @input string reminderMessage = "Make sure you have enough open space around you before placing the grid on the floor." {"label": "Reminder Message"}
// @input vec3 reminderOffset = {0, 0, 80} {"label": "Reminder Offset", "hint": "Local offset from camera (X, Y, Z in cm)"}
// @input float displayDuration = 3.0 {"label": "Display Duration", "hint": "Seconds to show the message"}
// @input float fadeOutDuration = 0.6 {"label": "Fade Out Duration", "hint": "Seconds to fade out"}
// @input float popInDuration = 0.35 {"label": "Pop In Duration", "hint": "Seconds for the pop-in scale animation"}
// @input Component.AudioComponent popInAudio {"label": "Pop In Audio", "hint": "Optional. Plays when the message appears"}

var isShowing = false;
var fadeTimer = 0;
var isFading = false;
var textComponent = null;
var onCompleteCallback = null;
var targetScale = new vec3(1, 1, 1);

/**
 * Find Text or Text3D component in container or its children
 */
function findTextComponent(container) {
	if (!container) return null;

	var comp = container.getComponent("Component.Text");
	if (comp) return comp;

	comp = container.getComponent("Component.Text3D");
	if (comp) return comp;

	for (var i = 0; i < container.getChildrenCount(); i++) {
		comp = findTextComponent(container.getChild(i));
		if (comp) return comp;
	}
	return null;
}

/**
 * Set alpha on text component (supports Text and Text3D via textFill)
 */
function setTextAlpha(comp, alpha) {
	if (!comp) return;
	try {
		var color = comp.textFill.color;
		comp.textFill.color = new vec4(color.r, color.g, color.b, alpha);
	} catch (e) {}
}

/**
 * Initialize
 */
function initialize() {
	if (script.reminderContainer) {
		script.reminderContainer.enabled = false;
	}

	textComponent = findTextComponent(script.reminderContainer);
	if (textComponent && script.reminderMessage) {
		textComponent.text = script.reminderMessage;
	}

	if (script.reminderContainer && script.cameraObject) {
		script.reminderContainer.setParent(script.cameraObject);
		var tr = script.reminderContainer.getTransform();
		tr.setLocalPosition(script.reminderOffset);
		tr.setLocalRotation(quat.quatIdentity());
		targetScale = tr.getLocalScale();
		if (targetScale.x === 0 && targetScale.y === 0 && targetScale.z === 0) {
			targetScale = new vec3(1, 1, 1);
		}
	}
}

/**
 * Show the reminder, then fade out and call callback
 * @param {Function} callback - Called when fade completes (e.g. createFloorPlacement)
 */
function showWithCallback(callback) {
	if (!script.reminderContainer) {
		if (callback) callback();
		return;
	}

	onCompleteCallback = callback;
	isShowing = true;
	isFading = false;
	fadeTimer = 0;

	// Set message
	if (textComponent && script.reminderMessage) {
		textComponent.text = script.reminderMessage;
	}
	setTextAlpha(textComponent, 1.0);

	script.reminderContainer.enabled = true;

	// Play pop-in SFX
	if (script.popInAudio) {
		try {
			script.popInAudio.play(1);
		} catch (e) {}
	}

	// Pop-in scale animation (bounce from 0 to full size)
	var popDur = script.popInDuration || 0.35;
	AnimationManager.bounceReveal(script.reminderContainer, {
		duration: popDur,
		overshoot: 1.15,
		endScale: targetScale,
	});

	// Schedule start of fade after display duration
	var fadeDelay = script.createEvent("DelayedCallbackEvent");
	fadeDelay.bind(function () {
		startFadeOut();
	});
	fadeDelay.reset(script.displayDuration || 3.0);
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
 * Update fade animation
 */
function update(deltaTime) {
	if (!isFading) return;

	fadeTimer += deltaTime;
	var fadeDuration = script.fadeOutDuration || 0.6;
	var progress = Math.min(fadeTimer / fadeDuration, 1.0);

	setTextAlpha(textComponent, 1.0 - progress);

	if (progress >= 1.0) {
		isShowing = false;
		isFading = false;
		if (script.reminderContainer) {
			script.reminderContainer.enabled = false;
		}
		setTextAlpha(textComponent, 1.0);

		var cb = onCompleteCallback;
		onCompleteCallback = null;
		if (cb) cb();
	}
}

/**
 * Hide immediately and cancel any pending callback
 */
function hide() {
	isShowing = false;
	isFading = false;
	onCompleteCallback = null;
	if (script.reminderContainer) {
		script.reminderContainer.enabled = false;
	}
	setTextAlpha(textComponent, 1.0);
}

// Initialize on start
script.createEvent("OnStartEvent").bind(function () {
	initialize();
});

// Update every frame for fade animation
script.createEvent("UpdateEvent").bind(function (eventData) {
	update(eventData.getDeltaTime());
});

script.showWithCallback = showWithCallback;
script.hide = hide;
