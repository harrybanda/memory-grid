// DialogueLines.js
// Contains all host dialogue text for Memory Grid game
// Note: Audio will be added later - for now these are logged to console

/**
 * Dialogue definitions for the robot host
 * Each dialogue has:
 * - id: Unique identifier (matches audio file name)
 * - text: The spoken text (for subtitles)
 * - duration: Approximate duration in seconds
 * - sfxOnly: If true, only play sound effect (no voice)
 */
var Dialogue = {
	// ==========================================
	// FIRST-TIME INTRODUCTION
	// ==========================================
	WELCOME: {
		id: "welcome",
		text: "Welcome to Memory Grid!",
		duration: 1.5,
	},
	EXPLAIN_GOAL: {
		id: "explain_goal",
		text: "Your mission: conquer all 11 levels. Each one gets trickier than the last!",
		duration: 4.0,
	},
	EXPLAIN_RULES: {
		id: "explain_rules",
		text: "Watch the path light up, burn it into your brain, then walk it perfectly.",
		duration: 4.0,
	},
	EXPLAIN_RETRY: {
		id: "explain_retry",
		text: "Don't sweat the mistakes—you can retry any level. But true legends finish on the first try!",
		duration: 4.5,
	},

	// ==========================================
	// LEVEL ANNOUNCEMENTS
	// ==========================================
	LEVEL_1: {
		id: "level_1",
		text: "Level 1! Let's start with something simple.",
		duration: 2.5,
	},
	LEVEL_2: {
		id: "level_2",
		text: "Level 2! Warming up nicely.",
		duration: 2.0,
	},
	LEVEL_3: {
		id: "level_3",
		text: "Level 3! Now we're getting somewhere.",
		duration: 2.0,
	},
	LEVEL_4: {
		id: "level_4",
		text: "Level 4! The path grows longer...",
		duration: 2.0,
	},
	LEVEL_5: {
		id: "level_5",
		text: "Level 5! Halfway to greatness!",
		duration: 2.0,
	},
	LEVEL_6: {
		id: "level_6",
		text: "Level 6! Time to separate the pros from the amateurs.",
		duration: 3.0,
	},
	LEVEL_7: {
		id: "level_7",
		text: "Level 7! Your brain is working overtime now.",
		duration: 2.5,
	},
	LEVEL_8: {
		id: "level_8",
		text: "Level 8! Only the dedicated make it this far.",
		duration: 2.5,
	},
	LEVEL_9: {
		id: "level_9",
		text: "Level 9! The final stretch begins!",
		duration: 2.5,
	},
	LEVEL_10: {
		id: "level_10",
		text: "Level 10! One more after this. You've got this!",
		duration: 3.0,
	},
	LEVEL_11: {
		id: "level_11",
		text: "Level 11! The ultimate challenge. Show me what you've got!",
		duration: 3.5,
	},

	// ==========================================
	// CONTINUING FROM SAVED PROGRESS
	// ==========================================
	WELCOME_BACK: {
		id: "welcome_back",
		text: "Welcome back! Ready to pick up where you left off?",
		duration: 3.0,
	},
	CONTINUE_LEVEL: {
		id: "continue_level",
		text: "Let's pick up where you left off!",
		duration: 2.5,
	},

	// ==========================================
	// COUNTDOWN & PHASE TRANSITIONS
	// ==========================================
	COUNTDOWN_THREE: {
		id: "countdown_three",
		text: "Three...",
		duration: 1.0,
		sfxOnly: true,
	},
	COUNTDOWN_TWO: {
		id: "countdown_two",
		text: "Two...",
		duration: 1.0,
		sfxOnly: true,
	},
	COUNTDOWN_ONE: {
		id: "countdown_one",
		text: "One...",
		duration: 1.0,
		sfxOnly: true,
	},
	WATCH: {
		id: "watch",
		text: "Watch!",
		duration: 1.0,
	},
	GO: {
		id: "go",
		text: "Go!",
		duration: 0.5,
	},

	// ==========================================
	// MEMORIZE PHASE
	// ==========================================
	MEMORIZE_START: {
		id: "memorize_start",
		text: "Watch carefully...",
		duration: 1.5,
	},
	MEMORIZE_END: {
		id: "memorize_end",
		text: "Now walk the path!",
		duration: 1.5,
	},

	// ==========================================
	// SUCCESS RESPONSES (randomly picked)
	// ==========================================
	SUCCESS_1: {
		id: "success_1",
		text: "Nailed it! Your memory is razor sharp.",
		duration: 2.5,
	},
	SUCCESS_2: {
		id: "success_2",
		text: "Perfect! Your brain is on fire today!",
		duration: 2.5,
	},
	SUCCESS_3: {
		id: "success_3",
		text: "Flawless! Are you sure you're not a robot like me?",
		duration: 3.0,
	},
	SUCCESS_4: {
		id: "success_4",
		text: "Smooth moves! On to the next one!",
		duration: 2.0,
	},
	SUCCESS_5: {
		id: "success_5",
		text: "That's how it's done!",
		duration: 1.5,
	},

	// First-try specific success
	SUCCESS_FIRST_TRY: {
		id: "success_first_try",
		text: "First try! Now that's impressive!",
		duration: 2.5,
	},

	// ==========================================
	// FAILURE RESPONSES (encouraging)
	// ==========================================
	FAIL_1: {
		id: "fail_1",
		text: "Oops! Almost had it. Try again!",
		duration: 2.5,
	},
	FAIL_2: {
		id: "fail_2",
		text: "So close! Don't worry, you'll get it.",
		duration: 2.5,
	},
	FAIL_3: {
		id: "fail_3",
		text: "Not quite! Take a breath and give it another shot.",
		duration: 3.0,
	},
	FAIL_4: {
		id: "fail_4",
		text: "Wrong turn! The path awaits your return.",
		duration: 2.5,
	},
	FAIL_5: {
		id: "fail_5",
		text: "Stumbled! Shake it off and try again.",
		duration: 2.5,
	},

	// Multiple retry encouragement
	FAIL_RETRY_2: {
		id: "fail_retry_2",
		text: "Second attempt! You've seen the path, now own it!",
		duration: 3.0,
	},
	FAIL_RETRY_3: {
		id: "fail_retry_3",
		text: "Third time's the charm! Focus up!",
		duration: 2.5,
	},
	FAIL_RETRY_MANY: {
		id: "fail_retry_many",
		text: "Persistence pays off! Keep at it!",
		duration: 2.5,
	},

	// ==========================================
	// LEVEL UP / PROGRESSION
	// ==========================================
	LEVEL_UP: {
		id: "level_up",
		text: "Level up! The paths are getting sneakier.",
		duration: 2.5,
	},
	LEVEL_UP_HALFWAY: {
		id: "level_up_halfway",
		text: "Halfway there! You're doing great!",
		duration: 2.5,
	},
	LEVEL_UP_ALMOST: {
		id: "level_up_almost",
		text: "Almost at the end! Don't lose focus now!",
		duration: 3.0,
	},

	// ==========================================
	// GAME COMPLETION
	// ==========================================
	GAME_COMPLETE: {
		id: "game_complete",
		text: "You did it! All 11 levels conquered! You're a true Grid Master!",
		duration: 4.5,
	},
	GAME_COMPLETE_FLAWLESS: {
		id: "game_complete_flawless",
		text: "Unbelievable! All 11 levels without a single retry! You're a legend!",
		duration: 5.0,
	},
	GAME_COMPLETE_RETURN: {
		id: "game_complete_return",
		text: "Welcome back, Grid Master! Feel like another run?",
		duration: 3.0,
	},

	// ==========================================
	// START ZONE PROMPTS
	// ==========================================
	STAND_IN_ZONE: {
		id: "stand_in_zone",
		text: "Step into the start zone when you're ready!",
		duration: 2.5,
	},
	RETURN_SUCCESS: {
		id: "return_success",
		text: "Head back to the start zone for your next challenge!",
		duration: 3.0,
	},
	RETURN_RETRY: {
		id: "return_retry",
		text: "Step back to the start zone to try again!",
		duration: 2.5,
	},
	ENTERED_START_ZONE: {
		id: "entered_start_zone",
		text: "",
		duration: 0,
		sfxOnly: true, // Just a confirmation sound
	},

	// ==========================================
	// ACHIEVEMENTS
	// ==========================================
	ACHIEVEMENT_UNLOCKED: {
		id: "achievement_unlocked",
		text: "Achievement unlocked!",
		duration: 2.0,
	},

	// ==========================================
	// IDLE/MISC
	// ==========================================
	IDLE_PROMPT: {
		id: "idle_prompt",
		text: "Still there? The path won't walk itself!",
		duration: 2.5,
	},
};

/**
 * Gets a random "watch" phase transition line
 * Randomly picks between WATCH and MEMORIZE_START
 * @returns {Object} Random watch dialogue
 */
function getRandomWatchDialogue() {
	var options = [Dialogue.WATCH, Dialogue.MEMORIZE_START];
	return options[Math.floor(Math.random() * options.length)];
}

/**
 * Gets a random "go" phase transition line
 * Randomly picks between GO and MEMORIZE_END
 * @returns {Object} Random go dialogue
 */
function getRandomGoDialogue() {
	var options = [Dialogue.GO, Dialogue.MEMORIZE_END];
	return options[Math.floor(Math.random() * options.length)];
}

/**
 * Gets the appropriate return-to-start dialogue
 * @param {boolean} isSuccess - Whether the player succeeded (true) or failed (false)
 * @returns {Object} Return dialogue
 */
function getReturnToStartDialogue(isSuccess) {
	if (isSuccess) {
		return Dialogue.RETURN_SUCCESS;
	}
	return Dialogue.RETURN_RETRY;
}

/**
 * Gets a random success dialogue
 * @param {boolean} firstTry - Whether this was completed on first try
 * @returns {Object} Random success dialogue
 */
function getRandomSuccessDialogue(firstTry) {
	if (firstTry && Math.random() < 0.5) {
		return Dialogue.SUCCESS_FIRST_TRY;
	}
	var successDialogues = [Dialogue.SUCCESS_1, Dialogue.SUCCESS_2, Dialogue.SUCCESS_3, Dialogue.SUCCESS_4, Dialogue.SUCCESS_5];
	var index = Math.floor(Math.random() * successDialogues.length);
	return successDialogues[index];
}

/**
 * Gets a random failure dialogue
 * @param {number} retryCount - Number of retries on this level
 * @returns {Object} Random failure dialogue
 */
function getRandomFailDialogue(retryCount) {
	// Special messages for multiple retries
	if (retryCount === 2) {
		return Dialogue.FAIL_RETRY_2;
	} else if (retryCount === 3) {
		return Dialogue.FAIL_RETRY_3;
	} else if (retryCount > 3) {
		return Dialogue.FAIL_RETRY_MANY;
	}

	var failDialogues = [Dialogue.FAIL_1, Dialogue.FAIL_2, Dialogue.FAIL_3, Dialogue.FAIL_4, Dialogue.FAIL_5];
	var index = Math.floor(Math.random() * failDialogues.length);
	return failDialogues[index];
}

/**
 * Gets level announcement dialogue
 * @param {number} level - Level number (1-11)
 * @returns {Object} Level dialogue
 */
function getLevelDialogue(level) {
	var levelKey = "LEVEL_" + level;
	if (Dialogue[levelKey]) {
		return Dialogue[levelKey];
	}
	// Fallback for levels beyond 11
	return {
		id: "level_" + level,
		text: "Level " + level + "!",
		duration: 1.5,
	};
}

/**
 * Gets level up dialogue based on progress
 * @param {number} newLevel - The level just reached
 * @returns {Object} Level up dialogue
 */
function getLevelUpDialogue(newLevel) {
	if (newLevel === 6) {
		return Dialogue.LEVEL_UP_HALFWAY;
	} else if (newLevel >= 10) {
		return Dialogue.LEVEL_UP_ALMOST;
	}
	return Dialogue.LEVEL_UP;
}

/**
 * Gets game completion dialogue
 * @param {boolean} flawless - Whether completed without any retries
 * @returns {Object} Completion dialogue
 */
function getGameCompleteDialogue(flawless) {
	if (flawless) {
		return Dialogue.GAME_COMPLETE_FLAWLESS;
	}
	return Dialogue.GAME_COMPLETE;
}

/**
 * Gets dialogue by ID
 * @param {string} id - Dialogue ID
 * @returns {Object} Dialogue object or null
 */
function getDialogueById(id) {
	for (var key in Dialogue) {
		if (Dialogue[key].id === id) {
			return Dialogue[key];
		}
	}
	return null;
}

/**
 * Logs a host dialogue to console (placeholder for audio)
 * @param {Object} dialogue - Dialogue object
 */
function logHostDialogue(dialogue) {
	if (!dialogue) return;
	if (dialogue.sfxOnly) {
		print("[HOST SFX]: " + dialogue.id);
	} else {
		print("[HOST]: " + dialogue.text);
	}
}

module.exports = {
	Dialogue: Dialogue,
	getRandomSuccessDialogue: getRandomSuccessDialogue,
	getRandomFailDialogue: getRandomFailDialogue,
	getRandomWatchDialogue: getRandomWatchDialogue,
	getRandomGoDialogue: getRandomGoDialogue,
	getReturnToStartDialogue: getReturnToStartDialogue,
	getLevelDialogue: getLevelDialogue,
	getLevelUpDialogue: getLevelUpDialogue,
	getGameCompleteDialogue: getGameCompleteDialogue,
	getDialogueById: getDialogueById,
	logHostDialogue: logHostDialogue,
};
