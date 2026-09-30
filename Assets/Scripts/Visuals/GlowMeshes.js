// GlowMeshes.js
// Runtime glow meshes shared by the grid tiles and the game modes. Soft edges live in vertex alpha, so the
// additive materials need no mask textures. Each mesh is built once per lens run and shared by every visual.
//
// Vertex layout: position (cm), normal, texture0 (UV), color (RGBA). The glow materials (LavaFX_Glow,
// LavaFX_Scroll) use Vertex Color = Base Color, so a vertex's colour tints it and its alpha fades it.

var LAYOUT = [
	{ name: "position", components: 3 },
	{ name: "normal", components: 3, normalized: true },
	{ name: "texture0", components: 2 },
	{ name: "color", components: 4 },
];

var cache = {};

function MeshData() {
	this.vertices = [];
	this.indices = [];
	this.count = 0;
}

MeshData.prototype.vertex = function (x, y, z, normal, u, v, color, alpha) {
	this.vertices.push(x, y, z, normal[0], normal[1], normal[2], u, v, color[0], color[1], color[2], alpha);
	return this.count++;
};

MeshData.prototype.quad = function (a, b, c, d) {
	this.indices.push(a, b, c, a, c, d);
};

MeshData.prototype.build = function () {
	var builder = new MeshBuilder(LAYOUT);
	builder.topology = MeshTopology.Triangles;
	builder.indexType = MeshIndexType.UInt16;
	builder.appendVerticesInterleaved(this.vertices);
	builder.appendIndices(this.indices);
	builder.updateMesh();
	return builder.getMesh();
};

var UP = [0, 1, 0];
var FACING = [0, 0, 1];
var WHITE = [1, 1, 1];

/**
 * Concentric flat rectangles on XZ joined into bands; the first is filled unless `hollow`
 * @param {Array} rings - [{half, alpha}] or [{halfX, halfZ, alpha}] from the inside out, in cm
 * @param {number} uvSize - Width in cm that UV 0-1 spans
 * @param {boolean} hollow - Leave the inside of the first rectangle empty
 */
function squareRings(rings, uvSize, hollow) {
	var data = new MeshData();
	var corners = [
		[-1, -1],
		[1, -1],
		[1, 1],
		[-1, 1],
	];
	for (var r = 0; r < rings.length; r++) {
		var halfX = rings[r].halfX !== undefined ? rings[r].halfX : rings[r].half;
		var halfZ = rings[r].halfZ !== undefined ? rings[r].halfZ : rings[r].half;
		for (var c = 0; c < 4; c++) {
			var x = corners[c][0] * halfX;
			var z = corners[c][1] * halfZ;
			data.vertex(x, 0, z, UP, x / uvSize + 0.5, z / uvSize + 0.5, WHITE, rings[r].alpha);
		}
	}
	if (!hollow) data.quad(0, 1, 2, 3);
	for (var i = 0; i < rings.length - 1; i++) {
		for (var s = 0; s < 4; s++) {
			var next = (s + 1) % 4;
			data.quad(i * 4 + s, i * 4 + next, (i + 1) * 4 + next, (i + 1) * 4 + s);
		}
	}
	return data.build();
}

/**
 * Tile plate: a glowing square frame on the 50cm tile edge with a faint fill
 */
function plate() {
	if (!cache.plate) {
		cache.plate = squareRings(
			[
				{ half: 20.5, alpha: 0.1 },
				{ half: 23.6, alpha: 0.35 },
				{ half: 24.0, alpha: 1 },
				{ half: 25.0, alpha: 1 },
				{ half: 27.5, alpha: 0 },
			],
			55
		);
	}
	return cache.plate;
}

/**
 * Grid tile: a bright frame on the 50cm tile edge with an inner glow that fades toward the middle, so a lit
 * tile reads as a glowing panel without a flat slab (flat fills show the display's unevenness)
 */
function tile() {
	if (!cache.tile) {
		cache.tile = squareRings(
			[
				{ half: 12, alpha: 0.2 },
				{ half: 19, alpha: 0.26 },
				{ half: 22.5, alpha: 0.5 },
				{ half: 24, alpha: 1 },
				{ half: 25, alpha: 1 },
				{ half: 27.5, alpha: 0 },
			],
			55
		);
	}
	return cache.tile;
}

/**
 * Lava core: a 48cm textured square whose outer 4cm fades out
 */
function core() {
	if (!cache.core) {
		cache.core = squareRings(
			[
				{ half: 20, alpha: 1 },
				{ half: 24, alpha: 0.25 },
			],
			48
		);
	}
	return cache.core;
}

/**
 * Lava moat: a band around a board whose tile edges are halfX/halfZ from its centre. A thin gap, then lava
 * that fades out over the outer part. Cached per board size
 */
function moat(halfX, halfZ) {
	var name = "moat" + halfX + "x" + halfZ;
	if (!cache[name]) {
		cache[name] = squareRings(bandRings(halfX, halfZ, [
			{ d: 3, alpha: 0 },
			{ d: 7, alpha: 1 },
			{ d: 30, alpha: 0.9 },
			{ d: 55, alpha: 0.5 },
			{ d: 80, alpha: 0 },
		]), 55, true);
	}
	return cache[name];
}

/**
 * Hot rim along the moat's inner edge, so the board's boundary reads as a line not to cross
 */
function moatEdge(halfX, halfZ) {
	var name = "moatEdge" + halfX + "x" + halfZ;
	if (!cache[name]) {
		cache[name] = squareRings(bandRings(halfX, halfZ, [
			{ d: 2, alpha: 0 },
			{ d: 4.5, alpha: 1 },
			{ d: 6, alpha: 1 },
			{ d: 11, alpha: 0 },
		]), 55, true);
	}
	return cache[name];
}

function bandRings(halfX, halfZ, steps) {
	return steps.map(function (step) {
		return { halfX: halfX + step.d, halfZ: halfZ + step.d, alpha: step.alpha };
	});
}

/**
 * One side of a board border, on the floor: a band along X (the board edge at z = 0, outward is +z) whose ends
 * are mitred at 45 degrees so four sides meet cleanly at the corners. UV: u runs along the edge (one unit per
 * `period` cm, for a tiling stripe texture), v across the band. Cached per length
 * @param {number} length - Edge length in cm (between the board's corners)
 */
function borderBand(length, period) {
	var name = "borderBand" + Math.round(length) + "p" + period;
	if (cache[name]) return cache[name];

	var data = new MeshData();
	var rows = [
		{ d: 4, alpha: 0 },
		{ d: 5.5, alpha: 1 },
		{ d: 12.5, alpha: 1 },
		{ d: 14, alpha: 0 },
	];
	for (var r = 0; r < rows.length; r++) {
		var half = length / 2 + rows[r].d;
		var v = (rows[r].d - rows[0].d) / (rows[rows.length - 1].d - rows[0].d);
		data.vertex(-half, 0, rows[r].d, UP, -half / period, v, WHITE, rows[r].alpha);
		data.vertex(half, 0, rows[r].d, UP, half / period, v, WHITE, rows[r].alpha);
	}
	for (var i = 0; i < rows.length - 1; i++) {
		data.quad(i * 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
	}
	cache[name] = data.build();
	return cache[name];
}

/**
 * One side of a board border, standing up: a glowing curtain along X at z = `offset`, unit height (scale Y
 * sets the height in cm), bright at the floor and fading upward. Its ends reach the mitred corners
 */
function borderCurtain(length, offset) {
	var name = "borderCurtain" + Math.round(length) + "o" + offset;
	if (cache[name]) return cache[name];

	var data = new MeshData();
	var half = length / 2 + offset;
	var rows = [
		{ y: 0, alpha: 0.75 },
		{ y: 0.06, alpha: 0.55 },
		{ y: 0.45, alpha: 0.2 },
		{ y: 1, alpha: 0 },
	];
	for (var r = 0; r < rows.length; r++) {
		data.vertex(-half, rows[r].y, offset, FACING, 0, rows[r].y, WHITE, rows[r].alpha);
		data.vertex(half, rows[r].y, offset, FACING, 1, rows[r].y, WHITE, rows[r].alpha);
	}
	for (var i = 0; i < rows.length - 1; i++) {
		data.quad(i * 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
	}
	cache[name] = data.build();
	return cache[name];
}

/**
 * Upright card on XY with its base at y = 0 and a unit height (scale Y sets the height in cm)
 * @param {Object} profile - {rows: [{v, half, color, alpha}], columns: [{s, alpha}]}; s runs -1..1 across
 */
function card(name, profile) {
	if (cache[name]) return cache[name];

	var data = new MeshData();
	var rows = profile.rows;
	var columns = profile.columns;
	for (var r = 0; r < rows.length; r++) {
		for (var c = 0; c < columns.length; c++) {
			var s = columns[c].s;
			data.vertex(s * rows[r].half, rows[r].v, 0, FACING, (s + 1) / 2, rows[r].v, rows[r].color, rows[r].alpha * columns[c].alpha);
		}
	}
	var stride = columns.length;
	for (var i = 0; i < rows.length - 1; i++) {
		for (var j = 0; j < stride - 1; j++) {
			data.quad(i * stride + j, i * stride + j + 1, (i + 1) * stride + j + 1, (i + 1) * stride + j);
		}
	}
	cache[name] = data.build();
	return cache[name];
}

var SOFT_COLUMNS = [
	{ s: -1, alpha: 0 },
	{ s: -0.5, alpha: 0.7 },
	{ s: 0, alpha: 1 },
	{ s: 0.5, alpha: 0.7 },
	{ s: 1, alpha: 0 },
];

/**
 * Flame tongue: 46cm wide at the base tapering to a point, white-hot at the base to red at the tip
 */
function flame() {
	return card("flame", {
		rows: [
			{ v: 0, half: 23, color: [1, 0.97, 0.85], alpha: 0.85 },
			{ v: 0.08, half: 23, color: [1, 0.9, 0.6], alpha: 1 },
			{ v: 0.3, half: 17, color: [1, 0.72, 0.3], alpha: 0.95 },
			{ v: 0.55, half: 11, color: [1, 0.45, 0.1], alpha: 0.7 },
			{ v: 0.8, half: 6, color: [0.95, 0.25, 0.05], alpha: 0.35 },
			{ v: 1, half: 1.5, color: [0.7, 0.1, 0.02], alpha: 0 },
		],
		columns: SOFT_COLUMNS,
	});
}

/**
 * Safe beam: a thin light pillar with a bright core and soft halo, fading out at the top
 */
function beam() {
	return card("beam", {
		rows: [
			{ v: 0, half: 7, color: WHITE, alpha: 0.55 },
			{ v: 0.08, half: 7, color: WHITE, alpha: 0.85 },
			{ v: 0.3, half: 7, color: WHITE, alpha: 1 },
			{ v: 0.55, half: 7, color: WHITE, alpha: 1 },
			{ v: 0.8, half: 7, color: WHITE, alpha: 0.6 },
			{ v: 1, half: 7, color: WHITE, alpha: 0 },
		],
		columns: [
			{ s: -1, alpha: 0 },
			{ s: -0.4, alpha: 0.35 },
			{ s: 0, alpha: 1 },
			{ s: 0.4, alpha: 0.35 },
			{ s: 1, alpha: 0 },
		],
	});
}

/**
 * Unit annulus on XZ (radius 1): a bright band with soft inner and outer edges
 */
function ring() {
	if (cache.ring) return cache.ring;

	var data = new MeshData();
	var radii = [
		{ r: 0.78, alpha: 0 },
		{ r: 0.93, alpha: 1 },
		{ r: 1.0, alpha: 1 },
		{ r: 1.12, alpha: 0 },
	];
	var segments = 40;
	for (var i = 0; i < radii.length; i++) {
		for (var s = 0; s < segments; s++) {
			var angle = (s / segments) * Math.PI * 2;
			var x = Math.cos(angle) * radii[i].r;
			var z = Math.sin(angle) * radii[i].r;
			data.vertex(x, 0, z, UP, x * 0.5 + 0.5, z * 0.5 + 0.5, WHITE, radii[i].alpha);
		}
	}
	for (var k = 0; k < radii.length - 1; k++) {
		for (var t = 0; t < segments; t++) {
			var next = (t + 1) % segments;
			data.quad(k * segments + t, k * segments + next, (k + 1) * segments + next, (k + 1) * segments + t);
		}
	}
	cache.ring = data.build();
	return cache.ring;
}

/**
 * Head-locked glow strip (64 x 14cm on XY): bright along the bottom edge, fading upward and at the ends
 */
function strip() {
	if (cache.strip) return cache.strip;

	var data = new MeshData();
	var xs = [
		{ x: -32, alpha: 0 },
		{ x: -22, alpha: 1 },
		{ x: 22, alpha: 1 },
		{ x: 32, alpha: 0 },
	];
	var ys = [
		{ y: -7, alpha: 1 },
		{ y: -2, alpha: 0.45 },
		{ y: 7, alpha: 0 },
	];
	for (var j = 0; j < ys.length; j++) {
		for (var i = 0; i < xs.length; i++) {
			data.vertex(xs[i].x, ys[j].y, 0, FACING, i / (xs.length - 1), j / (ys.length - 1), WHITE, xs[i].alpha * ys[j].alpha);
		}
	}
	for (var r = 0; r < ys.length - 1; r++) {
		for (var c = 0; c < xs.length - 1; c++) {
			data.quad(r * xs.length + c, r * xs.length + c + 1, (r + 1) * xs.length + c + 1, (r + 1) * xs.length + c);
		}
	}
	cache.strip = data.build();
	return cache.strip;
}

/**
 * Creates a hidden glow visual at runtime on a clone of an unlit material. The clone is forced to additive
 * blending without depth writes, so black adds nothing on the see-through display and overlaps don't sort
 * @param {SceneObject} parent - Parent object
 * @param {string} name - Object name
 * @param {RenderMesh} mesh - Mesh to draw
 * @param {Asset.Material} material - Material to clone
 * @param {Object} options - Optional {texture, uvScale (vec2)}
 * @returns {Object} {object, visual, pass}
 */
function createVisual(parent, name, mesh, material, options) {
	var object = global.scene.createSceneObject(name);
	object.setParent(parent);
	var visual = object.createComponent("Component.RenderMeshVisual");
	visual.mesh = mesh;

	var clone = material.clone();
	var pass = clone.mainPass;
	pass.blendMode = BlendMode.Add;
	pass.depthWrite = false;
	pass.twoSided = true;

	options = options || {};
	if (options.texture) pass.baseTex = options.texture;
	if (options.uvScale) pass.uv2Scale = options.uvScale;

	visual.mainMaterial = clone;
	object.enabled = false;
	return { object: object, visual: visual, pass: clone.mainPass };
}

module.exports = {
	createVisual: createVisual,
	tile: tile,
	plate: plate,
	core: core,
	flame: flame,
	beam: beam,
	ring: ring,
	strip: strip,
	moat: moat,
	moatEdge: moatEdge,
	borderBand: borderBand,
	borderCurtain: borderCurtain,
};
