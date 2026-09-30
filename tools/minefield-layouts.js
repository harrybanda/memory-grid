// Validates Minefield layouts: node tools/minefield-layouts.js
// Suggests candidates:         node tools/minefield-layouts.js suggest <mines> <minMoves>
// Board is 4 columns (x 0-3) by 4 rows (z 0-3). The player steps on from the start marker onto any safe tile
// of row 3 (the near row, which can hold mines too); the goal is in row 0.
// Rules: every layout (and its left-right mirror) must be solvable, the shortest route (counting the step onto
// the board) must be at least minMoves, the straight walk down column 2 (straight ahead of the start marker)
// must hit a mine, and at least two near-row tiles must be safe to enter.
// Moves: straight steps, and diagonal steps only when both tiles beside the diagonal are safe. A diagonal
// past a mine's corner walks over that corner, where the game's mine-cell check (rightly) catches the body,
// so a route that needs one isn't really walkable.
var COLUMNS = 4;
var ROWS = 4;
var NEAR = ROWS - 1;

function mineSet(layout) {
	var mines = {};
	layout.mines.forEach(function (m) { mines[m.x + "," + m.z] = true; });
	return mines;
}

function shortestRoute(layout) {
	var mines = mineSet(layout);
	var dist = {};
	var queue = [];
	for (var x = 0; x < COLUMNS; x++) {
		if (mines[x + "," + NEAR]) continue;
		dist[x + "," + NEAR] = 1;
		queue.push({ x: x, z: NEAR });
	}
	while (queue.length) {
		var p = queue.shift();
		if (p.x === layout.goal.x && p.z === layout.goal.z) return dist[p.x + "," + p.z];
		for (var dx = -1; dx <= 1; dx++) for (var dz = -1; dz <= 1; dz++) {
			var n = { x: p.x + dx, z: p.z + dz }, k = n.x + "," + n.z;
			if (dx && dz && (mines[(p.x + dx) + "," + p.z] || mines[p.x + "," + (p.z + dz)])) continue; // no corner cutting
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
		var mines = mineSet(l);
		var openEntries = 0;
		for (var x = 0; x < COLUMNS; x++) if (!mines[x + "," + NEAR]) openEntries++;
		if (openEntries < 2) problems.push(tag + ": fewer than two safe near-row tiles");
		if (l.goal.z !== 0) problems.push(tag + ": goal not on the far row");
		l.mines.forEach(function (m) {
			if (m.x === l.goal.x && m.z === l.goal.z) problems.push(tag + ": mine on goal");
		});
	});
	return problems;
}

module.exports = { check: check, shortestRoute: shortestRoute, mirror: mirror };

function suggest(mineCount, minMoves) {
	var cells = [];
	for (var z = 1; z < ROWS; z++) for (var x = 0; x < COLUMNS; x++) cells.push({ x: x, z: z });
	var results = [];
	function choose(start, picked) {
		if (picked.length === mineCount) {
			for (var gx = 1; gx <= 2; gx++) {
				var layout = { goal: { x: gx, z: 0 }, mines: picked.slice() };
				if (check(layout, minMoves).length === 0) {
					var nearMines = picked.filter(function (m) { return m.z === NEAR; }).length;
					results.push({ layout: layout, moves: shortestRoute(layout), nearMines: nearMines });
				}
			}
			return;
		}
		for (var i = start; i < cells.length; i++) {
			picked.push(cells[i]);
			choose(i + 1, picked);
			picked.pop();
		}
	}
	choose(0, []);
	return results;
}

if (require.main === module) {
	if (process.argv[2] === "suggest") {
		var found = suggest(parseInt(process.argv[3], 10), parseInt(process.argv[4], 10));
		console.log(found.length + " valid layouts");
		found.sort(function (a, b) { return b.moves - a.moves || b.nearMines - a.nearMines; });
		found.slice(0, 12).forEach(function (r) { console.log("moves=" + r.moves + " nearMines=" + r.nearMines + " " + JSON.stringify(r.layout)); });
		process.exit(0);
	}
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
