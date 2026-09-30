// MenuCards.js
// Fills the main menu's mode cards at runtime: a board icon on the left, the mode's name and a one-line rule.
// The cards are the UI Kit RectangleButtons already in the scene (sized and placed in the editor) and
// MainMenuManager still binds them, so this only adds what's drawn on them.

// @input SceneObject classicCard {"label": "Classic Card"}
// @input SceneObject minefieldCard {"label": "Minefield Card"}
// @input SceneObject tonePadsCard {"label": "Tone Pads Card"}
// @input SceneObject lavaCard {"label": "Floor Is Lava Card"}
// @input Asset.Texture classicIcon {"label": "Classic Icon"}
// @input Asset.Texture minefieldIcon {"label": "Minefield Icon"}
// @input Asset.Texture tonePadsIcon {"label": "Tone Pads Icon"}
// @input Asset.Texture lavaIcon {"label": "Floor Is Lava Icon"}
// @input Asset.Material iconMaterial {"label": "Icon Material", "hint": "An unlit image material with a baseTex (cloned per icon)"}

var GlowMeshes = require("../Visuals/GlowMeshes");
var Constants = require("../Utils/Constants");

// mode: key in global.PathFinder.Modes, where each mode publishes its levelCount (Classic's comes from Constants)
// tag: the level-count tag's colour, matching the mode's icon
var CARDS = [
	{ card: "classicCard", icon: "classicIcon", mode: "classic", name: "CLASSIC", rule: "Watch the path light up,\nthen walk it from memory", tag: new vec4(0.16, 0.7, 0.38, 0.95) },
	{ card: "minefieldCard", icon: "minefieldIcon", mode: "minefield", name: "MINEFIELD", rule: "Remember the mines, then\ncross to the blue tile", tag: new vec4(0.8, 0.22, 0.18, 0.95) },
	{ card: "tonePadsCard", icon: "tonePadsIcon", mode: "tonepads", name: "TONE PADS", rule: "Watch the pads play a tune,\nthen step it back in order", tag: new vec4(0.7, 0.25, 0.75, 0.95) },
	{ card: "lavaCard", icon: "lavaIcon", mode: "lava", name: "FLOOR IS LAVA", rule: "Get to a safe tile\nbefore the lava lands", tag: new vec4(0.92, 0.45, 0.08, 0.95) },
];

// Card layout in the card's own cm (cards are about 16.5 x 9.5)
var Layout = {
	ICON_X: -5.1,
	ICON_SIZE: 6.2,
	TEXT_X: 3.2, // centre of the text column, which starts just right of the icon
	TEXT_HALF_WIDTH: 4.6,
	NAME_Y: 2.3,
	NAME_SIZE: 44,
	RULE_Y: -1.3,
	RULE_SIZE: 28, // readable at arm's length on the glasses (about 0.7cm letters)
	RULE_COLOR: new vec4(0.72, 0.78, 0.86, 1),
	LIFT: 0.15, // in front of the button face

	// Level-count tag, straddling the card's top-right corner (cards are 16.5 x 9.5)
	TAG_X: 5.6,
	TAG_Y: 4.75,
	TAG_HALF_WIDTH: 2.1,
	TAG_SIZE: 24,
	TAG_RENDER_ORDER: 100, // drawn after the logo image, whose faint backdrop would otherwise cover the top tags
	TAG_PADDING: 0.35,
	TAG_CORNER: 0.45,
};

/**
 * How many levels a mode has right now, or 0 if it can't be found
 */
function levelCount(mode) {
	if (mode === "classic") return Constants.LevelConfig.LEVEL_COUNT;
	var modes = global.PathFinder && global.PathFinder.Modes;
	return modes && modes[mode] && modes[mode].levelCount ? modes[mode].levelCount : 0;
}

/**
 * A small coloured pill with the mode's level count, sticking out of the card's top-right corner
 */
function addLevelTag(card, spec, font) {
	var count = levelCount(spec.mode);
	if (!count) return;

	var object = global.scene.createSceneObject("LevelTag");
	object.setParent(card);
	object.getTransform().setLocalPosition(new vec3(Layout.TAG_X, Layout.TAG_Y, Layout.LIFT * 2));
	var tag = object.createComponent("Component.Text");
	tag.font = font;
	tag.text = count + (count === 1 ? " LEVEL" : " LEVELS");
	tag.size = Layout.TAG_SIZE;
	tag.horizontalAlignment = HorizontalAlignment.Center;
	tag.verticalAlignment = VerticalAlignment.Center;
	tag.worldSpaceRect = Rect.create(-Layout.TAG_HALF_WIDTH, Layout.TAG_HALF_WIDTH, -0.6, 0.6);
	tag.depthTest = false;
	tag.setRenderOrder(Layout.TAG_RENDER_ORDER);
	tag.textFill.color = new vec4(1, 1, 1, 1);

	var background = tag.backgroundSettings;
	background.enabled = true;
	background.fill.color = spec.tag;
	background.cornerRadius = Layout.TAG_CORNER;
	background.margins = Rect.create(Layout.TAG_PADDING, Layout.TAG_PADDING, Layout.TAG_PADDING * 0.6, Layout.TAG_PADDING * 0.6);
}

function findText(object) {
	var text = object.getComponent("Component.Text");
	if (text) return text;
	for (var i = 0; i < object.getChildrenCount(); i++) {
		var found = findText(object.getChild(i));
		if (found) return found;
	}
	return null;
}

function placeText(text, y, size, halfHeight) {
	text.getSceneObject().getTransform().setLocalPosition(new vec3(Layout.TEXT_X, y, Layout.LIFT));
	text.size = size;
	text.horizontalAlignment = HorizontalAlignment.Left;
	text.verticalAlignment = VerticalAlignment.Center;
	text.worldSpaceRect = Rect.create(-Layout.TEXT_HALF_WIDTH, Layout.TEXT_HALF_WIDTH, -halfHeight, halfHeight);
	text.depthTest = false;
}

function decorate(card, spec, icon) {
	// The button's own label becomes the name, top right
	var name = findText(card);
	if (!name) {
		print("MenuCards: No label on " + card.name);
		return;
	}
	name.text = spec.name;
	placeText(name, Layout.NAME_Y, Layout.NAME_SIZE, 1.5);

	var ruleObject = global.scene.createSceneObject("Rule");
	ruleObject.setParent(card);
	var rule = ruleObject.createComponent("Component.Text");
	rule.font = name.font;
	rule.text = spec.rule;
	rule.textFill.color = Layout.RULE_COLOR;
	placeText(rule, Layout.RULE_Y, Layout.RULE_SIZE, 2.6);

	addLevelTag(card, spec, name.font);

	if (icon && script.iconMaterial) {
		var iconObject = global.scene.createSceneObject("Icon");
		iconObject.setParent(card);
		var transform = iconObject.getTransform();
		transform.setLocalPosition(new vec3(Layout.ICON_X, 0, Layout.LIFT));
		transform.setLocalScale(new vec3(Layout.ICON_SIZE, Layout.ICON_SIZE, 1));
		var visual = iconObject.createComponent("Component.RenderMeshVisual");
		visual.mesh = GlowMeshes.panel();
		var material = script.iconMaterial.clone();
		material.mainPass.baseTex = icon;
		material.mainPass.depthTest = false;
		material.mainPass.twoSided = true;
		visual.mainMaterial = material;
		visual.setRenderOrder(name.getRenderOrder ? name.getRenderOrder() : 0);
	}
}

function initialize() {
	for (var i = 0; i < CARDS.length; i++) {
		var card = script[CARDS[i].card];
		if (card) decorate(card, CARDS[i], script[CARDS[i].icon]);
	}
}

script.createEvent("OnStartEvent").bind(initialize);
