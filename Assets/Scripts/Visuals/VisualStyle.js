// VisualStyle.js
// Scene-level holder for the shared glow material. GridManager lives in the per-session Surface prefab,
// which can't be edited here, so it reads the material from global.PathFinder.VisualStyle instead of an input.
// Without this object the grid falls back to its plain box tiles.

// @input Asset.Material glowMaterial {"label": "Glow Material", "hint": "LavaFX_Glow: additive, vertex colour only"}

global.PathFinder = global.PathFinder || {};
global.PathFinder.VisualStyle = {
	glowMaterial: script.glowMaterial,
};
