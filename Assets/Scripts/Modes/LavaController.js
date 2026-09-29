// LavaController.js
// Floor Is Lava mode: tiles warn in orange, then burn. Be on a safe tile when the lava lands.
// Lives in the scene (not the per-session Surface prefab); PlacementBridge routes to it.
//
// Flow: WAIT_START (step into the light on the centre tile) -> COUNTDOWN -> waves:
//   SETTLE (stand near a tile centre) -> WARN (burning tiles pulse orange; a cyan beam marks a safe tile
//   one step forward or sideways, or the game says FREEZE) -> LAND (flames rise; judged over a short
//   grace window) -> COOL -> next wave. Clear all waves to clear the level; three levels, then it loops.
//
// Where the player stands is tracked from head position every frame (the tile triggers only report
// first entries). A tile becomes "confirmed" only after the head holds within CONFIRM_RADIUS of its
// centre for CONFIRM_DWELL, so leans and head bob don't move it. At landing the player is safe if either
// the confirmed tile or the tile nearest the head is safe in any frame of the grace window.

// @input SceneObject cameraObject {"label": "Camera", "hint": "The Camera Object with Device Tracking, for head position"}
// @input Asset.RenderMesh boxMesh {"label": "Box Mesh", "hint": "A unit box mesh, used for the flames and the safe-tile beam"}
// @input Asset.Material boxMaterial {"label": "Box Material", "hint": "An unlit material with a baseColor (cloned per box)"}
// @input Component.AudioComponent sfxPlayer {"label": "SFX Player", "hint": "Lava's own AudioComponent, so its cues don't cut off the shared channel"}
// @input Asset.AudioTrackAsset landTrack {"label": "Land Sound", "hint": "Played when the lava lands"}
// @input Asset.AudioTrackAsset goTrack {"label": "Go Sound", "hint": "Played at the end of the countdown"}

var Constants = require("../Utils/Constants");
var Helpers = require("./ModeHelpers");

var TAG = "Lava";

var ROWS = 3;
var COLUMNS = 3;
var CENTRE = { x: 1, z: 1 };

// Wave types. LINE burns the player's row or column; CHECKER burns every tile of the player's colour;
// ISLAND burns everything except one neighbour; FREEZE burns everything except where the player stands
var Wave = {
	LINE: "line",
	CHECKER: "checker",
	ISLAND: "island",
	FREEZE: "freeze",
};

// Three levels for testing
var LEVELS = [
	{ warn: 3.0, waves: [Wave.LINE, Wave.LINE, Wave.CHECKER, Wave.LINE] },
	{ warn: 2.5, waves: [Wave.LINE, Wave.CHECKER, Wave.FREEZE, Wave.LINE, Wave.ISLAND] },
	{ warn: 2.0, waves: [Wave.CHECKER, Wave.LINE, Wave.FREEZE, Wave.ISLAND, Wave.FREEZE, Wave.ISLAND] },
];

var Config = {
	LIVES: 3, // Every wave is judged from head position, so a couple of spare lives absorb misreads

	CONFIRM_RADIUS: 15, // cm from a tile centre before that tile can become the confirmed tile
	CONFIRM_DWELL: 0.3, // seconds the head must hold there
	SETTLE_RADIUS: 18, // a wave only starts when the head is this close to the confirmed tile's centre
	SETTLE_HINT_AFTER: 1.5, // seconds unsettled before "STAND IN THE MIDDLE OF A TILE"
	OFF_BOARD_MARGIN: 20, // head this far past the board's edge counts as off the board
	TILE_HALF: 25,

	LAND_GRACE: 0.4, // judgement window after the lava lands
	LAVA_HOLD: 1.0,
	COOL_TIME: 0.6,
	BEHIND_LIMIT: -0.2, // a safe tile is never more than slightly behind the player's facing

	TICK_START: 0.6, // seconds between warning ticks at the start of a warning
	TICK_END: 0.18,

	FLAME_SIZE: new vec3(45, 140, 45),
	BEAM_SIZE: new vec3(8, 200, 8),
};

var COLORS = {
	DEFAULT: Helpers.withAlpha(Constants.GridConfig.COLORS.TILE_DEFAULT, 0.35),
	WARN: new vec4(1.0, 0.55, 0.05, 1.0),
	LAVA: new vec4(1.0, 0.15, 0.05, 0.9),
	SAFE: new vec4(0.2, 0.9, 1.0, 0.9),
	CLEAR: new vec4(0.1, 1.0, 0.5, 0.9),
	FLAME: new vec4(1.0, 0.35, 0.05, 0.4),
	BEAM: new vec4(0.2, 0.9, 1.0, 0.55),
};

var Phase = {
	IDLE: "idle",
	WAIT_START: "wait_start",
	COUNTDOWN: "countdown",
	SETTLE: "settle",
	WARN: "warn",
	LAND: "land",
	COOL: "cool",
	RESULT: "result",
};

var clock = Helpers.createRoundClock(script);
var phase = Phase.IDLE;
var phaseTime = 0;
var lastHudText = null;

var GridManager = null;
var centres = []; // centres[z][x] in grid-local cm
var bounds = null;

// Session and level state
var levelIndex = 0;
var waveIndex = 0;
var lives = 0;

// Occupancy
var confirmed = null; // {x, z} or null
var candidate = null;
var candidateTime = 0;
var nearest = null; // {x, z} or null when off the board
var headNow = null;

// Current wave
var burning = {}; // "x,z" -> true
var safeTarget = null; // tile the beam marks
var waveType = null;
var savedDuringGrace = false;
var tickTimer = 0;

// Runtime visuals, built once and reused across sessions
var flames = []; // flames[z][x]
var beam = null;

/**
 * Called by PlacementBridge when this mode is selected and the floor is placed
 */
function onGridPlaced(gridOrigin, floorY) {
	GridManager = global.PathFinder && global.PathFinder.GridManager;
	if (!GridManager) {
		print("LavaController: No GridManager registered for this session");
		return;
	}

	Helpers.installExitWrapper(TAG, endSession);
	clock.start();

	GridManager.initialize(gridOrigin, ROWS, COLUMNS);
	GridManager.showGrid();

	centres = [];
	for (var z = 0; z < ROWS; z++) {
		centres[z] = [];
		for (var x = 0; x < COLUMNS; x++) {
			centres[z][x] = Helpers.tileLocal(GridManager, x, z);
		}
	}
	bounds = computeBounds();

	buildVisuals();
	placeVisuals();

	confirmed = null;
	candidate = null;
	levelIndex = 0;
	enterWaitStart();
}

// ============================================
// FLOW
// ============================================

function enterWaitStart() {
	setPhase(Phase.WAIT_START);
	clearBoard();
	paintTile(CENTRE.x, CENTRE.z, COLORS.SAFE);
	showBeam(CENTRE);
	setHud("FLOOR IS LAVA\nSTEP INTO THE LIGHT", 0);
}

function startCountdown() {
	setPhase(Phase.COUNTDOWN);
	hideBeam();
	clearBoard();

	var steps = ["3", "2", "1"];
	for (var i = 0; i < steps.length; i++) {
		scheduleCount(steps[i], i);
	}
	clock.later(steps.length, function () {
		setHud("GO!", 1.0);
		Helpers.playTrack(script.sfxPlayer, script.goTrack);
		startLevel();
	});
}

function scheduleCount(text, index) {
	clock.later(index, function () {
		setHud("LEVEL " + (levelIndex + 1) + "\n" + text, 0);
		Helpers.playSfx("playCountdown");
	});
}

function startLevel() {
	waveIndex = 0;
	lives = Config.LIVES;
	enterSettle();
}

function enterSettle() {
	setPhase(Phase.SETTLE);
	clearBoard();
	hideBeam();
}

function startWave() {
	var level = LEVELS[levelIndex];
	var plan = planWave(level.waves[waveIndex]);
	waveType = plan.type;
	burning = plan.burning;
	safeTarget = plan.safe;
	savedDuringGrace = false;
	tickTimer = 0;

	setPhase(Phase.WARN);
	clearBoard();
	paintTile(safeTarget.x, safeTarget.z, COLORS.SAFE);

	if (waveType === Wave.FREEZE) {
		// No beam: it would stand on the player's own tile
		setHud("FREEZE!", 0);
	} else {
		showBeam(safeTarget);
		setHud("MOVE!", 0);
	}
}

function land() {
	setPhase(Phase.LAND);
	Helpers.playTrack(script.sfxPlayer, script.landTrack);

	forEachTile(function (x, z) {
		if (burning[key(x, z)]) {
			paintTile(x, z, COLORS.LAVA);
			setFlameVisible(x, z, true);
		}
	});
}

function judgeWave() {
	setPhase(Phase.RESULT);

	if (savedDuringGrace) {
		setHud("SAFE!", 1.0);
		Helpers.playStep(waveIndex + 1);
	} else {
		lives--;
		Helpers.playSfx("playError");
		if (lives <= 0) {
			loseLevel();
			return;
		}
		setHud("BURNED! " + lives + (lives === 1 ? " LIFE LEFT" : " LIVES LEFT"), 1.5);
	}

	clock.later(Config.LAVA_HOLD, cool);
}

function cool() {
	setPhase(Phase.COOL);
	hideFlames();
	hideBeam();
	clearBoard();

	clock.later(Config.COOL_TIME, function () {
		waveIndex++;
		if (waveIndex >= LEVELS[levelIndex].waves.length) {
			clearLevel();
		} else {
			enterSettle();
		}
	});
}

function clearLevel() {
	setPhase(Phase.RESULT);
	Helpers.playSfx("playCompletion");
	forEachTile(function (x, z) {
		paintTile(x, z, COLORS.CLEAR);
	});

	var finished = levelIndex >= LEVELS.length - 1;
	setHud(finished ? "YOU SURVIVED THE LAVA!" : "LEVEL " + (levelIndex + 1) + " CLEAR!", 0);
	levelIndex = finished ? 0 : levelIndex + 1;

	clock.later(finished ? 4.0 : 3.0, startCountdown);
}

function loseLevel() {
	setPhase(Phase.RESULT);
	forEachTile(function (x, z) {
		paintTile(x, z, COLORS.LAVA);
	});
	setHud("BURNED OUT\nLEVEL " + (levelIndex + 1) + " AGAIN", 0);

	clock.later(Config.LAVA_HOLD, function () {
		hideFlames();
	});
	clock.later(3.0, startCountdown);
}

// ============================================
// PER-FRAME
// ============================================

function update() {
	if (!clock.isActive() || !GridManager) return;

	headNow = Helpers.headLocal(GridManager, script.cameraObject);
	if (!headNow) return;

	var dt = getDeltaTime();
	phaseTime += dt;
	updateOccupancy(headNow, dt);

	if (phase === Phase.WAIT_START) {
		if (confirmed && confirmed.x === CENTRE.x && confirmed.z === CENTRE.z) {
			startCountdown();
		}
	} else if (phase === Phase.SETTLE) {
		if (isSettled()) {
			startWave();
		} else if (!nearest) {
			setHud("BACK ON THE BOARD", 0);
		} else if (phaseTime >= Config.SETTLE_HINT_AFTER) {
			setHud("STAND IN THE MIDDLE OF A TILE", 0);
		}
	} else if (phase === Phase.WARN) {
		updateWarning(dt);
		if (phaseTime >= LEVELS[levelIndex].warn) {
			land();
		}
	} else if (phase === Phase.LAND) {
		if (isSafeNow()) {
			savedDuringGrace = true;
		}
		if (phaseTime >= Config.LAND_GRACE) {
			judgeWave();
		}
	}
}

/**
 * Tracks the nearest tile (null off the board) and the confirmed tile (held near its centre)
 */
function updateOccupancy(head, dt) {
	nearest = nearestTile(head);

	var holding = nearest && Helpers.horizontalDistance(head, centres[nearest.z][nearest.x]) <= Config.CONFIRM_RADIUS;
	if (!holding) {
		candidate = null;
		candidateTime = 0;
		return;
	}
	if (confirmed && confirmed.x === nearest.x && confirmed.z === nearest.z) {
		candidate = null;
		candidateTime = 0;
		return;
	}
	if (!candidate || candidate.x !== nearest.x || candidate.z !== nearest.z) {
		candidate = nearest;
		candidateTime = 0;
	}
	candidateTime += dt;
	if (candidateTime >= Config.CONFIRM_DWELL) {
		confirmed = candidate;
		candidate = null;
		candidateTime = 0;
		Helpers.debugLog(TAG, "Confirmed tile " + key(confirmed.x, confirmed.z));
	}
}

function isSettled() {
	return !!confirmed && !!nearest && Helpers.horizontalDistance(headNow, centres[confirmed.z][confirmed.x]) <= Config.SETTLE_RADIUS;
}

/**
 * Lenient landing check: safe if either the confirmed tile or the nearest tile is not burning
 */
function isSafeNow() {
	var confirmedSafe = confirmed && !burning[key(confirmed.x, confirmed.z)];
	var nearestSafe = nearest && !burning[key(nearest.x, nearest.z)];
	return !!(confirmedSafe || nearestSafe);
}

/**
 * Pulses the burning tiles and speeds up the warning ticks as landing approaches
 */
function updateWarning(dt) {
	var warn = LEVELS[levelIndex].warn;
	var progress = Math.min(phaseTime / warn, 1);

	var pulseSpeed = 4 + 10 * progress;
	var alpha = 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(phaseTime * pulseSpeed));
	forEachTile(function (x, z) {
		if (burning[key(x, z)]) {
			paintTile(x, z, Helpers.withAlpha(COLORS.WARN, alpha));
		}
	});

	tickTimer -= dt;
	if (tickTimer <= 0) {
		Helpers.playSfx("playCountdown");
		tickTimer = Config.TICK_START + (Config.TICK_END - Config.TICK_START) * progress;
	}
}

// ============================================
// WAVE PLANNING
// ============================================

/**
 * Picks which tiles burn so the player always has a fair answer: one step forward or sideways onto
 * a safe tile, or staying put (FREEZE). If no safe neighbour is in front of or beside the player,
 * the wave becomes a FREEZE
 * @param {string} type - Wave type from the level table
 * @returns {Object} {type, burning, safe}
 */
function planWave(type) {
	var standing = confirmed || CENTRE;

	if (type !== Wave.FREEZE) {
		var target = pickTarget(standing);
		if (target) {
			return { type: type, burning: burnSet(type, standing, target), safe: target };
		}
		Helpers.debugLog(TAG, "No safe neighbour in front - FREEZE instead of " + type);
	}

	return { type: Wave.FREEZE, burning: burnSet(Wave.FREEZE, standing, standing), safe: standing };
}

/**
 * The orthogonal neighbour to move to: not behind the player's facing, preferring tiles nearer the
 * centre so the player isn't pushed to the edge
 */
function pickTarget(standing) {
	var heading = headingLocal();
	var options = [];
	var directions = [
		{ x: 1, z: 0 },
		{ x: -1, z: 0 },
		{ x: 0, z: 1 },
		{ x: 0, z: -1 },
	];

	for (var i = 0; i < directions.length; i++) {
		var tile = { x: standing.x + directions[i].x, z: standing.z + directions[i].z };
		if (tile.x < 0 || tile.x >= COLUMNS || tile.z < 0 || tile.z >= ROWS) continue;

		if (heading) {
			var step = centres[tile.z][tile.x].sub(centres[standing.z][standing.x]);
			var stepLength = Math.sqrt(step.x * step.x + step.z * step.z);
			var facing = (step.x * heading.x + step.z * heading.z) / stepLength;
			if (facing < Config.BEHIND_LIMIT) continue;
		}

		var distanceToCentre = Math.abs(tile.x - CENTRE.x) + Math.abs(tile.z - CENTRE.z);
		options.push({ tile: tile, score: distanceToCentre + Math.random() * 0.5 });
	}

	if (options.length === 0) return null;
	options.sort(function (a, b) {
		return a.score - b.score;
	});
	return options[0].tile;
}

function burnSet(type, standing, target) {
	var result = {};
	forEachTile(function (x, z) {
		var burns;
		if (type === Wave.LINE) {
			// Target beside the player: burn the player's column; in front or behind: burn the row
			burns = target.z === standing.z ? x === standing.x : z === standing.z;
		} else if (type === Wave.CHECKER) {
			burns = (x + z) % 2 === (standing.x + standing.z) % 2;
		} else if (type === Wave.ISLAND) {
			burns = !(x === target.x && z === target.z);
		} else {
			burns = !(x === standing.x && z === standing.z);
		}
		if (burns) result[key(x, z)] = true;
	});
	return result;
}

/**
 * Flattened view direction in grid-local space. The camera looks along its -forward
 */
function headingLocal() {
	if (!script.cameraObject) return null;
	var transform = script.cameraObject.getTransform();
	var position = transform.getWorldPosition();
	var ahead = position.add(transform.forward.uniformScale(-100));
	var from = GridManager.worldToGridLocal(position);
	var to = GridManager.worldToGridLocal(ahead);
	if (!from || !to) return null;

	var dx = to.x - from.x;
	var dz = to.z - from.z;
	var length = Math.sqrt(dx * dx + dz * dz);
	if (length < 1e-3) return null;
	return { x: dx / length, z: dz / length };
}

// ============================================
// BOARD AND VISUALS
// ============================================

function nearestTile(head) {
	if (!bounds) return null;
	var margin = Config.OFF_BOARD_MARGIN;
	if (head.x < bounds.minX - margin || head.x > bounds.maxX + margin || head.z < bounds.minZ - margin || head.z > bounds.maxZ + margin) {
		return null;
	}

	var best = null;
	var bestDistance = Infinity;
	forEachTile(function (x, z) {
		var distance = Helpers.horizontalDistance(head, centres[z][x]);
		if (distance < bestDistance) {
			bestDistance = distance;
			best = { x: x, z: z };
		}
	});
	return best;
}

function computeBounds() {
	var nearLeft = centres[ROWS - 1][0];
	var farRight = centres[0][COLUMNS - 1];
	if (!nearLeft || !farRight) return null;
	var half = Config.TILE_HALF;
	return {
		minX: Math.min(nearLeft.x, farRight.x) - half,
		maxX: Math.max(nearLeft.x, farRight.x) + half,
		minZ: Math.min(nearLeft.z, farRight.z) - half,
		maxZ: Math.max(nearLeft.z, farRight.z) + half,
	};
}

function clearBoard() {
	forEachTile(function (x, z) {
		paintTile(x, z, COLORS.DEFAULT);
	});
}

function paintTile(x, z, color) {
	GridManager.setTileColorAt(x, z, color);
}

function forEachTile(fn) {
	for (var z = 0; z < ROWS; z++) {
		for (var x = 0; x < COLUMNS; x++) {
			fn(x, z);
		}
	}
}

/**
 * Builds one flame column per tile and the safe-tile beam, once
 */
function buildVisuals() {
	if (!script.boxMesh || !script.boxMaterial || beam) return;

	var parent = script.getSceneObject();
	for (var z = 0; z < ROWS; z++) {
		flames[z] = [];
		for (var x = 0; x < COLUMNS; x++) {
			var flame = Helpers.createBox(parent, "LavaFlame" + x + z, script.boxMesh, script.boxMaterial);
			Helpers.setBoxColor(flame, COLORS.FLAME);
			flame.object.getTransform().setLocalScale(Config.FLAME_SIZE);
			flame.object.enabled = false;
			flames[z][x] = flame;
		}
	}
	beam = Helpers.createBox(parent, "LavaBeam", script.boxMesh, script.boxMaterial);
	Helpers.setBoxColor(beam, COLORS.BEAM);
	beam.object.getTransform().setLocalScale(Config.BEAM_SIZE);
	beam.object.enabled = false;
}

/**
 * Stands each flame on its tile for this session's grid
 */
function placeVisuals() {
	if (!beam) return;
	var rotation = GridManager.getGridParent().getTransform().getWorldRotation();
	forEachTile(function (x, z) {
		var transform = flames[z][x].object.getTransform();
		var centre = centres[z][x];
		transform.setWorldPosition(Helpers.gridToWorldPoint(GridManager, new vec3(centre.x, Config.FLAME_SIZE.y / 2, centre.z)));
		transform.setWorldRotation(rotation);
	});
	beam.object.getTransform().setWorldRotation(rotation);
}

function setFlameVisible(x, z, visible) {
	if (flames[z] && flames[z][x]) {
		flames[z][x].object.enabled = visible;
	}
}

function hideFlames() {
	forEachTile(function (x, z) {
		setFlameVisible(x, z, false);
	});
}

function showBeam(tile) {
	if (!beam) return;
	var centre = centres[tile.z][tile.x];
	beam.object.getTransform().setWorldPosition(Helpers.gridToWorldPoint(GridManager, new vec3(centre.x, Config.BEAM_SIZE.y / 2, centre.z)));
	beam.object.enabled = true;
}

function hideBeam() {
	if (beam) beam.object.enabled = false;
}

// ============================================
// LIFECYCLE
// ============================================

/**
 * Stops this mode's callbacks and hides its HUD, flames and beam
 */
function endSession() {
	clock.stop();
	setPhase(Phase.IDLE);
	Helpers.hideHud();
	hideFlames();
	hideBeam();
}

/**
 * Shows HUD text, skipping repeats of a message that is already up (some are set every frame)
 */
function setHud(text, seconds) {
	if (text === lastHudText && seconds === 0) return;
	lastHudText = text;
	Helpers.showHud(text, seconds);
}

function setPhase(newPhase) {
	phase = newPhase;
	phaseTime = 0;
	lastHudText = null;
	Helpers.debugLog(TAG, "Phase: " + newPhase);
}

function key(x, z) {
	return x + "," + z;
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
global.PathFinder.Modes.lava = {
	onGridPlaced: onGridPlaced,
	endRound: endSession,
};
