// PalmExitButton.js
// Adapted from Jigsaw Genie: show/hide exit button by game state
// Uses SIK Interactable.onTriggerEnd or UIKit onTriggerUp — matches JigsawGenieManager.setupExitButton
// Place the exit button directly under the right wrist in the Lens Studio hierarchy for best results

// @input SceneObject exitButton {"label": "Exit Button", "hint": "Button to exit and return to menu"}
// @input SceneObject exitButtonContainer {"label": "Exit Button Container (alias)", "hint": "Same as Exit Button - for scene compatibility"}

function getExitButton() {
	return script.exitButton || script.exitButtonContainer;
}

var exitButtonInitialPos = null;
var exitButtonInitialRot = null;
var exitButtonInitialScale = null;
var isEnabled = false;

function storeExitButtonInitialTransform() {
	if (getExitButton()) {
		var tr = getExitButton().getTransform();
		exitButtonInitialPos = tr.getLocalPosition();
		exitButtonInitialRot = tr.getLocalRotation();
		exitButtonInitialScale = tr.getLocalScale();
	}
}

function resetExitButtonTransform() {
	if (getExitButton() && exitButtonInitialPos) {
		var tr = getExitButton().getTransform();
		tr.setLocalPosition(exitButtonInitialPos);
		tr.setLocalRotation(exitButtonInitialRot);
		tr.setLocalScale(exitButtonInitialScale);
	}
}

function show() {
	isEnabled = true;
	if (getExitButton()) {
		resetExitButtonTransform();
		getExitButton().enabled = true;
	}
}

function hide() {
	isEnabled = false;
	if (getExitButton()) {
		getExitButton().enabled = false;
	}
}

// Matches JigsawGenieManager.setupExitButton exactly: SIK onTriggerEnd first, then UIKit onTriggerUp
function setupExitButton() {
	if (!getExitButton()) return;

	// Try SIK Interactable.onTriggerEnd first (Jigsaw Genie pattern)
	try {
		var SIK = require("SpectaclesInteractionKit.lspkg/SIK").SIK;
		if (SIK && SIK.InteractionConfiguration) {
			var interactableType = SIK.InteractionConfiguration.requireType("Interactable");
			var interactable = getExitButton().getComponent(interactableType);
			if (interactable) {
				interactable.onTriggerEnd.add(onExitButtonPressed);
				print("PalmExitButton: Bound via SIK Interactable.onTriggerEnd");
				return;
			}
		}
	} catch (e) {}

	// Try UIKit / ScriptComponent onTriggerUp (Jigsaw Genie fallback)
	try {
		var buttonComp = getExitButton().getComponent("Component.ScriptComponent");
		if (buttonComp && buttonComp.onTriggerUp) {
			buttonComp.onTriggerUp.add(onExitButtonPressed);
			print("PalmExitButton: Bound via onTriggerUp");
		}
	} catch (e) {}

	// Try children for button component
	try {
		for (var i = 0; i < getExitButton().getChildrenCount(); i++) {
			var child = getExitButton().getChild(i);
			var comp = child.getComponent("Component.ScriptComponent");
			if (comp && comp.onTriggerUp) {
				comp.onTriggerUp.add(onExitButtonPressed);
				print("PalmExitButton: Bound via child onTriggerUp");
				return;
			}
		}
	} catch (e) {}
}

function onExitButtonPressed() {
	if (!isEnabled) return;

	print("PalmExitButton: Exit button pressed - returning to menu");

	// Force stop audio immediately
	if (global.PathFinder && global.PathFinder.Audio && global.PathFinder.Audio.stop) {
		global.PathFinder.Audio.stop();
	}

	if (global.PathFinder && global.PathFinder.Game && global.PathFinder.Game.exit) {
		global.PathFinder.Game.exit();
		return;
	}

	hide();
	if (global.PathFinder && global.PathFinder.MainMenu) {
		global.PathFinder.MainMenu.show();
	}
}

function isExitEnabled() {
	return isEnabled;
}

// Initialize on start (matches Jigsaw Genie OnStartEvent)
script.createEvent("OnStartEvent").bind(function () {
	storeExitButtonInitialTransform();
	hide();
	setupExitButton();
});

// Global API
global.PathFinder = global.PathFinder || {};
global.PathFinder.PalmExit = {
	show: show,
	hide: hide,
	isEnabled: isExitEnabled,
};
