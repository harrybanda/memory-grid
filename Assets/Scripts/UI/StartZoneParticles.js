// StartZoneParticles.js
// Rising zone particle effect for the start zone
// Particles lie flat (parallel to floor), rise straight up, and shrink + fade as they go

// @input Asset.ObjectPrefab particlePrefab {"label": "Particle Prefab", "hint": "PNG square outline prefab (flat on floor)"}

// @ui {"widget": "separator"}
// @ui {"widget": "label", "label": "Particle Settings"}
// @input float spawnRate = 2 {"label": "Spawn Rate", "hint": "Particles spawned per second"}
// @input float riseSpeed = 15 {"label": "Rise Speed (cm/s)", "hint": "How fast particles move straight up"}
// @input float lifetime = 3.0 {"label": "Lifetime (s)", "hint": "Seconds before particle is destroyed"}
// @input float startScale = 20 {"label": "Start Scale", "hint": "Initial particle scale (matches zone size)"}

/**
 * StartZoneParticles Component
 * Particles stay flat (parallel to floor), rise straight up on Y axis,
 * and smoothly shrink + alpha-fade as they rise. No XZ spread.
 */

var particles = [];
var isEmitting = false;
var spawnTimer = 0;

/**
 * Starts emitting particles
 */
function startEmitting() {
	isEmitting = true;
	spawnTimer = 0;
}

/**
 * Stops emitting and destroys all existing particles
 */
function stopEmitting() {
	isEmitting = false;

	for (var i = particles.length - 1; i >= 0; i--) {
		if (particles[i].object && !particles[i].object.isDestroyed) {
			particles[i].object.destroy();
		}
	}
	particles = [];
}

/**
 * Spawns a single particle at the center, flat on the floor
 */
function spawnParticle() {
	if (!script.particlePrefab) return;

	var parentObject = script.getSceneObject();
	var particle = script.particlePrefab.instantiate(parentObject);
	if (!particle) return;

	particle.enabled = true;

	var transform = particle.getTransform();

	// Spawn at center of zone, at floor level (y=0 in local space)
	transform.setLocalPosition(new vec3(0, 0, 0));

	// Keep the prefab's original rotation (flat on floor)
	// Don't override rotation — the prefab should already be oriented flat

	// Set initial scale
	var s = script.startScale || 20;
	transform.setLocalScale(new vec3(s, s, s));

	// Clone material for independent alpha control
	cloneMaterial(particle);

	particles.push({
		object: particle,
		age: 0,
	});
}

/**
 * Gets the visual component from a SceneObject (Image or RenderMeshVisual)
 * @param {SceneObject} obj - The object to search
 * @returns {Component} The visual component, or null
 */
function getVisual(obj) {
	if (!obj) return null;

	// Try Image first (most likely for PNG prefabs)
	var img = obj.getComponent("Component.Image");
	if (img) return img;

	// Fallback to RenderMeshVisual
	var mesh = obj.getComponent("Component.RenderMeshVisual");
	if (mesh) return mesh;

	return null;
}

/**
 * Clones the material on a particle (root + children) so alpha can change independently
 */
function cloneMaterial(obj) {
	if (!obj) return;

	var visual = getVisual(obj);
	if (visual && visual.mainMaterial) {
		visual.mainMaterial = visual.mainMaterial.clone();
	}

	for (var i = 0; i < obj.getChildrenCount(); i++) {
		var childVisual = getVisual(obj.getChild(i));
		if (childVisual && childVisual.mainMaterial) {
			childVisual.mainMaterial = childVisual.mainMaterial.clone();
		}
	}
}

/**
 * Sets alpha on a particle's visual component (root + children)
 * Works with both Image and RenderMeshVisual components
 */
function setAlpha(obj, alpha) {
	if (!obj) return;

	var visual = getVisual(obj);
	if (visual && visual.mainPass) {
		var c = visual.mainPass.baseColor;
		visual.mainPass.baseColor = new vec4(c.r, c.g, c.b, alpha);
	}

	for (var i = 0; i < obj.getChildrenCount(); i++) {
		var childVisual = getVisual(obj.getChild(i));
		if (childVisual && childVisual.mainPass) {
			var cc = childVisual.mainPass.baseColor;
			childVisual.mainPass.baseColor = new vec4(cc.r, cc.g, cc.b, alpha);
		}
	}
}

/**
 * Updates all particles: rise up, shrink, fade, destroy
 */
function updateParticles(deltaTime) {
	var lt = script.lifetime || 3.0;
	var speed = script.riseSpeed || 15;

	for (var i = particles.length - 1; i >= 0; i--) {
		var p = particles[i];

		if (!p.object || p.object.isDestroyed) {
			particles.splice(i, 1);
			continue;
		}

		p.age += deltaTime;

		// Progress 0 → 1 over lifetime
		var t = p.age / lt;

		if (t >= 1.0) {
			p.object.destroy();
			particles.splice(i, 1);
			continue;
		}

		// Move straight up (local Y only, no XZ drift)
		var transform = p.object.getTransform();
		var pos = transform.getLocalPosition();
		pos.y += speed * deltaTime;
		transform.setLocalPosition(pos);

		// Alpha fade only: 1.0 → 0.0 (no scale change)
		var alpha = 1.0 - t;
		setAlpha(p.object, alpha);
	}
}

// Main update loop
var updateEvent = script.createEvent("UpdateEvent");
updateEvent.bind(function (eventData) {
	var deltaTime = eventData.getDeltaTime();

	if (isEmitting && script.particlePrefab) {
		var rate = script.spawnRate || 2;
		spawnTimer += deltaTime;
		var spawnInterval = 1.0 / rate;

		while (spawnTimer >= spawnInterval) {
			spawnParticle();
			spawnTimer -= spawnInterval;
		}
	}

	if (particles.length > 0) {
		updateParticles(deltaTime);
	}
});

// Always emit — this effect is part of the start tile itself
script.createEvent("OnStartEvent").bind(function () {
	startEmitting();
});

// Export API
script.startEmitting = startEmitting;
script.stopEmitting = stopEmitting;
