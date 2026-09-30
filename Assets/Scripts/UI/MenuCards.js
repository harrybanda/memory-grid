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

var CARDS = [
	{ card: "classicCard", icon: "classicIcon", name: "CLASSIC", rule: "Watch the path light up,\nthen walk it from memory" },
	{ card: "minefieldCard", icon: "minefieldIcon", name: "MINEFIELD", rule: "Remember the mines, then\ncross to the blue tile" },
	{ card: "tonePadsCard", icon: "tonePadsIcon", name: "TONE PADS", rule: "Watch the pads play a tune,\nthen step it back in order" },
	{ card: "lavaCard", icon: "lavaIcon", name: "FLOOR IS LAVA", rule: "Get to a safe tile\nbefore the lava lands" },
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
};

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
