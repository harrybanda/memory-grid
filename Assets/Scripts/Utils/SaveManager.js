// SaveManager.js
// Handles save/restore of game progress using Lens Studio persistent storage
// Reference: https://developers.snap.com/lens-studio/api/lens-scripting/classes/Built-In.PersistentStorageSystem.html

var AchievementDefs = require("./AchievementDefs");

var SAVE_KEY = "memoryGridSave";
var storage = null;

// The new modes each keep their own progress; Classic's stays in the top-level fields
var MODE_KEYS = ["minefield", "tonepads", "lava"];

function defaultModeData() {
	return {
		highestCleared: 0, // highest level cleared (levels count from 1)
		clearedFirstTry: [], // levels cleared without failing them since they were last cleared
		failsPerLevel: {}, // { "2": 1, ... } fails since the level was last cleared
		stats: {}, // tonepads: longestTune; lava: wavesSurvived
	};
}

// Default save data structure
var defaultSaveData = {
	version: 1,
	currentLevel: 1,
	highestLevel: 1,
	totalRetries: 0,
	retriesPerLevel: {}, // { "1": 0, "2": 1, ... }
	levelsCompletedFirstTry: [], // [1, 2, 5, ...] levels completed without retrying
	achievements: [], // ["first_steps", "flawless_five", ...]
	modes: {}, // filled by ensureModes: { minefield: defaultModeData(), ... }
};

// In-memory save data
var saveData = null;
var achievementUnlockedListeners = [];

/**
 * Subscribe to newly unlocked achievement events.
 * Callback receives an array of achievement IDs unlocked in a single check.
 * @param {Function} callback
 */
function onAchievementsUnlocked(callback) {
	if (typeof callback !== "function") return;
	if (achievementUnlockedListeners.indexOf(callback) === -1) {
		achievementUnlockedListeners.push(callback);
	}
}

/**
 * Notify listeners about newly unlocked achievements
 * @param {Array<string>} achievementIds
 */
function emitAchievementsUnlocked(achievementIds) {
	if (!achievementIds || achievementIds.length === 0) return;

	var deliveredToListener = false;

	// Send to explicit subscribers first
	for (var i = achievementUnlockedListeners.length - 1; i >= 0; i--) {
		try {
			achievementUnlockedListeners[i](achievementIds.slice());
			deliveredToListener = true;
		} catch (e) {
			print("SaveManager: Achievement listener error - " + e);
			// Remove broken listeners so stale callbacks can't block future events.
			achievementUnlockedListeners.splice(i, 1);
		}
	}

	// Always forward to the notification queue if available.
	// This guarantees popup delivery even if listener registration order/hot-reload causes stale callbacks.
	if (global.PathFinder && global.PathFinder.AchievementNotification && global.PathFinder.AchievementNotification.enqueue) {
		if (!deliveredToListener) {
			print("SaveManager: Using direct AchievementNotification enqueue fallback");
		}
		global.PathFinder.AchievementNotification.enqueue(achievementIds.slice());
	}
}

/**
 * Initialize the save manager
 */
function init() {
	try {
		storage = global.persistentStorageSystem;
		if (storage) {
			print("SaveManager: Initialized");
			loadFromStorage();
		}
	} catch (e) {
		print("SaveManager: Persistent storage not available - " + e);
		// Use default data in memory if storage unavailable
		saveData = JSON.parse(JSON.stringify(defaultSaveData));
		ensureModes();
	}
}

/**
 * Load save data from persistent storage
 */
function loadFromStorage() {
	if (!storage) {
		saveData = JSON.parse(JSON.stringify(defaultSaveData));
		return;
	}

	try {
		var store = storage.store;
		if (store.has(SAVE_KEY)) {
			var json = store.getString(SAVE_KEY);
			saveData = JSON.parse(json);
			print("SaveManager: Loaded - Level " + saveData.currentLevel);
		} else {
			saveData = JSON.parse(JSON.stringify(defaultSaveData));
			print("SaveManager: No save found, starting fresh");
		}
	} catch (e) {
		print("SaveManager: Load failed - " + e);
		saveData = JSON.parse(JSON.stringify(defaultSaveData));
	}
	ensureModes();
}

/**
 * Saves from before the new modes had progress get an empty record per mode (Classic's is untouched)
 */
function ensureModes() {
	if (!saveData) return;
	saveData.modes = saveData.modes || {};
	for (var i = 0; i < MODE_KEYS.length; i++) {
		var mode = saveData.modes[MODE_KEYS[i]];
		if (!mode) {
			saveData.modes[MODE_KEYS[i]] = defaultModeData();
			continue;
		}
		var defaults = defaultModeData();
		for (var field in defaults) {
			if (mode[field] === undefined) mode[field] = defaults[field];
		}
	}
}

/**
 * Save data to persistent storage
 */
function saveToStorage() {
	if (!storage || !saveData) return false;

	try {
		var store = storage.store;
		store.putString(SAVE_KEY, JSON.stringify(saveData));
		storage.store = store;
		return true;
	} catch (e) {
		print("SaveManager: Save failed - " + e);
		return false;
	}
}

/**
 * Check if a saved game exists
 */
function hasSavedGame() {
	return saveData && saveData.currentLevel > 1;
}

/**
 * Get the current level
 */
function getCurrentLevel() {
	return saveData ? saveData.currentLevel : 1;
}

/**
 * Get the highest level reached
 */
function getHighestLevel() {
	return saveData ? saveData.highestLevel : 1;
}

/**
 * Called when a level is completed successfully
 * @param {number} level - The level that was completed
 * @param {boolean} firstTry - Whether it was completed on first attempt
 */
function onLevelCompleted(level, firstTry) {
	if (!saveData) return;

	// Track first-try completions
	if (firstTry && saveData.levelsCompletedFirstTry.indexOf(level) === -1) {
		saveData.levelsCompletedFirstTry.push(level);
	}

	// Advance to next level
	saveData.currentLevel = level + 1;

	// Update highest level
	if (saveData.currentLevel > saveData.highestLevel) {
		saveData.highestLevel = saveData.currentLevel;
	}

	// Check and unlock achievements BEFORE resetting retry counter
	// (quick_learner and comeback_kid need the retry count to still be set)
	checkAchievements();

	// Reset retry counter for this level (completed)
	saveData.retriesPerLevel[level.toString()] = 0;

	saveToStorage();
	print("SaveManager: Level " + level + " completed, now on level " + saveData.currentLevel);
}

/**
 * Called when a level is failed (retry)
 * @param {number} level - The level that was failed
 */
function onLevelFailed(level) {
	if (!saveData) return;

	saveData.totalRetries++;

	var levelKey = level.toString();
	if (!saveData.retriesPerLevel[levelKey]) {
		saveData.retriesPerLevel[levelKey] = 0;
	}
	saveData.retriesPerLevel[levelKey]++;

	saveToStorage();
	print("SaveManager: Level " + level + " failed, retry #" + saveData.retriesPerLevel[levelKey]);
}

/**
 * Get retry count for a specific level
 */
function getRetriesForLevel(level) {
	if (!saveData) return 0;
	return saveData.retriesPerLevel[level.toString()] || 0;
}

/**
 * Get total retries across all levels
 */
function getTotalRetries() {
	return saveData ? saveData.totalRetries : 0;
}

/**
 * Check if a level was completed on first try
 */
function wasLevelCompletedFirstTry(level) {
	if (!saveData) return false;
	return saveData.levelsCompletedFirstTry.indexOf(level) !== -1;
}

/**
 * Check and unlock achievements based on current progress
 */
function checkAchievements() {
	if (!saveData) return;

	var newAchievements = [];

	// Progression badges
	if (saveData.highestLevel > 1) unlockAchievement("first_steps", newAchievements);
	if (saveData.highestLevel > 3) unlockAchievement("getting_warmer", newAchievements);
	if (saveData.highestLevel > 5) unlockAchievement("memory_walker", newAchievements);
	if (saveData.highestLevel > 8) unlockAchievement("grid_expert", newAchievements);
	if (saveData.highestLevel > 11) unlockAchievement("grid_master", newAchievements);

	// Flawless badges
	if (wasLevelCompletedFirstTry(1)) {
		unlockAchievement("clean_start", newAchievements);
	}

	// Check flawless five (levels 1-5 without retries)
	var flawlessFive = true;
	for (var i = 1; i <= 5; i++) {
		if (!wasLevelCompletedFirstTry(i)) {
			flawlessFive = false;
			break;
		}
	}
	if (flawlessFive && saveData.highestLevel > 5) {
		unlockAchievement("flawless_five", newAchievements);
	}

	// Check no mistakes (all 11 without retries)
	var noMistakes = true;
	for (var j = 1; j <= 11; j++) {
		if (!wasLevelCompletedFirstTry(j)) {
			noMistakes = false;
			break;
		}
	}
	if (noMistakes && saveData.highestLevel > 11) {
		unlockAchievement("no_mistakes", newAchievements);
	}

	// Deep focus (level 6+ on first try = 15+ tiles)
	for (var k = 6; k <= 11; k++) {
		if (wasLevelCompletedFirstTry(k)) {
			unlockAchievement("deep_focus", newAchievements);
			break;
		}
	}

	// Persistence badges
	for (var levelStr in saveData.retriesPerLevel) {
		var retries = saveData.retriesPerLevel[levelStr];
		var level = parseInt(levelStr);

		// Quick learner - completed after exactly 1 retry
		if (retries === 1 && saveData.highestLevel > level) {
			unlockAchievement("quick_learner", newAchievements);
		}

		// Comeback kid - completed after 3+ retries
		if (retries >= 3 && saveData.highestLevel > level) {
			unlockAchievement("comeback_kid", newAchievements);
		}
	}

	// Never give up - completed level 11 with 5+ total retries
	if (saveData.highestLevel > 11 && saveData.totalRetries >= 5) {
		unlockAchievement("never_give_up", newAchievements);
	}

	// Notify about new achievements
	if (newAchievements.length > 0) {
		print("SaveManager: New achievements unlocked - " + newAchievements.join(", "));
		emitAchievementsUnlocked(newAchievements);
	}
}

// ============================================
// NEW MODES (Minefield, Tone Pads, Floor Is Lava)
// ============================================

function modeData(mode) {
	if (!saveData) return null;
	ensureModes();
	return saveData.modes[mode] || null;
}

/**
 * A mode's level was cleared
 * @param {string} mode - "minefield", "tonepads" or "lava"
 * @param {number} level - The level cleared, counting from 1
 * @param {number} levelCount - How many levels the mode has (for "clear them all")
 */
function onModeLevelCleared(mode, level, levelCount) {
	var data = modeData(mode);
	if (!data) return;
	var key = level.toString();
	if (!data.failsPerLevel[key] && data.clearedFirstTry.indexOf(level) === -1) {
		data.clearedFirstTry.push(level);
	}
	data.failsPerLevel[key] = 0;
	data.highestCleared = Math.max(data.highestCleared, level);
	checkModeAchievements(mode, levelCount);
	saveToStorage();
}

/**
 * A mode's level was failed (it restarts)
 */
function onModeLevelFailed(mode, level) {
	var data = modeData(mode);
	if (!data) return;
	var key = level.toString();
	data.failsPerLevel[key] = (data.failsPerLevel[key] || 0) + 1;
	saveToStorage();
}

/**
 * Keeps the best value of a mode stat (e.g. the longest tune played back). Saved with the next level result,
 * or straight away if it unlocks something
 */
function recordModeBest(mode, stat, value) {
	var data = modeData(mode);
	if (!data) return;
	if (value > (data.stats[stat] || 0)) {
		data.stats[stat] = value;
		if (checkModeAchievements(mode)) saveToStorage();
	}
}

/**
 * Adds to a running mode stat (e.g. lava waves survived). Saved like recordModeBest
 */
function addModeCount(mode, stat, amount) {
	var data = modeData(mode);
	if (!data) return;
	data.stats[stat] = (data.stats[stat] || 0) + amount;
	if (checkModeAchievements(mode)) saveToStorage();
}

/**
 * Unlocks a mode's achievements from its progress (rules in AchievementDefs.MODE_RULES)
 * @param {string} mode
 * @param {number} levelCount - Optional; the "all levels" achievements need it
 * @returns {boolean} True if anything new unlocked
 */
function checkModeAchievements(mode, levelCount) {
	var data = modeData(mode);
	var rules = AchievementDefs.MODE_RULES[mode];
	if (!data || !rules) return false;

	var newAchievements = [];
	if (data.highestCleared >= 1) unlockAchievement(rules.first, newAchievements);
	if (data.highestCleared >= AchievementDefs.HALFWAY_LEVEL) unlockAchievement(rules.halfway, newAchievements);
	if (levelCount && data.highestCleared >= levelCount) unlockAchievement(rules.master, newAchievements);
	if (data.clearedFirstTry.length > 0) unlockAchievement(rules.firstTry, newAchievements);

	if (rules.allFirstTry && levelCount) {
		var all = true;
		for (var level = 1; level <= levelCount; level++) {
			if (data.clearedFirstTry.indexOf(level) === -1) {
				all = false;
				break;
			}
		}
		if (all) unlockAchievement(rules.allFirstTry, newAchievements);
	}
	if (rules.stat && (data.stats[rules.stat.key] || 0) >= rules.stat.atLeast) {
		unlockAchievement(rules.stat.id, newAchievements);
	}

	if (newAchievements.length === 0) return false;
	print("SaveManager: New achievements unlocked - " + newAchievements.join(", "));
	emitAchievementsUnlocked(newAchievements);
	return true;
}

/**
 * Unlock an achievement if not already unlocked
 */
function unlockAchievement(achievementId, newList) {
	if (!saveData) return;

	if (saveData.achievements.indexOf(achievementId) === -1) {
		saveData.achievements.push(achievementId);
		if (newList) {
			newList.push(achievementId);
		}
	}
}

/**
 * Check if an achievement is unlocked
 */
function hasAchievement(achievementId) {
	if (!saveData) return false;
	return saveData.achievements.indexOf(achievementId) !== -1;
}

/**
 * Get all unlocked achievements
 */
function getUnlockedAchievements() {
	return saveData ? saveData.achievements : [];
}

/**
 * Reset all progress (start fresh) but keep achievements permanently
 */
function resetProgress() {
	// Preserve achievements before resetting
	var savedAchievements = saveData ? saveData.achievements.slice() : [];

	saveData = JSON.parse(JSON.stringify(defaultSaveData));

	// Restore achievements — once unlocked, always unlocked
	saveData.achievements = savedAchievements;
	ensureModes();

	saveToStorage();
	print("SaveManager: Progress reset (achievements preserved: " + savedAchievements.length + ")");
}

/**
 * Clear only level progress but keep achievements
 */
function resetLevelProgress() {
	if (!saveData) return;

	saveData.currentLevel = 1;
	saveData.totalRetries = 0;
	saveData.retriesPerLevel = {};
	saveData.levelsCompletedFirstTry = [];
	// The new modes lose their retry and first-try records the same way; highest levels and stats stay
	ensureModes();
	for (var i = 0; i < MODE_KEYS.length; i++) {
		saveData.modes[MODE_KEYS[i]].failsPerLevel = {};
		saveData.modes[MODE_KEYS[i]].clearedFirstTry = [];
	}
	// Keep achievements and highestLevel

	saveToStorage();
	print("SaveManager: Level progress reset, achievements kept");
}

/**
 * Reset absolutely everything (including achievements)
 * Useful for QA/testing first-time unlock popup flows
 */
function resetAllProgress() {
	saveData = JSON.parse(JSON.stringify(defaultSaveData));
	ensureModes();
	saveToStorage();
	print("SaveManager: Full reset (levels + retries + achievements cleared)");
}

// Initialize on start
script.createEvent("OnStartEvent").bind(init);

// Export API
global.PathFinder = global.PathFinder || {};
global.PathFinder.Save = {
	hasSavedGame: hasSavedGame,
	getCurrentLevel: getCurrentLevel,
	getHighestLevel: getHighestLevel,
	onLevelCompleted: onLevelCompleted,
	onLevelFailed: onLevelFailed,
	getRetriesForLevel: getRetriesForLevel,
	getTotalRetries: getTotalRetries,
	wasLevelCompletedFirstTry: wasLevelCompletedFirstTry,
	hasAchievement: hasAchievement,
	getUnlockedAchievements: getUnlockedAchievements,
	onAchievementsUnlocked: onAchievementsUnlocked,
	onModeLevelCleared: onModeLevelCleared,
	onModeLevelFailed: onModeLevelFailed,
	recordModeBest: recordModeBest,
	addModeCount: addModeCount,
	resetProgress: resetProgress,
	resetLevelProgress: resetLevelProgress,
	resetAll: resetAllProgress,
};
