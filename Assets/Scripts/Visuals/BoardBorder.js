// BoardBorder.js
// A "stay inside" border around a board: an amber caution-tape band on the floor whose stripes march slowly
// along the edge, and a low glowing curtain rising from it. Each side turns red and brightens as the player's
// body nears it, so the edge is felt before it's crossed. The near side can be an open gate (a cool entry
// line with no curtain) until the player steps on, then it closes behind them.
// Built once and reused; everything is additive light (black adds nothing on the see-through display).

var GlowMeshes = require("./GlowMeshes");

var Config = {
	STRIPE_PERIOD: 10, // cm of edge per stripe
	STRIPE_SPEED: 0.25, // stripes per second
	BAND_LIFT: 0.5,
	CURTAIN_OFFSET: 9, // cm outside the tile edge (the middle of the band)
	CURTAIN_HEIGHT: 35,
	GATE_TIME: 0.4, // seconds for the near side's curtain to rise when the gate closes
	WARN_DISTANCE: 20, // a side starts lighting up when the body is this close to it (cm, inside the board)
	FLASH_TIME: 0.8,
};

var HAZARD = new vec3(1.0, 0.72, 0.12);
var ALERT = new vec3(1.0, 0.18, 0.08);
var ENTRY = new vec3(0.55, 0.85, 1.0);

/**
 * @param {Object} options - {parent, glowMaterial, scrollMaterial, stripeTexture}
 * @returns {Object} The border API, or null when a material or the texture is missing
 */
function create(options) {
	if (!options.glowMaterial || !options.scrollMaterial || !options.stripeTexture) {
		print("BoardBorder: Missing a material or the stripe texture; the border is off");
		return null;
	}

	var now = 0;
	var placed = false;
	var gateOpen = false;
	var gateRise = 1; // 0-1 height of the near curtain
	var flashTime = 0;
	var bounds = null;

	var sides = ["near", "far", "left", "right"].map(function (name) {
		var band = GlowMeshes.createVisual(options.parent, "Border_" + name + "Band", GlowMeshes.ring(), options.scrollMaterial, {
			texture: options.stripeTexture,
		});
		var curtain = GlowMeshes.createVisual(options.parent, "Border_" + name + "Curtain", GlowMeshes.ring(), options.glowMaterial);
		return { name: name, band: band, curtain: curtain, alert: 0 };
	});

	function setColor(visual, color, intensity) {
		visual.pass.baseColor = new vec4(color.x * intensity, color.y * intensity, color.z * intensity, 1);
	}

	/**
	 * Lays the border around a board
	 * @param {Object} gridManager - The session's GridManager
	 * @param {Object} edges - {minX, maxX, minZ, maxZ}: the tiles' outer edges in grid-local cm
	 */
	function place(gridManager, edges) {
		bounds = edges;
		var gridTransform = gridManager.getGridParent().getTransform();
		var matrix = gridTransform.getWorldTransform();
		var rotation = gridTransform.getWorldRotation();
		var width = edges.maxX - edges.minX;
		var depth = edges.maxZ - edges.minZ;
		var cx = (edges.minX + edges.maxX) / 2;
		var cz = (edges.minZ + edges.maxZ) / 2;

		// Each side's local +z points out of the board; yaw turns +z to that direction
		var layout = {
			near: { centre: new vec3(cx, 0, edges.maxZ), yaw: 0, length: width },
			far: { centre: new vec3(cx, 0, edges.minZ), yaw: Math.PI, length: width },
			right: { centre: new vec3(edges.maxX, 0, cz), yaw: Math.PI / 2, length: depth },
			left: { centre: new vec3(edges.minX, 0, cz), yaw: -Math.PI / 2, length: depth },
		};

		for (var i = 0; i < sides.length; i++) {
			var side = sides[i];
			var spec = layout[side.name];
			var sideRotation = rotation.multiply(quat.angleAxis(spec.yaw, vec3.up()));

			side.band.visual.mesh = GlowMeshes.borderBand(spec.length, Config.STRIPE_PERIOD);
			side.band.object.getTransform().setWorldPosition(matrix.multiplyPoint(spec.centre.add(new vec3(0, Config.BAND_LIFT, 0))));
			side.band.object.getTransform().setWorldRotation(sideRotation);
			side.band.object.enabled = true;

			side.curtain.visual.mesh = GlowMeshes.borderCurtain(spec.length, Config.CURTAIN_OFFSET);
			side.curtain.object.getTransform().setWorldPosition(matrix.multiplyPoint(spec.centre));
			side.curtain.object.getTransform().setWorldRotation(sideRotation);
			side.alert = 0;
		}
		flashTime = 0;
		placed = true;
		setGateOpen(gateOpen, true);
	}

	/**
	 * Opens the near side as the way in, or closes it behind the player
	 * @param {boolean} open
	 * @param {boolean} instant - Skip the curtain rising
	 */
	function setGateOpen(open, instant) {
		gateOpen = open;
		if (open || instant) gateRise = open ? 0 : 1;
	}

	/**
	 * Every side flashes red once (someone left the board)
	 */
	function flash() {
		flashTime = Config.FLASH_TIME;
	}

	/**
	 * @param {number} dt
	 * @param {vec3} body - The player's body estimate in grid-local cm, or null
	 * @param {boolean} warn - Whether sides light up as the body nears them (only while the round is live)
	 */
	function update(dt, body, warn) {
		if (!placed) return;
		now += dt;
		flashTime = Math.max(0, flashTime - dt);
		if (!gateOpen && gateRise < 1) gateRise = Math.min(1, gateRise + dt / Config.GATE_TIME);

		var inward = body
			? {
					near: bounds.maxZ - body.z,
					far: body.z - bounds.minZ,
					right: bounds.maxX - body.x,
					left: body.x - bounds.minX,
				}
			: null;
		var stripes = now * Config.STRIPE_SPEED;
		stripes -= Math.floor(stripes);

		for (var i = 0; i < sides.length; i++) {
			var side = sides[i];
			var target = 0;
			if (warn && inward) {
				target = Math.max(0, Math.min(1, (Config.WARN_DISTANCE - inward[side.name]) / Config.WARN_DISTANCE));
			}
			// Rise fast, fall slower, so a lean doesn't flicker
			side.alert += (target - side.alert) * Math.min(1, dt * (target > side.alert ? 12 : 4));
			var alert = Math.max(side.alert, flashTime / Config.FLASH_TIME);

			var isGate = side.name === "near" && gateOpen;
			var color = isGate ? ENTRY : vec3.lerp(HAZARD, ALERT, alert);
			setColor(side.band, color, isGate ? 0.6 : 0.55 + 0.45 * alert);
			side.band.pass.uv2Offset = new vec2(stripes, 0);

			var height = side.name === "near" ? gateRise : 1;
			side.curtain.object.enabled = height > 0.01;
			if (side.curtain.object.enabled) {
				side.curtain.object.getTransform().setWorldScale(new vec3(1, Config.CURTAIN_HEIGHT * height, 1));
				setColor(side.curtain, color, 0.3 + 0.6 * alert);
			}
		}
	}

	function hide() {
		placed = false;
		for (var i = 0; i < sides.length; i++) {
			sides[i].band.object.enabled = false;
			sides[i].curtain.object.enabled = false;
		}
	}

	return {
		place: place,
		update: update,
		setGateOpen: setGateOpen,
		flash: flash,
		hide: hide,
	};
}

module.exports = {
	create: create,
};
