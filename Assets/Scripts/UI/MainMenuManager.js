// MainMenuManager.js
// Handles main menu UI with Start and Achievements buttons
// Uses Spectacles UI Kit for button interactions

var Constants = require("../Utils/Constants");

// @input SceneObject interfaceContainer {"label": "Interface Container", "hint": "Top-level parent (Interface) that contains Menu and Achievements"}
// @input SceneObject menuContainer {"label": "Menu Container", "hint": "Menu content container"}
// @input SceneObject achievementsContainer {"label": "Achievements Container", "hint": "Achievements content container"}
// @input SceneObject startButton {"label": "Start Button", "hint": "Button to start the game"}
// @input SceneObject achievementsButton {"label": "Achievements Button", "hint": "Button to view achievements"}
// @input SceneObject resetProgressButton {"label": "Reset Progress Button", "hint": "Button to clear saved progress"}
// @input SceneObject resetAllButton {"label": "Reset All Button (Debug)", "hint": "Debug-only button that calls Save.resetAll()"}
// @input Component.Text versionText {"label": "Version Text", "hint": "Text showing game version"}
// @input Component.Text levelText {"label": "Level Text", "hint": "Text showing current level (optional)"}
// @input string gameVersion = "v1.0.0" {"label": "Game Version"}

// @ui {"widget": "separator"}
// @ui {"widget": "label", "label": "Scene References"}
// @input Asset.ObjectPrefab floorPlacementPrefab {"label": "Floor Placement Prefab", "hint": "Prefab for Surface Placement - will be instantiated fresh each game (Option A)"}
// @input SceneObject floorPlacementParent {"label": "Floor Placement Parent", "hint": "Parent object for instantiated placement"}
// @input SceneObject floorPlacementObject {"label": "Floor Placement Object", "hint": "Direct scene reference (Option B - use if prefab doesn't work)"}
// @input Component.ScriptComponent achievementsUI {"label": "Achievements UI Script", "hint": "Reference to AchievementsUI script"}

// Import UI Kit button components
var PillButton = null;
var RectangleButton = null;

try {
	PillButton = require("SpectaclesUIKit.lspkg/Scripts/Components/Button/PillButton").PillButton;
} catch (e) {
	print("MainMenuManager: PillButton not available");
}

try {
	RectangleButton = require("SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton").RectangleButton;
} catch (e) {
	print("MainMenuManager: RectangleButton not available");
}

// Fallback to SIK if UI Kit not available
var SIK = null;
try {
	SIK = require("SpectaclesInteractionKit.lspkg/SIK").SIK;
} catch (e) {
	print("MainMenuManager: SIK not available");
}

var startBtn = null;
var achievementsBtn = null;
var resetBtn = null;
var resetAllBtn = null;
var isMenuVisible = true;
var currentPlacementInstance = null;

var BUTTON_EVENT_NAMES = ["onTriggerUp", "onTriggerEnd", "onTap", "onTapped", "onClick", "onPressEnd", "onPressUp", "onRelease", "onReleased"];

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

/**
 * Get UI Kit button component from a SceneObject
 */
function getUIKitButton(sceneObject) {
	if (!sceneObject) return null;

	var button = null;

	// Try PillButton
	if (PillButton) {
		try {
			button = sceneObject.getComponent(PillButton.getTypeName());
			if (button) return button;
		} catch (e) {}
	}

	// Try RectangleButton
	if (RectangleButton) {
		try {
			button = sceneObject.getComponent(RectangleButton.getTypeName());
			if (button) return button;
		} catch (e) {}
	}

	return null;
}

/**
 * Fallback: Get SIK Interactable from a SceneObject
 */
function getSIKInteractable(sceneObject) {
	if (!sceneObject || !SIK) return null;

	try {
		var interactableTypename = SIK.InteractionConfiguration.requireType("Interactable");
		return sceneObject.getComponent(interactableTypename);
	} catch (e) {
		return null;
	}
}

/**
 * Setup a button with UI Kit (preferred) or SIK fallback
 */
function setupButton(sceneObject, callback) {
	if (!sceneObject) return null;

	// Try UI Kit first
	var uiButton = getUIKitButton(sceneObject);
	if (uiButton) {
		if (bindKnownButtonEvents(uiButton, callback)) {
			return uiButton;
		}
	}

	// Fallback to SIK Interactable
	var interactable = getSIKInteractable(sceneObject);
	if (interactable) {
		if (bindKnownButtonEvents(interactable, callback)) {
			return interactable;
		}
	}

	// Final fallback: inspect script components on this object/children and bind any known trigger event
	if (bindButtonFromHierarchy(sceneObject, callback)) {
		return sceneObject;
	}

	print("MainMenuManager: No button component found on " + sceneObject.name);
	return null;
}

/**
 * Called when Start button is pressed
 */
function onStartPressed() {
	hideInterface();
	createFloorPlacement();
}

/**
 * Create/show floor placement
 * Tries prefab instantiation first, falls back to scene object
 */
function createFloorPlacement() {
	// Option A: Try prefab instantiation
	if (script.floorPlacementPrefab) {
		destroyFloorPlacement();

		try {
			if (script.floorPlacementParent) {
				currentPlacementInstance = script.floorPlacementPrefab.instantiate(script.floorPlacementParent);
			} else {
				currentPlacementInstance = script.floorPlacementPrefab.instantiate(null);
			}

			if (currentPlacementInstance) {
				currentPlacementInstance.enabled = true;
				return;
			}
		} catch (e) {}
	}

	// Option B: Fall back to direct scene object
	if (script.floorPlacementObject) {
		script.floorPlacementObject.enabled = true;
	}
}

/**
 * Destroy/hide floor placement
 */
function destroyFloorPlacement() {
	if (currentPlacementInstance) {
		currentPlacementInstance.destroy();
		currentPlacementInstance = null;
	}

	if (script.floorPlacementObject) {
		script.floorPlacementObject.enabled = false;
	}
}

/**
 * Called when Achievements button is pressed
 */
function onAchievementsPressed() {
	// Hide menu content, show achievements content
	if (script.menuContainer) {
		script.menuContainer.enabled = false;
	}
	if (script.achievementsContainer) {
		script.achievementsContainer.enabled = true;
	}

	// Trigger achievements display
	if (script.achievementsUI && script.achievementsUI.displayAchievements) {
		script.achievementsUI.displayAchievements();
	}
}

/**
 * Called when Reset Progress button is pressed
 */
function onResetProgressPressed() {
	if (global.PathFinder && global.PathFinder.Save) {
		global.PathFinder.Save.resetProgress();
		print("MainMenuManager: Progress reset - starting fresh from Level 1");
		updateLevelDisplay();
	}
}

/**
 * Called when Reset All button is pressed (debug only)
 */
function onResetAllPressed() {
	if (!Constants.DebugConfig.ENABLED) {
		print("MainMenuManager: Reset All ignored (debug mode disabled)");
		return;
	}

	if (global.PathFinder && global.PathFinder.Save && global.PathFinder.Save.resetAll) {
		global.PathFinder.Save.resetAll();
		print("MainMenuManager: DEBUG resetAll() executed (levels + retries + achievements cleared)");
		updateLevelDisplay();

		// If achievements page is currently visible, refresh cards immediately.
		if (script.achievementsContainer && script.achievementsContainer.enabled && script.achievementsUI && script.achievementsUI.displayAchievements) {
			script.achievementsUI.displayAchievements();
		}
	}
}

/**
 * Update the level display text and reset button visibility
 */
function updateLevelDisplay() {
	var currentLevel = 1;
	if (global.PathFinder && global.PathFinder.Save) {
		currentLevel = global.PathFinder.Save.getCurrentLevel();
	}

	// Update level text
	if (script.levelText) {
		if (currentLevel > 11) {
			script.levelText.text = "All Levels Complete!";
		} else {
			script.levelText.text = "Level " + currentLevel + " of 11";
		}
	}

	// Hide reset button on level 1 (nothing to reset)
	if (script.resetProgressButton) {
		script.resetProgressButton.enabled = currentLevel > 1;
	}

	// Show debug-only "Reset All" button only when debug mode is enabled.
	if (script.resetAllButton) {
		script.resetAllButton.enabled = Constants.DebugConfig.ENABLED === true;
	}
}

/**
 * Show the main menu (and interface container)
 */
function showMenu() {
	// Show interface container
	if (script.interfaceContainer) {
		script.interfaceContainer.enabled = true;
	}

	// Show menu, hide achievements
	if (script.menuContainer) {
		script.menuContainer.enabled = true;
	}
	if (script.achievementsContainer) {
		script.achievementsContainer.enabled = false;
	}

	// Update level display when menu is shown
	updateLevelDisplay();

	isMenuVisible = true;
}

/**
 * Hide just the menu content (for switching to achievements)
 */
function hideMenuContent() {
	if (script.menuContainer) {
		script.menuContainer.enabled = false;
	}
}

/**
 * Hide the entire interface (frame + all content)
 */
function hideInterface() {
	if (script.interfaceContainer) {
		script.interfaceContainer.enabled = false;
	}
	isMenuVisible = false;
}

/**
 * Show the interface container
 */
function showInterface() {
	if (script.interfaceContainer) {
		script.interfaceContainer.enabled = true;
	}
}

/**
 * Check if menu is currently visible
 */
function isVisible() {
	return isMenuVisible;
}

/**
 * Initialize the menu
 */
function initialize() {
	// Set version text
	if (script.versionText) {
		script.versionText.text = script.gameVersion || "v1.0.0";
	}

	// Setup Start button
	if (script.startButton) {
		startBtn = setupButton(script.startButton, onStartPressed);
	}

	// Setup Achievements button
	if (script.achievementsButton) {
		achievementsBtn = setupButton(script.achievementsButton, onAchievementsPressed);
	}

	// Setup Reset Progress button
	if (script.resetProgressButton) {
		resetBtn = setupButton(script.resetProgressButton, onResetProgressPressed);
	}

	// Setup Debug Reset All button
	if (script.resetAllButton) {
		resetAllBtn = setupButton(script.resetAllButton, onResetAllPressed);
	}

	// No floor placement instance at start - will be created when Start is pressed

	// Show menu initially (interface + menu content visible, achievements hidden)
	showMenu();

	// Update level display after short delay (ensure SaveManager is initialized)
	var levelDelay = script.createEvent("DelayedCallbackEvent");
	levelDelay.bind(updateLevelDisplay);
	levelDelay.reset(0.2);
}

// Initialize on start
script.createEvent("OnStartEvent").bind(function () {
	initialize();
});

// Export API
script.showMenu = showMenu;
script.hideMenuContent = hideMenuContent;
script.hideInterface = hideInterface;
script.showInterface = showInterface;
script.isVisible = isVisible;
script.destroyFloorPlacement = destroyFloorPlacement;

// Global API for other scripts to access
global.PathFinder = global.PathFinder || {};
global.PathFinder.MainMenu = {
	show: showMenu,
	hide: hideInterface,
	showInterface: showInterface,
	hideInterface: hideInterface,
	isVisible: isVisible,
	destroyPlacement: destroyFloorPlacement,
};
