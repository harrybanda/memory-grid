// MinefieldLayouts.js
// Hand-picked Minefield layouts, two per level. Validate with: node tools/minefield-layouts.js
// Board: 4 columns (x 0-3) by 4 rows (z 0-3). The player steps on from the start marker onto row 3 (the near
// row, which can hold mines); the goal is in row 0. Every layout and its left-right mirror is solvable walking
// from tile centre to tile centre: straight steps, and diagonal steps only where both tiles beside the diagonal
// are safe (a diagonal past a mine's corner walks over that corner, and the mine check catches it). Each needs
// at least minMoves steps counting the step onto the board, leaves at least two near-row tiles safe to step
// onto, and blocks the straight walk down column 2, which runs straight ahead of the marker.

var LEVELS = [
	{
		studyCap: 12,
		minMoves: 6,
		layouts: [
			// XG.. / .X.. / ...X / ..X.  : around the right of the middle mine, then back left to the goal
			{ goal: { x: 1, z: 0 }, mines: [{ x: 0, z: 0 }, { x: 1, z: 1 }, { x: 3, z: 2 }, { x: 2, z: 3 }] },
			// X.G. / ..X. / .X.. / ...X
			{ goal: { x: 2, z: 0 }, mines: [{ x: 0, z: 0 }, { x: 2, z: 1 }, { x: 1, z: 2 }, { x: 3, z: 3 }] },
		],
	},
	{
		studyCap: 11,
		minMoves: 7,
		layouts: [
			// XG.. / ..X. / .X.. / X..X  : up the right side and in along the far row
			{ goal: { x: 1, z: 0 }, mines: [{ x: 0, z: 0 }, { x: 2, z: 1 }, { x: 1, z: 2 }, { x: 0, z: 3 }, { x: 3, z: 3 }] },
			// ..GX / .X.. / ..X. / X..X
			{ goal: { x: 2, z: 0 }, mines: [{ x: 3, z: 0 }, { x: 1, z: 1 }, { x: 2, z: 2 }, { x: 0, z: 3 }, { x: 3, z: 3 }] },
		],
	},
	{
		studyCap: 10,
		minMoves: 8,
		layouts: [
			// XG.. / .XX. / X... / ..XX  : a U-turn around the wall in front of the goal
			{ goal: { x: 1, z: 0 }, mines: [{ x: 0, z: 0 }, { x: 1, z: 1 }, { x: 2, z: 1 }, { x: 0, z: 2 }, { x: 2, z: 3 }, { x: 3, z: 3 }] },
			// ..GX / .XX. / ...X / XX..
			{ goal: { x: 2, z: 0 }, mines: [{ x: 3, z: 0 }, { x: 1, z: 1 }, { x: 2, z: 1 }, { x: 3, z: 2 }, { x: 0, z: 3 }, { x: 1, z: 3 }] },
		],
	},
];

module.exports = {
	LEVELS: LEVELS,
};
