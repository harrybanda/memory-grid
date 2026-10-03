// AchievementsUI.js
// Displays achievements in a grid of cards, with a tab per game mode
// Icons are auto-matched by filename (like AudioManager); the achievements themselves are in AchievementDefs.js

// @input SceneObject backButton {"label": "Back Button", "hint": "Button to return to main menu"}
// @input SceneObject classicTab {"label": "Classic Tab"}
// @input SceneObject minefieldTab {"label": "Minefield Tab"}
// @input SceneObject tonePadsTab {"label": "Tone Pads Tab"}
// @input SceneObject lavaTab {"label": "Floor Is Lava Tab"}
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

var AchievementDefs = require("../Utils/AchievementDefs");

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

// One tab per game mode; mode matches AchievementDefs
var TABS = [
	{ input: "classicTab", name: "CLASSIC", mode: "classic" },
	{ input: "minefieldTab", name: "MINEFIELD", mode: "minefield" },
	{ input: "tonePadsTab", name: "TONE PADS", mode: "tonepads" },
	{ input: "lavaTab", name: "FLOOR IS LAVA", mode: "lava" },
];
var TAB_LABEL_SIZE = 26;

function tabButton(index) {
	return script[TABS[index].input] || null;
}
var TAB_ACTIVE_COLOR = new vec4(1, 1, 1, 1);
var TAB_IDLE_COLOR = new vec4(0.5, 0.55, 0.62, 1);
var activeTab = 0;
var comingSoonText = null;

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

// Every mode's achievements, from the shared list (Utils/AchievementDefs.js); unlocked is synced from SaveManager
var achievementsData = AchievementDefs.LIST.map(function (achievement) {
	return { id: achievement.id, mode: achievement.mode, name: achievement.name, description: achievement.description, unlocked: false };
});

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

// ═══════════════════════════════════════════════════════════════════
// MODE TABS
// ═══════════════════════════════════════════════════════════════════

function findFirstText(object) {
	var text = object.getComponent("Component.Text");
	if (text) return text;
	for (var i = 0; i < object.getChildrenCount(); i++) {
		var found = findFirstText(object.getChild(i));
		if (found) return found;
	}
	return null;
}

/**
 * Shows one mode's achievement cards (or a coming-soon note if a mode has none yet)
 * @param {number} index - Index into TABS
 */
function selectTab(index) {
	activeTab = index;
	for (var i = 0; i < TABS.length; i++) {
		var button = tabButton(i);
		var label = button ? findFirstText(button) : null;
		if (label) label.textFill.color = i === index ? TAB_ACTIVE_COLOR : TAB_IDLE_COLOR;
	}

	if (showCards(TABS[index].mode) > 0) {
		hideComingSoon();
	} else {
		showComingSoon(TABS[index].name);
	}
}

function showComingSoon(modeName) {
	if (!comingSoonText) {
		var source = script.titleText || findFirstText(script.getSceneObject());
		var object = global.scene.createSceneObject("ComingSoon");
		object.setParent(script.getSceneObject());
		var gridY = script.gridContainer ? script.gridContainer.getTransform().getLocalPosition().y : 0;
		object.getTransform().setLocalPosition(new vec3(0, gridY - 12, 0.05));
		comingSoonText = object.createComponent("Component.Text");
		if (source) comingSoonText.font = source.font;
		comingSoonText.size = 44;
		comingSoonText.horizontalAlignment = HorizontalAlignment.Center;
		comingSoonText.verticalAlignment = VerticalAlignment.Center;
		comingSoonText.worldSpaceRect = Rect.create(-13, 13, -4, 4);
		comingSoonText.textFill.color = new vec4(0.92, 0.94, 0.98, 1);
		comingSoonText.depthTest = false;
	}
	comingSoonText.text = modeName + " ACHIEVEMENTS\nARE COMING SOON";
	comingSoonText.getSceneObject().enabled = true;
}

function hideComingSoon() {
	if (comingSoonText) comingSoonText.getSceneObject().enabled = false;
}

/**
 * Opens (or refreshes) the achievements screen on the Classic tab
 */
function displayAchievements() {
	selectTab(0);
}

/**
 * Lays out one mode's achievements in the card grid
 * @param {string} mode - An AchievementDefs mode key
 * @returns {number} How many cards were shown
 */
function showCards(mode) {
	// Ensure icon map is built (handles case where display is called before OnStartEvent)
	if (Object.keys(iconMap).length === 0) {
		buildIconMap();
	}

	clearCards();

	// Sync with save system to get current unlock status
	syncUnlockStatus();

	var shown = 0;
	for (var i = 0; i < achievementsData.length; i++) {
		if (achievementsData[i].mode !== mode) continue;
		spawnCard(achievementsData[i], shown);
		shown++;
	}
	return shown;
}

// ═══════════════════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════════════════

function onBackPressed() {
	clearCards();
	hideComingSoon();

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

	for (var i = 0; i < TABS.length; i++) {
		var button = tabButton(i);
		if (!button) continue;
		var label = findFirstText(button);
		if (label) {
			label.text = TABS[i].name;
			label.size = TAB_LABEL_SIZE;
		}
		(function (index) {
			setupButton(button, function () {
				selectTab(index);
			});
		})(i);
	}

	// Build the icon map from texture filenames
	buildIconMap();
}

script.createEvent("OnStartEvent").bind(function () {
	initialize();
});

// Export API
script.displayAchievements = displayAchievements;
script.selectTab = selectTab;
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
