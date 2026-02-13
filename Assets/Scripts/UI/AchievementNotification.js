// AchievementNotification.js
// Minimal achievement popup manager.
// Attach the popup under camera (or another always-enabled parent) and position it manually.
// This script only sets content and toggles visibility on unlock.

// @input SceneObject notificationRoot {"label": "Notification Root", "hint": "Root object for the popup. If empty, this script's SceneObject is used."}
// @input SceneObject titleLabelObject {"label": "Title Label", "hint": "Child object with Text or Text3D for achievement name"}
// @input SceneObject descriptionLabelObject {"label": "Description Label", "hint": "Child object with Text or Text3D for achievement description"}
// @input SceneObject iconObject {"label": "Icon Object", "hint": "Child object with Image or RenderMeshVisual for achievement icon"}
// @input Asset.Texture[] iconTextures {"label": "Icon Textures", "hint": "Achievement icon textures, matched by filename to achievement ID"}
// @input Component.AudioComponent notificationAudio {"label": "Notification Audio", "hint": "AudioComponent that plays when popup appears"}
// @input string iconTextureProperty = "baseTex" {"label": "Icon Texture Property", "hint": "Material texture slot name for mesh icons (e.g. baseTex, mainTex)"}
// @input float displayDuration = 2.2 {"label": "Display Duration (s)", "hint": "How long each notification stays visible"}

var queue = [];
var queuedLookup = {};
var activeAchievementId = null;
var isShowing = false;
var hideEvent = null;

var subscribedToSaveEvents = false;
var lastSubscribeAttempt = -10;

var iconMap = {};
var iconImageComp = null;
var iconMeshVisualComp = null;

var baseScale = new vec3(1, 1, 1);

var achievementDefinitions = {
	first_steps: { name: "First Steps", description: "Complete Level 1" },
	getting_warmer: { name: "Getting Warmer", description: "Complete Level 3" },
	memory_walker: { name: "Memory Walker", description: "Complete Level 5" },
	grid_expert: { name: "Grid Expert", description: "Complete Level 8" },
	grid_master: { name: "Grid Master", description: "Complete all 11 levels" },
	clean_start: { name: "Clean Start", description: "Complete Level 1 on first try" },
	flawless_five: { name: "Flawless Five", description: "Complete Levels 1-5 without retries" },
	no_mistakes: { name: "No Mistakes", description: "Complete all 11 levels without retries" },
	deep_focus: { name: "Deep Focus", description: "Complete a Level 6+ on first try" },
	quick_learner: { name: "Quick Learner", description: "Complete a level after 1 retry" },
	comeback_kid: { name: "Comeback Kid", description: "Complete a level after 3+ retries" },
	never_give_up: { name: "Never Give Up", description: "Beat Level 11 with 5+ total retries" },
};

function getRootObject() {
	return script.notificationRoot || script.getSceneObject();
}

function getScriptSceneObject() {
	try {
		return script.getSceneObject();
	} catch (e) {
		return null;
	}
}

function normalizeAchievementId(achievementId) {
	if (achievementId === undefined || achievementId === null) return "";
	return ("" + achievementId).toLowerCase();
}

function canonicalKey(value) {
	var key = normalizeAchievementId(value);
	key = key.replace(/\.(png|jpg|jpeg|gif|webp)$/i, "");
	key = key.replace(/[^a-z0-9]+/g, "_");
	key = key.replace(/^_+|_+$/g, "");
	return key;
}

function prettifyAchievementId(achievementId) {
	var id = normalizeAchievementId(achievementId);
	if (!id) return "Achievement Unlocked";

	var words = id.split("_");
	for (var i = 0; i < words.length; i++) {
		if (!words[i]) continue;
		words[i] = words[i].charAt(0).toUpperCase() + words[i].substring(1);
	}
	return words.join(" ");
}

function getAchievementData(achievementId) {
	var key = normalizeAchievementId(achievementId);
	var data = achievementDefinitions[key];
	if (data) return data;

	return {
		name: prettifyAchievementId(key),
		description: "Achievement unlocked",
	};
}

function buildIconMap() {
	iconMap = {};
	if (!script.iconTextures || script.iconTextures.length === 0) {
		return;
	}

	for (var i = 0; i < script.iconTextures.length; i++) {
		var texture = script.iconTextures[i];
		if (!texture) continue;

		var name = texture.name || "";
		var lower = name.toLowerCase();
		var stripped = lower.replace(/\.(png|jpg|jpeg|gif|webp)$/i, "");
		var canonical = canonicalKey(stripped);

		iconMap[name] = texture;
		iconMap[lower] = texture;
		iconMap[stripped] = texture;
		if (canonical) {
			iconMap[canonical] = texture;
		}
	}
}

function getIconTextureForAchievement(achievementId) {
	var key = normalizeAchievementId(achievementId);
	var canonical = canonicalKey(key);
	var localTexture = iconMap[key] || iconMap[key + ".png"] || iconMap[canonical] || null;
	if (localTexture) return localTexture;

	// Fallback to shared AchievementsUI icon map.
	if (global.PathFinder && global.PathFinder.Achievements && global.PathFinder.Achievements.getIconTexture) {
		try {
			var sharedTexture = global.PathFinder.Achievements.getIconTexture(key);
			if (sharedTexture) return sharedTexture;
		} catch (e) {}
	}

	return null;
}

function setTextOnObject(sceneObject, value) {
	if (!sceneObject) return false;

	var text = sceneObject.getComponent("Component.Text");
	if (text) {
		text.text = value;
		return true;
	}

	var text3D = sceneObject.getComponent("Component.Text3D");
	if (text3D) {
		text3D.text = value;
		return true;
	}

	return false;
}

function findComponentRecursive(sceneObject, componentType) {
	if (!sceneObject) return null;

	var direct = sceneObject.getComponent(componentType);
	if (direct) return direct;

	var childCount = sceneObject.getChildrenCount();
	for (var i = 0; i < childCount; i++) {
		var child = sceneObject.getChild(i);
		var found = findComponentRecursive(child, componentType);
		if (found) return found;
	}

	return null;
}

function resolveIconComponents() {
	iconImageComp = null;
	iconMeshVisualComp = null;

	if (!script.iconObject) return;

	iconImageComp = findComponentRecursive(script.iconObject, "Component.Image");
	iconMeshVisualComp = findComponentRecursive(script.iconObject, "Component.RenderMeshVisual");
}

function setupIconMaterials() {
	if (iconImageComp && iconImageComp.mainMaterial) {
		iconImageComp.mainMaterial = iconImageComp.mainMaterial.clone();
	}
	if (iconMeshVisualComp && iconMeshVisualComp.mainMaterial) {
		iconMeshVisualComp.mainMaterial = iconMeshVisualComp.mainMaterial.clone();
	}
}

function setTextureOnMainPass(mainPass, texture) {
	if (!mainPass || !texture) return false;

	var keys = [];
	if (script.iconTextureProperty) {
		keys.push(script.iconTextureProperty);
	}
	keys.push("baseTex");
	keys.push("mainTex");
	keys.push("diffuseTex");
	keys.push("albedoTex");
	keys.push("colorTex");
	keys.push("emissiveTex");

	var applied = false;
	for (var i = 0; i < keys.length; i++) {
		var key = keys[i];
		if (!key) continue;

		try {
			if (mainPass[key] !== undefined) {
				mainPass[key] = texture;
				applied = true;
			}
		} catch (e) {}
	}

	return applied;
}

function applyIconTexture(achievementId) {
	if (!script.iconObject) return;

	var texture = getIconTextureForAchievement(achievementId);
	if (!texture) {
		print("AchievementNotification: No icon texture found for '" + achievementId + "'");
		return;
	}

	var assigned = false;

	if (iconImageComp) {
		if (iconImageComp.mainPass) {
			assigned = setTextureOnMainPass(iconImageComp.mainPass, texture) || assigned;
		}
		try {
			if (iconImageComp.texture !== undefined) {
				iconImageComp.texture = texture;
				assigned = true;
			}
		} catch (e) {}
	}

	if (iconMeshVisualComp && iconMeshVisualComp.mainPass) {
		assigned = setTextureOnMainPass(iconMeshVisualComp.mainPass, texture) || assigned;
	}

	if (!assigned) {
		print("AchievementNotification: Icon texture slot not found. Check Icon Texture Property.");
	}
}

function setVisible(visible) {
	var root = getRootObject();
	if (!root) return;

	var scriptObj = getScriptSceneObject();
	if (scriptObj && root === scriptObj) {
		// Do not disable the script host object or updates/callbacks stop.
		if (!root.enabled) {
			root.enabled = true;
		}
		if (visible) {
			root.getTransform().setLocalScale(baseScale);
		} else {
			root.getTransform().setLocalScale(new vec3(0, 0, 0));
		}
		return;
	}

	root.enabled = visible;
}

function playNotificationSound() {
	if (!script.notificationAudio) return;

	try {
		if (script.notificationAudio.isPlaying()) {
			script.notificationAudio.stop(false);
		}
	} catch (e) {}

	script.notificationAudio.play(1);
}

function cancelHideEvent() {
	if (hideEvent) {
		hideEvent.enabled = false;
		hideEvent = null;
	}
}

function scheduleHideAndNext() {
	cancelHideEvent();

	var duration = Math.max(0.5, script.displayDuration || 2.2);
	hideEvent = script.createEvent("DelayedCallbackEvent");
	hideEvent.bind(function () {
		hideEvent = null;
		hideNow();
		showNextInQueue();
	});
	hideEvent.reset(duration);
}

function hideNow() {
	cancelHideEvent();
	isShowing = false;
	activeAchievementId = null;
	setVisible(false);
}

function showNextInQueue() {
	if (queue.length === 0) {
		hideNow();
		return;
	}

	activeAchievementId = queue.shift();
	delete queuedLookup[activeAchievementId];

	var data = getAchievementData(activeAchievementId);
	setTextOnObject(script.titleLabelObject, data.name);
	setTextOnObject(script.descriptionLabelObject, data.description);
	applyIconTexture(activeAchievementId);

	setVisible(true);
	playNotificationSound();
	isShowing = true;

	scheduleHideAndNext();
	print("AchievementNotification: Showing '" + activeAchievementId + "'");
}

function enqueue(achievementIds) {
	if (achievementIds === undefined || achievementIds === null) return;

	var list = achievementIds;
	if (Object.prototype.toString.call(list) !== "[object Array]") {
		list = [list];
	}

	for (var i = 0; i < list.length; i++) {
		var id = normalizeAchievementId(list[i]);
		if (!id) continue;
		if (id === activeAchievementId) continue;
		if (queuedLookup[id]) continue;

		queue.push(id);
		queuedLookup[id] = true;
	}

	if (!isShowing) {
		showNextInQueue();
	}
}

function showImmediate(achievementId) {
	clearQueue();
	hideNow();
	enqueue(achievementId);
}

function clearQueue() {
	queue = [];
	queuedLookup = {};
}

function trySubscribeToSaveEvents() {
	if (subscribedToSaveEvents) return;

	var now = getTime();
	if (now - lastSubscribeAttempt < 0.5) return;
	lastSubscribeAttempt = now;

	if (global.PathFinder && global.PathFinder.Save && global.PathFinder.Save.onAchievementsUnlocked) {
		global.PathFinder.Save.onAchievementsUnlocked(enqueue);
		subscribedToSaveEvents = true;
		print("AchievementNotification: Connected to SaveManager unlock events");
	}
}

function update() {
	trySubscribeToSaveEvents();
}

function initialize() {
	var root = getRootObject();
	if (root) {
		baseScale = root.getTransform().getLocalScale();
		if (baseScale.x === 0 && baseScale.y === 0 && baseScale.z === 0) {
			baseScale = new vec3(1, 1, 1);
		}
	}

	buildIconMap();
	resolveIconComponents();
	setupIconMaterials();

	hideNow();
	trySubscribeToSaveEvents();
}

function setupUpdateEvent() {
	var updateEvent = script.createEvent("UpdateEvent");
	updateEvent.bind(function () {
		update();
	});
}

script.createEvent("OnStartEvent").bind(function () {
	initialize();
	setupUpdateEvent();
});

script.enqueue = enqueue;
script.showImmediate = showImmediate;
script.hide = hideNow;
script.clearQueue = clearQueue;

global.PathFinder = global.PathFinder || {};
global.PathFinder.AchievementNotification = {
	enqueue: enqueue,
	show: showImmediate,
	hide: hideNow,
	clearQueue: clearQueue,
};
