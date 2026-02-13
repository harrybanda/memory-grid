// Constants.js
// Game configuration and constants for Memory Grid

/**
 * Debug Configuration
 */
var DebugConfig = {
	// Enable on-screen debug logging via TextLogger
	ENABLED: false,

	// Skip path validation - stepping on ANY tile immediately completes the level
	// Only the end tile (last tile in path) needs to be reached
	// Use this to quickly test all 11 levels without memorizing paths
	SKIP_PATH_CHECK: false,
};

/**
 * Grid Configuration
 * All measurements are in centimeters (Lens Studio World mode units)
 * Tile size reduced for better Spectacles FOV coverage
 */
var GridConfig = {
	// Default grid dimensions
	DEFAULT_ROWS: 5,
	DEFAULT_COLUMNS: 5,

	// Tile size in centimeters (smaller for better FOV fit)
	TILE_SIZE: 50,

	// Gap between tiles in centimeters
	TILE_GAP: 5,

	// Visual settings
	TILE_HEIGHT: 1, // Slight elevation for visibility

	// Opacity for default (white) tiles during normal gameplay (0-1)
	DEFAULT_ALPHA: 0.5,

	// Opacity for normally visible tiles (0-1)
	VISIBLE_ALPHA: 0.77,

	// Opacity for dimmed background tiles (0-1)
	DIMMED_ALPHA: 0.15,

	// Subtle idle pulse settings
	IDLE_PULSE_ENABLED: false,
	IDLE_PULSE_ALL_TILES: true, // true = pulse all tile states, false = pulse default white tiles only
	IDLE_PULSE_SPEED: 0.35, // Pulses per second (tuned for visible but gentle motion)
	IDLE_PULSE_MIN_ALPHA: 0.3, // Pulse floor alpha
	IDLE_PULSE_MAX_ALPHA: 0.8, // Pulse ceiling alpha

	// Colors (RGBA values 0-1)
	COLORS: {
		TILE_DEFAULT: new vec4(1.0, 1.0, 1.0, 0.5),
		TILE_PATH: new vec4(0.0, 0.8, 0.4, 0.77),
		TILE_CORRECT: new vec4(0.0, 1.0, 0.5, 0.77),
		TILE_WRONG: new vec4(1.0, 0.2, 0.2, 0.77),
		TILE_START: new vec4(1.0, 0.9, 0.2, 0.77), // Yellow for start
		TILE_END: new vec4(0.2, 0.6, 1.0, 0.77), // Blue for end
	},
};

/**
 * Player Tracking Configuration
 */
var PlayerConfig = {
	// How close to tile center player must be (in cm)
	TILE_ENTRY_RADIUS: 20,

	// Minimum distance to move before registering new position
	MOVEMENT_THRESHOLD: 5,

	// Height offset from camera to approximate foot position (cm)
	// Typical standing height - we project straight down
	HEAD_TO_FLOOR_OFFSET: 160,

	// Start zone configuration
	START_ZONE_SIZE: 40, // Size of the starting area in cm
	START_ZONE_OFFSET: 80, // Distance in front of grid where start zone appears
};

/**
 * Game Timing Configuration (in seconds)
 */
var TimingConfig = {
	// Time to memorize the path
	MEMORIZE_TIME: 5,

	// Countdown before path reveal
	COUNTDOWN_TIME: 5,

	// Maximum time to complete the path
	PLAY_TIME: 30,
};

/**
 * Game State Enum
 */
var GameState = {
	IDLE: "idle",
	PLACING_GRID: "placing_grid",
	GRID_INTRO: "grid_intro",
	HOST_INTRO: "host_intro",
	WAITING_IN_START_ZONE: "waiting_in_start_zone",
	COUNTDOWN: "countdown",
	MEMORIZE: "memorize",
	PLAYING: "playing",
	COMPLETED: "completed",
	FAILED: "failed",
};

/**
 * Intro Animation Configuration
 * Designed for progressive reveal that guides player attention
 */
var IntroConfig = {
	// Delay between each tile reveal during path animation (seconds)
	TILE_REVEAL_DELAY: 0.5,

	// Delay after path fully revealed before memorize timer starts (seconds)
	POST_REVEAL_DELAY: 0.5,

	// Delay after player sees start tile before countdown begins (seconds)
	START_FOCUS_DELAY: 1.5,
};

/**
 * Host Avatar Configuration
 */
var HostConfig = {
	// Distance from user where host appears (cm)
	DISTANCE_FROM_USER: 150,

	// Height offset from floor (cm) - eye level
	HEIGHT_OFFSET: 150,

	// Host placeholder size (cm)
	PLACEHOLDER_SIZE: 30,
};

/**
 * Start Zone Configuration
 * Visual marker shown when player needs to return to start
 */
var StartZoneConfig = {
	// Ground marker colors (solid white, no transparency)
	COLOR: new vec4(1.0, 1.0, 1.0, 1.0),
	COLOR_ACTIVE: new vec4(1.0, 1.0, 1.0, 1.0),
};

/**
 * Level Configuration
 * All levels use 5x5 grid
 * Path length increases by 2 each level (5, 7, 9, 11...)
 * Memorize time is constant at 5 seconds
 * No time limit for gameplay
 */
var LevelConfig = {
	GRID_ROWS: 5,
	GRID_COLUMNS: 5,
	BASE_PATH_LENGTH: 5, // Starting path length
	PATH_INCREMENT: 2, // Add 2 tiles per level
	MAX_PATH_LENGTH: 25, // Max tiles on 5x5 grid
	MEMORIZE_TIME: 5, // Constant 5 seconds
};

/**
 * Direction vectors for path generation
 * Only allows orthogonal movement (no diagonals)
 */
var Directions = {
	UP: { x: 0, z: 1 },
	DOWN: { x: 0, z: -1 },
	LEFT: { x: -1, z: 0 },
	RIGHT: { x: 1, z: 0 },
};

// Export for module usage
module.exports = {
	DebugConfig: DebugConfig,
	GridConfig: GridConfig,
	PlayerConfig: PlayerConfig,
	TimingConfig: TimingConfig,
	GameState: GameState,
	IntroConfig: IntroConfig,
	HostConfig: HostConfig,
	StartZoneConfig: StartZoneConfig,
	LevelConfig: LevelConfig,
	Directions: Directions,
};
