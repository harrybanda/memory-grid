// LavaController.js
// Floor Is Lava mode: tiles warn in amber, then burn. Be on a safe tile when the lava lands.
// Lives in the scene (not the per-session Surface prefab); PlacementBridge routes to it.
//
// Flow: WAIT_START (step into the light on the centre tile) -> COUNTDOWN -> waves:
//   SETTLE (stand near a tile centre) -> WARN (burning tiles pulse amber; a cyan pillar marks a safe tile
//   one step forward or sideways, or the game says FREEZE) -> LAND (flames rise; judged over a short
//   grace window) -> COOL -> next wave. Clear all waves to clear the level; three levels, then it loops.
//
// Where the player stands is tracked every frame from a body estimate: the head position pulled back when
// looking down (ModeHelpers.bodyLocal), since the tile triggers only report first entries and looking at
// the next tile moves the head over it. A tile becomes "confirmed" only after the body holds within
// CONFIRM_RADIUS of its centre for CONFIRM_DWELL, so leans and head bob don't move it. At landing the
// player is safe if either the confirmed tile or the nearest tile is safe in any frame of the grace window.
//
// All visuals are drawn by LavaFx (glowing frames, lava cores, flame tongues, the safe beacon); the grid's
// own tile boxes are hidden while this mode runs.

// @input SceneObject cameraObject {"label": "Camera", "hint": "The Camera Object with Device Tracking, for head position"}
// @input Asset.Material fxScrollMaterial {"label": "FX Scroll Material", "hint": "LavaFX_Scroll: additive, textured, vertex colour, UV2 scroll"}
// @input Asset.Material fxGlowMaterial {"label": "FX Glow Material", "hint": "LavaFX_Glow: additive, vertex colour only"}
// @input Asset.Texture lavaTexture {"label": "Lava Texture", "hint": "T_LavaVeins: glowing cracks on black"}
// @input Asset.Texture flameTexture {"label": "Flame Texture", "hint": "T_FlameNoise: upward-streaked noise for flames and the safe pillar"}
// @input Component.AudioComponent sfxPlayer {"label": "SFX Player", "hint": "Lava's own AudioComponent, so its cues don't cut off the shared channel"}
// @input Asset.AudioTrackAsset landTrack {"label": "Land Sound", "hint": "Played when the lava lands"}
// @input Asset.AudioTrackAsset goTrack {"label": "Go Sound", "hint": "Played at the end of the countdown"}

var Helpers = require("./ModeHelpers");
var LavaFx = require("./LavaFx");

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

	CONFIRM_RADIUS: 21, // cm from a tile centre before that tile can become the confirmed tile (< half the 55cm pitch)
	CONFIRM_DWELL: 0.3, // seconds the head must hold there
	SETTLE_RADIUS: 26, // a wave only starts once the body holds this close to a tile's centre for CONFIRM_DWELL
	SETTLE_HINT_AFTER: 1.5, // seconds unsettled before "STEP TO THE MIDDLE OF THE LIT TILE"
	OFF_BOARD_MARGIN: 20, // head this far past the board's edge counts as off the board
	TILE_HALF: 25,

	LAND_GRACE: 0.4, // judgement window after the lava lands
	LAVA_HOLD: 1.0,
	COOL_TIME: 0.6,
	BEHIND_LIMIT: -0.2, // a safe tile is never more than slightly behind the player's facing

	TICK_START: 0.6, // seconds between warning ticks at the start of a warning
	TICK_END: 0.18,

	// The warning frames breathe faster as landing approaches, capped below 3 flashes a second
	WARN_HZ_START: 0.8,
	WARN_HZ_END: 2.2,
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
var bodyNow = null;
var nearestHead = null; // tile nearest the raw head; the landing check accepts either estimate
var settleTile = null;
var settleTime = 0;
var settleShown = null; // tile lit faintly while waiting to settle, so the player sees which tile counts

// Current wave
var burning = {}; // "x,z" -> true
var safeTarget = null; // tile the pillar marks
var waveType = null;
var savedDuringGrace = false;
var tickTimer = 0;
var warnPhase = 0;

// Runtime visuals, built once and reused across sessions
var fx = null;

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
	if (fx) {
		fx.place(GridManager, centres);
		setTileBoxesVisible(false);
	}

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
	if (fx) {
		fx.resetBoard();
		fx.setSafe(CENTRE, true);
	}
	setHud("FLOOR IS LAVA\nSTEP INTO THE LIGHT", 0);
}

function startCountdown() {
	setPhase(Phase.COUNTDOWN);
	if (fx) {
		fx.hideSafe();
		fx.resetBoard(0.3);
	}

	var steps = ["3", "2", "1"];
	for (var i = 0; i < steps.length; i++) {
		scheduleCount(steps[i], i);
	}
	clock.later(steps.length, function () {
		setHud("GO!", 1.0);
		Helpers.playTrack(script.sfxPlayer, script.goTrack);
		if (fx) fx.goSweep();
		// Let GO! be read before the first wave's MOVE!/FREEZE! (update ignores COUNTDOWN)
		clock.later(1.0, startLevel);
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
	if (fx) {
		fx.hideSafe();
		fx.resetBoard();
	}
	settleShown = null;
	settleTile = null;
	settleTime = 0;
}

function startWave() {
	var level = LEVELS[levelIndex];
	var plan = planWave(level.waves[waveIndex]);
	waveType = plan.type;
	burning = plan.burning;
	safeTarget = plan.safe;
	savedDuringGrace = false;
	tickTimer = 0;
	warnPhase = 0;

	setPhase(Phase.WARN);
	if (fx) {
		fx.resetBoard();
		fx.setWarnTiles(burningList());
		// No pillar on a FREEZE: it would stand on the player's own tile
		fx.setSafe(safeTarget, waveType !== Wave.FREEZE);
	}
	setHud(waveType === Wave.FREEZE ? "FREEZE!" : "MOVE!", 0);
}

function land() {
	setPhase(Phase.LAND);
	Helpers.playTrack(script.sfxPlayer, script.landTrack);
	if (fx) fx.ignite(burningList(), playerTile());
}

function judgeWave() {
	setPhase(Phase.RESULT);

	if (savedDuringGrace) {
		setHud("SAFE!", 1.0);
		Helpers.playStep(waveIndex + 1);
		if (fx) fx.safePing(playerTile());
	} else {
		lives--;
		Helpers.playSfx("playError");
		if (fx) fx.burnFlash(playerTile());
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
	if (fx) fx.cool(Config.COOL_TIME);

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
	if (fx) fx.clearRipple(playerTile());

	var finished = levelIndex >= LEVELS.length - 1;
	setHud(finished ? "YOU SURVIVED THE LAVA!" : "LEVEL " + (levelIndex + 1) + " CLEAR!", 0);
	levelIndex = finished ? 0 : levelIndex + 1;

	clock.later(finished ? 4.0 : 3.0, startCountdown);
}

function loseLevel() {
	setPhase(Phase.RESULT);
	if (fx) fx.burnedOut();
	setHud("BURNED OUT\nLEVEL " + (levelIndex + 1) + " AGAIN", 0);

	clock.later(Config.LAVA_HOLD, function () {
		if (fx) fx.sinkFlames();
	});
	clock.later(3.0, startCountdown);
}

// ============================================
// PER-FRAME
// ============================================

function update() {
	if (!clock.isActive() || !GridManager) return;

	var dt = getDeltaTime();
	// Before the body check, so animations never freeze
	if (fx) fx.update(dt);

	bodyNow = Helpers.bodyLocal(GridManager, script.cameraObject);
	if (!bodyNow) return;

	phaseTime += dt;
	updateOccupancy(bodyNow, dt);
	var head = Helpers.headLocal(GridManager, script.cameraObject);
	nearestHead = head ? nearestTile(head) : null;

	if (phase === Phase.WAIT_START) {
		if (confirmed && confirmed.x === CENTRE.x && confirmed.z === CENTRE.z) {
			startCountdown();
		}
	} else if (phase === Phase.SETTLE) {
		showSettleTile();
		if (updateSettle(dt)) {
			// Plan from the tile the player is actually holding
			confirmed = { x: settleTile.x, z: settleTile.z };
			startWave();
		} else if (!nearest) {
			setHud("BACK ON THE BOARD", 0);
		} else if (phaseTime >= Config.SETTLE_HINT_AFTER) {
			setHud("STEP TO THE MIDDLE OF THE LIT TILE", 0);
		}
	} else if (phase === Phase.WARN) {
		updateWarning(dt);
		if (fx && waveType !== Wave.FREEZE && nearest && nearest.x === safeTarget.x && nearest.z === safeTarget.z) {
			// Arrived: the tile stays cyan, the pillar would only get in the way
			fx.hideBeam();
		}
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

/**
 * Settled once the body has held near one tile's centre for CONFIRM_DWELL, so a wave is never planned
 * from a tile the player is only walking through
 * @returns {boolean} True when settled on settleTile
 */
function updateSettle(dt) {
	var near = !!nearest && Helpers.horizontalDistance(bodyNow, centres[nearest.z][nearest.x]) <= Config.SETTLE_RADIUS;
	if (!near) {
		settleTile = null;
		settleTime = 0;
		return false;
	}
	if (!settleTile || settleTile.x !== nearest.x || settleTile.z !== nearest.z) {
		settleTile = { x: nearest.x, z: nearest.z };
		settleTime = 0;
	}
	settleTime += dt;
	return settleTime >= Config.CONFIRM_DWELL;
}

/**
 * While waiting to settle, lights the tile the player is over faintly so they can see which tile counts
 */
function showSettleTile() {
	var same = settleShown && nearest && settleShown.x === nearest.x && settleShown.z === nearest.z;
	if (same || (!settleShown && !nearest)) return;
	if (settleShown && fx) fx.setPlateLook(settleShown.x, settleShown.z, "idle");
	settleShown = nearest ? { x: nearest.x, z: nearest.z } : null;
	if (settleShown && fx) fx.setPlateLook(settleShown.x, settleShown.z, "settle");
}

/**
 * Lenient landing check: safe if either the confirmed tile or the nearest tile is not burning.
 * FREEZE waves use the nearest tile only: the confirmed tile is the safe one, so it can't excuse stepping off it
 */
function isSafeNow() {
	// The body estimate can over- or under-correct for looking down, so either it or the raw head counts
	var nearestSafe = (!!nearest && !burning[key(nearest.x, nearest.z)]) || (!!nearestHead && !burning[key(nearestHead.x, nearestHead.z)]);
	if (waveType === Wave.FREEZE) return nearestSafe;
	var confirmedSafe = !!confirmed && !burning[key(confirmed.x, confirmed.z)];
	return confirmedSafe || nearestSafe;
}

/**
 * Pulses the burning tiles, grows their cracks and speeds up the warning ticks as landing approaches
 */
function updateWarning(dt) {
	var warn = LEVELS[levelIndex].warn;
	var progress = Math.min(phaseTime / warn, 1);

	// Accumulated phase, so the pulse rate is exactly the stated frequency (never above WARN_HZ_END)
	var hz = Config.WARN_HZ_START + (Config.WARN_HZ_END - Config.WARN_HZ_START) * progress;
	warnPhase += 2 * Math.PI * hz * dt;
	if (fx) fx.setWarnLevel(0.5 + 0.5 * Math.sin(warnPhase), progress);

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
	var heading = Helpers.viewLocal(GridManager, script.cameraObject);
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

function forEachTile(fn) {
	for (var z = 0; z < ROWS; z++) {
		for (var x = 0; x < COLUMNS; x++) {
			fn(x, z);
		}
	}
}

/**
 * Builds the lava visuals once; they are reused across sessions
 */
function buildVisuals() {
	if (fx) return;
	fx = LavaFx.create({
		parent: script.getSceneObject(),
		cameraObject: script.cameraObject,
		scrollMaterial: script.fxScrollMaterial,
		glowMaterial: script.fxGlowMaterial,
		lavaTexture: script.lavaTexture,
		flameTexture: script.flameTexture,
		rows: ROWS,
		columns: COLUMNS,
	});
}

/**
 * The grid's own boxes are hidden while the lava visuals draw the tiles
 */
function setTileBoxesVisible(visible) {
	// The Surface prefab (and its GridManager) is destroyed on exit, after this mode's teardown
	if (!GridManager || isNull(GridManager) || !GridManager.setTileVisualEnabled) return;
	forEachTile(function (x, z) {
		GridManager.setTileVisualEnabled(x, z, visible);
	});
}

/**
 * The tile the player is over right now, for centring effects
 */
function playerTile() {
	return nearest || confirmed || CENTRE;
}

function burningList() {
	var list = [];
	forEachTile(function (x, z) {
		if (burning[key(x, z)]) list.push({ x: x, z: z });
	});
	return list;
}

// ============================================
// LIFECYCLE
// ============================================

/**
 * Stops this mode's callbacks and hides its HUD and visuals
 */
function endSession() {
	clock.stop();
	setPhase(Phase.IDLE);
	Helpers.hideHud();
	Helpers.stopTrack(script.sfxPlayer);
	if (fx) fx.hideAll();
	setTileBoxesVisible(true);
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
