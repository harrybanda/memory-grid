// AchievementDefs.js
// Every achievement in one list, shared by the achievements screen (AchievementsUI), the unlock popup
// (AchievementNotification) and SaveManager's checks, so their names and ids can't drift apart.
// mode: the achievements tab it belongs to (the same keys as global.PathFinder.Modes, plus "classic").
// Icons are matched by id to the PNG filenames in Textures/achivment_icons.

var LIST = [
	// Classic: progression
	{ id: "first_steps", mode: "classic", name: "First Steps", description: "Complete Level 1" },
	{ id: "getting_warmer", mode: "classic", name: "Getting Warmer", description: "Complete Level 3" },
	{ id: "memory_walker", mode: "classic", name: "Memory Walker", description: "Complete Level 5" },
	{ id: "grid_expert", mode: "classic", name: "Grid Expert", description: "Complete Level 8" },
	{ id: "grid_master", mode: "classic", name: "Grid Master", description: "Complete all 11 levels" },
	// Classic: flawless
	{ id: "clean_start", mode: "classic", name: "Clean Start", description: "Complete Level 1 on first try" },
	{ id: "flawless_five", mode: "classic", name: "Flawless Five", description: "Complete Levels 1-5 without retries" },
	{ id: "no_mistakes", mode: "classic", name: "No Mistakes", description: "Complete all 11 levels without retries" },
	{ id: "deep_focus", mode: "classic", name: "Deep Focus", description: "Complete a Level 6+ on first try" },
	// Classic: persistence
	{ id: "quick_learner", mode: "classic", name: "Quick Learner", description: "Complete a level after 1 retry" },
	{ id: "comeback_kid", mode: "classic", name: "Comeback Kid", description: "Complete a level after 3+ retries" },
	{ id: "never_give_up", mode: "classic", name: "Never Give Up", description: "Beat Level 11 with 5+ total retries" },

	// Minefield
	{ id: "safe_crossing", mode: "minefield", name: "Safe Crossing", description: "Clear Minefield Level 1" },
	{ id: "mine_dodger", mode: "minefield", name: "Mine Dodger", description: "Clear Minefield Level 3" },
	{ id: "minefield_master", mode: "minefield", name: "Minefield Master", description: "Clear all Minefield levels" },
	{ id: "light_feet", mode: "minefield", name: "Light Feet", description: "Clear a Minefield level on first try" },
	{ id: "untouchable", mode: "minefield", name: "Untouchable", description: "Clear every Minefield level on first try" },

	// Tone Pads
	{ id: "first_tune", mode: "tonepads", name: "First Tune", description: "Clear Tone Pads Level 1" },
	{ id: "in_tune", mode: "tonepads", name: "In Tune", description: "Clear Tone Pads Level 3" },
	{ id: "maestro", mode: "tonepads", name: "Maestro", description: "Clear all Tone Pads levels" },
	{ id: "perfect_pitch", mode: "tonepads", name: "Perfect Pitch", description: "Clear a Tone Pads level on first try" },
	{ id: "long_memory", mode: "tonepads", name: "Long Memory", description: "Play back a 10-note tune" },

	// Floor Is Lava
	{ id: "hot_feet", mode: "lava", name: "Hot Feet", description: "Clear Floor Is Lava Level 1" },
	{ id: "fire_walker", mode: "lava", name: "Fire Walker", description: "Clear Floor Is Lava Level 3" },
	{ id: "lava_lord", mode: "lava", name: "Lava Lord", description: "Clear all Floor Is Lava levels" },
	{ id: "not_even_warm", mode: "lava", name: "Not Even Warm", description: "Clear a Floor Is Lava level on first try" },
	{ id: "survivor", mode: "lava", name: "Survivor", description: "Survive 50 lava waves" },
];

// What unlocks each new mode's achievements (SaveManager.checkModeAchievements). Levels count from 1;
// "first try" means cleared without failing that level since it was last cleared
var MODE_RULES = {
	minefield: { first: "safe_crossing", halfway: "mine_dodger", master: "minefield_master", firstTry: "light_feet", allFirstTry: "untouchable" },
	tonepads: { first: "first_tune", halfway: "in_tune", master: "maestro", firstTry: "perfect_pitch", stat: { key: "longestTune", atLeast: 10, id: "long_memory" } },
	lava: { first: "hot_feet", halfway: "fire_walker", master: "lava_lord", firstTry: "not_even_warm", stat: { key: "wavesSurvived", atLeast: 50, id: "survivor" } },
};
var HALFWAY_LEVEL = 3;

function byId(id) {
	var key = ("" + id).toLowerCase();
	for (var i = 0; i < LIST.length; i++) {
		if (LIST[i].id === key) return LIST[i];
	}
	return null;
}

function forMode(mode) {
	return LIST.filter(function (achievement) {
		return achievement.mode === mode;
	});
}

module.exports = {
	LIST: LIST,
	MODE_RULES: MODE_RULES,
	HALFWAY_LEVEL: HALFWAY_LEVEL,
	byId: byId,
	forMode: forMode,
};
