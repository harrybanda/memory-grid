// MinefieldController.js
// Minefield mode: remember where the mines are, then walk to the goal without stepping on one
// Lives in the scene (not the per-session Surface prefab); PlacementBridge routes to it.
// The current session's GridManager and StartZone are read from global.PathFinder on each placement.
//
// Round flow: ZONE_WAIT (stand on the glowing marker) -> SWEEP (rows light far to near, mines stay red)
// -> STUDY (self-paced, ends on stepping onto the board or at the cap) -> PLAY (mines hidden)
// -> RESULT (win, mine hit or off the board; every mine relights) -> back to ZONE_WAIT for the next round.
//
// A caution-tape border (Visuals/BoardBorder) marks the board's edge. Its near side is an open gate while the
// player waits on the marker; once they step on, it closes behind them, and any side lights up red as they near it.

// @input SceneObject cameraObject {"label": "Camera", "hint": "The Camera Object with Device Tracking, for head position"}
// @input Component.AudioComponent sfxPlayer {"label": "SFX Player", "hint": "Minefield's own AudioComponent, so its cues don't cut off the shared step/error channel"}
// @input Asset.AudioTrackAsset goTrack {"label": "Go Sound", "hint": "Played when the mines hide and the walk begins"}

var Constants = require("../Utils/Constants");
var MinefieldLayouts = require("./MinefieldLayouts");
var Helpers = require("./ModeHelpers");
var BoardBorder = require("../Visuals/BoardBorder");

// Board: 4 columns x 4 rows. Row 3 is nearest the player (the way on, and it can hold mines), row 0 is the far row
var ROWS = 4;
var COLUMNS = 4;

var Config = {
	// The recorded voice lines were written for Classic's levels, so they're off until Minefield has its own
	VOICE_ENABLED: false,

	LIVES: 1, // One mistake ends the round. Raising it brings back "BOOM! n LIVES LEFT" and stars
	SWEEP_ROW_DELAY: 0.6, // Seconds between rows lighting during the sweep
	GRACE_AFTER_HIT: 1.5, // With more than one life: a second mine within this window costs no life
	FLASH_DURATION: 0.3, // Whole-board red flash on a hit
	MUTE_STEPS_AFTER_HIT: 1.2, // Keeps step notes from cutting off the error buzz (one shared SFX channel)
	RESULT_HOLD: 4.0, // Seconds on the result before the marker reappears

	// Start marker gate (grid-local cm). The marker sits straight ahead of column 2's tile centres,
	// because on a 4-wide board the default x=0 line is the gap between columns 1 and 2
	MARKER_LOCAL_X: 27.5,
	GATE_RADIUS: 35, // Head within this distance of the marker centre counts as standing on it
	GATE_ARM_DISTANCE: 50, // The gate arms only once the head has been this far from the marker
	GATE_ARM_AFTER_HINT: 40, // After the "step off" hint, just stepping off the glow arms it
	GATE_DWELL: 0.5,
	MIN_HEAD_HEIGHT: 100, // Head must be this high above the floor (not a carried headset); lowered at placement if needed

	STUDY_LINE_Z: 40, // Study ends when the body steps onto the board (near row centre z=25, edge z=50)
	GOAL_RADIUS: 25,
	GOAL_DWELL: 0.3,

	// Leaving the board during play costs a life (with one life, it ends the round) and locks the goal until the
	// player is back on the near row, so walking around the outside can't reach the goal. The margin is how far
	// past a tile's outer edge the body estimate may stray: enough for a heel on the edge, not a path around it
	OFF_BOARD_MARGIN: 10,
	OFF_BOARD_DWELL: 0.3,
	TILE_HALF: 25,

	// Mines also count when the body estimate stays in a mine's cell, so nobody can slip past along the gaps
	// the tile triggers don't reach. On a side that faces another mine the cell runs to the middle of the gap
	// (MINE_CELL_SHARED), closing the seam between the two; on a side that faces a safe tile or the board edge
	// it stops a little inside the tile (MINE_CELL_OPEN). Layouts never need a diagonal past a mine's corner
	// (tools/minefield-layouts.js forbids it), so every route can be walked tile centre to tile centre
	MINE_CELL_SHARED: 27.5,
	MINE_CELL_OPEN: 20,
	MINE_CELL_DWELL: 0.2, // Seconds in the cell before it counts (filters a brief lean)
};

var COLORS = {
	DEFAULT: Constants.GridConfig.COLORS.TILE_DEFAULT,
	GOAL: Constants.GridConfig.COLORS.TILE_END,
	MINE: Constants.GridConfig.COLORS.TILE_WRONG,
	FOOTPRINT: new vec4(1.0, 1.0, 1.0, 0.95),
};

var Phase = {
	IDLE: "idle",
	ZONE_WAIT: "zone_wait",
	SWEEP: "sweep",
	STUDY: "study",
	PLAY: "play",
	RESULT: "result",
};

var SUCCESS_LINES_FULL_LIVES = ["success_1", "success_2"];
var SUCCESS_LINES = ["success_4", "success_5"];
// fail_4 mentions "the path", so it isn't used here
var FAIL_LINES = ["fail_1", "fail_2", "fail_3", "fail_5"];

// Incremented on every round start and exit; delayed callbacks from older rounds do nothing
var roundId = 0;
var active = false;
var phase = Phase.IDLE;

var GridManager = null;
var StartZone = null;

// Session state (reset on every placement)
var level = 1;
var layoutCursor = 0;

// Round state
var layout = null;
var mineKeys = {};
var tileColors = [];
var lives = 0;
var stepCount = 0;
var graceUntil = 0;
var muteStepsUntil = 0;
var studyStartTime = 0;
var studyCap = 12;

// Off-board state: while returning, the goal is locked until the head is back on the near row
var boardBounds = null;
var returningToStart = false;
var offBoardTime = 0;
var enteredBoard = false; // the back edge only counts once the player has been on the board this round
var border = null; // built once, reused across sessions

// Gate and dwell timers. The gate arms once per placement (see updateGate)
var gateArmed = false;
var gateHintShown = false;
var gateDwell = 0;
var goalDwell = 0;
var minHeadHeight = Config.MIN_HEAD_HEIGHT;

// Mine cells: tile centres in grid-local cm, and how long the body has been in the current mine's cell
var cellCentres = [];
var mineCellKey = null;
var mineCellTime = 0;

/**
 * Called by PlacementBridge when this mode is selected and the floor is placed
 * @param {vec3} gridOrigin - World position of the placement
 * @param {number} floorY - Y coordinate of the floor
 */
function onGridPlaced(gridOrigin, floorY) {
	GridManager = global.PathFinder && global.PathFinder.GridManager;
	StartZone = global.PathFinder && global.PathFinder.StartZone;
	if (!GridManager) {
		print("MinefieldController: No GridManager registered for this session");
		return;
	}

	installExitWrapper();

	level = 1;
	layoutCursor = 0;
	active = true;

	GridManager.initialize(gridOrigin, ROWS, COLUMNS);
	GridManager.showGrid();
	GridManager.onTriggerEntered(onTileEntered);

	// Surface Placement's no-floor fallback puts the floor exactly 100cm below the head, so allow a margin
	// below the height the board was placed from
	var placeHead = Helpers.headLocal(GridManager, script.cameraObject);
	minHeadHeight = placeHead ? Math.min(Config.MIN_HEAD_HEIGHT, placeHead.y - 30) : Config.MIN_HEAD_HEIGHT;

	// Only the first round after placement needs arming, so whoever placed the board can't start it
	gateArmed = false;
	moveMarkerToColumnTwo();
	placeBorder();
	enterZoneWait();
}

/**
 * Builds the border once and lays it around this session's board
 */
function placeBorder() {
	var style = global.PathFinder && global.PathFinder.VisualStyle;
	if (!border && style) {
		border = BoardBorder.create({
			parent: script.getSceneObject(),
			glowMaterial: style.glowMaterial,
			scrollMaterial: style.scrollMaterial,
			stripeTexture: style.hazardTexture,
		});
	}
	var edges = computeBoardBounds();
	if (border && edges) border.place(GridManager, edges);
}

// ============================================
// ROUND FLOW
// ============================================

/**
 * Shows the start marker and waits for the player to stand on it
 */
function enterZoneWait() {
	setPhase(Phase.ZONE_WAIT);
	gateDwell = 0;
	gateHintShown = false;

	layout = null;
	mineKeys = {};
	clearBoard();
	if (StartZone) StartZone.show();
	if (border) border.setGateOpen(true);
	showHud("STAND ON THE GLOW", 0);
}

/**
 * Starts a round: picks a layout and runs the far-to-near sweep
 */
function startRound() {
	roundId++;
	if (StartZone) StartZone.hide();

	var levelData = MinefieldLayouts.LEVELS[currentLevelNumber() - 1];
	layout = pickLayout(levelData);
	studyCap = levelData.studyCap;

	mineKeys = {};
	for (var i = 0; i < layout.mines.length; i++) {
		mineKeys[key(layout.mines[i].x, layout.mines[i].z)] = { hit: false };
	}

	lives = Config.LIVES;
	stepCount = 0;
	graceUntil = 0;
	muteStepsUntil = 0;
	goalDwell = 0;
	returningToStart = false;
	offBoardTime = 0;
	enteredBoard = false;
	mineCellKey = null;
	mineCellTime = 0;
	boardBounds = computeBoardBounds();
	cellCentres = [];
	for (var z = 0; z < ROWS; z++) {
		cellCentres[z] = [];
		for (var x = 0; x < COLUMNS; x++) {
			cellCentres[z][x] = Helpers.tileLocal(GridManager, x, z);
		}
	}

	clearBoard();
	GridManager.resetTriggers();

	setPhase(Phase.SWEEP);
	showHud("LEVEL " + currentLevelNumber() + " / " + MinefieldLayouts.LEVELS.length + "\nREMEMBER THE RED", ROWS * Config.SWEEP_ROW_DELAY);

	for (var row = 0; row < ROWS; row++) {
		scheduleSweepRow(row, row * Config.SWEEP_ROW_DELAY);
	}
	later(ROWS * Config.SWEEP_ROW_DELAY, function () {
		setPhase(Phase.STUDY);
		studyStartTime = getTime();
	});
}

function scheduleSweepRow(row, delay) {
	later(delay, function () {
		for (var x = 0; x < COLUMNS; x++) {
			paint(x, row, layoutColor(x, row, true));
		}
		playSfx("playCountdown");
	});
}

/**
 * Hides the mines and starts the walk
 */
function endStudy() {
	if (phase !== Phase.STUDY && phase !== Phase.SWEEP) return;
	if (phase === Phase.SWEEP) {
		// Stepping on during the sweep starts the walk early; cancel the rows still to light
		roundId++;
	}
	setPhase(Phase.PLAY);

	for (var k in mineKeys) {
		var pos = parseKey(k);
		paint(pos.x, pos.z, COLORS.DEFAULT);
	}

	showHud("GO!\nWALK TO THE BLUE", 1.5);
	playTrack(script.goTrack);
}

/**
 * Handles a tile trigger entry (the head within ~15cm of a tile centre)
 * @param {number} x - Grid X
 * @param {number} z - Grid Z
 */
function onTileEntered(x, z) {
	if (!active) return;

	// A tile entered during the sweep or study (normally the near row) starts the walk and counts as the
	// first footprint, so the once-per-round trigger latch can't swallow it
	if (phase === Phase.SWEEP || phase === Phase.STUDY) {
		endStudy();
	}
	if (phase !== Phase.PLAY) return;

	var mine = mineKeys[key(x, z)];
	if (mine) {
		hitMine(x, z, mine);
	} else if (layout.goal.x === x && layout.goal.z === z) {
		if (!returningToStart) win();
	} else {
		leaveFootprint(x, z);
	}
}

function leaveFootprint(x, z) {
	paint(x, z, COLORS.FOOTPRINT);
	stepCount++;
	if (getTime() >= muteStepsUntil && global.PathFinder && global.PathFinder.Audio && global.PathFinder.Audio.playStep) {
		global.PathFinder.Audio.playStep(stepCount);
	}
}

function hitMine(x, z, mine) {
	// A mine can be reported twice: by its tile trigger and by the cell check
	if (mine.hit) return;
	mine.hit = true;
	paint(x, z, COLORS.MINE);

	var now = getTime();
	if (now < graceUntil) {
		debugLog("Mine (" + x + "," + z + ") during grace - no life lost");
		return;
	}

	if (loseLife("BOOM!")) {
		showHud("BOOM! " + livesText(), 2.0);
	}
}

/**
 * Takes a life with the red flash and buzz
 * @returns {boolean} True if the player still has lives left
 */
function loseLife(reason) {
	var now = getTime();
	lives--;
	graceUntil = now + Config.GRACE_AFTER_HIT;
	muteStepsUntil = now + Config.MUTE_STEPS_AFTER_HIT;
	playSfx("playError");
	flashBoard();

	if (lives <= 0) {
		lose(reason);
		return false;
	}
	return true;
}

function livesText() {
	return lives + (lives === 1 ? " LIFE LEFT" : " LIVES LEFT");
}

/**
 * The player walked off the board: costs a life and locks the goal until they return to the near row
 */
function leaveBoard() {
	returningToStart = true;
	offBoardTime = 0;
	goalDwell = 0;
	debugLog("Off the board");
	if (border) border.flash();

	if (loseLife("OFF THE BOARD")) {
		showHud("OFF THE BOARD - " + livesText() + "\nSTEP BACK ON AT THE FRONT", 0);
	}
}

function win() {
	setPhase(Phase.RESULT);
	relightMines();
	playSfx("playCompletion");

	var stars = lives;
	var total = MinefieldLayouts.LEVELS.length;
	var clearedAll = level >= total;
	var headline = clearedAll ? "ALL " + total + " LEVELS CLEARED!" : "SAFE!";
	if (Config.LIVES === 1) {
		showHud(headline + "\nTURN AROUND", 0);
	} else {
		showHud(headline + " " + stars + (stars === 1 ? " STAR" : " STARS") + "\nTURN AROUND", 0);
	}

	var lines = stars === Config.LIVES ? SUCCESS_LINES_FULL_LIVES : SUCCESS_LINES;
	later(0.8, function () {
		playVoice(randomItem(lines));
	});

	level = clearedAll ? 1 : level + 1;
	later(Config.RESULT_HOLD, function () {
		enterZoneWait();
		playVoice("return_success");
	});
}

/**
 * @param {string} reason - "BOOM!" or "OFF THE BOARD"
 */
function lose(reason) {
	setPhase(Phase.RESULT);
	relightMines();
	showHud((Config.LIVES === 1 ? reason : "OUT OF LIVES") + "\nTURN AROUND", 0);

	later(0.8, function () {
		playVoice(randomItem(FAIL_LINES));
	});

	// Same level again, on the other layout
	later(Config.RESULT_HOLD, function () {
		enterZoneWait();
		playVoice("return_retry");
	});
}

// ============================================
// PER-FRAME CHECKS
// ============================================

function update() {
	if (!active || !GridManager || !script.cameraObject) return;

	var head = Helpers.headLocal(GridManager, script.cameraObject);
	if (!head) return;
	// Where the player stands: the head pulled back when looking down, so peeking at a tile doesn't count as being on it
	var body = Helpers.bodyLocal(GridManager, script.cameraObject) || head;

	var dt = getDeltaTime();
	if (border) border.update(dt, body, phase === Phase.PLAY);

	if (phase === Phase.ZONE_WAIT) {
		updateGate(head, dt);
	} else if (phase === Phase.SWEEP) {
		if (body.z < Config.STUDY_LINE_Z) {
			endStudy();
		}
	} else if (phase === Phase.STUDY) {
		if (body.z < Config.STUDY_LINE_Z || getTime() - studyStartTime >= studyCap) {
			endStudy();
		}
	} else if (phase === Phase.PLAY) {
		updateOffBoard(body, dt);
		if (phase === Phase.PLAY) {
			updateMineCells(body, dt);
		}
		if (phase === Phase.PLAY && !returningToStart) {
			updateGoal(body, dt);
		}
	}
}

/**
 * A mine counts when the body stays in its cell for MINE_CELL_DWELL, even between tile triggers
 */
function updateMineCells(body, dt) {
	var inCell = null;
	for (var k in mineKeys) {
		if (mineKeys[k].hit) continue;
		var pos = parseKey(k);
		if (isInMineCell(body, pos.x, pos.z)) {
			inCell = k;
			break;
		}
	}

	if (inCell !== mineCellKey) {
		mineCellKey = inCell;
		mineCellTime = 0;
	}
	if (!inCell) return;

	mineCellTime += dt;
	if (mineCellTime >= Config.MINE_CELL_DWELL) {
		var mine = parseKey(inCell);
		hitMine(mine.x, mine.z, mineKeys[inCell]);
	}
}

/**
 * True when the body is inside mine (x, z)'s cell. Each side extends to the middle of the gap if the
 * neighbour across it is also a mine, and stops at MINE_CELL_OPEN otherwise (see Config)
 */
function isInMineCell(body, x, z) {
	var centre = cellCentres[z] && cellCentres[z][x];
	if (!centre) return false;
	var dx = body.x - centre.x;
	var dz = body.z - centre.z;

	// Neighbours in grid terms: +gridX is +local x; +gridZ is +local z (toward the player)
	var reachX = mineKeys[key(x + (dx >= 0 ? 1 : -1), z)] ? Config.MINE_CELL_SHARED : Config.MINE_CELL_OPEN;
	var reachZ = mineKeys[key(x, z + (dz >= 0 ? 1 : -1))] ? Config.MINE_CELL_SHARED : Config.MINE_CELL_OPEN;
	return Math.abs(dx) <= reachX && Math.abs(dz) <= reachZ;
}

function updateOffBoard(head, dt) {
	if (!boardBounds) return;

	if (returningToStart) {
		// Back once the head is over the near row
		var onNearRow = head.x >= boardBounds.minX && head.x <= boardBounds.maxX && head.z >= boardBounds.startRowMinZ && head.z <= boardBounds.maxZ;
		if (onNearRow) {
			returningToStart = false;
			showHud("BACK ON THE BOARD", 1.5);
			debugLog("Back on the near row");
		}
		return;
	}

	// The back edge (behind the near row) only counts once the player has been on the board: the marker stands
	// behind it, and the study timer can start the walk with the player still on the marker
	var margin = Config.OFF_BOARD_MARGIN;
	var inside = head.x >= boardBounds.minX && head.x <= boardBounds.maxX && head.z >= boardBounds.minZ && head.z <= boardBounds.maxZ;
	if (inside && !enteredBoard) {
		enteredBoard = true;
		// The gate closes behind them
		if (border) border.setGateOpen(false);
	}
	var outside = head.x < boardBounds.minX - margin || head.x > boardBounds.maxX + margin || head.z < boardBounds.minZ - margin || (enteredBoard && head.z > boardBounds.maxZ + margin);

	if (outside) {
		offBoardTime += dt;
		if (offBoardTime >= Config.OFF_BOARD_DWELL) {
			leaveBoard();
		}
	} else {
		offBoardTime = 0;
	}
}

/**
 * Board outline in grid-local cm, from the real tile positions
 */
function computeBoardBounds() {
	var nearLeft = GridManager.worldToGridLocal(GridManager.getTileWorldPosition(0, ROWS - 1));
	var farRight = GridManager.worldToGridLocal(GridManager.getTileWorldPosition(COLUMNS - 1, 0));
	if (!nearLeft || !farRight) return null;

	var half = Config.TILE_HALF;
	return {
		minX: Math.min(nearLeft.x, farRight.x) - half,
		maxX: Math.max(nearLeft.x, farRight.x) + half,
		minZ: Math.min(nearLeft.z, farRight.z) - half,
		maxZ: Math.max(nearLeft.z, farRight.z) + half,
		startRowMinZ: nearLeft.z - half,
	};
}

/**
 * The round starts when a standing player holds still on the marker. The gate arms only after the
 * head has been away from the marker, so whoever placed the board can't start it by accident
 */
function updateGate(head, dt) {
	var marker = StartZone && StartZone.getZoneWorldPosition ? GridManager.worldToGridLocal(StartZone.getZoneWorldPosition()) : null;
	if (!marker) return;

	var distance = horizontalDistance(head, marker);

	if (!gateArmed) {
		if (distance > (gateHintShown ? Config.GATE_ARM_AFTER_HINT : Config.GATE_ARM_DISTANCE)) {
			gateArmed = true;
			debugLog("Gate armed");
			if (gateHintShown) {
				gateHintShown = false;
				showHud("STAND ON THE GLOW", 0);
			}
		} else if (distance <= Config.GATE_RADIUS && !gateHintShown) {
			// Whoever placed the board is often already on the glow; tell them how to start
			gateHintShown = true;
			showHud("STEP OFF THE GLOW,\nTHEN BACK ON", 0);
		}
		return;
	}

	if (distance <= Config.GATE_RADIUS && head.y >= minHeadHeight) {
		gateDwell += dt;
		if (gateDwell >= Config.GATE_DWELL) {
			startRound();
		}
	} else {
		gateDwell = 0;
	}
}

function updateGoal(head, dt) {
	var goal = GridManager.worldToGridLocal(GridManager.getTileWorldPosition(layout.goal.x, layout.goal.z));
	if (goal && horizontalDistance(head, goal) <= Config.GOAL_RADIUS) {
		goalDwell += dt;
		if (goalDwell >= Config.GOAL_DWELL) {
			win();
		}
	} else {
		goalDwell = 0;
	}
}

// ============================================
// BOARD
// ============================================

/**
 * Colour of a tile in the current layout
 * @param {boolean} showMines - Whether mines are visible
 */
function layoutColor(x, z, showMines) {
	if (layout && layout.goal.x === x && layout.goal.z === z) return COLORS.GOAL;
	if (showMines && mineKeys[key(x, z)]) return COLORS.MINE;
	return COLORS.DEFAULT;
}

function clearBoard() {
	tileColors = [];
	for (var z = 0; z < ROWS; z++) {
		tileColors[z] = [];
		for (var x = 0; x < COLUMNS; x++) {
			paint(x, z, layoutColor(x, z, false));
		}
	}
}

function relightMines() {
	for (var k in mineKeys) {
		var pos = parseKey(k);
		paint(pos.x, pos.z, COLORS.MINE);
	}
}

/**
 * Flashes the whole board red, then restores every tile's colour
 */
function flashBoard() {
	for (var z = 0; z < ROWS; z++) {
		for (var x = 0; x < COLUMNS; x++) {
			GridManager.setTileColorAt(x, z, COLORS.MINE);
		}
	}
	later(Config.FLASH_DURATION, function () {
		for (var z = 0; z < ROWS; z++) {
			for (var x = 0; x < COLUMNS; x++) {
				GridManager.setTileColorAt(x, z, tileColors[z][x]);
			}
		}
	});
}

function paint(x, z, color) {
	tileColors[z] = tileColors[z] || [];
	tileColors[z][x] = color;
	GridManager.setTileColorAt(x, z, color);
}

function currentLevelNumber() {
	return Math.min(level, MinefieldLayouts.LEVELS.length);
}

/**
 * Cycles through the level's layouts and mirrors left-right half the time
 */
function pickLayout(levelData) {
	var base = levelData.layouts[layoutCursor % levelData.layouts.length];
	layoutCursor++;

	if (Math.random() < 0.5) return base;
	return {
		goal: { x: COLUMNS - 1 - base.goal.x, z: base.goal.z },
		mines: base.mines.map(function (m) {
			return { x: COLUMNS - 1 - m.x, z: m.z };
		}),
	};
}

/**
 * Moves the start marker to column 2's centre line at runtime (editing the prefab would move Classic's)
 */
function moveMarkerToColumnTwo() {
	if (!StartZone || !StartZone.getZoneObject) return;
	var zone = StartZone.getZoneObject();
	if (!zone) return;
	var transform = zone.getTransform();
	var pos = transform.getLocalPosition();
	transform.setLocalPosition(new vec3(Config.MARKER_LOCAL_X, pos.y, pos.z));
}

// ============================================
// LIFECYCLE
// ============================================

/**
 * Runs fn after the given seconds, unless the round has ended or changed since
 * @param {number} seconds - Delay
 * @param {Function} fn - Callback
 */
function later(seconds, fn) {
	var scheduledRound = roundId;
	var delay = script.createEvent("DelayedCallbackEvent");
	delay.bind(function () {
		if (active && scheduledRound === roundId) {
			fn();
		}
	});
	delay.reset(seconds);
	return delay;
}

/**
 * Stops this mode's callbacks and hides its HUD
 */
function endRound() {
	roundId++;
	active = false;
	setPhase(Phase.IDLE);
	Helpers.stopTrack(script.sfxPlayer);
	if (border) border.hide();

	if (global.PathFinder && global.PathFinder.LookDownHint) {
		global.PathFinder.LookDownHint.hide();
	}
}

/**
 * Wraps the palm-exit handler so this mode tears down before Classic's exit runs
 * GameStateManager recreates global.PathFinder.Game on every session, so this never leaks
 */
function installExitWrapper() {
	var game = global.PathFinder && global.PathFinder.Game;
	if (!game || !game.exit || game.exit.isMinefieldWrapper) return;

	var classicExit = game.exit;
	var wrappedExit = function () {
		endRound();
		classicExit();
	};
	wrappedExit.isMinefieldWrapper = true;
	game.exit = wrappedExit;
}

function setPhase(newPhase) {
	phase = newPhase;
	debugLog("Phase: " + newPhase);
}

// ============================================
// HELPERS
// ============================================

/**
 * Shows head-locked text via LookDownHint
 * @param {string} text - Message
 * @param {number} seconds - Seconds before it fades (0 keeps it up)
 */
function showHud(text, seconds) {
	if (global.PathFinder && global.PathFinder.LookDownHint && global.PathFinder.LookDownHint.showFor) {
		global.PathFinder.LookDownHint.showFor(text, seconds);
	}
}

/**
 * Plays a voice line by id without the host robot (skipped if the clip is missing)
 */
function playVoice(id) {
	if (!Config.VOICE_ENABLED) return;
	var audio = global.PathFinder && global.PathFinder.Audio;
	if (audio && audio.has && audio.has(id)) {
		audio.play(id);
	}
}

/**
 * Plays a track on Minefield's own AudioComponent
 */
function playTrack(track) {
	if (!script.sfxPlayer || !track) return;
	script.sfxPlayer.audioTrack = track;
	script.sfxPlayer.play(1);
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

function horizontalDistance(a, b) {
	var dx = a.x - b.x;
	var dz = a.z - b.z;
	return Math.sqrt(dx * dx + dz * dz);
}

function key(x, z) {
	return x + "," + z;
}

function parseKey(k) {
	var parts = k.split(",");
	return { x: parseInt(parts[0], 10), z: parseInt(parts[1], 10) };
}

function randomItem(list) {
	return list[Math.floor(Math.random() * list.length)];
}

function debugLog(message) {
	if (!Constants.DebugConfig.ENABLED) return;
	message = "Minefield: " + message;
	if (global.textLogger) {
		global.textLogger.log(message);
	} else {
		print(message);
	}
}

script.createEvent("UpdateEvent").bind(function () {
	update();
});

// Export API
script.onGridPlaced = onGridPlaced;
script.endRound = endRound;

// Register with the mode router in PlacementBridge
global.PathFinder = global.PathFinder || {};
global.PathFinder.Modes = global.PathFinder.Modes || {};
global.PathFinder.Modes.minefield = {
	onGridPlaced: onGridPlaced,
	endRound: endRound,
};
