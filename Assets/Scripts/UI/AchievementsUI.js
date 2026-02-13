// AchievementsUI.js
// Displays achievements in a grid of cards
// Icons are auto-matched by filename (like AudioManager)

// @input SceneObject backButton {"label": "Back Button", "hint": "Button to return to main menu"}
// @input Component.Text titleText {"label": "Title Text", "hint": "Achievements screen title"}

// @ui {"widget": "separator"}
// @ui {"widget": "label", "label": "Achievement Card Grid"}
// @input Asset.ObjectPrefab cardPrefab {"label": "Card Prefab", "hint": "Card prefab with title, image, description children"}
// @input SceneObject gridContainer {"label": "Grid Container", "hint": "Parent for spawned achievement cards"}
// @input int gridColumns = 2 {"label": "Grid Columns", "hint": "Number of columns in the grid"}
// @input vec2 cardSpacing = {8, 10} {"label": "Card Spacing (X, Y)", "hint": "Horizontal and vertical spacing between cards (in local units)"}
// @input vec3 gridOffset = {0, 0, 0} {"label": "Grid Offset", "hint": "Offset for entire grid from container origin"}

// @ui {"widget": "separator"}
// @ui {"widget": "label", "label": "Icon Textures"}
// @input Asset.Texture[] iconTextures {"label": "Icon Textures", "hint": "Drop all achievement icon PNGs here (order doesn't matter, matched by filename)"}

// @ui {"widget": "separator"}
// @ui {"widget": "label", "label": "Locked Style"}
// @input vec4 lockedTint = {0.25, 0.25, 0.25, 0.6} {"label": "Locked Tint", "hint": "Color tint for locked achievement icons (dark = locked look)"}

// @ui {"widget": "separator"}
// @ui {"widget": "label", "label": "Menu Reference"}
// @input Component.ScriptComponent mainMenuScript {"label": "Main Menu Script", "hint": "Reference to MainMenuManager script"}

// Import UI Kit button components
var PillButton = null;
var RectangleButton = null;

try {
	PillButton = require("SpectaclesUIKit.lspkg/Scripts/Components/Button/PillButton").PillButton;
} catch (e) {}

try {
	RectangleButton = require("SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton").RectangleButton;
} catch (e) {}

// Fallback to SIK
var SIK = null;
try {
	SIK = require("SpectaclesInteractionKit.lspkg/SIK").SIK;
} catch (e) {}

var backBtn = null;
var spawnedCards = [];

// Icon texture map: achievementId -> Texture (built from iconTextures array)
var iconMap = {};

var BUTTON_EVENT_NAMES = [
	"onTriggerUp",
	"onTriggerEnd",
	"onTap",
	"onTapped",
	"onClick",
	"onPressEnd",
	"onPressUp",
	"onRelease",
	"onReleased",
];

function tryAddHandlerToEvent(eventObj, callback) {
	if (!eventObj || typeof callback !== "function") return false;

	try {
		if (typeof eventObj.add === "function") {
			eventObj.add(callback);
			return true;
		}
	} catch (e) {}

	return false;
}

function bindKnownButtonEvents(target, callback) {
	if (!target) return false;

	for (var i = 0; i < BUTTON_EVENT_NAMES.length; i++) {
		var eventName = BUTTON_EVENT_NAMES[i];
		if (tryAddHandlerToEvent(target[eventName], callback)) {
			return true;
		}
	}

	if (target.api) {
		for (var j = 0; j < BUTTON_EVENT_NAMES.length; j++) {
			var apiEventName = BUTTON_EVENT_NAMES[j];
			if (tryAddHandlerToEvent(target.api[apiEventName], callback)) {
				return true;
			}
		}
	}

	return false;
}

function bindButtonFromHierarchy(sceneObject, callback) {
	if (!sceneObject) return false;

	try {
		var scriptComponents = null;
		if (sceneObject.getComponents && typeof sceneObject.getComponents === "function") {
			scriptComponents = sceneObject.getComponents("Component.ScriptComponent");
		}

		if ((!scriptComponents || scriptComponents.length === 0) && sceneObject.getComponent && typeof sceneObject.getComponent === "function") {
			var singleComponent = sceneObject.getComponent("Component.ScriptComponent");
			if (singleComponent) {
				scriptComponents = [singleComponent];
			}
		}

		if (scriptComponents) {
			for (var i = 0; i < scriptComponents.length; i++) {
				if (bindKnownButtonEvents(scriptComponents[i], callback)) {
					return true;
				}
			}
		}
	} catch (e) {}

	for (var childIndex = 0; childIndex < sceneObject.getChildrenCount(); childIndex++) {
		var child = sceneObject.getChild(childIndex);
		if (bindButtonFromHierarchy(child, callback)) {
			return true;
		}
	}

	return false;
}

function normalizeIconKey(value) {
	if (value === undefined || value === null) return "";
	var key = ("" + value).toLowerCase();
	key = key.replace(/\.(png|jpg|jpeg|gif|webp)$/i, "");
	key = key.replace(/[^a-z0-9]+/g, "_");
	key = key.replace(/^_+|_+$/g, "");
	return key;
}

// All achievements with IDs matching SaveManager.checkAchievements()
var achievementsData = [
	// Progression
	{ id: "first_steps", name: "First Steps", description: "Complete Level 1", unlocked: false },
	{ id: "getting_warmer", name: "Getting Warmer", description: "Complete Level 3", unlocked: false },
	{ id: "memory_walker", name: "Memory Walker", description: "Complete Level 5", unlocked: false },
	{ id: "grid_expert", name: "Grid Expert", description: "Complete Level 8", unlocked: false },
	{ id: "grid_master", name: "Grid Master", description: "Complete all 11 levels", unlocked: false },

	// Flawless
	{ id: "clean_start", name: "Clean Start", description: "Complete Level 1 on first try", unlocked: false },
	{ id: "flawless_five", name: "Flawless Five", description: "Complete Levels 1-5 without retries", unlocked: false },
	{ id: "no_mistakes", name: "No Mistakes", description: "Complete all 11 levels without retries", unlocked: false },
	{ id: "deep_focus", name: "Deep Focus", description: "Complete a Level 6+ on first try", unlocked: false },

	// Persistence
	{ id: "quick_learner", name: "Quick Learner", description: "Complete a level after 1 retry", unlocked: false },
	{ id: "comeback_kid", name: "Comeback Kid", description: "Complete a level after 3+ retries", unlocked: false },
	{ id: "never_give_up", name: "Never Give Up", description: "Beat Level 11 with 5+ total retries", unlocked: false },
];

// ═══════════════════════════════════════════════════════════════════
// ICON MAPPING
// ═══════════════════════════════════════════════════════════════════

/**
 * Builds the icon map by matching texture filenames to achievement IDs
 * (same pattern as AudioManager)
 */
function buildIconMap() {
	if (!script.iconTextures || script.iconTextures.length === 0) {
		print("AchievementsUI: No icon textures provided");
		return;
	}

	for (var i = 0; i < script.iconTextures.length; i++) {
		var tex = script.iconTextures[i];
		if (!tex) continue;

		var name = tex.name;

		// Store under multiple keys to handle different naming formats:
		// "first_steps.png" -> "first_steps.png", "first_steps", "first_steps" (lowercased)
		iconMap[name] = tex;
		iconMap[name.toLowerCase()] = tex;

		var stripped = name.replace(/\.(png|jpg|jpeg|gif|webp)$/i, "");
		iconMap[stripped] = tex;
		iconMap[stripped.toLowerCase()] = tex;
		var normalized = normalizeIconKey(stripped);
		if (normalized) {
			iconMap[normalized] = tex;
		}
	}

	print("AchievementsUI: Mapped " + script.iconTextures.length + " icon textures");
}

// ═══════════════════════════════════════════════════════════════════
// BUTTON SETUP
// ═══════════════════════════════════════════════════════════════════

function getUIKitButton(sceneObject) {
	if (!sceneObject) return null;

	var button = null;

	if (PillButton) {
		try {
			button = sceneObject.getComponent(PillButton.getTypeName());
			if (button) return button;
		} catch (e) {}
	}

	if (RectangleButton) {
		try {
			button = sceneObject.getComponent(RectangleButton.getTypeName());
			if (button) return button;
		} catch (e) {}
	}

	return null;
}

function getSIKInteractable(sceneObject) {
	if (!sceneObject || !SIK) return null;

	try {
		var interactableTypename = SIK.InteractionConfiguration.requireType("Interactable");
		return sceneObject.getComponent(interactableTypename);
	} catch (e) {
		return null;
	}
}

function setupButton(sceneObject, callback) {
	if (!sceneObject) return null;

	var uiButton = getUIKitButton(sceneObject);
	if (uiButton) {
		if (bindKnownButtonEvents(uiButton, callback)) {
			return uiButton;
		}
	}

	var interactable = getSIKInteractable(sceneObject);
	if (interactable) {
		if (bindKnownButtonEvents(interactable, callback)) {
			return interactable;
		}
	}

	if (bindButtonFromHierarchy(sceneObject, callback)) {
		return sceneObject;
	}

	print("AchievementsUI: No button component found on " + sceneObject.name);
	return null;
}

// ═══════════════════════════════════════════════════════════════════
// ACHIEVEMENT CARD GRID
// ═══════════════════════════════════════════════════════════════════

/**
 * Find a child object by name pattern (recursive)
 */
function findChildByPattern(parent, pattern) {
	for (var i = 0; i < parent.getChildrenCount(); i++) {
		var child = parent.getChild(i);
		var name = child.name.toLowerCase();

		if (name.indexOf(pattern) !== -1) {
			return child;
		}

		var found = findChildByPattern(child, pattern);
		if (found) return found;
	}
	return null;
}

/**
 * Find text component in children by name pattern
 */
function findTextInChildren(parent, namePattern) {
	var child = findChildByPattern(parent, namePattern);
	if (child) {
		var text = child.getComponent("Component.Text");
		if (text) return text;
	}
	return null;
}

/**
 * Find an Image component in children by name pattern
 */
function findImageInChildren(parent, namePattern) {
	var child = findChildByPattern(parent, namePattern);
	if (child) {
		var img = child.getComponent("Component.Image");
		if (img) return img;
	}
	return null;
}

/**
 * Clear all spawned achievement cards
 */
function clearCards() {
	for (var i = 0; i < spawnedCards.length; i++) {
		if (spawnedCards[i] && !spawnedCards[i].isDestroyed) {
			spawnedCards[i].destroy();
		}
	}
	spawnedCards = [];
}

/**
 * Calculate grid position for a card at given index
 */
function getGridPosition(index) {
	var columns = script.gridColumns || 2;
	var spacingX = script.cardSpacing ? script.cardSpacing.x : 8;
	var spacingY = script.cardSpacing ? script.cardSpacing.y : 10;
	var offset = script.gridOffset || new vec3(0, 0, 0);

	var col = index % columns;
	var row = Math.floor(index / columns);

	var totalWidth = (columns - 1) * spacingX;
	var startX = -totalWidth / 2;

	var x = startX + col * spacingX + offset.x;
	var y = -row * spacingY + offset.y;
	var z = offset.z;

	return new vec3(x, y, z);
}

/**
 * Spawn a single achievement card at grid position
 */
function spawnCard(achievement, index) {
	if (!script.cardPrefab || !script.gridContainer) {
		return null;
	}

	var cardObj = script.cardPrefab.instantiate(script.gridContainer);
	cardObj.enabled = true;

	// Position the card in grid
	var transform = cardObj.getTransform();
	var gridPos = getGridPosition(index);
	transform.setLocalPosition(gridPos);

	// Find and set the title text
	var titleText = findTextInChildren(cardObj, "title");
	if (!titleText) {
		titleText = findTextInChildren(cardObj, "name");
	}
	if (titleText) {
		titleText.text = achievement.name;
	}

	// Find and set the description text
	var descText = findTextInChildren(cardObj, "desc");
	if (descText) {
		descText.text = achievement.description;
	}

	// Find the achievement image child and assign the matching texture
	var imageComp = findImageInChildren(cardObj, "image");

	if (imageComp) {
		// Look up the icon texture by achievement ID (try exact, then lowercase)
		var iconTexture = iconMap[achievement.id] || iconMap[achievement.id.toLowerCase()];
		if (iconTexture) {
			// Clone material so tint is independent per card
			if (imageComp.mainMaterial) {
				imageComp.mainMaterial = imageComp.mainMaterial.clone();
			}

			// Set texture via mainPass.baseTex (works for Image components)
			if (imageComp.mainPass) {
				imageComp.mainPass.baseTex = iconTexture;
			}

			// Also try setting via the texture property directly (some Image setups use this)
			try {
				if (imageComp.texture !== undefined) {
					imageComp.texture = iconTexture;
				}
			} catch (e) {}

			// Apply locked/unlocked tint
			if (imageComp.mainPass) {
				if (achievement.unlocked) {
					imageComp.mainPass.baseColor = new vec4(1.0, 1.0, 1.0, 1.0);
				} else {
					var tint = script.lockedTint || new vec4(0.25, 0.25, 0.25, 0.6);
					imageComp.mainPass.baseColor = tint;
				}
			}
		} else {
			print("AchievementsUI: No icon texture found for '" + achievement.id + "'");
		}
	} else {
		print("AchievementsUI: No image/icon child found in card prefab");
	}

	// Toggle lock icon: visible when locked, hidden when unlocked
	var lockIcon = findChildByPattern(cardObj, "lock");
	if (lockIcon) {
		lockIcon.enabled = !achievement.unlocked;
	}

	cardObj.achievementId = achievement.id;
	cardObj.isUnlocked = achievement.unlocked;

	spawnedCards.push(cardObj);
	return cardObj;
}

/**
 * Syncs unlock status from SaveManager before displaying
 */
function syncUnlockStatus() {
	if (!global.PathFinder || !global.PathFinder.Save) return;

	for (var i = 0; i < achievementsData.length; i++) {
		achievementsData[i].unlocked = global.PathFinder.Save.hasAchievement(achievementsData[i].id);
	}
}

/**
 * Display all achievements in a grid
 */
function displayAchievements() {
	// Ensure icon map is built (handles case where display is called before OnStartEvent)
	if (Object.keys(iconMap).length === 0) {
		buildIconMap();
	}

	clearCards();

	// Sync with save system to get current unlock status
	syncUnlockStatus();

	for (var i = 0; i < achievementsData.length; i++) {
		spawnCard(achievementsData[i], i);
	}
}

// ═══════════════════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════════════════

function onBackPressed() {
	clearCards();

	if (script.mainMenuScript && script.mainMenuScript.showMenu) {
		script.mainMenuScript.showMenu();
	} else if (global.PathFinder && global.PathFinder.MainMenu) {
		global.PathFinder.MainMenu.show();
	}
}

/**
 * Update achievement unlock status
 */
function setAchievementUnlocked(achievementId, unlocked) {
	for (var i = 0; i < achievementsData.length; i++) {
		if (achievementsData[i].id === achievementId) {
			achievementsData[i].unlocked = unlocked;
			return;
		}
	}
}

function getAchievements() {
	return achievementsData;
}

function getIconTexture(achievementId) {
	if (!achievementId) return null;
	if (Object.keys(iconMap).length === 0) {
		buildIconMap();
	}

	var key = ("" + achievementId).toLowerCase();
	var normalized = normalizeIconKey(key);

	return (
		iconMap[key] ||
		iconMap[key + ".png"] ||
		iconMap[normalized] ||
		null
	);
}

function isAchievementUnlocked(achievementId) {
	for (var i = 0; i < achievementsData.length; i++) {
		if (achievementsData[i].id === achievementId) {
			return achievementsData[i].unlocked;
		}
	}
	return false;
}

/**
 * Initialize
 */
function initialize() {
	if (script.titleText) {
		script.titleText.text = "Achievements";
	}

	if (script.backButton) {
		backBtn = setupButton(script.backButton, onBackPressed);
	}

	// Build the icon map from texture filenames
	buildIconMap();
}

script.createEvent("OnStartEvent").bind(function () {
	initialize();
});

// Export API
script.displayAchievements = displayAchievements;
script.clearCards = clearCards;
script.setAchievementUnlocked = setAchievementUnlocked;
script.getAchievements = getAchievements;
script.isAchievementUnlocked = isAchievementUnlocked;
script.getIconTexture = getIconTexture;

// Global API
global.PathFinder = global.PathFinder || {};
global.PathFinder.Achievements = {
	display: displayAchievements,
	clear: clearCards,
	unlock: setAchievementUnlocked,
	isUnlocked: isAchievementUnlocked,
	getAll: getAchievements,
	getIconTexture: getIconTexture,
};
