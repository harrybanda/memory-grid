// AnimationManager.js
// LSTween-based animation helpers for Memory Grid

var LSTween = null;
var Easing = null;

// Try to load LSTween (handles different package naming)
try {
	LSTween = require("LSTween.lspkg/LSTween").LSTween;
	Easing = require("LSTween.lspkg/TweenJS/Easing").Easing;
} catch (e) {
	try {
		LSTween = require("LS Tween.lspkg/LSTween").LSTween;
		Easing = require("LS Tween.lspkg/TweenJS/Easing").Easing;
	} catch (e2) {
		print("AnimationManager: LSTween not available - animations disabled");
	}
}

// ============================================
// CONFIGURATION
// ============================================

var CONFIG = {
	// Tile Reveal Animation
	tileRevealDuration: 0.4, // seconds
	tileRevealOvershoot: 1.2, // scale multiplier at peak (bounce effect)

	// Tile Collapse Animation (for failure)
	tileCollapseDuration: 0.5,
	tileCollapseDelay: 0.03, // stagger between tiles

	// Confetti burst
	confettiDuration: 2.0,
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

function toMs(seconds) {
	return Math.max(1, Math.round(seconds * 1000));
}

function lerp(a, b, t) {
	return a + (b - a) * t;
}

function getTransform(target) {
	if (!target) return null;
	try {
		if (target.getTransform && typeof target.getTransform === "function") {
			return target.getTransform();
		}
		return target;
	} catch (e) {
		return null;
	}
}

function isAlive(tf) {
	try {
		return tf && tf.getSceneObject && tf.getSceneObject();
	} catch (e) {
		return false;
	}
}

// ============================================
// ANIMATION FUNCTIONS
// ============================================

/**
 * Bounce-out reveal animation for tiles
 * Scales from 0 to target scale with overshoot bounce effect
 * @param {SceneObject} targetSO - The tile SceneObject
 * @param {Object} options - Animation options
 * @returns {Object} The tween object
 */
function bounceReveal(targetSO, options) {
	if (!LSTween || !targetSO) {
		// Fallback: just show the tile without animation
		if (targetSO) targetSO.enabled = true;
		if (options && options.onComplete) options.onComplete();
		return null;
	}

	var tf = getTransform(targetSO);
	if (!tf) {
		if (options && options.onComplete) options.onComplete();
		return null;
	}

	var opts = options || {};
	var duration = opts.duration || CONFIG.tileRevealDuration;
	var overshoot = opts.overshoot || CONFIG.tileRevealOvershoot;
	var delay = opts.delay || 0;
	var onComplete = opts.onComplete;

	// Get target scale (current scale or provided)
	var endScale = opts.endScale || tf.getLocalScale();
	if (endScale.x === 0 && endScale.y === 0 && endScale.z === 0) {
		endScale = new vec3(1, 1, 1);
	}

	var startScale = new vec3(0, 0, 0);
	var peakScale = new vec3(
		endScale.x * overshoot,
		endScale.y * overshoot,
		endScale.z * overshoot
	);

	// Start at zero scale
	tf.setLocalScale(startScale);
	targetSO.enabled = true;

	var halfDur = toMs(duration * 0.6);
	var restDur = toMs(duration) - halfDur;

	// Phase 1: Scale up past target (overshoot)
	var upTween = LSTween.rawTween(halfDur, { t: 0 })
		.delay(toMs(delay))
		.to({ t: 1 }, halfDur)
		.easing(Easing.Back.Out)
		.onUpdate(function (obj) {
			if (!isAlive(tf)) return;
			var k = obj.t;
			tf.setLocalScale(
				new vec3(
					lerp(startScale.x, peakScale.x, k),
					lerp(startScale.y, peakScale.y, k),
					lerp(startScale.z, peakScale.z, k)
				)
			);
		});

	// Phase 2: Settle back to target scale
	var downTween = LSTween.rawTween(restDur, { t: 0 })
		.to({ t: 1 }, restDur)
		.easing(Easing.Quadratic.Out)
		.onUpdate(function (obj) {
			if (!isAlive(tf)) return;
			var k = obj.t;
			tf.setLocalScale(
				new vec3(
					lerp(peakScale.x, endScale.x, k),
					lerp(peakScale.y, endScale.y, k),
					lerp(peakScale.z, endScale.z, k)
				)
			);
		})
		.onComplete(function () {
			if (onComplete) onComplete();
		});

	upTween.onComplete(function () {
		downTween.start();
	});

	upTween.start();
	return upTween;
}

/**
 * Scale out animation (shrink to zero)
 * @param {SceneObject} targetSO - The SceneObject to animate
 * @param {Object} options - Animation options
 * @returns {Object} The tween object
 */
function scaleOut(targetSO, options) {
	if (!LSTween || !targetSO) {
		if (targetSO) targetSO.enabled = false;
		if (options && options.onComplete) options.onComplete();
		return null;
	}

	var tf = getTransform(targetSO);
	if (!tf) {
		if (options && options.onComplete) options.onComplete();
		return null;
	}

	var opts = options || {};
	var duration = opts.duration || 0.3;
	var delay = opts.delay || 0;
	var onComplete = opts.onComplete;

	var startScale = tf.getLocalScale();
	var endScale = new vec3(0, 0, 0);

	var tw = LSTween.rawTween(toMs(duration), { t: 0 })
		.delay(toMs(delay))
		.to({ t: 1 }, toMs(duration))
		.easing(Easing.Back.In)
		.onUpdate(function (obj) {
			if (!isAlive(tf)) return;
			tf.setLocalScale(
				new vec3(
					lerp(startScale.x, endScale.x, obj.t),
					lerp(startScale.y, endScale.y, obj.t),
					lerp(startScale.z, endScale.z, obj.t)
				)
			);
		})
		.onComplete(function () {
			if (targetSO) targetSO.enabled = false;
			if (onComplete) onComplete();
		});

	tw.start();
	return tw;
}

/**
 * Pulse scale effect (quick grow and shrink)
 * @param {SceneObject} targetSO - The SceneObject to animate
 * @param {Object} options - Animation options
 * @returns {Object} The tween object
 */
function pulse(targetSO, options) {
	if (!LSTween || !targetSO) return null;

	var tf = getTransform(targetSO);
	if (!tf) return null;

	// Prevent multiple pulses at once
	if (targetSO._pulseActive) return null;
	targetSO._pulseActive = true;

	var opts = options || {};
	var duration = opts.duration || 0.3;
	var factor = opts.factor || 1.15;

	var orig = tf.getLocalScale();
	var peak = new vec3(orig.x * factor, orig.y * factor, orig.z * factor);
	var half = toMs(duration * 0.5);

	var upTween = LSTween.rawTween(half, { t: 0 })
		.to({ t: 1 }, half)
		.easing(Easing.Quadratic.Out)
		.onUpdate(function (obj) {
			if (!isAlive(tf)) return;
			tf.setLocalScale(
				new vec3(
					lerp(orig.x, peak.x, obj.t),
					lerp(orig.y, peak.y, obj.t),
					lerp(orig.z, peak.z, obj.t)
				)
			);
		});

	var downTween = LSTween.rawTween(half, { t: 0 })
		.to({ t: 1 }, half)
		.easing(Easing.Quadratic.Out)
		.onUpdate(function (obj) {
			if (!isAlive(tf)) return;
			tf.setLocalScale(
				new vec3(
					lerp(peak.x, orig.x, obj.t),
					lerp(peak.y, orig.y, obj.t),
					lerp(peak.z, orig.z, obj.t)
				)
			);
		})
		.onComplete(function () {
			targetSO._pulseActive = false;
		});

	upTween.onComplete(function () {
		downTween.start();
	});

	upTween.start();
	return upTween;
}

/**
 * Drop/fall animation for tile collapse
 * @param {SceneObject} targetSO - The tile to drop
 * @param {Object} options - Animation options
 * @returns {Object} The tween object
 */
function dropTile(targetSO, options) {
	if (!LSTween || !targetSO) {
		if (targetSO) targetSO.enabled = false;
		if (options && options.onComplete) options.onComplete();
		return null;
	}

	var tf = getTransform(targetSO);
	if (!tf) {
		if (options && options.onComplete) options.onComplete();
		return null;
	}

	var opts = options || {};
	var duration = opts.duration || CONFIG.tileCollapseDuration;
	var delay = opts.delay || 0;
	var dropDistance = opts.dropDistance || 200; // cm to fall
	var onComplete = opts.onComplete;

	var startPos = tf.getLocalPosition();
	var startScale = tf.getLocalScale();
	var endPos = new vec3(startPos.x, startPos.y - dropDistance, startPos.z);

	var tw = LSTween.rawTween(toMs(duration), { t: 0 })
		.delay(toMs(delay))
		.to({ t: 1 }, toMs(duration))
		.easing(Easing.Quadratic.In) // Accelerate downward (gravity feel)
		.onUpdate(function (obj) {
			if (!isAlive(tf)) return;
			// Drop position
			var y = lerp(startPos.y, endPos.y, obj.t);
			tf.setLocalPosition(new vec3(startPos.x, y, startPos.z));

			// Slight rotation wobble as it falls
			var wobble = Math.sin(obj.t * Math.PI * 4) * 0.1 * (1 - obj.t);
			var rot = quat.fromEulerAngles(wobble, 0, wobble * 0.5);
			tf.setLocalRotation(rot);

			// Scale down slightly at end
			if (obj.t > 0.7) {
				var scaleT = (obj.t - 0.7) / 0.3;
				var s = 1 - scaleT * 0.3;
				tf.setLocalScale(
					new vec3(startScale.x * s, startScale.y * s, startScale.z * s)
				);
			}
		})
		.onComplete(function () {
			if (targetSO) targetSO.enabled = false;
			if (onComplete) onComplete();
		});

	tw.start();
	return tw;
}

/**
 * Check if LSTween is available
 * @returns {boolean} True if animations are supported
 */
function isSupported() {
	return !!(LSTween && Easing);
}

// ============================================
// MODULE EXPORTS
// ============================================

module.exports = {
	// Configuration
	CONFIG: CONFIG,

	// Animations
	bounceReveal: bounceReveal,
	scaleOut: scaleOut,
	pulse: pulse,
	dropTile: dropTile,

	// Utilities
	isSupported: isSupported,
	lerp: lerp,
	toMs: toMs,
};
