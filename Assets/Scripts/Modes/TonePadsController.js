// TonePadsController.js
// Tone Pads mode: four coloured pads in a diamond play a tune; step on them in the same order.
// Each correct tune adds a note; reaching a level's target length clears the level.
// Lives in the scene (not the per-session Surface prefab); PlacementBridge routes to it.
//
// Round flow: WAIT_ON_START (stand on the yellow pad) -> PLAYBACK (pads flash with notes, mirrored on a
// floating "remote" at eye level, since the pads at your feet are mostly below the display) -> INPUT
// (step the pads in order) -> RESULT (tune done, level clear, or wrong pad) -> WAIT_ON_START.
//
// Input is polled from head position rather than the tile triggers: pads are at least 78cm apart,
// so a generous 25cm radius can't reach a second pad, and a player already standing on yellow counts.

// @input SceneObject cameraObject {"label": "Camera", "hint": "The Camera Object with Device Tracking, for head position"}
// @input Asset.RenderMesh boxMesh {"label": "Box Mesh", "hint": "A unit box mesh, used to build the floating remote"}
// @input Asset.Material boxMaterial {"label": "Box Material", "hint": "An unlit material with a baseColor (cloned per light)"}

var Constants = require("../Utils/Constants");
var Helpers = require("./ModeHelpers");

var TAG = "TonePads";

// Board: 3 x 3. Pads sit on the four edge-middle tiles in a diamond; the other five tiles are ignored
var ROWS = 3;
var COLUMNS = 3;

// Pad ids index PADS. S is the near pad on Classic's start tile, N is the far pad
var S = 0;
var W = 1;
var N = 2;
var E = 3;

var PADS = [
	{ name: "S", x: 1, z: 2, note: 1, color: Constants.GridConfig.COLORS.TILE_START },
	{ name: "W", x: 0, z: 1, note: 5, color: new vec4(0.1, 0.85, 1.0, 1.0) },
	{ name: "N", x: 1, z: 0, note: 8, color: new vec4(0.95, 0.25, 0.85, 1.0) },
	{ name: "E", x: 2, z: 1, note: 13, color: new vec4(1.0, 0.55, 0.1, 1.0) },
];
// step_01/05/08/13 are C#5, F5, G#5 and C#6, so any order of notes sounds consonant

// Three levels for testing. Each starts at startLength notes and clears at targetLength
var LEVELS = [
	{ startLength: 3, targetLength: 5, noteOn: 0.7, noteGap: 0.25 },
	{ startLength: 4, targetLength: 6, noteOn: 0.55, noteGap: 0.2 },
	{ startLength: 5, targetLength: 8, noteOn: 0.45, noteGap: 0.15 },
];

var Config = {
	PAD_RADIUS: 25, // Head within this distance of a pad centre enters it (cm)
	PAD_RELEASE: 32, // Head must go beyond this distance before the same pad can register again
	START_DWELL: 0.5, // Seconds on the yellow pad before the tune plays
	IDLE_REPLAY: 10, // Seconds without progress before the tune replays
	CHIME_DELAY: 0.4, // Keeps the success chime from cutting off the last note (one shared SFX channel)
	PAD_IDLE_ALPHA: 0.45,
	PAD_LIT_ALPHA: 1.0,
	OFF_TILE_ALPHA: 0.08,

	// Floating remote, in grid-local cm: about 1m beyond the far edge at eye level, tilted back
	// so its top reads as "far" like the floor diamond
	REMOTE_POSITION: new vec3(0, 140, -210),
	REMOTE_TILT_DEGREES: 40,
	REMOTE_SPACING: 22,
	REMOTE_LIGHT_SIZE: new vec3(18, 18, 2),
	REMOTE_IDLE_ALPHA: 0.25,
};

var Phase = {
	IDLE: "idle",
	WAIT_ON_START: "wait_on_start",
	PLAYBACK: "playback",
	INPUT: "input",
	RESULT: "result",
};

var clock = Helpers.createRoundClock(script);
var phase = Phase.IDLE;

var GridManager = null;
var padCentres = [];

// Session state
var levelIndex = 0;
var best = 0;
var isFirstTune = true;

// Tune state
var tune = [];
var inputIndex = 0;
var lastAcceptedPad = -1;
var padInside = [false, false, false, false];
var startDwell = 0;
var idleTime = 0;

// Remote: a root object with one light per pad, built once and reused
var remote = null;

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

	placeRemote();
	paintBoard();

	levelIndex = 0;
	isFirstTune = true;
	startLevel();
}

// ============================================
// FLOW
// ============================================

function startLevel() {
	var level = LEVELS[levelIndex];
	tune = generateTune(level.startLength, isFirstTune);
	isFirstTune = false;
	enterWaitOnStart();
}

function enterWaitOnStart() {
	setPhase(Phase.WAIT_ON_START);
	startDwell = 0;
	paintBoard();
	setPadLit(S, true);
	Helpers.showHud("LEVEL " + (levelIndex + 1) + " · " + tune.length + " NOTES\nSTAND ON YELLOW", 0);
}

function startPlayback() {
	setPhase(Phase.PLAYBACK);
	clock.invalidate();
	paintBoard();
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
	inputIndex = 0;
	lastAcceptedPad = -1;
	idleTime = 0;
	Helpers.showHud("YOUR TURN", 0);

	// Seed pad states from where the head is now, so standing on yellow counts as the first note
	var head = Helpers.headLocal(GridManager, script.cameraObject);
	for (var p = 0; p < PADS.length; p++) {
		padInside[p] = !!head && Helpers.horizontalDistance(head, padCentres[p]) <= Config.PAD_RADIUS;
	}
	if (padInside[tune[0]]) {
		acceptPad(tune[0]);
	}
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
	clock.later(1.5, enterWaitOnStart);
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
	setPadColor(pad, new vec4(0.5, 0.5, 0.5, 0.6));
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

	var head = Helpers.headLocal(GridManager, script.cameraObject);
	if (!head) return;

	var dt = getDeltaTime();

	if (phase === Phase.WAIT_ON_START) {
		if (Helpers.horizontalDistance(head, padCentres[S]) <= Config.PAD_RADIUS) {
			startDwell += dt;
			if (startDwell >= Config.START_DWELL) {
				startPlayback();
			}
		} else {
			startDwell = 0;
		}
	} else if (phase === Phase.INPUT) {
		updatePads(head);

		idleTime += dt;
		if (phase === Phase.INPUT && idleTime >= Config.IDLE_REPLAY) {
			Helpers.showHud("LISTEN AGAIN", 0);
			clock.later(1.0, enterWaitOnStart);
			setPhase(Phase.RESULT);
		}
	}
}

/**
 * Edge-triggered pad entry: a pad registers when the head comes within PAD_RADIUS,
 * and re-arms once the head is beyond PAD_RELEASE
 */
function updatePads(head) {
	for (var p = 0; p < PADS.length; p++) {
		var distance = Helpers.horizontalDistance(head, padCentres[p]);
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
 * Every tune starts on S. The very first tune only moves forward (S, then W or E, then N)
 */
function generateTune(length, forwardOnly) {
	var result = [S];
	if (forwardOnly && length >= 3) {
		result.push(Math.random() < 0.5 ? W : E);
		result.push(N);
	}
	while (result.length < length) {
		result.push(nextNote(result[result.length - 1]));
	}
	return result;
}

/**
 * A random next note: never the same pad twice in a row, and never straight between N and S
 * (a 110cm walk, often backward)
 */
function nextNote(previous) {
	var options = [];
	for (var p = 0; p < PADS.length; p++) {
		if (p === previous) continue;
		if ((previous === N && p === S) || (previous === S && p === N)) continue;
		options.push(p);
	}
	return Helpers.randomItem(options);
}

// ============================================
// VISUALS
// ============================================

function paintBoard() {
	for (var z = 0; z < ROWS; z++) {
		for (var x = 0; x < COLUMNS; x++) {
			GridManager.setTileColorAt(x, z, Helpers.withAlpha(Constants.GridConfig.COLORS.TILE_DEFAULT, Config.OFF_TILE_ALPHA));
		}
	}
	for (var p = 0; p < PADS.length; p++) {
		setPadLit(p, false);
	}
}

function setPadLit(pad, lit) {
	var color = PADS[pad].color;
	setPadColor(pad, Helpers.withAlpha(color, lit ? Config.PAD_LIT_ALPHA : Config.PAD_IDLE_ALPHA));
	if (remote) {
		Helpers.setBoxColor(remote.lights[pad], Helpers.withAlpha(color, lit ? 1.0 : Config.REMOTE_IDLE_ALPHA));
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

/**
 * Builds the floating remote once, then places it relative to this session's grid
 */
function placeRemote() {
	if (!script.boxMesh || !script.boxMaterial) return;

	if (!remote) {
		remote = { root: global.scene.createSceneObject("TonePadsRemote"), lights: [] };
		remote.root.setParent(script.getSceneObject());

		// Diamond layout in the remote's own plane: +Y is up (far), +X is right
		var offsets = [
			new vec3(0, -Config.REMOTE_SPACING, 0), // S
			new vec3(-Config.REMOTE_SPACING, 0, 0), // W
			new vec3(0, Config.REMOTE_SPACING, 0), // N
			new vec3(Config.REMOTE_SPACING, 0, 0), // E
		];
		for (var p = 0; p < PADS.length; p++) {
			var light = Helpers.createBox(remote.root, "Light" + PADS[p].name, script.boxMesh, script.boxMaterial);
			var transform = light.object.getTransform();
			transform.setLocalPosition(offsets[p]);
			transform.setLocalScale(Config.REMOTE_LIGHT_SIZE);
			remote.lights.push(light);
		}
	}

	var gridTransform = GridManager.getGridParent().getTransform();
	var tilt = quat.angleAxis((-Config.REMOTE_TILT_DEGREES * Math.PI) / 180, vec3.right());
	var rootTransform = remote.root.getTransform();
	rootTransform.setWorldPosition(Helpers.gridToWorldPoint(GridManager, Config.REMOTE_POSITION));
	rootTransform.setWorldRotation(gridTransform.getWorldRotation().multiply(tilt));
	remote.root.enabled = true;
}

// ============================================
// LIFECYCLE
// ============================================

/**
 * Stops this mode's callbacks, hides its HUD and the remote
 */
function endSession() {
	clock.stop();
	setPhase(Phase.IDLE);
	Helpers.hideHud();
	if (remote) {
		remote.root.enabled = false;
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
	onGridPlaced: onGridPlaced,
	endRound: endSession,
};
