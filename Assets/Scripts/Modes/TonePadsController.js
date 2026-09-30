// TonePadsController.js
// Tone Pads mode: four coloured pads in a diamond play a tune; step on them in the same order.
// Each correct tune adds a note; reaching a level's target length clears the level.
// Lives in the scene (not the per-session Surface prefab); PlacementBridge routes to it.
//
// Round flow: WAIT_ON_HOME (stand on the white middle tile) -> PLAYBACK (pads flash with notes, mirrored on
// a small copy of the board that floats in front of the player, since the pads at your feet are mostly
// below the display) -> INPUT (step the pads in order, from the middle) -> RESULT (tune done, level clear,
// or wrong pad) -> WAIT_ON_HOME. One wrong pad ends the tune.
//
// The mini board follows the player's head (lazily, so it doesn't swim), keeping the floor's layout: its far
// pad is always the floor's far pad, whichever way the player faces. A dot on it shows where they stand.
//
// Input is polled from a body estimate (the head pulled back when looking down, ModeHelpers.bodyLocal)
// rather than the tile triggers: pads are 55cm from the middle and at least 78cm apart, so a 25cm radius
// can't reach a second pad.

// @input SceneObject cameraObject {"label": "Camera", "hint": "The Camera Object with Device Tracking, for head position"}

var Helpers = require("./ModeHelpers");
var GlowMeshes = require("../Visuals/GlowMeshes");

var TAG = "TonePads";

// Board: 3 x 3. Pads sit on the four edge-middle tiles in a diamond around the home tile; corners are unused
var ROWS = 3;
var COLUMNS = 3;
var HOME = { x: 1, z: 1 };

// Pad ids index PADS. S is the near pad, N the far pad
var S = 0;
var W = 1;
var N = 2;
var E = 3;

var PADS = [
	{ name: "S", x: 1, z: 2, note: 1, color: new vec4(0.25, 1.0, 0.45, 1.0) },
	{ name: "W", x: 0, z: 1, note: 5, color: new vec4(0.1, 0.85, 1.0, 1.0) },
	{ name: "N", x: 1, z: 0, note: 8, color: new vec4(0.95, 0.25, 0.85, 1.0) },
	{ name: "E", x: 2, z: 1, note: 13, color: new vec4(1.0, 0.55, 0.1, 1.0) },
];
// step_01/05/08/13 are C#5, F5, G#5 and C#6, so any order of notes sounds consonant

var HOME_COLOR = new vec4(1.0, 1.0, 1.0, 1.0);
var WRONG_COLOR = new vec4(1.0, 0.2, 0.2, 1.0);

// Three levels for testing. Each starts at startLength notes and clears at targetLength
var LEVELS = [
	{ startLength: 3, targetLength: 5, noteOn: 0.7, noteGap: 0.25 },
	{ startLength: 4, targetLength: 6, noteOn: 0.55, noteGap: 0.2 },
	{ startLength: 5, targetLength: 8, noteOn: 0.45, noteGap: 0.15 },
];

var Config = {
	PAD_RADIUS: 25, // Body within this distance of a pad centre enters it (cm)
	PAD_RELEASE: 32, // Body must go beyond this distance before the same pad can register again
	HOME_RADIUS: 22, // Body within this distance of the middle tile's centre is home
	HOME_DWELL: 0.5, // Seconds at home before the tune plays
	IDLE_REPLAY: 10, // Seconds without progress before the tune replays
	CHIME_DELAY: 0.8, // Step notes swell to their peak at ~0.4s; wait before the chime replaces them (one shared SFX channel)

	PAD_IDLE_ALPHA: 0.45,
	PAD_LIT_ALPHA: 1.0,
	OFF_TILE_ALPHA: 0.08,
	HOME_WAITING_ALPHA: 0.7, // the middle tile glows while it's waiting for the player
	HOME_QUIET_ALPHA: 0.2,

	// Mini board: a tabletop copy of the floor this far ahead of the eyes and this far below them (cm),
	// tilted up toward the player so it reads at a glance
	REMOTE_DISTANCE: 70,
	REMOTE_DROP: 30,
	REMOTE_SCALE: 0.14, // a 55cm tile becomes ~8cm
	REMOTE_TILT_DEGREES: 40,
	REMOTE_FOLLOW: 4, // how quickly it catches up with the head (per second)
	REMOTE_IDLE: 0.3, // brightness of unlit pads on the mini board
	// Looking down at the real pads hides the mini board (it would sit between the eyes and the floor);
	// two thresholds so it doesn't flicker at the edge
	REMOTE_HIDE_LOOK_DOWN: 0.75,
	REMOTE_SHOW_LOOK_DOWN: 0.6,
	YOU_DOT_RADIUS: 2.2, // cm on the mini board

	HOME_RING_RADIUS: 17, // the floor ring on the middle tile while waiting
	RIPPLE_TIME: 0.5,
	RIPPLE_FROM: 16,
	RIPPLE_TO: 42,
};

var Phase = {
	IDLE: "idle",
	WAIT_ON_HOME: "wait_on_home",
	PLAYBACK: "playback",
	INPUT: "input",
	RESULT: "result",
};

var clock = Helpers.createRoundClock(script);
var phase = Phase.IDLE;
var now = 0;

var GridManager = null;
var padCentres = [];
var homeCentre = null;

// Session state
var levelIndex = 0;
var best = 0;

// Tune state
var tune = [];
var inputIndex = 0;
var lastAcceptedPad = -1;
var padInside = [false, false, false, false];
var homeDwell = 0;
var idleTime = 0;

// Visuals, built once and reused across sessions
var visuals = null;

/**
 * Called by PlacementBridge when this mode is selected and the floor is placed
 */
function onGridPlaced(gridOrigin, floorY) {
	GridManager = global.PathFinder && global.PathFinder.GridManager;
	if (!GridManager) {
		print("TonePadsController: No GridManager registered for this session");
		return;
	}

	Helpers.installExitWrapper(TAG, endSession);
	clock.start();

	GridManager.initialize(gridOrigin, ROWS, COLUMNS);
	GridManager.showGrid();

	padCentres = PADS.map(function (pad) {
		return Helpers.tileLocal(GridManager, pad.x, pad.z);
	});
	homeCentre = Helpers.tileLocal(GridManager, HOME.x, HOME.z);

	buildVisuals();
	placeVisuals();
	paintBoard();

	levelIndex = 0;
	best = 0;
	startLevel();
}

// ============================================
// FLOW
// ============================================

function startLevel() {
	tune = generateTune(LEVELS[levelIndex].startLength);
	enterWaitOnHome();
}

function enterWaitOnHome() {
	setPhase(Phase.WAIT_ON_HOME);
	homeDwell = 0;
	paintBoard();
	setHome(true);
	Helpers.showHud("LEVEL " + (levelIndex + 1) + " · " + tune.length + " NOTES\nSTAND IN THE MIDDLE", 0);
}

function startPlayback() {
	setPhase(Phase.PLAYBACK);
	clock.invalidate();
	paintBoard();
	setHome(false);
	Helpers.showHud("WATCH", 0);

	var level = LEVELS[levelIndex];
	var step = level.noteOn + level.noteGap;

	for (var i = 0; i < tune.length; i++) {
		schedulePlaybackNote(tune[i], 0.6 + i * step, level.noteOn);
	}
	clock.later(0.6 + tune.length * step, startInput);
}

function schedulePlaybackNote(pad, at, duration) {
	clock.later(at, function () {
		setPadLit(pad, true);
		Helpers.playStep(PADS[pad].note);
	});
	clock.later(at + duration, function () {
		setPadLit(pad, false);
	});
}

function startInput() {
	setPhase(Phase.INPUT);
	idleTime = 0;
	inputIndex = 0;
	lastAcceptedPad = -1;

	// Pads are seeded from where the player is now (normally home, touching none), so a pad they drifted
	// onto during playback needs a fresh step rather than counting or failing at once
	var body = Helpers.bodyLocal(GridManager, script.cameraObject);
	for (var p = 0; p < PADS.length; p++) {
		padInside[p] = !!body && Helpers.horizontalDistance(body, padCentres[p]) <= Config.PAD_RELEASE;
	}
	Helpers.showHud("YOUR TURN · 0/" + tune.length, 0);
}

function onPadEntered(pad) {
	if (phase !== Phase.INPUT) return;
	if (pad === lastAcceptedPad) return;

	if (pad === tune[inputIndex]) {
		acceptPad(pad);
	} else {
		wrongPad(pad);
	}
}

function acceptPad(pad) {
	inputIndex++;
	lastAcceptedPad = pad;
	idleTime = 0;

	flashPad(pad, 0.4);
	ripple(PADS[pad], PADS[pad].color);
	Helpers.playStep(PADS[pad].note);
	Helpers.showHud("YOUR TURN · " + inputIndex + "/" + tune.length, 0);

	if (inputIndex >= tune.length) {
		tuneComplete();
	}
}

function tuneComplete() {
	setPhase(Phase.RESULT);
	best = Math.max(best, tune.length);
	clock.later(Config.CHIME_DELAY, function () {
		Helpers.playSfx("playCompletion");
	});

	var level = LEVELS[levelIndex];
	if (tune.length >= level.targetLength) {
		levelComplete();
		return;
	}

	tune.push(nextNote(tune[tune.length - 1]));
	Helpers.showHud("NICE!\nNEXT: " + tune.length + " NOTES", 0);
	clock.later(1.5, enterWaitOnHome);
}

function levelComplete() {
	if (levelIndex < LEVELS.length - 1) {
		Helpers.showHud("LEVEL " + (levelIndex + 1) + " CLEAR!", 0);
		levelIndex++;
	} else {
		Helpers.showHud("ALL LEVELS CLEAR!\nBEST " + best + " NOTES", 0);
		levelIndex = 0;
	}
	clock.later(2.5, startLevel);
}

function wrongPad(pad) {
	setPhase(Phase.RESULT);
	Helpers.playSfx("playError");

	var expected = tune[inputIndex];
	setPadColor(pad, Helpers.withAlpha(WRONG_COLOR, 0.8));
	ripple(PADS[pad], WRONG_COLOR);
	blinkPad(expected, 2);

	Helpers.showHud("WRONG PAD\nBEST " + best + " NOTES", 0);
	// Same level again, with a fresh tune
	clock.later(3.0, startLevel);
}

// ============================================
// PER-FRAME CHECKS
// ============================================

function update() {
	if (!clock.isActive() || !GridManager) return;

	var dt = getDeltaTime();
	now += dt;

	var body = Helpers.bodyLocal(GridManager, script.cameraObject);
	updateVisuals(dt, body);
	if (!body) return;

	if (phase === Phase.WAIT_ON_HOME) {
		if (Helpers.horizontalDistance(body, homeCentre) <= Config.HOME_RADIUS) {
			homeDwell += dt;
			if (homeDwell >= Config.HOME_DWELL) {
				startPlayback();
			}
		} else {
			homeDwell = 0;
		}
	} else if (phase === Phase.INPUT) {
		updatePads(body);

		idleTime += dt;
		if (phase === Phase.INPUT && idleTime >= Config.IDLE_REPLAY) {
			Helpers.showHud("LISTEN AGAIN", 0);
			clock.later(1.0, enterWaitOnHome);
			setPhase(Phase.RESULT);
		}
	}
}

/**
 * Edge-triggered pad entry: a pad registers when the body comes within PAD_RADIUS,
 * and re-arms once the body is beyond PAD_RELEASE
 */
function updatePads(body) {
	for (var p = 0; p < PADS.length; p++) {
		var distance = Helpers.horizontalDistance(body, padCentres[p]);
		if (!padInside[p] && distance <= Config.PAD_RADIUS) {
			padInside[p] = true;
			onPadEntered(p);
			if (phase !== Phase.INPUT) return;
		} else if (padInside[p] && distance > Config.PAD_RELEASE) {
			padInside[p] = false;
		}
	}
}

// ============================================
// TUNES
// ============================================

/**
 * A tune of random pads, never the same pad twice in a row. The player walks from the middle, so any
 * pad can come first and crossing from one side to the other passes over home
 */
function generateTune(length) {
	var result = [Math.floor(Math.random() * PADS.length)];
	while (result.length < length) {
		result.push(nextNote(result[result.length - 1]));
	}
	return result;
}

function nextNote(previous) {
	var options = [];
	for (var p = 0; p < PADS.length; p++) {
		if (p !== previous) options.push(p);
	}
	return Helpers.randomItem(options);
}

// ============================================
// VISUALS
// ============================================

/**
 * Floor tiles are drawn by the grid (glow tiles); this mode adds the home ring, ripples and the mini board
 */
function buildVisuals() {
	if (visuals) return;
	var style = global.PathFinder && global.PathFinder.VisualStyle;
	if (!style || !style.glowMaterial) {
		print("TonePadsController: No VisualStyle in the scene; the mini board and effects are off");
		return;
	}
	var material = style.glowMaterial;
	var parent = script.getSceneObject();

	visuals = {
		homeRing: GlowMeshes.createVisual(parent, "TonePadsHomeRing", GlowMeshes.ring(), material),
		ripples: [],
		rippleNext: 0,
		remote: global.scene.createSceneObject("TonePadsRemote"),
		remoteTiles: [],
		you: null,
		remotePosition: null,
		remoteFlat: null,
	};
	for (var i = 0; i < 3; i++) {
		visuals.ripples.push({ visual: GlowMeshes.createVisual(parent, "TonePadsRipple" + i, GlowMeshes.ring(), material), time: -1, color: null });
	}

	visuals.remote.setParent(parent);
	for (var z = 0; z < ROWS; z++) {
		visuals.remoteTiles[z] = [];
		for (var x = 0; x < COLUMNS; x++) {
			var tile = GlowMeshes.createVisual(visuals.remote, "MiniTile" + x + z, GlowMeshes.tile(), material);
			var transform = tile.object.getTransform();
			transform.setLocalPosition(new vec3((x - HOME.x) * 55 * Config.REMOTE_SCALE, 0, (z - HOME.z) * 55 * Config.REMOTE_SCALE));
			transform.setLocalScale(new vec3(Config.REMOTE_SCALE, 1, Config.REMOTE_SCALE));
			tile.object.enabled = true;
			visuals.remoteTiles[z][x] = tile;
		}
	}
	visuals.you = GlowMeshes.createVisual(visuals.remote, "MiniYou", GlowMeshes.ring(), material);
	visuals.you.object.getTransform().setLocalScale(new vec3(Config.YOU_DOT_RADIUS, 1, Config.YOU_DOT_RADIUS));
	setGlow(visuals.you, HOME_COLOR, 1.0);
}

/**
 * Lays the floor effects onto this session's grid and snaps the mini board in front of the player
 */
function placeVisuals() {
	if (!visuals) return;
	var rotation = GridManager.getGridParent().getTransform().getWorldRotation();
	visuals.homeRing.object.getTransform().setWorldPosition(Helpers.gridToWorldPoint(GridManager, new vec3(homeCentre.x, 1.2, homeCentre.z)));
	visuals.homeRing.object.getTransform().setWorldRotation(rotation);
	visuals.homeRing.object.getTransform().setWorldScale(new vec3(Config.HOME_RING_RADIUS, 1, Config.HOME_RING_RADIUS));
	for (var i = 0; i < visuals.ripples.length; i++) {
		visuals.ripples[i].visual.object.getTransform().setWorldRotation(rotation);
		visuals.ripples[i].time = -1;
		visuals.ripples[i].visual.object.enabled = false;
	}
	visuals.remotePosition = null;
	visuals.remote.enabled = true;
}

/**
 * Per frame: the mini board follows the head, the you-dot follows the body, the home ring breathes and
 * ripples expand
 */
function updateVisuals(dt, body) {
	if (!visuals) return;

	updateRemote(dt, body);

	if (visuals.homeRing.object.enabled) {
		setGlow(visuals.homeRing, HOME_COLOR, 0.55 + 0.25 * Math.sin(now * Math.PI * 2 * 0.8));
	}

	for (var i = 0; i < visuals.ripples.length; i++) {
		var ripple = visuals.ripples[i];
		if (ripple.time < 0) continue;
		ripple.time += dt;
		var t = ripple.time / Config.RIPPLE_TIME;
		if (t >= 1) {
			ripple.time = -1;
			ripple.visual.object.enabled = false;
			continue;
		}
		var radius = Config.RIPPLE_FROM + (Config.RIPPLE_TO - Config.RIPPLE_FROM) * (1 - (1 - t) * (1 - t));
		ripple.visual.object.getTransform().setWorldScale(new vec3(radius, 1, radius));
		setGlow(ripple.visual, ripple.color, 0.9 * (1 - t));
	}
}

/**
 * Keeps the mini board ahead of the eyes and a little below them, following the head's heading lazily.
 * Its layout keeps the floor's orientation; only the tilt toward the player turns with the head
 */
function updateRemote(dt, body) {
	var gridTransform = GridManager.getGridParent().getTransform();
	var up = gridTransform.up.normalize();
	var camera = script.cameraObject.getTransform();
	var eye = camera.getWorldPosition();
	var view = camera.forward.uniformScale(-1); // the camera looks along -forward
	var flat = view.sub(up.uniformScale(view.dot(up)));
	if (flat.length < 0.05) {
		flat = visuals.remoteFlat || gridTransform.forward.uniformScale(-1);
	}
	flat = flat.normalize();

	var target = eye.add(flat.uniformScale(Config.REMOTE_DISTANCE)).sub(up.uniformScale(Config.REMOTE_DROP));
	if (!visuals.remotePosition) {
		visuals.remotePosition = target;
		visuals.remoteFlat = flat;
	} else {
		var k = 1 - Math.exp(-dt * Config.REMOTE_FOLLOW);
		visuals.remotePosition = vec3.lerp(visuals.remotePosition, target, k);
		visuals.remoteFlat = vec3.lerp(visuals.remoteFlat, flat, k).normalize();
	}

	var down = -view.dot(up);
	if (visuals.remote.enabled && down > Config.REMOTE_HIDE_LOOK_DOWN) {
		visuals.remote.enabled = false;
	} else if (!visuals.remote.enabled && down < Config.REMOTE_SHOW_LOOK_DOWN) {
		visuals.remote.enabled = true;
	}

	var right = visuals.remoteFlat.cross(up).normalize();
	var tilt = quat.angleAxis((Config.REMOTE_TILT_DEGREES * Math.PI) / 180, right);
	var transform = visuals.remote.getTransform();
	transform.setWorldPosition(visuals.remotePosition);
	transform.setWorldRotation(tilt.multiply(gridTransform.getWorldRotation()));

	// You are here: the body's offset from the middle tile, at the mini board's scale
	var showYou = !!body && Math.abs(body.x - homeCentre.x) < 110 && Math.abs(body.z - homeCentre.z) < 110;
	visuals.you.object.enabled = showYou;
	if (showYou) {
		visuals.you.object.getTransform().setLocalPosition(new vec3((body.x - homeCentre.x) * Config.REMOTE_SCALE, 0.5, (body.z - homeCentre.z) * Config.REMOTE_SCALE));
	}
}

function ripple(tile, color) {
	if (!visuals) return;
	var slot = visuals.ripples[visuals.rippleNext];
	visuals.rippleNext = (visuals.rippleNext + 1) % visuals.ripples.length;
	var centre = Helpers.tileLocal(GridManager, tile.x, tile.z);
	slot.visual.object.getTransform().setWorldPosition(Helpers.gridToWorldPoint(GridManager, new vec3(centre.x, 1.4, centre.z)));
	slot.time = 0;
	slot.color = color;
	slot.visual.object.enabled = true;
}

function setGlow(visual, color, intensity) {
	visual.pass.baseColor = new vec4(color.r * intensity, color.g * intensity, color.b * intensity, 1);
}

function paintBoard() {
	for (var z = 0; z < ROWS; z++) {
		for (var x = 0; x < COLUMNS; x++) {
			GridManager.setTileColorAt(x, z, Helpers.withAlpha(HOME_COLOR, Config.OFF_TILE_ALPHA));
			if (visuals) setGlow(visuals.remoteTiles[z][x], HOME_COLOR, Config.OFF_TILE_ALPHA);
		}
	}
	setHome(phase === Phase.WAIT_ON_HOME);
	for (var p = 0; p < PADS.length; p++) {
		setPadLit(p, false);
	}
}

/**
 * The middle tile glows (with a breathing ring) while it waits for the player, and stays faint otherwise
 */
function setHome(waiting) {
	var alpha = waiting ? Config.HOME_WAITING_ALPHA : Config.HOME_QUIET_ALPHA;
	GridManager.setTileColorAt(HOME.x, HOME.z, Helpers.withAlpha(HOME_COLOR, alpha));
	if (visuals) {
		setGlow(visuals.remoteTiles[HOME.z][HOME.x], HOME_COLOR, alpha);
		visuals.homeRing.object.enabled = waiting;
	}
}

function setPadLit(pad, lit) {
	var color = PADS[pad].color;
	setPadColor(pad, Helpers.withAlpha(color, lit ? Config.PAD_LIT_ALPHA : Config.PAD_IDLE_ALPHA));
	if (visuals) {
		setGlow(visuals.remoteTiles[PADS[pad].z][PADS[pad].x], color, lit ? 1.0 : Config.REMOTE_IDLE);
	}
}

function setPadColor(pad, color) {
	GridManager.setTileColorAt(PADS[pad].x, PADS[pad].z, color);
}

function flashPad(pad, seconds) {
	setPadLit(pad, true);
	clock.later(seconds, function () {
		if (phase === Phase.INPUT || phase === Phase.RESULT) {
			setPadLit(pad, false);
		}
	});
}

function blinkPad(pad, times) {
	for (var i = 0; i < times; i++) {
		(function (index) {
			clock.later(0.3 + index * 0.5, function () {
				setPadLit(pad, true);
			});
			clock.later(0.55 + index * 0.5, function () {
				setPadLit(pad, false);
			});
		})(i);
	}
}

// ============================================
// LIFECYCLE
// ============================================

/**
 * Stops this mode's callbacks, hides its HUD and visuals
 */
function endSession() {
	clock.stop();
	setPhase(Phase.IDLE);
	Helpers.hideHud();
	if (visuals) {
		visuals.remote.enabled = false;
		visuals.homeRing.object.enabled = false;
		for (var i = 0; i < visuals.ripples.length; i++) {
			visuals.ripples[i].time = -1;
			visuals.ripples[i].visual.object.enabled = false;
		}
	}
}

function setPhase(newPhase) {
	phase = newPhase;
	Helpers.debugLog(TAG, "Phase: " + newPhase);
}

script.createEvent("UpdateEvent").bind(function () {
	update();
});

// Export API
script.onGridPlaced = onGridPlaced;
script.endSession = endSession;

// Register with the mode router in PlacementBridge
global.PathFinder = global.PathFinder || {};
global.PathFinder.Modes = global.PathFinder.Modes || {};
global.PathFinder.Modes.tonepads = {
	levelCount: LEVELS.length, // shown on the menu card
	onGridPlaced: onGridPlaced,
	endRound: endSession,
};
