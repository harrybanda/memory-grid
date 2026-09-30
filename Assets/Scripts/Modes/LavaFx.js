// LavaFx.js
// Floor Is Lava visuals. "Draw only the glow": every layer is additive light, so black adds nothing and
// the real floor between the lava veins reads as the dark crust.
//
// Per tile: a glowing frame (plate), a textured lava core that grows during the warning and flares
// on landing, and a tapered flame tongue that turns to face the player. Shared: the safe beacon
// (ground ring, light pillar, rising rings), a shock ring on the floor, and a burn glow along the bottom
// of the view. Warm squares and tongues mean danger; cool circles and a thin pillar mean safety.
// Everything is built once and reused across sessions; nothing is created or destroyed per wave.

var Helpers = require("./ModeHelpers");
var Meshes = require("./LavaFxMeshes");

var FX = {
	PLATE_LIFT: 0.8, // cm above the floor plane (the hidden tile boxes' tops are at +0.5)
	CORE_LIFT: 1.2,
	RING_LIFT: 1.6,

	FLAME_HEIGHT: 200, // tall enough to reach eye level from the next tile
	FLAME_RISE: 0.22,
	FLAME_SINK: 0.3,
	FLAME_BRIGHTNESS: 0.95,
	FLAME_FADE_NEAR: 30, // horizontal cm from the head: flames fade out here so none fills the view
	FLAME_FADE_FAR: 50,
	IGNITE_STAGGER: 0.04, // seconds per tile outward from the player

	BEAM_HEIGHT: 230,
	BEAM_BRIGHTNESS: 0.85,
	BEAM_FADE_NEAR: 25,
	BEAM_FADE_FAR: 60,
	BREATHE_HZ: 0.8,
	GROUND_RING_RADIUS: 21,
	RISE_PERIOD: 1.6,
	RISE_HEIGHT: 200,

	FLARE_TIME: 0.25,
	VIGNETTE_POSITION: new vec3(0, -27, -90), // camera-local: below the HUD, outside the near field
	VIGNETTE_ATTACK: 0.06,
	VIGNETTE_RELEASE: 0.35,
	VIGNETTE_BRIGHTNESS: 0.45,
};

// Additive tints (rgb scaled by an intensity; alpha stays 1)
var TINT = {
	IDLE: new vec3(0.55, 0.65, 0.75),
	SAFE: new vec3(0.25, 0.95, 1.0),
	WARN_RIM: new vec3(1.0, 0.62, 0.12),
	WARN_CORE: new vec3(1.0, 0.45, 0.1),
	LAVA_RIM: new vec3(1.0, 0.8, 0.45),
	LAVA_CORE: new vec3(1.0, 1.0, 1.0),
	CRUST: new vec3(1.0, 0.25, 0.05),
	CLEAR: new vec3(0.35, 1.0, 0.55),
	OUT: new vec3(1.0, 0.35, 0.1),
	OUT_CORE: new vec3(1.0, 0.45, 0.2),
	BURN: new vec3(1.0, 0.3, 0.06),
	SHOCK: new vec3(1.0, 0.5, 0.1),
};

var IDLE_LEVEL = 0.45;

var Flame = {
	OFF: 0,
	WAITING: 1,
	RISING: 2,
	BURNING: 3,
	SINKING: 4,
};

/**
 * Builds the Lava visuals
 * @param {Object} options - {parent, cameraObject, scrollMaterial, glowMaterial, lavaTexture, flameTexture, rows, columns}
 * @returns {Object} The visuals API, or null when an input is missing
 */
function create(options) {
	if (!options.scrollMaterial || !options.glowMaterial || !options.lavaTexture || !options.flameTexture || !options.cameraObject) {
		print("LavaFx: Missing a material, texture or camera input; the lava visuals are off");
		return null;
	}

	var parent = options.parent;
	var rows = options.rows;
	var columns = options.columns;
	var camera = options.cameraObject;

	var now = 0;
	var placed = false;
	var gridMatrix = null;
	var gridInverse = null;
	var gridRotation = null;
	var gridUp = null;

	var tiles = [];
	var scrollers = [];
	var warnTiles = [];
	var flareTime = 0;
	var vignetteTime = -1;
	var safe = { tile: null, withBeam: false, start: 0 };
	var shock = { active: false, time: 0, duration: 0, from: 0, to: 0, color: null };

	// ---------- build ----------

	for (var z = 0; z < rows; z++) {
		tiles[z] = [];
		for (var x = 0; x < columns; x++) {
			tiles[z][x] = buildTile(x, z);
		}
	}

	var beam = glowCard("LavaBeam", Meshes.beam(), options.flameTexture, new vec2(1, 2.2), new vec2(0, -0.6));
	var groundRing = glow("LavaGroundRing", Meshes.ring());
	var riseRings = [glow("LavaRiseRing0", Meshes.ring()), glow("LavaRiseRing1", Meshes.ring())];
	var shockRing = glow("LavaShockRing", Meshes.ring());
	var vignette = Helpers.createMeshVisual(camera, "LavaBurnGlow", Meshes.strip(), options.glowMaterial);
	vignette.object.getTransform().setLocalPosition(FX.VIGNETTE_POSITION);

	function buildTile(x, z) {
		var name = "Lava" + x + z;
		var variant = (x + z) % 3;
		var tile = {
			x: x,
			z: z,
			centre: null,
			plate: glow(name + "Plate", Meshes.plate()),
			plateColor: tween(TINT.IDLE.uniformScale(IDLE_LEVEL)),
			plateQueue: [],
			core: glowCard(name + "Core", Meshes.core(), options.lavaTexture, new vec2(0.9 + 0.1 * variant, 0.9 + 0.1 * variant), new vec2(0.012, 0.02)),
			coreOn: false,
			coreScale: 1,
			coreColor: tween(new vec3(0, 0, 0)),
			coreOffAtEnd: false,
			coreTurn: ((x + 2 * z) % 4) * (Math.PI / 2), // so the tiles don't look copy-pasted
			flame: glowCard(name + "Flame", Meshes.flame(), options.flameTexture, new vec2(1, 1.4), new vec2((Math.random() - 0.5) * 0.04, -0.85 + (Math.random() - 0.5) * 0.16)),
			flameState: Flame.OFF,
			flameTime: 0,
			flameDelay: 0,
			flamePhase: [0, 0, 0],
			flameBase: null,
		};
		return tile;
	}

	function glow(name, mesh) {
		return Helpers.createMeshVisual(parent, name, mesh, options.glowMaterial);
	}

	// Textured cards scroll their texture from script: the material's own UV animation switch isn't
	// reachable from script, so each frame sets the UV2 offset (wrapped to 0-1; the textures tile)
	function glowCard(name, mesh, texture, uvScale, uvScroll) {
		var visual = Helpers.createMeshVisual(parent, name, mesh, options.scrollMaterial, {
			texture: texture,
			uvScale: uvScale,
		});
		scrollers.push({ visual: visual, speed: uvScroll });
		return visual;
	}

	function updateScroll() {
		for (var i = 0; i < scrollers.length; i++) {
			var scroller = scrollers[i];
			if (!scroller.visual.object.enabled) continue;
			var u = scroller.speed.x * now;
			var v = scroller.speed.y * now;
			scroller.visual.pass.uv2Offset = new vec2(u - Math.floor(u), v - Math.floor(v));
		}
	}

	// ---------- small utilities ----------

	function tween(value) {
		return { value: value, from: value, to: value, time: 0, duration: 0, active: false };
	}

	function tweenTo(state, target, duration) {
		state.from = state.value;
		state.to = target;
		state.time = 0;
		state.duration = duration || 0;
		state.active = state.duration > 0;
		if (!state.active) state.value = target;
	}

	/**
	 * @returns {boolean} True on the frame the tween finishes
	 */
	function stepTween(state, dt) {
		if (!state.active) return false;
		state.time += dt;
		var k = Helpers.smoothstep(0, 1, state.time / state.duration);
		state.value = vec3.lerp(state.from, state.to, k);
		if (state.time >= state.duration) {
			state.value = state.to;
			state.active = false;
			return true;
		}
		return false;
	}

	function setColor(visual, color, intensity) {
		var k = intensity === undefined ? 1 : intensity;
		visual.pass.baseColor = new vec4(color.x * k, color.y * k, color.z * k, 1);
	}

	function toWorld(local, lift) {
		return gridMatrix.multiplyPoint(new vec3(local.x, lift, local.z));
	}

	function faceCamera(transform, base, cameraWorld) {
		var toCamera = cameraWorld.sub(base);
		var flat = toCamera.sub(gridUp.uniformScale(toCamera.dot(gridUp)));
		if (flat.length < 1) return;
		transform.setWorldRotation(quat.lookAt(flat.normalize(), gridUp));
	}

	function chebyshev(a, b) {
		return Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));
	}

	function forEachTile(fn) {
		for (var z = 0; z < rows; z++) {
			for (var x = 0; x < columns; x++) {
				fn(tiles[z][x]);
			}
		}
	}

	function easeOutBack(t) {
		var c1 = 1.70158;
		var c3 = c1 + 1;
		return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
	}

	// ---------- per-tile pieces ----------

	function setPlate(tile, color, duration) {
		tile.plateQueue = [];
		tweenTo(tile.plateColor, color, duration);
	}

	function queuePlate(tile, delay, color, duration) {
		tile.plateQueue.push({ at: now + delay, color: color, duration: duration });
	}

	function setCore(tile, scale, color, duration, offAtEnd) {
		if (!tile.coreOn) {
			tile.coreOn = true;
			tile.coreColor = tween(new vec3(0, 0, 0));
			tile.core.object.enabled = true;
		}
		if (scale !== tile.coreScale) {
			tile.coreScale = scale;
			tile.core.object.getTransform().setWorldScale(new vec3(scale, 1, scale));
		}
		tweenTo(tile.coreColor, color, duration);
		tile.coreOffAtEnd = !!offAtEnd;
		if (offAtEnd && !tile.coreColor.active) coreOff(tile);
	}

	function coreOff(tile) {
		tile.coreOn = false;
		tile.coreOffAtEnd = false;
		tile.core.object.enabled = false;
	}

	function fadeCore(tile, duration) {
		if (tile.coreOn) setCore(tile, tile.coreScale, new vec3(0, 0, 0), duration, true);
	}

	function ignite(tile, delay) {
		tile.flameState = Flame.WAITING;
		tile.flameTime = 0;
		tile.flameDelay = delay;
		tile.flamePhase = [Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28];
	}

	function sink(tile) {
		if (tile.flameState === Flame.WAITING) {
			tile.flameState = Flame.OFF;
		} else if (tile.flameState === Flame.RISING || tile.flameState === Flame.BURNING) {
			tile.flameState = Flame.SINKING;
			tile.flameTime = 0;
		}
	}

	function updatePlate(tile, dt) {
		while (tile.plateQueue.length > 0 && tile.plateQueue[0].at <= now) {
			var step = tile.plateQueue.shift();
			tweenTo(tile.plateColor, step.color, step.duration);
		}
		stepTween(tile.plateColor, dt);
		setColor(tile.plate, tile.plateColor.value);
	}

	function updateCore(tile, dt) {
		if (!tile.coreOn) return;
		var finished = stepTween(tile.coreColor, dt);
		if (finished && tile.coreOffAtEnd) {
			coreOff(tile);
			return;
		}
		setColor(tile.core, tile.coreColor.value);
	}

	function updateFlame(tile, dt, head, cameraWorld, flare) {
		if (tile.flameState === Flame.OFF) return;
		tile.flameTime += dt;

		if (tile.flameState === Flame.WAITING) {
			if (tile.flameTime < tile.flameDelay) return;
			tile.flameState = Flame.RISING;
			tile.flameTime = 0;
		}

		var height = 1;
		var brightness = 1;
		if (tile.flameState === Flame.RISING) {
			var rise = Math.min(1, tile.flameTime / FX.FLAME_RISE);
			height = 0.05 + 0.95 * easeOutBack(rise);
			brightness = 0.45 + 0.55 * Math.min(1, tile.flameTime / 0.12);
			if (rise >= 1) {
				tile.flameState = Flame.BURNING;
				tile.flameTime = 0;
			}
		} else if (tile.flameState === Flame.SINKING) {
			var fall = Math.min(1, tile.flameTime / FX.FLAME_SINK);
			height = 1 - fall * fall;
			brightness = 1 - fall;
			if (fall >= 1) {
				tile.flameState = Flame.OFF;
				tile.flame.object.enabled = false;
				return;
			}
		}

		// Slow, smooth flicker with a per-tile phase (never a flash)
		var p = tile.flamePhase;
		var tau = Math.PI * 2;
		var flickerY = 1 + 0.05 * Math.sin(tau * 1.7 * now + p[0]) + 0.03 * Math.sin(tau * 3.1 * now + p[1]);
		var flickerX = 1 + 0.04 * Math.sin(tau * 2.3 * now + p[2]);
		var flickerB = 1 + 0.08 * Math.sin(tau * 1.3 * now + p[1]);
		height *= flickerY * (1 + 0.12 * flare);
		brightness *= flickerB * (1 + 0.3 * flare) * FX.FLAME_BRIGHTNESS;

		// A flame on the player's own tile would fill the view from inside the head volume
		brightness *= Helpers.smoothstep(FX.FLAME_FADE_NEAR, FX.FLAME_FADE_FAR, Helpers.horizontalDistance(head, tile.centre));

		var visible = brightness > 0.02 && height > 0.01;
		tile.flame.object.enabled = visible;
		if (!visible) return;

		var transform = tile.flame.object.getTransform();
		transform.setWorldScale(new vec3(flickerX, FX.FLAME_HEIGHT * height, 1));
		faceCamera(transform, tile.flameBase, cameraWorld);
		tile.flame.pass.baseColor = new vec4(brightness, brightness, brightness, 1);
	}

	// ---------- shared pieces ----------

	function updateSafe(head, cameraWorld) {
		if (!safe.tile) return;
		var centre = tiles[safe.tile.z][safe.tile.x].centre;
		var breathe = 0.875 + 0.125 * Math.sin(Math.PI * 2 * FX.BREATHE_HZ * now);
		setColor(groundRing, TINT.SAFE, 0.9 * breathe);

		if (!safe.withBeam) return;
		var fade = Helpers.smoothstep(FX.BEAM_FADE_NEAR, FX.BEAM_FADE_FAR, Helpers.horizontalDistance(head, centre));

		var beamBrightness = FX.BEAM_BRIGHTNESS * breathe * fade;
		beam.object.enabled = beamBrightness > 0.02;
		if (beam.object.enabled) {
			faceCamera(beam.object.getTransform(), toWorld(centre, 0), cameraWorld);
			setColor(beam, TINT.SAFE, beamBrightness);
		}

		for (var i = 0; i < riseRings.length; i++) {
			var cycle = (now - safe.start) / FX.RISE_PERIOD + i / riseRings.length;
			var phase = cycle - Math.floor(cycle);
			var alpha = Helpers.smoothstep(0, 0.15, phase) * (1 - Helpers.smoothstep(0.7, 1, phase)) * fade;
			var ring = riseRings[i];
			ring.object.enabled = alpha > 0.02;
			if (!ring.object.enabled) continue;
			var radius = 16 - 6 * phase;
			var transform = ring.object.getTransform();
			transform.setWorldPosition(toWorld(centre, FX.RING_LIFT + FX.RISE_HEIGHT * phase));
			transform.setWorldScale(new vec3(radius, 1, radius));
			setColor(ring, TINT.SAFE, 0.8 * alpha);
		}
	}

	function updateShock(dt) {
		if (!shock.active) return;
		shock.time += dt;
		var t = shock.time / shock.duration;
		if (t >= 1) {
			shock.active = false;
			shockRing.object.enabled = false;
			return;
		}
		var radius = shock.from + (shock.to - shock.from) * (1 - (1 - t) * (1 - t));
		shockRing.object.getTransform().setWorldScale(new vec3(radius, 1, radius));
		setColor(shockRing, shock.color, 1 - t);
	}

	function updateVignette(dt) {
		if (vignetteTime < 0) return;
		vignetteTime += dt;
		var envelope = vignetteTime < FX.VIGNETTE_ATTACK ? vignetteTime / FX.VIGNETTE_ATTACK : 1 - (vignetteTime - FX.VIGNETTE_ATTACK) / FX.VIGNETTE_RELEASE;
		if (envelope <= 0) {
			vignetteTime = -1;
			vignette.object.enabled = false;
			return;
		}
		vignette.object.enabled = true;
		setColor(vignette, TINT.BURN, FX.VIGNETTE_BRIGHTNESS * envelope);
	}

	function startShock(tile, color, from, to, duration) {
		var transform = shockRing.object.getTransform();
		transform.setWorldPosition(toWorld(tiles[tile.z][tile.x].centre, FX.RING_LIFT));
		transform.setWorldRotation(gridRotation);
		shock.active = true;
		shock.time = 0;
		shock.duration = duration;
		shock.from = from;
		shock.to = to;
		shock.color = color;
		shockRing.object.enabled = true;
	}

	// ---------- API ----------

	/**
	 * Lays the visuals onto this session's grid and shows the idle board
	 * @param {Object} gridManager - The session's GridManager
	 * @param {Array} centres - centres[z][x] tile centres in grid-local cm
	 */
	function place(gridManager, centres) {
		var gridTransform = gridManager.getGridParent().getTransform();
		gridMatrix = gridTransform.getWorldTransform();
		gridInverse = gridTransform.getInvertedWorldTransform();
		gridRotation = gridTransform.getWorldRotation();
		gridUp = gridTransform.up.normalize();

		hideAll();
		forEachTile(function (tile) {
			tile.centre = centres[tile.z][tile.x];
			tile.flameBase = toWorld(tile.centre, 0);

			var plate = tile.plate.object.getTransform();
			plate.setWorldPosition(toWorld(tile.centre, FX.PLATE_LIFT));
			plate.setWorldRotation(gridRotation);

			var core = tile.core.object.getTransform();
			core.setWorldPosition(toWorld(tile.centre, FX.CORE_LIFT));
			core.setWorldRotation(gridRotation.multiply(quat.angleAxis(tile.coreTurn, vec3.up())));
			tile.coreScale = -1; // forces the next setCore to apply its scale

			tile.flame.object.getTransform().setWorldPosition(tile.flameBase);

			tile.plateColor = tween(TINT.IDLE.uniformScale(IDLE_LEVEL));
			setColor(tile.plate, tile.plateColor.value);
			tile.plate.object.enabled = true;
		});

		groundRing.object.getTransform().setWorldRotation(gridRotation);
		groundRing.object.getTransform().setWorldScale(new vec3(FX.GROUND_RING_RADIUS, 1, FX.GROUND_RING_RADIUS));
		for (var i = 0; i < riseRings.length; i++) {
			riseRings[i].object.getTransform().setWorldRotation(gridRotation);
		}
		placed = true;
	}

	function update(dt) {
		if (!placed) return;
		now += dt;
		var cameraWorld = camera.getTransform().getWorldPosition();
		var head = gridInverse.multiplyPoint(cameraWorld);

		flareTime = Math.max(0, flareTime - dt);
		var flare = flareTime / FX.FLARE_TIME;

		forEachTile(function (tile) {
			updatePlate(tile, dt);
			updateCore(tile, dt);
			updateFlame(tile, dt, head, cameraWorld, flare);
		});
		updateSafe(head, cameraWorld);
		updateShock(dt);
		updateVignette(dt);
		updateScroll();
	}

	/**
	 * Back to the idle board: frames cool white, cores fade, flames sink
	 */
	function resetBoard(duration) {
		var fade = duration === undefined ? 0.15 : duration;
		warnTiles = [];
		forEachTile(function (tile) {
			setPlate(tile, TINT.IDLE.uniformScale(IDLE_LEVEL), fade);
			fadeCore(tile, fade);
			sink(tile);
		});
	}

	/**
	 * Plate looks the controller sets directly: "idle", "settle" (the tile that counts while settling) or "safe"
	 */
	function setPlateLook(x, z, look, duration) {
		var color = TINT.IDLE.uniformScale(IDLE_LEVEL);
		if (look === "settle") color = TINT.SAFE.uniformScale(0.45);
		if (look === "safe") color = TINT.SAFE;
		setPlate(tiles[z][x], color, duration === undefined ? 0.15 : duration);
	}

	/**
	 * The safe target: cyan frame and ground ring, plus the light pillar unless it's a FREEZE
	 */
	function setSafe(tile, withBeam) {
		hideSafe();
		safe.tile = { x: tile.x, z: tile.z };
		safe.withBeam = withBeam;
		safe.start = now;
		var centre = tiles[tile.z][tile.x].centre;
		setPlate(tiles[tile.z][tile.x], TINT.SAFE, 0.15);
		groundRing.object.getTransform().setWorldPosition(toWorld(centre, FX.RING_LIFT));
		groundRing.object.enabled = true;
		if (withBeam) {
			var transform = beam.object.getTransform();
			transform.setWorldPosition(toWorld(centre, 0));
			transform.setWorldScale(new vec3(1, FX.BEAM_HEIGHT, 1));
		}
	}

	function hideBeam() {
		safe.withBeam = false;
		beam.object.enabled = false;
		for (var i = 0; i < riseRings.length; i++) {
			riseRings[i].object.enabled = false;
		}
	}

	function hideSafe() {
		hideBeam();
		safe.tile = null;
		groundRing.object.enabled = false;
	}

	/**
	 * Marks the tiles that will burn: their cores start as a small dim patch of cracks
	 * @param {Array} list - [{x, z}]
	 */
	function setWarnTiles(list) {
		warnTiles = [];
		for (var i = 0; i < list.length; i++) {
			var tile = tiles[list[i].z][list[i].x];
			warnTiles.push(tile);
			setCore(tile, 0.25, TINT.WARN_CORE.uniformScale(0.25), 0);
		}
	}

	/**
	 * Warning frame: the frames breathe amber and the cracks spread across the tile as the warning runs
	 * @param {number} pulse - 0-1 pulse value (the caller caps its rate)
	 * @param {number} progress - 0-1 through the warning
	 */
	function setWarnLevel(pulse, progress) {
		var rim = TINT.WARN_RIM.uniformScale(0.55 + 0.45 * pulse);
		var scale = 0.25 + 0.7 * Math.pow(progress, 0.7);
		var core = TINT.WARN_CORE.uniformScale(0.25 + 0.45 * progress);
		for (var i = 0; i < warnTiles.length; i++) {
			setPlate(warnTiles[i], rim, 0);
			setCore(warnTiles[i], scale, core, 0);
		}
	}

	/**
	 * The lava lands: cores flare, frames go white-hot and flames shoot up, rolling outward from the player
	 * @param {Array} list - [{x, z}] burning tiles
	 * @param {Object} origin - {x, z} the player's tile
	 */
	function igniteTiles(list, origin) {
		warnTiles = [];
		for (var i = 0; i < list.length; i++) {
			var tile = tiles[list[i].z][list[i].x];
			setPlate(tile, TINT.LAVA_RIM, 0);
			setCore(tile, 1, TINT.LAVA_CORE, 0);
			ignite(tile, FX.IGNITE_STAGGER * chebyshev(tile, origin));
		}
	}

	/**
	 * After a wave: flames sink, cores crust over and fade, frames go back to idle
	 */
	function cool(duration) {
		hideSafe();
		forEachTile(function (tile) {
			sink(tile);
			if (tile.coreOn) setCore(tile, tile.coreScale, TINT.CRUST.uniformScale(0.12), duration, true);
			setPlate(tile, TINT.IDLE.uniformScale(IDLE_LEVEL), 0.3);
		});
	}

	function sinkFlames() {
		forEachTile(sink);
	}

	/**
	 * Burned: nearby flames flare, a warm glow along the bottom of the view, and a shock ring across the floor
	 */
	function burnFlash(tile) {
		flareTime = FX.FLARE_TIME;
		vignetteTime = 0;
		if (tile) startShock(tile, TINT.SHOCK.uniformScale(0.9), 15, 90, 0.5);
	}

	/**
	 * Survived a wave: a cyan ring from the player's tile
	 */
	function safePing(tile) {
		if (tile) startShock(tile, TINT.SAFE.uniformScale(0.7), 15, 70, 0.45);
	}

	/**
	 * GO!: the frames light up once from the far row to the near one, then settle back
	 */
	function goSweep() {
		forEachTile(function (tile) {
			var delay = 0.06 * tile.z;
			queuePlate(tile, delay, TINT.IDLE, 0.06);
			queuePlate(tile, delay + 0.12, TINT.IDLE.uniformScale(IDLE_LEVEL), 0.3);
		});
	}

	/**
	 * Level clear: a green ripple outward from the player's tile, then the board holds green
	 */
	function clearRipple(origin) {
		hideSafe();
		forEachTile(function (tile) {
			sink(tile);
			fadeCore(tile, 0.3);
			tile.plateQueue = [];
			var delay = 0.09 * chebyshev(tile, origin);
			queuePlate(tile, delay, TINT.CLEAR, 0.15);
			queuePlate(tile, delay + 0.45, TINT.CLEAR.uniformScale(0.6), 0.5);
		});
	}

	/**
	 * Out of lives: the whole board turns to embers and slowly dies down (no strobing)
	 */
	function burnedOut() {
		hideSafe();
		warnTiles = [];
		forEachTile(function (tile) {
			setPlate(tile, TINT.OUT.uniformScale(0.9), 0);
			queuePlate(tile, 0.02, TINT.OUT.uniformScale(0.4), 2.5);
			setCore(tile, 1, TINT.OUT_CORE.uniformScale(0.7), 0);
			setCore(tile, 1, TINT.OUT_CORE.uniformScale(0.2), 2.5);
		});
	}

	function hideAll() {
		warnTiles = [];
		forEachTile(function (tile) {
			tile.plateQueue = [];
			tile.plate.object.enabled = false;
			coreOff(tile);
			tile.flameState = Flame.OFF;
			tile.flame.object.enabled = false;
		});
		hideSafe();
		shock.active = false;
		shockRing.object.enabled = false;
		vignetteTime = -1;
		vignette.object.enabled = false;
		flareTime = 0;
		placed = false;
	}

	return {
		place: place,
		update: update,
		resetBoard: resetBoard,
		setPlateLook: setPlateLook,
		setSafe: setSafe,
		hideBeam: hideBeam,
		hideSafe: hideSafe,
		setWarnTiles: setWarnTiles,
		setWarnLevel: setWarnLevel,
		ignite: igniteTiles,
		cool: cool,
		sinkFlames: sinkFlames,
		burnFlash: burnFlash,
		safePing: safePing,
		goSweep: goSweep,
		clearRipple: clearRipple,
		burnedOut: burnedOut,
		hideAll: hideAll,
	};
}

module.exports = {
	create: create,
};
