// VisualStyle.js
// Scene-level holder for the shared glow materials and textures. GridManager lives in the per-session Surface
// prefab, which can't be edited here, so it (and the modes) read these from global.PathFinder.VisualStyle
// instead of inputs. Without this object the grid falls back to its plain box tiles.

// @input Asset.Material glowMaterial {"label": "Glow Material", "hint": "LavaFX_Glow: additive, vertex colour only"}
// @input Asset.Material scrollMaterial {"label": "Scroll Material", "hint": "LavaFX_Scroll: additive, textured, vertex colour, UV2 offset"}
// @input Asset.Texture hazardTexture {"label": "Hazard Stripes", "hint": "T_HazardStripes: caution-tape stripes for board borders"}

global.PathFinder = global.PathFinder || {};
global.PathFinder.VisualStyle = {
	glowMaterial: script.glowMaterial,
	scrollMaterial: script.scrollMaterial,
	hazardTexture: script.hazardTexture,
};
