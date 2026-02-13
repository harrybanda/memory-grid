// MathHelpers.js
// Utility functions for position calculations and grid math

/**
 * Converts grid coordinates to world position (center of tile)
 * @param {number} gridX - Grid X coordinate
 * @param {number} gridZ - Grid Z coordinate
 * @param {vec3} gridOrigin - The origin point of the grid
 * @param {number} tileSize - Size of each tile in cm
 * @param {number} tileGap - Gap between tiles in cm
 * @returns {vec3} World position at center of the tile
 */
function gridToWorld(gridX, gridZ, gridOrigin, tileSize, tileGap) {
	var totalTileSize = tileSize + tileGap;
	var halfTile = tileSize / 2;

	var worldX = gridOrigin.x + gridX * totalTileSize + halfTile;
	var worldZ = gridOrigin.z + gridZ * totalTileSize + halfTile;
	var worldY = gridOrigin.y;

	return new vec3(worldX, worldY, worldZ);
}

/**
 * Checks if a position is within a tile's bounds
 * @param {vec3} worldPos - The world position to check
 * @param {vec3} tileCenter - The center of the tile
 * @param {number} radius - The detection radius
 * @returns {boolean} True if within tile bounds
 */
function isWithinTile(worldPos, tileCenter, radius) {
	// Use horizontal distance only (X and Z)
	var dx = worldPos.x - tileCenter.x;
	var dz = worldPos.z - tileCenter.z;
	var distanceSquared = dx * dx + dz * dz;

	return distanceSquared <= radius * radius;
}

/**
 * Calculates horizontal distance between two points (ignoring Y)
 * @param {vec3} posA - First position
 * @param {vec3} posB - Second position
 * @returns {number} Horizontal distance in cm
 */
function horizontalDistance(posA, posB) {
	var dx = posA.x - posB.x;
	var dz = posA.z - posB.z;
	return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Calculates 3D distance between two points
 * @param {vec3} posA - First position
 * @param {vec3} posB - Second position
 * @returns {number} Distance in cm
 */
function distance3D(posA, posB) {
	var dx = posA.x - posB.x;
	var dy = posA.y - posB.y;
	var dz = posA.z - posB.z;
	return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Projects camera position to floor level
 * @param {vec3} cameraPos - The camera world position
 * @param {number} floorY - The Y coordinate of the floor
 * @returns {vec3} Position projected onto the floor
 */
function projectToFloor(cameraPos, floorY) {
	return new vec3(cameraPos.x, floorY, cameraPos.z);
}

/**
 * Checks if grid coordinates are valid within grid bounds
 * @param {number} gridX - Grid X coordinate
 * @param {number} gridZ - Grid Z coordinate
 * @param {number} rows - Number of rows in grid
 * @param {number} columns - Number of columns in grid
 * @returns {boolean} True if coordinates are within bounds
 */
function isValidGridPosition(gridX, gridZ, rows, columns) {
	return gridX >= 0 && gridX < columns && gridZ >= 0 && gridZ < rows;
}

/**
 * Compares two grid positions for equality
 * @param {Object} posA - First grid position {x, z}
 * @param {Object} posB - Second grid position {x, z}
 * @returns {boolean} True if positions are the same
 */
function isSameGridPosition(posA, posB) {
	if (!posA || !posB) return false;
	return posA.x === posB.x && posA.z === posB.z;
}

/**
 * Gets all valid neighboring grid positions (orthogonal only)
 * @param {number} gridX - Current X coordinate
 * @param {number} gridZ - Current Z coordinate
 * @param {number} rows - Grid row count
 * @param {number} columns - Grid column count
 * @returns {Array} Array of valid neighbor positions
 */
function getNeighbors(gridX, gridZ, rows, columns) {
	var neighbors = [];
	var directions = [
		{ x: 0, z: 1 }, // Up
		{ x: 0, z: -1 }, // Down
		{ x: -1, z: 0 }, // Left
		{ x: 1, z: 0 }, // Right
	];

	for (var i = 0; i < directions.length; i++) {
		var newX = gridX + directions[i].x;
		var newZ = gridZ + directions[i].z;

		if (isValidGridPosition(newX, newZ, rows, columns)) {
			neighbors.push({ x: newX, z: newZ });
		}
	}

	return neighbors;
}

/**
 * Generates a random integer between min and max (inclusive)
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Random integer
 */
function randomInt(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Shuffles an array in place using Fisher-Yates algorithm
 * @param {Array} array - Array to shuffle
 * @returns {Array} The shuffled array
 */
function shuffleArray(array) {
	for (var i = array.length - 1; i > 0; i--) {
		var j = randomInt(0, i);
		var temp = array[i];
		array[i] = array[j];
		array[j] = temp;
	}
	return array;
}

/**
 * Clamps a value between min and max
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
function clamp(value, min, max) {
	return Math.min(Math.max(value, min), max);
}

/**
 * Linear interpolation between two values
 * @param {number} a - Start value
 * @param {number} b - End value
 * @param {number} t - Interpolation factor (0-1)
 * @returns {number} Interpolated value
 */
function lerp(a, b, t) {
	return a + (b - a) * clamp(t, 0, 1);
}

/**
 * Linear interpolation between two vec3 values
 * @param {vec3} a - Start vector
 * @param {vec3} b - End vector
 * @param {number} t - Interpolation factor (0-1)
 * @returns {vec3} Interpolated vector
 */
function lerpVec3(a, b, t) {
	t = clamp(t, 0, 1);
	return new vec3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
}

// Export all functions
module.exports = {
	gridToWorld: gridToWorld,
	isWithinTile: isWithinTile,
	horizontalDistance: horizontalDistance,
	distance3D: distance3D,
	projectToFloor: projectToFloor,
	isValidGridPosition: isValidGridPosition,
	isSameGridPosition: isSameGridPosition,
	getNeighbors: getNeighbors,
	randomInt: randomInt,
	shuffleArray: shuffleArray,
	clamp: clamp,
	lerp: lerp,
	lerpVec3: lerpVec3,
};
