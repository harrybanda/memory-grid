// ModeHelpers.js
// Shared helpers for the scene-level game mode controllers (Minefield, Tone Pads, Floor Is Lava)

var Constants = require("../Utils/Constants");

/**
 * Creates a round clock: delayed callbacks only fire if the round they were scheduled in is still current
 * @param {ScriptComponent} script - The owning script (used to create events)
 * @returns {Object} {start, invalidate, stop, isActive, later}
 */
function createRoundClock(script) {
	var roundId = 0;
	var active = false;

	return {
		// Starts a session; earlier callbacks become no-ops
		start: function () {
			roundId++;
			active = true;
		},
		// Cancels pending callbacks but keeps the session running
		invalidate: function () {
			roundId++;
		},
		// Ends the session; pending callbacks become no-ops
		stop: function () {
			roundId++;
			active = false;
		},
		isActive: function () {
			return active;
		},
		later: function (seconds, fn) {
			var scheduledRound = roundId;
			var delay = script.createEvent("DelayedCallbackEvent");
			delay.bind(function () {
				if (active && scheduledRound === roundId) {
					fn();
				}
			});
			delay.reset(seconds);
			return delay;
		},
	};
}

/**
 * Wraps the palm-exit handler so the mode tears down before Classic's exit runs
 * GameStateManager recreates global.PathFinder.Game on every session, so the wrapper never leaks
 * @param {string} tag - Unique mode name, used to avoid wrapping twice
 * @param {Function} onExit - Teardown to run first
 */
function installExitWrapper(tag, onExit) {
	var game = global.PathFinder && global.PathFinder.Game;
	if (!game || !game.exit || game.exit.modeWrapperTag === tag) return;

	var classicExit = game.exit;
	var wrappedExit = function () {
		onExit();
		classicExit();
	};
	wrappedExit.modeWrapperTag = tag;
	game.exit = wrappedExit;
}

/**
 * Shows head-locked text via LookDownHint
 * @param {string} text - Message
 * @param {number} seconds - Seconds before it fades (0 keeps it up)
 */
function showHud(text, seconds) {
	var hint = global.PathFinder && global.PathFinder.LookDownHint;
	if (hint && hint.showFor) {
		hint.showFor(text, seconds);
	}
}

function hideHud() {
	var hint = global.PathFinder && global.PathFinder.LookDownHint;
	if (hint) {
		hint.hide();
	}
}

/**
 * Plays a gameplay sound through the shared SFX channel (playCountdown, playError, playCompletion)
 */
function playSfx(name) {
	var audio = global.PathFinder && global.PathFinder.Audio;
	if (audio && audio[name]) {
		audio[name]();
	}
}

/**
 * Plays one of the rising step notes (1-25) through the shared SFX channel
 */
function playStep(n) {
	var audio = global.PathFinder && global.PathFinder.Audio;
	if (audio && audio.playStep) {
		audio.playStep(n);
	}
}

/**
 * Plays a track on a mode's own AudioComponent (so it doesn't cut off the shared channel)
 */
function playTrack(audioComponent, track) {
	if (!audioComponent || !track) return;
	audioComponent.audioTrack = track;
	audioComponent.play(1);
}

/**
 * Stops a mode's own AudioComponent (it lives in the scene, so exiting doesn't destroy it)
 */
function stopTrack(audioComponent) {
	if (audioComponent && audioComponent.isPlaying()) {
		audioComponent.stop(false);
	}
}

/**
 * Head position in grid-local centimeters (+Z toward the player at placement, y = height above the floor)
 */
function headLocal(gridManager, cameraObject) {
	if (!gridManager || !cameraObject) return null;
	return gridManager.worldToGridLocal(cameraObject.getTransform().getWorldPosition());
}

// Looking down moves the Spectacles forward of the body, which can put the head over the next tile while
// the feet are still on this one. bodyLocal pulls the head back along the view direction: a little when
// upright, more the further the player looks down. Starting values; tune them on device
var BODY_BACK_UPRIGHT = 5;
var BODY_BACK_LOOKING_DOWN = 12; // Kept modest: overshooting puts the estimate behind the feet

/**
 * Flattened view direction in grid-local space, plus how far the player looks down
 * (0 = level, 1 = straight down). The camera looks along its -forward
 * @returns {Object} {x, z, down} or null
 */
function viewLocal(gridManager, cameraObject) {
	if (!gridManager || !cameraObject) return null;
	var transform = cameraObject.getTransform();
	var position = transform.getWorldPosition();
	var from = gridManager.worldToGridLocal(position);
	var to = gridManager.worldToGridLocal(position.add(transform.forward.uniformScale(-100)));
	if (!from || !to) return null;

	var dx = to.x - from.x;
	var dy = to.y - from.y;
	var dz = to.z - from.z;
	var flat = Math.sqrt(dx * dx + dz * dz);
	if (flat < 1e-3) return null;
	return { x: dx / flat, z: dz / flat, down: Math.max(0, Math.min(1, -dy / 100)) };
}

/**
 * Estimated body position in grid-local cm: the head pulled back along the view direction
 * (see BODY_BACK_*). y stays the head's height above the floor
 */
function bodyLocal(gridManager, cameraObject) {
	var head = headLocal(gridManager, cameraObject);
	if (!head) return null;
	var view = viewLocal(gridManager, cameraObject);
	if (!view) return head;

	var back = BODY_BACK_UPRIGHT + BODY_BACK_LOOKING_DOWN * view.down;
	return new vec3(head.x - view.x * back, head.y, head.z - view.z * back);
}

/**
 * Tile centre in grid-local centimeters
 */
function tileLocal(gridManager, x, z) {
	return gridManager.worldToGridLocal(gridManager.getTileWorldPosition(x, z));
}

function horizontalDistance(a, b) {
	var dx = a.x - b.x;
	var dz = a.z - b.z;
	return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Creates a colored box at runtime (the Surface prefab can't hold mode visuals)
 * @param {SceneObject} parent - Parent object
 * @param {string} name - Object name
 * @param {Asset.RenderMesh} mesh - A unit box mesh
 * @param {Asset.Material} material - Material to clone (needs a baseColor)
 * @returns {Object} {object, visual}
 */
function createBox(parent, name, mesh, material) {
	var object = global.scene.createSceneObject(name);
	object.setParent(parent);
	var visual = object.createComponent("Component.RenderMeshVisual");
	visual.mesh = mesh;
	visual.mainMaterial = material.clone();
	return { object: object, visual: visual };
}

function setBoxColor(box, color) {
	if (box && box.visual && box.visual.mainPass) {
		box.visual.mainPass.baseColor = color;
	}
}

/**
 * Creates a hidden glow visual at runtime on a clone of an unlit material. The clone is forced to additive
 * blending without depth writes, so black adds nothing on the see-through display and overlaps don't sort
 * @param {SceneObject} parent - Parent object
 * @param {string} name - Object name
 * @param {RenderMesh} mesh - Mesh to draw
 * @param {Asset.Material} material - Material to clone
 * @param {Object} options - Optional {texture, uvScale (vec2)}
 * @returns {Object} {object, visual, pass}
 */
function createMeshVisual(parent, name, mesh, material, options) {
	var object = global.scene.createSceneObject(name);
	object.setParent(parent);
	var visual = object.createComponent("Component.RenderMeshVisual");
	visual.mesh = mesh;

	var clone = material.clone();
	var pass = clone.mainPass;
	pass.blendMode = BlendMode.Add;
	pass.depthWrite = false;
	pass.twoSided = true;

	options = options || {};
	if (options.texture) pass.baseTex = options.texture;
	if (options.uvScale) pass.uv2Scale = options.uvScale;

	visual.mainMaterial = clone;
	object.enabled = false;
	return { object: object, visual: visual, pass: clone.mainPass };
}

function clamp01(value) {
	return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0, edge1, value) {
	var t = clamp01((value - edge0) / (edge1 - edge0));
	return t * t * (3 - 2 * t);
}

/**
 * Converts a grid-local point to world space
 */
function gridToWorldPoint(gridManager, localPoint) {
	return gridManager.getGridParent().getTransform().getWorldTransform().multiplyPoint(localPoint);
}

function withAlpha(color, alpha) {
	return new vec4(color.r, color.g, color.b, alpha);
}

function randomItem(list) {
	return list[Math.floor(Math.random() * list.length)];
}

function debugLog(tag, message) {
	if (!Constants.DebugConfig.ENABLED) return;
	message = tag + ": " + message;
	if (global.textLogger) {
		global.textLogger.log(message);
	} else {
		print(message);
	}
}

module.exports = {
	createRoundClock: createRoundClock,
	installExitWrapper: installExitWrapper,
	showHud: showHud,
	hideHud: hideHud,
	playSfx: playSfx,
	playStep: playStep,
	playTrack: playTrack,
	stopTrack: stopTrack,
	headLocal: headLocal,
	viewLocal: viewLocal,
	bodyLocal: bodyLocal,
	tileLocal: tileLocal,
	horizontalDistance: horizontalDistance,
	createBox: createBox,
	setBoxColor: setBoxColor,
	createMeshVisual: createMeshVisual,
	clamp01: clamp01,
	smoothstep: smoothstep,
	gridToWorldPoint: gridToWorldPoint,
	withAlpha: withAlpha,
	randomItem: randomItem,
	debugLog: debugLog,
};
