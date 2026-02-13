// PathGenerator.js
// Generates random walkable paths on the grid

var MathHelpers = require("../Utils/MathHelpers");

/**
 * PathGenerator handles creation of random valid paths on the grid
 * Paths are connected sequences of tiles with orthogonal movement only
 */

/**
 * Generates a random path on the grid
 * Retries up to MAX_RETRIES times if the path is shorter than requested
 * @param {number} rows - Number of rows in the grid
 * @param {number} columns - Number of columns in the grid
 * @param {number} pathLength - Desired length of the path
 * @param {Object} startPos - Optional starting position {x, z}, defaults to random edge
 * @returns {Array} Array of grid positions forming the path
 */
function generatePath(rows, columns, pathLength, startPos) {
	var maxPossibleLength = rows * columns;
	pathLength = Math.min(pathLength, maxPossibleLength);

	var MAX_RETRIES = 10;
	var bestPath = null;

	for (var retry = 0; retry < MAX_RETRIES; retry++) {
		var result = generatePathAttempt(rows, columns, pathLength, startPos);

		// Perfect length — use immediately
		if (result.length >= pathLength) {
			return result;
		}

		// Keep the longest attempt so far
		if (!bestPath || result.length > bestPath.length) {
			bestPath = result;
		}
	}

	// All retries exhausted — return the longest path we found
	print("PathGenerator: WARNING - requested " + pathLength + " tiles but best attempt was " + bestPath.length + " after " + MAX_RETRIES + " retries");
	return bestPath;
}

/**
 * Single attempt at generating a path (internal helper)
 * @param {number} rows - Grid rows
 * @param {number} columns - Grid columns
 * @param {number} pathLength - Desired length
 * @param {Object} startPos - Starting position (optional)
 * @returns {Array} Generated path (may be shorter than requested)
 */
function generatePathAttempt(rows, columns, pathLength, startPos) {
	if (!startPos) {
		startPos = getRandomEdgePosition(rows, columns);
	}

	var path = [{ x: startPos.x, z: startPos.z }];
	var visited = {};
	visited[positionKey(startPos.x, startPos.z)] = true;

	var attempts = 0;
	var maxAttempts = pathLength * 100;

	while (path.length < pathLength && attempts < maxAttempts) {
		var currentPos = path[path.length - 1];
		var neighbors = MathHelpers.getNeighbors(currentPos.x, currentPos.z, rows, columns);

		// Filter out already visited positions
		var validNeighbors = neighbors.filter(function (neighbor) {
			return !visited[positionKey(neighbor.x, neighbor.z)];
		});

		if (validNeighbors.length === 0) {
			// Dead end - backtrack or restart
			if (path.length > 1) {
				var removed = path.pop();
				delete visited[positionKey(removed.x, removed.z)];
			} else {
				path = [];
				visited = {};
				startPos = getRandomEdgePosition(rows, columns);
				path.push({ x: startPos.x, z: startPos.z });
				visited[positionKey(startPos.x, startPos.z)] = true;
			}
			attempts++;
			continue;
		}

		// For long paths (23+ tiles, Levels 10-11): use Warnsdorff's heuristic
		// to prevent painting into corners on near-full-grid paths.
		// For shorter paths: random shuffle for natural-looking variety.
		var useWarnsdorff = pathLength >= 23;

		if (useWarnsdorff) {
			validNeighbors.sort(function (a, b) {
				var aExits = countUnvisitedNeighbors(a.x, a.z, rows, columns, visited);
				var bExits = countUnvisitedNeighbors(b.x, b.z, rows, columns, visited);
				if (aExits !== bExits) return aExits - bExits;
				return Math.random() - 0.5; // Random tiebreaker
			});
		} else {
			MathHelpers.shuffleArray(validNeighbors);
		}

		var nextPos = validNeighbors[0];
		path.push({ x: nextPos.x, z: nextPos.z });
		visited[positionKey(nextPos.x, nextPos.z)] = true;

		attempts++;
	}

	return path;
}

/**
 * Counts unvisited neighbors of a position (used by Warnsdorff's heuristic)
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @param {number} rows - Grid rows
 * @param {number} columns - Grid columns
 * @param {Object} visited - Map of visited positions
 * @returns {number} Count of unvisited neighbors
 */
function countUnvisitedNeighbors(x, z, rows, columns, visited) {
	var neighbors = MathHelpers.getNeighbors(x, z, rows, columns);
	var count = 0;
	for (var i = 0; i < neighbors.length; i++) {
		if (!visited[positionKey(neighbors[i].x, neighbors[i].z)]) {
			count++;
		}
	}
	return count;
}

/**
 * Gets a random position on the edge of the grid
 * Prefers corners and edges for natural starting points
 * @param {number} rows - Number of rows
 * @param {number} columns - Number of columns
 * @returns {Object} Grid position {x, z}
 */
function getRandomEdgePosition(rows, columns) {
	var edges = [];

	// Bottom edge (z = 0)
	for (var x = 0; x < columns; x++) {
		edges.push({ x: x, z: 0 });
	}

	// Top edge (z = rows - 1)
	for (var x = 0; x < columns; x++) {
		edges.push({ x: x, z: rows - 1 });
	}

	// Left edge (x = 0), excluding corners already added
	for (var z = 1; z < rows - 1; z++) {
		edges.push({ x: 0, z: z });
	}

	// Right edge (x = columns - 1), excluding corners
	for (var z = 1; z < rows - 1; z++) {
		edges.push({ x: columns - 1, z: z });
	}

	// Pick random edge position
	var index = MathHelpers.randomInt(0, edges.length - 1);
	return edges[index];
}

/**
 * Creates a unique string key for a grid position
 * Used for tracking visited positions
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @returns {string} Position key
 */
function positionKey(x, z) {
	return x + "," + z;
}

/**
 * Validates that a path is continuous (each step is adjacent)
 * @param {Array} path - Array of grid positions
 * @returns {boolean} True if path is valid
 */
function isValidPath(path) {
	if (!path || path.length < 2) return true;

	for (var i = 1; i < path.length; i++) {
		var prev = path[i - 1];
		var curr = path[i];

		var dx = Math.abs(curr.x - prev.x);
		var dz = Math.abs(curr.z - prev.z);

		// Must be exactly one step in one direction (orthogonal only)
		if (!((dx === 1 && dz === 0) || (dx === 0 && dz === 1))) {
			return false;
		}
	}

	return true;
}

/**
 * Generates a path that starts from the near edge (closest to player)
 * The near edge is the highest z row since the grid extends away from the user
 * @param {number} rows - Number of rows
 * @param {number} columns - Number of columns
 * @param {number} pathLength - Desired path length
 * @returns {Array} Path starting from center of near edge
 */
function generatePathFromBottom(rows, columns, pathLength) {
	// Start from center of the near row (highest z = closest to player)
	var startX = Math.floor(columns / 2);
	var startZ = rows - 1; // Near edge (closest to player when facing grid)
	var startPos = { x: startX, z: startZ };

	return generatePath(rows, columns, pathLength, startPos);
}

/**
 * Gets the direction between two adjacent path positions
 * @param {Object} from - Starting position {x, z}
 * @param {Object} to - Ending position {x, z}
 * @returns {string} Direction name: "up", "down", "left", "right"
 */
function getDirection(from, to) {
	var dx = to.x - from.x;
	var dz = to.z - from.z;

	if (dz > 0) return "up";
	if (dz < 0) return "down";
	if (dx > 0) return "right";
	if (dx < 0) return "left";

	return "none";
}

/**
 * Converts path to direction instructions
 * Useful for verbal guidance from game host
 * @param {Array} path - Array of grid positions
 * @returns {Array} Array of direction strings
 */
function pathToDirections(path) {
	var directions = [];

	for (var i = 1; i < path.length; i++) {
		directions.push(getDirection(path[i - 1], path[i]));
	}

	return directions;
}

// Export functions
module.exports = {
	generatePath: generatePath,
	generatePathFromBottom: generatePathFromBottom,
	getRandomEdgePosition: getRandomEdgePosition,
	isValidPath: isValidPath,
	getDirection: getDirection,
	pathToDirections: pathToDirections,
};
