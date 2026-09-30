// MinefieldLayouts.js
// Hand-picked Minefield layouts, two per level. Validate with: node tools/minefield-layouts.js
// Board: 4 columns (x 0-3) by 4 rows (z 0-3). The player steps on from the start marker onto row 3 (the near
// row, which can hold mines); the goal is in row 0. Every layout and its left-right mirror is solvable, needs
// at least minMoves steps counting the step onto the board (diagonals allowed), leaves at least two near-row
// tiles safe to step onto, and blocks the straight walk down column 2, which runs straight ahead of the marker.
// On a 4x4 board no layout can force more than one step of detour, so later levels are harder to remember
// (more mines, spread over more rows, less study time) rather than longer to walk.

var LEVELS = [
	{
		studyCap: 12,
		minMoves: 5,
		layouts: [
			// A wall in front of the goal, and one mine on the way in
			{ goal: { x: 1, z: 0 }, mines: [{ x: 0, z: 1 }, { x: 1, z: 1 }, { x: 2, z: 1 }, { x: 3, z: 3 }] },
			{ goal: { x: 2, z: 0 }, mines: [{ x: 1, z: 1 }, { x: 2, z: 1 }, { x: 3, z: 1 }, { x: 0, z: 3 }] },
		],
	},
	{
		studyCap: 10,
		minMoves: 5,
		layouts: [
			// A mine beside the goal as well
			{ goal: { x: 2, z: 0 }, mines: [{ x: 0, z: 0 }, { x: 1, z: 1 }, { x: 2, z: 1 }, { x: 3, z: 1 }, { x: 1, z: 3 }] },
			{ goal: { x: 1, z: 0 }, mines: [{ x: 3, z: 0 }, { x: 0, z: 1 }, { x: 1, z: 1 }, { x: 2, z: 1 }, { x: 0, z: 3 }] },
		],
	},
	{
		studyCap: 9,
		minMoves: 5,
		layouts: [
			// A diagonal chain from the entry row up to the goal
			{ goal: { x: 2, z: 0 }, mines: [{ x: 0, z: 0 }, { x: 1, z: 1 }, { x: 2, z: 1 }, { x: 2, z: 2 }, { x: 2, z: 3 }, { x: 3, z: 3 }] },
			{ goal: { x: 1, z: 0 }, mines: [{ x: 3, z: 0 }, { x: 2, z: 1 }, { x: 1, z: 2 }, { x: 2, z: 2 }, { x: 0, z: 3 }, { x: 1, z: 3 }] },
		],
	},
];

module.exports = {
	LEVELS: LEVELS,
};
