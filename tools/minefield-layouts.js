// Validates Minefield layouts: node tools/minefield-layouts.js
// Board is 4 columns (x 0-3) by 5 rows (z 0-4). Row 4 is the start row, the goal is in row 0.
// Rules: every layout (and its left-right mirror) must be solvable with 8-neighbour moves,
// the shortest route from the start row must be at least MIN_MOVES, and the straight walk
// down column 2 (straight ahead of the start marker) must hit a mine.
var COLUMNS = 4;
var ROWS = 5;

function shortestRoute(layout) {
	var mines = {};
	layout.mines.forEach(function (m) { mines[m.x + "," + m.z] = true; });
	var dist = {};
	var queue = [];
	for (var x = 0; x < COLUMNS; x++) { dist[x + "," + (ROWS - 1)] = 0; queue.push({ x: x, z: ROWS - 1 }); }
	while (queue.length) {
		var p = queue.shift();
		if (p.x === layout.goal.x && p.z === layout.goal.z) return dist[p.x + "," + p.z];
		for (var dx = -1; dx <= 1; dx++) for (var dz = -1; dz <= 1; dz++) {
			var n = { x: p.x + dx, z: p.z + dz }, k = n.x + "," + n.z;
			if ((dx || dz) && n.x >= 0 && n.x < COLUMNS && n.z >= 0 && n.z < ROWS && !mines[k] && dist[k] === undefined) {
				dist[k] = dist[p.x + "," + p.z] + 1; queue.push(n);
			}
		}
	}
	return Infinity;
}

function mirror(layout) {
	return {
		goal: { x: COLUMNS - 1 - layout.goal.x, z: layout.goal.z },
		mines: layout.mines.map(function (m) { return { x: COLUMNS - 1 - m.x, z: m.z }; }),
	};
}

function blocksColumn(layout, column) {
	return layout.mines.some(function (m) { return m.x === column; });
}

function check(layout, minMoves) {
	var problems = [];
	[layout, mirror(layout)].forEach(function (l, i) {
		var tag = i ? "mirror" : "layout";
		var moves = shortestRoute(l);
		if (moves === Infinity) problems.push(tag + ": goal unreachable");
		else if (moves < minMoves) problems.push(tag + ": shortest route " + moves + " < " + minMoves);
		if (!blocksColumn(l, 2)) problems.push(tag + ": column 2 not blocked");
		l.mines.forEach(function (m) {
			if (m.z === ROWS - 1) problems.push(tag + ": mine on start row");
			if (m.x === l.goal.x && m.z === l.goal.z) problems.push(tag + ": mine on goal");
		});
	});
	return problems;
}

module.exports = { check: check, shortestRoute: shortestRoute, mirror: mirror };

if (require.main === module) {
	var LAYOUTS = require("../Assets/Scripts/Modes/MinefieldLayouts.js").LEVELS;
	var failed = 0;
	LAYOUTS.forEach(function (level, li) {
		level.layouts.forEach(function (layout, i) {
			var problems = check(layout, level.minMoves);
			console.log("L" + (li + 1) + "." + (i + 1) + " mines=" + layout.mines.length + " moves=" + shortestRoute(layout) + "/" + shortestRoute(mirror(layout)) + (problems.length ? "  FAIL " + problems.join("; ") : "  PASS"));
			if (problems.length) failed++;
		});
	});
	process.exit(failed ? 1 : 0);
}
