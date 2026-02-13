// AudioManager.js
// Manages voice line audio playback for Memory Grid
// Audio files are automatically matched by filename to dialogue IDs

// @input Asset.AudioTrackAsset[] voiceLines {"label": "Voice Lines", "hint": "Add all voice audio files here - they will be matched by filename"}
// @input Component.AudioComponent audioPlayer {"label": "Audio Player", "hint": "AudioComponent to play voice lines"}

/**
 * AudioManager Component
 * Automatically maps audio files to dialogue IDs by filename
 * Just drop all audio files into the voiceLines array - order doesn't matter
 */

// Audio mapping: dialogueId -> AudioTrackAsset
var audioMap = {};

// State
var isInitialized = false;
var isPlaying = false;
var onCompleteCallback = null;
var playStartTime = 0; // Timestamp when play() was called (for grace period)

/**
 * Initializes the audio manager and builds the filename mapping
 */
function initialize() {
	if (isInitialized) return;

	buildAudioMap();
	isInitialized = true;

	print("AudioManager: Initialized with " + Object.keys(audioMap).length + " voice lines");
}

/**
 * Builds the audio map by matching filenames to dialogue IDs
 * Extracts the base filename (without extension) and uses it as the key
 */
function buildAudioMap() {
	if (!script.voiceLines || script.voiceLines.length === 0) {
		print("AudioManager: No voice lines provided");
		return;
	}

	for (var i = 0; i < script.voiceLines.length; i++) {
		var audioAsset = script.voiceLines[i];
		if (!audioAsset) continue;

		// Get the asset name (Lens Studio uses the filename as the asset name)
		var assetName = audioAsset.name;

		// Remove file extension if present (.mp3, .wav, .ogg, etc.)
		var dialogueId = assetName.replace(/\.(mp3|wav|ogg|m4a|aac)$/i, "");

		// Store in map
		audioMap[dialogueId] = audioAsset;

		print("AudioManager: Mapped '" + dialogueId + "' -> " + assetName);
	}
}

/**
 * Plays a voice line by dialogue ID
 * @param {string} dialogueId - The dialogue ID (matches filename without extension)
 * @param {Function} onComplete - Optional callback when audio finishes
 * @returns {boolean} True if audio was found and started playing
 */
function playVoiceLine(dialogueId, onComplete) {
	if (!isInitialized) {
		initialize();
	}

	var audioAsset = audioMap[dialogueId];

	if (!audioAsset) {
		print("AudioManager: No audio found for '" + dialogueId + "'");
		// Call callback immediately if no audio
		if (onComplete) {
			onComplete();
		}
		return false;
	}

	if (!script.audioPlayer) {
		print("AudioManager: No audio player assigned");
		if (onComplete) {
			onComplete();
		}
		return false;
	}

	// Stop any currently playing audio
	if (isPlaying) {
		script.audioPlayer.stop(false);
	}

	// Set the audio track
	script.audioPlayer.audioTrack = audioAsset;

	// Store callback
	onCompleteCallback = onComplete;
	isPlaying = true;
	playStartTime = getTime(); // Record start time for grace period

	// Use setOnFinish as the primary completion mechanism (reliable on device)
	script.audioPlayer.setOnFinish(function () {
		onAudioFinished();
	});

	// Play the audio
	script.audioPlayer.play(1);

	print("AudioManager: Playing '" + dialogueId + "'");

	return true;
}

/**
 * Plays a dialogue object (from DialogueLines)
 * @param {Object} dialogue - Dialogue object with id property
 * @param {Function} onComplete - Optional callback when audio finishes
 * @returns {boolean} True if audio was found and started playing
 */
function playDialogue(dialogue, onComplete) {
	if (!dialogue || !dialogue.id) {
		print("AudioManager: Invalid dialogue object");
		if (onComplete) {
			onComplete();
		}
		return false;
	}

	return playVoiceLine(dialogue.id, onComplete);
}

/**
 * Stops any currently playing audio
 */
function stopAudio() {
	if (!script.audioPlayer) return;

	// Some runtimes require a function and throw if null is passed.
	// Use a no-op callback to safely clear prior completion handlers.
	try {
		script.audioPlayer.setOnFinish(function () {});
	} catch (e) {
		print("AudioManager: Failed to clear onFinish callback - " + e);
	}

	if (isPlaying) {
		script.audioPlayer.stop(false);
	}

	isPlaying = false;
	onCompleteCallback = null;
}

/**
 * Checks if a voice line exists for the given dialogue ID
 * @param {string} dialogueId - The dialogue ID to check
 * @returns {boolean} True if audio exists for this ID
 */
function hasVoiceLine(dialogueId) {
	if (!isInitialized) {
		initialize();
	}
	return audioMap.hasOwnProperty(dialogueId);
}

/**
 * Gets the duration of a voice line
 * @param {string} dialogueId - The dialogue ID
 * @returns {number} Duration in seconds, or 0 if not found
 */
function getVoiceLineDuration(dialogueId) {
	if (!isInitialized) {
		initialize();
	}

	var audioAsset = audioMap[dialogueId];
	if (audioAsset && audioAsset.control) {
		return audioAsset.control.duration;
	}
	return 0;
}

/**
 * Gets list of all loaded dialogue IDs
 * @returns {Array} Array of dialogue ID strings
 */
function getLoadedDialogueIds() {
	return Object.keys(audioMap);
}

/**
 * Called when audio finishes playing
 * Safe against double-firing (both setOnFinish and polling may trigger)
 */
function onAudioFinished() {
	if (!isPlaying) return; // Already handled

	isPlaying = false;
	if (onCompleteCallback) {
		var callback = onCompleteCallback;
		onCompleteCallback = null;
		callback();
	}
}

// Setup audio finish detection (fallback safety net)
// Primary detection is via setOnFinish; this catches edge cases
function setupAudioFinishDetection() {
	if (!script.audioPlayer) return;

	var GRACE_PERIOD = 0.5; // Ignore isPlaying() for 0.5s after play() starts

	var updateEvent = script.createEvent("UpdateEvent");
	updateEvent.bind(function () {
		if (!isPlaying || !script.audioPlayer) return;

		// Skip check during grace period (device needs time to start playback)
		var elapsed = getTime() - playStartTime;
		if (elapsed < GRACE_PERIOD) return;

		// If AudioComponent says it's not playing, the clip has finished
		if (!script.audioPlayer.isPlaying()) {
			onAudioFinished();
		}
	});
}

// Initialize on start
var startEvent = script.createEvent("OnStartEvent");
startEvent.bind(function () {
	initialize();
	setupAudioFinishDetection();
});

// Export API
script.initialize = initialize;
script.playVoiceLine = playVoiceLine;
script.playDialogue = playDialogue;
script.stopAudio = stopAudio;
script.hasVoiceLine = hasVoiceLine;
script.getVoiceLineDuration = getVoiceLineDuration;
script.getLoadedDialogueIds = getLoadedDialogueIds;

// Global API for easy access from other scripts
// Merge with existing Audio API instead of overwriting
global.PathFinder = global.PathFinder || {};
global.PathFinder.Audio = global.PathFinder.Audio || {};
global.PathFinder.Audio.play = playVoiceLine;
global.PathFinder.Audio.playDialogue = playDialogue;
global.PathFinder.Audio.stop = stopAudio;
global.PathFinder.Audio.has = hasVoiceLine;
global.PathFinder.Audio.getDuration = getVoiceLineDuration;
global.PathFinder.Audio.getLoaded = getLoadedDialogueIds;
