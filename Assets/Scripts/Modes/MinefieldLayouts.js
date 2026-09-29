// MinefieldLayouts.js
// Hand-picked Minefield layouts, two per level. Validate with: node tools/minefield-layouts.js
// Board: 4 columns (x 0-3) by 5 rows (z 0-4). Row 4 is the yellow start row; the goal is in row 0.
// Every layout and its left-right mirror is solvable, needs at least minMoves moves (diagonals allowed),
// and blocks the straight walk down column 2, which runs straight ahead of the start marker.

var LEVELS = [
	{
		studyCap: 12,
		minMoves: 5,
		layouts: [
			// A wall of three in front of the goal that tempts a corner cut
			{ goal: { x: 1, z: 0 }, mines: [{ x: 0, z: 1 }, { x: 1, z: 1 }, { x: 2, z: 1 }, { x: 2, z: 3 }] },
			{ goal: { x: 2, z: 0 }, mines: [{ x: 1, z: 1 }, { x: 2, z: 1 }, { x: 3, z: 1 }, { x: 2, z: 2 }] },
		],
	},
	{
		studyCap: 10,
		minMoves: 5,
		layouts: [
			{ goal: { x: 2, z: 0 }, mines: [{ x: 1, z: 1 }, { x: 2, z: 1 }, { x: 3, z: 1 }, { x: 0, z: 2 }, { x: 2, z: 2 }] },
			{ goal: { x: 1, z: 0 }, mines: [{ x: 0, z: 1 }, { x: 1, z: 1 }, { x: 2, z: 1 }, { x: 2, z: 2 }, { x: 2, z: 3 }] },
		],
	},
	{
		studyCap: 10,
		minMoves: 6,
		layouts: [
			{ goal: { x: 2, z: 0 }, mines: [{ x: 1, z: 1 }, { x: 2, z: 1 }, { x: 3, z: 1 }, { x: 0, z: 3 }, { x: 1, z: 3 }, { x: 2, z: 3 }] },
			{ goal: { x: 1, z: 0 }, mines: [{ x: 0, z: 1 }, { x: 1, z: 1 }, { x: 2, z: 1 }, { x: 1, z: 3 }, { x: 2, z: 3 }, { x: 3, z: 3 }] },
		],
	},
];

module.exports = {
	LEVELS: LEVELS,
};
