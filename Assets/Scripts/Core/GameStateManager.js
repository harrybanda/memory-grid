// GameStateManager.js
// Manages game states, timers, and overall game flow

// @input Component.ScriptComponent gridManagerScript {"label": "Grid Manager", "hint": "Reference to GridManager script"}
// @input Component.ScriptComponent playerTrackerScript {"label": "Player Tracker", "hint": "Reference to PlayerTracker script"}
// @input Component.ScriptComponent hostManagerScript {"label": "Host Manager", "hint": "Reference to HostManager script (optional)"}
// @input Component.ScriptComponent startZoneScript {"label": "Start Zone Visual", "hint": "Reference to StartZoneVisual script (optional)"}
// @input Component.ScriptComponent countdownDisplayScript {"label": "Countdown Display", "hint": "Reference to CountdownDisplay script (optional)"}
// @input Component.VFXComponent confettiVFX {"label": "Confetti VFX", "hint": "VFX component for level completion confetti (optional)"}

var Constants = require("../Utils/Constants");
var DialogueLines = require("../Utils/DialogueLines");

/**
 * GameStateManager Component
 * Controls the game flow through various states and manages timers
 */

// Current game state
var gameState = {
	current: Constants.GameState.IDLE,
	previous: null,
	currentLevel: 1,
	score: 0,
	wrongSteps: 0,
	memorizeTimeRemaining: 0,
	isFirstGame: true,
	currentLevelRetried: false, // Track if current level was retried
};

// Timer references
var timers = {
	countdown: null,
	memorize: null,
	idlePrompt: null,
};

// Callbacks for state changes
var callbacks = {
	onStateChange: null,
	onCountdownTick: null,
	onMemorizeTimeTick: null,
	onGameComplete: null,
	onGameFailed: null,
	onScoreUpdate: null,
};

// Module references
var GridManager = null;
var PlayerTracker = null;
var HostManager = null;
var StartZone = null;
var CountdownDisplay = null;

// Floor position for initialization
var floorPosition = null;

// Player's position when grid was placed (for StartZone)
var playerPositionAtPlacement = null;

/**
 * Initializes the GameStateManager
 */
function initialize() {
	//global.PathFinder.AchievementNotification.show("first_steps");
	//global.PathFinder.Save.resetAll();
	//var unlockedAchievements = global.PathFinder.Save.getUnlockedAchievements();
	//print("Unlocked Achievements: " + unlockedAchievements);

	// Get module references
	if (script.gridManagerScript) {
		GridManager = script.gridManagerScript;
	}
	if (script.playerTrackerScript) {
		PlayerTracker = script.playerTrackerScript;
	}
	if (script.hostManagerScript) {
		HostManager = script.hostManagerScript;
	}
	if (script.startZoneScript) {
		StartZone = script.startZoneScript;
	}
	if (script.countdownDisplayScript) {
		CountdownDisplay = script.countdownDisplayScript;
	}

	// Setup player tracker callbacks
	if (PlayerTracker) {
		PlayerTracker.onCorrectStep(handleCorrectStep);
		PlayerTracker.onWrongStep(handleWrongStep);
		PlayerTracker.onPathCompleted(handlePathCompleted);
		PlayerTracker.onStartZoneEntered(handleStartZoneEntered);
		PlayerTracker.onStartZoneExited(handleStartZoneExited);
	}

	// Load saved progress after a short delay (ensure SaveManager is initialized)
	var loadDelay = script.createEvent("DelayedCallbackEvent");
	loadDelay.bind(function () {
		if (global.PathFinder && global.PathFinder.Save) {
			var savedLevel = global.PathFinder.Save.getCurrentLevel();
			if (savedLevel > 1) {
				gameState.currentLevel = savedLevel;
				print("GameStateManager: Loaded saved progress - Level " + savedLevel);
			}
		}
	});
	loadDelay.reset(0.1);

	// Ensure confetti is off at start
	stopConfetti();

	print("GameStateManager: Initialized with new game flow");
}

/**
 * Changes to a new game state
 * @param {string} newState - The new state to transition to
 */
function changeState(newState) {
	if (newState === gameState.current) return;

	gameState.previous = gameState.current;
	gameState.current = newState;

	print("Game: " + newState);

	// Handle state entry logic
	handleStateEntry(newState);

	// Notify listeners
	if (callbacks.onStateChange) {
		callbacks.onStateChange(newState, gameState.previous);
	}
}

/**
 * Handles logic when entering a new state
 * @param {string} state - The state being entered
 */
function handleStateEntry(state) {
	switch (state) {
		case Constants.GameState.IDLE:
			resetGame();
			break;

		case Constants.GameState.PLACING_GRID:
			// Grid placement is handled by external Spectacles package
			break;

		case Constants.GameState.GRID_INTRO:
			// New flow: show start tile, brief pause, then countdown
			startGridIntro();
			break;

		case Constants.GameState.HOST_INTRO:
			// Optional: only used for host dialogue between rounds
			startHostIntro();
			break;

		case Constants.GameState.WAITING_IN_START_ZONE:
			// Only used between rounds - player returns to start area
			startWaitingInStartZone();
			break;

		case Constants.GameState.COUNTDOWN:
			startCountdown();
			break;

		case Constants.GameState.MEMORIZE:
			startMemorizePhase();
			break;

		case Constants.GameState.PLAYING:
			startPlayPhase();
			break;

		case Constants.GameState.COMPLETED:
			handleGameCompleted();
			break;

		case Constants.GameState.FAILED:
			handleGameFailed();
			break;
	}
}

/**
 * Resets the game to initial state
 */
function resetGame() {
	clearAllTimers();

	gameState.score = 0;
	gameState.wrongSteps = 0;
	gameState.memorizeTimeRemaining = 0;

	if (PlayerTracker) {
		PlayerTracker.stopTracking();
		PlayerTracker.reset();
	}

	if (GridManager) {
		GridManager.resetTileStates();
	}

	if (StartZone) {
		StartZone.hide();
	}

	// Don't hide HostManager here - let it stay visible between rounds
}

/**
 * Starts the grid intro - shows dimmed grid with bright start tile
 * Creates a focal point for the player to focus on
 *
 * Level 1 first time: plays Welcome → Goal → Level 1 announcement, then countdown.
 * All other levels: plays level announcement, then countdown.
 * Host stays visible for the entire duration of each voice line.
 */
function startGridIntro() {
	// Generate path first so we know where start tile is
	setupLevel();

	// Show only the start tile brightly (grid already dimmed by GridManager.initialize)
	if (GridManager) {
		GridManager.showOnlyStartTile();
	}

	var isLevel1FirstTime = gameState.isFirstGame && gameState.currentLevel === 1;

	// Called after all host dialogue finishes to proceed to countdown
	function proceedToCountdown() {
		changeState(Constants.GameState.COUNTDOWN);
	}

	// Brief pause for player to notice the start tile, then begin host dialogue
	var focusDelay = script.createEvent("DelayedCallbackEvent");
	focusDelay.bind(function () {
		if (HostManager && floorPosition) {
			HostManager.initialize(floorPosition);

			if (isLevel1FirstTime) {
				// Level 1: Welcome → Goal → Level 1 announcement → countdown
				HostManager.playWelcomeSequence(function () {
					gameState.isFirstGame = false;
					HostManager.playLevelAnnouncement(gameState.currentLevel, proceedToCountdown);
				});
			} else {
				// Level 2+: level announcement → countdown
				HostManager.playLevelAnnouncement(gameState.currentLevel, proceedToCountdown);
			}
		} else {
			// No HostManager: go straight to countdown
			proceedToCountdown();
		}
	});
	focusDelay.reset(Constants.IntroConfig.START_FOCUS_DELAY);
}

/**
 * Starts the host introduction
 */
function startHostIntro() {
	if (HostManager && floorPosition) {
		HostManager.initialize(floorPosition);

		// Check if this is a returning player with saved progress
		var savedLevel = 1;
		if (global.PathFinder && global.PathFinder.Save) {
			savedLevel = global.PathFinder.Save.getCurrentLevel();
		}

		if (gameState.isFirstGame && savedLevel === 1) {
			// First time player: play full welcome sequence
			HostManager.playWelcomeSequence(function () {
				gameState.isFirstGame = false;
				changeState(Constants.GameState.WAITING_IN_START_ZONE);
			});
		} else {
			// Returning player or already played: level announcement covers it
			gameState.isFirstGame = false;
			HostManager.playDialogue(DialogueLines.Dialogue.STAND_IN_ZONE, function () {
				changeState(Constants.GameState.WAITING_IN_START_ZONE);
			});
		}
	} else {
		// Skip host intro if no HostManager
		changeState(Constants.GameState.WAITING_IN_START_ZONE);
	}
}

/**
 * Starts waiting for player to return to start area (between rounds)
 */
function startWaitingInStartZone() {
	// Setup new level path
	setupLevel();

	// Keep grid dimmed
	if (GridManager) {
		GridManager.dimGridBackground();
	}

	// Show start zone marker
	if (StartZone) {
		var startZonePos = playerPositionAtPlacement || floorPosition;
		StartZone.initialize(startZonePos);
		StartZone.show();
	}

	// Zone state was reset in promptReturnToStartZone() so we always wait for
	// a fresh onOverlapEnter collision event via handleStartZoneEntered().
	// This prevents stale isInZone flags from skipping the return-to-start flow.
}

/**
 * Handles player entering the start zone
 */
function handleStartZoneEntered() {
	if (gameState.current === Constants.GameState.WAITING_IN_START_ZONE) {
		beginCountdownFromStartZone();
	}
}

/**
 * Handles player exiting the start zone (no action needed)
 */
function handleStartZoneExited() {
	// No action — once the countdown sequence starts, it runs to completion
}

/**
 * Begins the countdown sequence immediately when player is in the start zone
 * No delays, no timers — shows yellow tile, plays level announcement, then countdown
 */
function beginCountdownFromStartZone() {
	// Prevent double-triggering (collision enter + already-in-zone check)
	if (gameState.current !== Constants.GameState.WAITING_IN_START_ZONE) return;

	// Stop confetti from previous level completion
	stopConfetti();

	// Show the start tile brightly
	if (GridManager) {
		GridManager.showOnlyStartTile();
	}

	// Hide the start zone marker
	if (StartZone) {
		StartZone.hide();
	}

	// Announce the level, then start countdown
	if (HostManager) {
		HostManager.playLevelAnnouncement(gameState.currentLevel, function () {
			changeState(Constants.GameState.COUNTDOWN);
		});
	} else {
		changeState(Constants.GameState.COUNTDOWN);
	}
}

/**
 * Sets up the current level
 * Syncs with save system to prevent level desync bugs
 */
function setupLevel() {
	// Always verify level against save system (single source of truth)
	if (global.PathFinder && global.PathFinder.Save) {
		var savedLevel = global.PathFinder.Save.getCurrentLevel();
		if (savedLevel !== gameState.currentLevel) {
			print("WARNING: Level desync! gameState=" + gameState.currentLevel + " save=" + savedLevel + " — correcting to save value");
			gameState.currentLevel = savedLevel;
		}
	}

	var levelConfig = getLevelConfig(gameState.currentLevel);

	print("setupLevel: Level " + gameState.currentLevel + " → pathLength " + levelConfig.pathLength);

	if (GridManager) {
		// Generate new path for this level
		GridManager.generateNewPath(levelConfig.pathLength);
	}

	gameState.memorizeTimeRemaining = levelConfig.memorizeTime;
}

/**
 * Gets configuration for a specific level
 * Path length = BASE_PATH_LENGTH + (level - 1) * PATH_INCREMENT
 * @param {number} level - Level number
 * @returns {Object} Level configuration
 */
function getLevelConfig(level) {
	var config = Constants.LevelConfig;
	var pathLength = config.BASE_PATH_LENGTH + (level - 1) * config.PATH_INCREMENT;
	pathLength = Math.min(pathLength, config.MAX_PATH_LENGTH);

	return {
		gridRows: config.GRID_ROWS,
		gridColumns: config.GRID_COLUMNS,
		pathLength: pathLength,
		memorizeTime: config.MEMORIZE_TIME,
	};
}

/**
 * Starts the countdown before path reveal
 * No arrows during countdown - they appear during memorize phase
 */
function startCountdown() {
	// Show look-down hint at the start of every countdown
	if (global.PathFinder && global.PathFinder.LookDownHint) {
		global.PathFinder.LookDownHint.show();
	}

	// Use CountdownDisplay if available
	if (CountdownDisplay) {
		// Position countdown above the start tile
		var countdownPos = floorPosition;
		if (GridManager) {
			var startTilePos = GridManager.getStartTileWorldPosition();
			if (startTilePos) {
				// Position above start tile (Y offset for visibility)
				countdownPos = new vec3(startTilePos.x, startTilePos.y + 1, startTilePos.z);
			}
		}
		CountdownDisplay.initialize(countdownPos);
		CountdownDisplay.startCountdown(function () {
			// Countdown complete
			changeState(Constants.GameState.MEMORIZE);
		});
	} else {
		// Fallback: simple timer-based countdown
		var countdownTime = Constants.TimingConfig.COUNTDOWN_TIME;

		var countdownInterval = script.createEvent("DelayedCallbackEvent");
		countdownInterval.bind(function () {
			countdownTime--;

			if (callbacks.onCountdownTick) {
				callbacks.onCountdownTick(countdownTime);
			}

			if (countdownTime <= 0) {
				changeState(Constants.GameState.MEMORIZE);
			} else {
				var nextTick = script.createEvent("DelayedCallbackEvent");
				nextTick.bind(arguments.callee);
				nextTick.reset(1.0);
			}
		});
		countdownInterval.reset(1.0);

		timers.countdown = countdownInterval;

		if (callbacks.onCountdownTick) {
			callbacks.onCountdownTick(countdownTime);
		}
	}
}

/**
 * Starts the memorization phase
 * Plays a random "watch" voice line, then reveals the path
 */
function startMemorizePhase() {
	var levelConfig = getLevelConfig(gameState.currentLevel);
	gameState.memorizeTimeRemaining = levelConfig.memorizeTime;

	// Play "Watch!" or "Watch carefully..." before revealing the path
	var watchDialogue = DialogueLines.getRandomWatchDialogue();

	if (HostManager) {
		HostManager.playDialogue(watchDialogue, function () {
			// Voice line finished — now reveal the path
			revealPathAndStartTimer();
		});
	} else {
		// No host — reveal immediately
		revealPathAndStartTimer();
	}
}

/**
 * Reveals the path sequentially and starts the memorize timer when done
 */
function revealPathAndStartTimer() {
	if (GridManager) {
		GridManager.showGrid();

		GridManager.revealPathSequential(function () {
			// Path fully revealed, start memorize timer
			startMemorizeTimer();
		});
	}
}

/**
 * Starts the memorization countdown timer
 */
function startMemorizeTimer() {
	var tickEvent = script.createEvent("DelayedCallbackEvent");
	tickEvent.bind(function () {
		gameState.memorizeTimeRemaining--;

		if (callbacks.onMemorizeTimeTick) {
			callbacks.onMemorizeTimeTick(gameState.memorizeTimeRemaining);
		}

		if (gameState.memorizeTimeRemaining <= 0) {
			changeState(Constants.GameState.PLAYING);
		} else {
			var nextTick = script.createEvent("DelayedCallbackEvent");
			nextTick.bind(arguments.callee);
			nextTick.reset(1.0);
			timers.memorize = nextTick;
		}
	});
	tickEvent.reset(1.0);

	timers.memorize = tickEvent;

	if (callbacks.onMemorizeTimeTick) {
		callbacks.onMemorizeTimeTick(gameState.memorizeTimeRemaining);
	}
}

/**
 * Starts the play phase
 */
function startPlayPhase() {
	// Hide the path (keep start/end visible)
	if (GridManager) {
		GridManager.hidePath();
	}

	// Show "GO!" message - NOW the player should move
	if (CountdownDisplay) {
		CountdownDisplay.showMessage("GO!", 1.0);
	}

	// Start tracking player position
	if (PlayerTracker) {
		PlayerTracker.startTracking();
	}

	// Exit button is already shown from MainMenuManager when Start was pressed

	// Play random "go" line (host stays hidden - player is mid-grid)
	if (HostManager) {
		HostManager.playDialogue(DialogueLines.getRandomGoDialogue());
	}

	// Start idle prompt timer - nudge the player if they don't move
	startIdlePromptTimer();
}

/**
 * Handles a correct step by the player
 * @param {Object} gridPos - Grid position of the step
 * @param {number} progress - Current progress
 * @param {number} total - Total steps needed
 */
function handleCorrectStep(gridPos, progress, total) {
	gameState.score += 100;

	// Reset idle timer since player is actively moving
	startIdlePromptTimer();

	if (callbacks.onScoreUpdate) {
		callbacks.onScoreUpdate(gameState.score);
	}
}

/**
 * Handles a wrong step by the player
 * @param {Object} gridPos - Grid position of the wrong step
 * @param {Object} expectedPos - Expected grid position
 */
function handleWrongStep(gridPos, expectedPos) {
	gameState.wrongSteps++;
	gameState.score = Math.max(0, gameState.score - 25);

	// Stop tracking immediately to prevent more steps
	if (PlayerTracker) {
		PlayerTracker.stopTracking();
	}

	// Play error sound via global audio API
	if (global.PathFinder && global.PathFinder.Audio) {
		global.PathFinder.Audio.playError();
	}

	// Delay before transitioning to failed state so red tile stays visible
	var delay = script.createEvent("DelayedCallbackEvent");
	delay.bind(function () {
		changeState(Constants.GameState.FAILED);
	});
	delay.reset(1.5); // 1.5 seconds to clearly see the wrong tile
}

/**
 * Handles path completion
 * @param {Array} stepsArray - Array of steps taken
 */
function handlePathCompleted(stepsArray) {
	// Bonus for completing the path
	gameState.score += 500;

	// Completion sound already played in PlayerTracker on final step

	changeState(Constants.GameState.COMPLETED);
}

/**
 * Handles successful game completion
 */
function handleGameCompleted() {
	clearAllTimers();

	if (PlayerTracker) {
		PlayerTracker.stopTracking();
	}

	// Save progress - track if completed on first try
	var firstTry = !gameState.currentLevelRetried;
	var newlyUnlockedAchievements = [];
	if (global.PathFinder && global.PathFinder.Save) {
		var unlockedBefore = [];
		if (global.PathFinder.Save.getUnlockedAchievements) {
			unlockedBefore = global.PathFinder.Save.getUnlockedAchievements().slice();
		}

		global.PathFinder.Save.onLevelCompleted(gameState.currentLevel, firstTry);

		// Fallback path: compute newly unlocked IDs directly from save state and
		// enqueue popups here, in case event subscription order/hot reload breaks
		// cross-script notification delivery.
		if (global.PathFinder.Save.getUnlockedAchievements) {
			var unlockedAfter = global.PathFinder.Save.getUnlockedAchievements();
			for (var i = 0; i < unlockedAfter.length; i++) {
				if (unlockedBefore.indexOf(unlockedAfter[i]) === -1) {
					newlyUnlockedAchievements.push(unlockedAfter[i]);
				}
			}
		}
	}

	if (newlyUnlockedAchievements.length > 0 && global.PathFinder && global.PathFinder.AchievementNotification && global.PathFinder.AchievementNotification.enqueue) {
		global.PathFinder.AchievementNotification.enqueue(newlyUnlockedAchievements);
		print("GameStateManager: Queued achievement popup(s): " + newlyUnlockedAchievements.join(", "));
	}

	// Reset retry flag for next level
	gameState.currentLevelRetried = false;

	// Exit button stays visible so user can exit anytime

	// Reveal the correct path (no arrows - just show the tiles)
	if (GridManager) {
		GridManager.showGrid();
		GridManager.revealPath(false);
	}

	// Play confetti celebration
	playConfetti();

	// Check if all levels completed
	var isGameComplete = gameState.currentLevel >= 11;
	var isFlawless = false;
	if (global.PathFinder && global.PathFinder.Save) {
		isFlawless = global.PathFinder.Save.getTotalRetries() === 0;
	}

	// Play success/completion audio, then progression, then return-to-start prompt
	if (HostManager) {
		if (isGameComplete) {
			// All 11 levels done — play completion audio, pause, then return to main menu
			HostManager.playGameComplete(isFlawless, function () {
				var congratsDelay = script.createEvent("DelayedCallbackEvent");
				congratsDelay.bind(function () {
					exitToMainMenu();
				});
				congratsDelay.reset(5.0);
			});
		} else {
			// Success → optional progression line → return-to-start
			HostManager.playSuccessResponse(firstTry, function () {
				// Play progression line if at a milestone
				var nextLevel = gameState.currentLevel + 1;
				var progressionDialogue = DialogueLines.getLevelUpDialogue(nextLevel);
				var isAtMilestone = nextLevel === 6 || nextLevel >= 10;

				if (isAtMilestone) {
					HostManager.playDialogue(progressionDialogue, function () {
						// Show start zone as soon as return-to-start line begins
						showStartZoneEarly();
						HostManager.playDialogue(DialogueLines.getReturnToStartDialogue(true), function () {
							promptReturnToStartZone(true);
						});
					});
				} else {
					// Show start zone as soon as return-to-start line begins
					showStartZoneEarly();
					HostManager.playDialogue(DialogueLines.getReturnToStartDialogue(true), function () {
						promptReturnToStartZone(true);
					});
				}
			});
		}
	} else {
		// Brief delay then prompt return (or exit if game complete)
		var delay = script.createEvent("DelayedCallbackEvent");
		delay.bind(function () {
			if (isGameComplete) {
				exitToMainMenu();
			} else {
				promptReturnToStartZone(true);
			}
		});
		delay.reset(2.0);
	}

	if (callbacks.onGameComplete) {
		callbacks.onGameComplete({
			level: gameState.currentLevel,
			score: gameState.score,
			wrongSteps: gameState.wrongSteps,
		});
	}
}

/**
 * Handles game failure
 */
function handleGameFailed() {
	clearAllTimers();

	if (PlayerTracker) {
		PlayerTracker.stopTracking();
	}

	// Track retry in save system
	gameState.currentLevelRetried = true;
	if (global.PathFinder && global.PathFinder.Save) {
		global.PathFinder.Save.onLevelFailed(gameState.currentLevel);
	}

	// Exit button stays visible so user can exit anytime

	// Reveal the correct path (no arrows - just show the tiles)
	if (GridManager) {
		GridManager.showGrid();
		GridManager.revealPath(false);
	}

	// Get retry count for this level
	var retryCount = 1;
	if (global.PathFinder && global.PathFinder.Save) {
		retryCount = global.PathFinder.Save.getRetriesForLevel(gameState.currentLevel);
	}

	// Play fail audio, then return-to-start prompt
	if (HostManager) {
		HostManager.playFailResponse(retryCount, function () {
			// Show start zone as soon as return-to-start line begins
			showStartZoneEarly();
			HostManager.playDialogue(DialogueLines.getReturnToStartDialogue(false), function () {
				promptReturnToStartZone(false);
			});
		});
	} else {
		// Brief delay then prompt return
		var delay = script.createEvent("DelayedCallbackEvent");
		delay.bind(function () {
			promptReturnToStartZone(false);
		});
		delay.reset(2.0);
	}

	if (callbacks.onGameFailed) {
		callbacks.onGameFailed({
			level: gameState.currentLevel,
			score: gameState.score,
			wrongSteps: gameState.wrongSteps,
			progress: PlayerTracker ? PlayerTracker.getPathProgress() : 0,
		});
	}
}

/**
 * Shows the start zone marker immediately so the player sees it
 * while the "return to start" audio is still playing
 */
function showStartZoneEarly() {
	if (StartZone) {
		var startZonePos = playerPositionAtPlacement || floorPosition;
		StartZone.initialize(startZonePos);
		StartZone.show();
	}
}

/**
 * Prompts player to return to start for next round
 * @param {boolean} isSuccess - Whether player succeeded (for level progression)
 */
function promptReturnToStartZone(isSuccess) {
	// Reset grid and prepare for next round
	if (GridManager) {
		GridManager.resetTileStates();
	}

	// Progress to next level or retry current
	if (isSuccess) {
		gameState.currentLevel++;
	}

	// Reset player tracker
	if (PlayerTracker) {
		PlayerTracker.reset();
		// Clear stale zone state so it doesn't carry into the next round
		PlayerTracker.resetStartZoneState();
	}

	// Host auto-hides after dialogue finishes

	// Go to waiting state for next round
	changeState(Constants.GameState.WAITING_IN_START_ZONE);
}

/**
 * Clears a specific timer
 * @param {string} timerName - Name of timer to clear
 */
function clearTimer(timerName) {
	if (timers[timerName]) {
		timers[timerName].enabled = false;
		timers[timerName] = null;
	}
}

/**
 * Clears all active timers
 */
function clearAllTimers() {
	clearTimer("countdown");
	clearTimer("memorize");
	clearTimer("idlePrompt");
}

/**
 * Starts/restarts the idle prompt timer
 * Plays a nudge if the player doesn't step for 15 seconds during PLAYING
 */
/**
 * Plays the confetti VFX burst
 */
function playConfetti() {
	if (!script.confettiVFX) return;
	print("Confetti: PLAY");

	// Ensure the VFX SceneObject is enabled before restarting
	if (script.confettiVFX.getSceneObject) {
		var confettiObj = script.confettiVFX.getSceneObject();
		if (confettiObj) {
			confettiObj.enabled = true;
		}
	}

	script.confettiVFX.enabled = true;
	script.confettiVFX.paused = false;
	script.confettiVFX.emitting = true;
	script.confettiVFX.restart();
}

/**
 * Stops and fully hides the confetti VFX
 */
function stopConfetti() {
	if (!script.confettiVFX) return;
	script.confettiVFX.emitting = false;
	script.confettiVFX.paused = true;
	script.confettiVFX.enabled = false;

	// Some VFX graphs keep visible particles alive briefly; disabling the owner
	// guarantees the effect is fully hidden between rounds.
	if (script.confettiVFX.getSceneObject) {
		var confettiObj = script.confettiVFX.getSceneObject();
		if (confettiObj) {
			confettiObj.enabled = false;
		}
	}
}

function startIdlePromptTimer() {
	clearTimer("idlePrompt");

	var idleEvent = script.createEvent("DelayedCallbackEvent");
	idleEvent.bind(function () {
		// Only fire if still in PLAYING state
		if (gameState.current === Constants.GameState.PLAYING && HostManager) {
			HostManager.playDialogue(DialogueLines.Dialogue.IDLE_PROMPT);
		}
	});
	idleEvent.reset(15.0); // 15 seconds of inactivity

	timers.idlePrompt = idleEvent;
}

/**
 * Called when grid placement is complete
 * @param {vec3} gridOrigin - World position where grid was placed
 * @param {number} floorY - Y coordinate of the floor
 */
function onGridPlaced(gridOrigin, floorY) {
	floorPosition = gridOrigin;

	// Set floor Y for player tracking FIRST so we can get accurate floor position
	if (PlayerTracker) {
		PlayerTracker.setFloorY(floorY);
		PlayerTracker.initialize(floorY);

		// Capture player's current floor position for StartZone placement
		playerPositionAtPlacement = PlayerTracker.getFloorPosition();
	}

	// Initialize GridManager with placed position
	if (GridManager) {
		var levelConfig = getLevelConfig(gameState.currentLevel);
		GridManager.initialize(gridOrigin, levelConfig.gridRows, levelConfig.gridColumns);
	}

	// Store placement position for Quick Start on restart
	if (global.PathFinder && global.PathFinder.MainMenu && global.PathFinder.MainMenu.storePlacement) {
		global.PathFinder.MainMenu.storePlacement(gridOrigin, floorY);
	}

	// Start the intro sequence
	changeState(Constants.GameState.GRID_INTRO);
}

/**
 * Quick Start - starts game with a previously stored position
 * Called from MainMenu when restarting after exit
 * @param {vec3} gridOrigin - World position for grid
 * @param {number} floorY - Y coordinate of floor
 */
function startWithPosition(gridOrigin, floorY) {
	print("GameStateManager: Quick Start at stored position");

	floorPosition = gridOrigin;

	// Set floor Y for player tracking
	if (PlayerTracker) {
		PlayerTracker.setFloorY(floorY);
		PlayerTracker.initialize(floorY);
		playerPositionAtPlacement = PlayerTracker.getFloorPosition();
	}

	// Show the grid
	if (GridManager) {
		GridManager.showGrid();
		var levelConfig = getLevelConfig(gameState.currentLevel);
		GridManager.initialize(gridOrigin, levelConfig.gridRows, levelConfig.gridColumns);
	}

	// Hint is shown by startGridIntro() at the right time

	// Start the intro sequence
	changeState(Constants.GameState.GRID_INTRO);
}

/**
 * Called when player confirms they're ready at start position
 */
function onPlayerReady() {
	if (gameState.current === Constants.GameState.WAITING_IN_START_ZONE) {
		if (StartZone) {
			StartZone.hide();
		}
		if (HostManager) {
			HostManager.hide();
		}
		changeState(Constants.GameState.COUNTDOWN);
	}
}

/**
 * Advances to the next level
 * Now handled by promptReturnToStartZone(true)
 */
function nextLevel() {
	promptReturnToStartZone(true);
}

/**
 * Restarts the current level
 * Now handled by promptReturnToStartZone(false)
 */
function restartLevel() {
	promptReturnToStartZone(false);
}

/**
 * Returns to idle state
 */
function returnToIdle() {
	changeState(Constants.GameState.IDLE);
}

/**
 * Exit the game and return to main menu
 * Called from palm exit button
 */
function exitToMainMenu() {
	// Hide the palm exit button immediately
	if (global.PathFinder && global.PathFinder.PalmExit) {
		global.PathFinder.PalmExit.hide();
	}

	// Clear all timers
	clearAllTimers();

	// Stop confetti
	stopConfetti();

	// Stop player tracking
	if (PlayerTracker) {
		PlayerTracker.stopTracking();
		PlayerTracker.reset();
	}

	// Hide game elements
	if (GridManager) {
		GridManager.hideGrid();
	}

	if (StartZone) {
		StartZone.hide();
	}

	if (HostManager) {
		// Ensure any in-flight host dialogue/audio is cancelled before teardown
		if (HostManager.skipDialogue) {
			HostManager.skipDialogue();
		}
		HostManager.hide();
	}

	// Extra safety: stop shared audio callbacks during exit teardown
	if (global.PathFinder && global.PathFinder.Audio && global.PathFinder.Audio.stop) {
		global.PathFinder.Audio.stop();
	}

	if (CountdownDisplay) {
		CountdownDisplay.hide();
	}

	if (global.PathFinder && global.PathFinder.LookDownHint) {
		global.PathFinder.LookDownHint.hide();
	}

	// Destroy the floor placement instance
	if (global.PathFinder && global.PathFinder.MainMenu && global.PathFinder.MainMenu.destroyPlacement) {
		global.PathFinder.MainMenu.destroyPlacement();
	}

	// Reset game state (but keep saved level)
	gameState.current = Constants.GameState.IDLE;
	// Load saved level instead of resetting to 1
	if (global.PathFinder && global.PathFinder.Save) {
		gameState.currentLevel = global.PathFinder.Save.getCurrentLevel();
	} else {
		gameState.currentLevel = 1;
	}
	gameState.score = 0;
	gameState.wrongSteps = 0;
	gameState.isFirstGame = true;
	gameState.currentLevelRetried = false;
	floorPosition = null;
	playerPositionAtPlacement = null;

	// Show main menu
	if (global.PathFinder && global.PathFinder.MainMenu) {
		global.PathFinder.MainMenu.show();
	}
}

/**
 * Gets the current game state
 * @returns {Object} Current game state
 */
function getGameState() {
	return {
		state: gameState.current,
		level: gameState.currentLevel,
		score: gameState.score,
		wrongSteps: gameState.wrongSteps,
		memorizeTimeRemaining: gameState.memorizeTimeRemaining,
	};
}

/**
 * Sets the current level
 * @param {number} level - Level number
 */
function setLevel(level) {
	// Max level is when path length reaches MAX_PATH_LENGTH
	var config = Constants.LevelConfig;
	var maxLevel = Math.floor((config.MAX_PATH_LENGTH - config.BASE_PATH_LENGTH) / config.PATH_INCREMENT) + 1;
	gameState.currentLevel = Math.max(1, Math.min(level, maxLevel));
}

// Register callbacks
function onStateChange(callback) {
	callbacks.onStateChange = callback;
}
function onCountdownTick(callback) {
	callbacks.onCountdownTick = callback;
}
function onMemorizeTimeTick(callback) {
	callbacks.onMemorizeTimeTick = callback;
}
function onGameComplete(callback) {
	callbacks.onGameComplete = callback;
}
function onGameFailed(callback) {
	callbacks.onGameFailed = callback;
}
function onScoreUpdate(callback) {
	callbacks.onScoreUpdate = callback;
}

// Export module API directly on script
script.initialize = initialize;
script.changeState = changeState;
script.resetGame = resetGame;
script.onGridPlaced = onGridPlaced;
script.startWithPosition = startWithPosition;
script.onPlayerReady = onPlayerReady;
script.nextLevel = nextLevel;
script.restartLevel = restartLevel;
script.returnToIdle = returnToIdle;
script.exitToMainMenu = exitToMainMenu;
script.getGameState = getGameState;
script.setLevel = setLevel;
script.onStateChange = onStateChange;
script.onCountdownTick = onCountdownTick;
script.onMemorizeTimeTick = onMemorizeTimeTick;
script.onGameComplete = onGameComplete;
script.onGameFailed = onGameFailed;
script.onScoreUpdate = onScoreUpdate;
script.GameState = Constants.GameState;

// Global API for other scripts to access
global.PathFinder = global.PathFinder || {};
global.PathFinder.Game = {
	reset: resetGame,
	exit: exitToMainMenu,
	startWithPosition: startWithPosition,
	getState: getGameState,
	setLevel: setLevel,
};

// Also expose GameStateManager directly for PlacementBridge
global.PathFinder.GameStateManager = {
	onGridPlaced: onGridPlaced,
	getGameState: getGameState,
};

// Hide confetti immediately at script load (before OnStartEvent)
if (script.confettiVFX) {
	script.confettiVFX.enabled = false;
	if (script.confettiVFX.getSceneObject) {
		var confettiObj = script.confettiVFX.getSceneObject();
		if (confettiObj) {
			confettiObj.enabled = false;
		}
	}
}

// Initialize on start event (after all scripts are loaded)
script.createEvent("OnStartEvent").bind(function () {
	initialize();
});
